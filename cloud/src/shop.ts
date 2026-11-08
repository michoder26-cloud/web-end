import { allowAttempt, getCustomer, newToken, sha256 } from './auth'
import { canSendEmail, isEmail, later, sendEmail, tellOwner } from './email'
import { escapeHtml, html, notFound, privateHeaders, see } from './http'
import { getProduct, getProducts, isAvailable } from './items'
import { languagePrefix, localizeSettings } from './languages'
import { formatMoney, parsePrice } from './money'
import { addSubscriber } from './news'
import { getSite } from './owner'
import { promptPayAmountOk, promptPayPayload, readPromptPayId } from './promptpay'
import { qrSvg } from './qr'
import { pageImage, renderLayout } from './render'
import { startCardPayment } from './stripe'
import { words } from './text'
import type { Customer, Env, Item, Order, OrderLine, Settings, SiteRow, Variant } from './types'
import { liveSite } from './versions'
import { countConversion } from './stats'
import { fireEvent } from './webhooks'

const cookieName = 'cart'
const cookieSeconds = 30 * 24 * 3600
const maxLines = 30
const maxQuantity = 99
const maxBodyBytes = 16 * 1024
const maxOrdersPerHour = 200
const lowStock = 5

export const orderStatuses = ['pending', 'paid', 'shipped', 'done', 'cancelled']

const zeroDecimal = new Set(['jpy', 'krw', 'vnd', 'clp', 'pyg', 'isk'])
export const canPayByCard = (env: Env, settings: Settings) => Boolean(settings.payCard && settings.currency && !zeroDecimal.has(settings.currency) && env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET)

/** PromptPay codes are in Thai baht, so the option shows only for shops pricing in baht with a PromptPay ID that reads correctly. */
export const canPayByPromptPay = (settings: Settings) => Boolean(settings.payPromptPay && settings.currency === 'thb' && readPromptPayId(settings.promptPayId))

/** The cookie holds only ids and quantities. Names, prices and stock always come from the database. */
export function readCart(request: Request) {
  const cart = new Map<string, number>()
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [name, value] = part.trim().split('=')
    if (name !== cookieName || !value) continue
    for (const pair of value.split('.').slice(0, maxLines)) {
      const match = /^(\d{1,10}(?:_\d{1,10})?):(\d{1,2})$/.exec(pair)
      if (match && Number(match[2]) > 0) cart.set(match[1], Number(match[2]))
    }
  }
  return cart
}

const cartCookie = (url: URL, cart: Map<string, number>) => {
  const value = [...cart].slice(0, maxLines).map(([key, quantity]) => `${key}:${quantity}`).join('.')
  return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${value ? cookieSeconds : 0}${url.protocol === 'https:' ? '; Secure' : ''}`
}

export const cartCount = (request: Request) => [...readCart(request).values()].reduce((sum, quantity) => sum + quantity, 0)

type Line = { item: Item; key: string; price: NonNullable<ReturnType<typeof parsePrice>>; quantity: number; variant: null | Variant }

/** Prices the cart from the database, leaving out anything no longer on sale and limiting quantities to the stock. */
async function priceCart(env: Env, site: SiteRow, cart: Map<string, number>) {
  const settings = JSON.parse(site.settings) as Settings
  const products = await getProducts(env, site.id, [...new Set([...cart.keys()].map((key) => Number(key.split('_')[0])))], settings.viewLanguage)
  const byId = new Map(products.map((item) => [item.id, item]))
  const lines: Line[] = []
  let changed = false
  for (const [key, asked] of cart) {
    const [itemId, variantId] = key.split('_').map(Number)
    const item = byId.get(itemId)
    const options = item?.variants ?? []
    const variant = variantId ? (options.find((option) => option.id === variantId) ?? null) : null
    const price = parsePrice(variant?.price || item?.price)
    const stock = variant ? variant.stock : (item?.stock ?? null)
    if (!item || !price || (options.length && !variant) || (variantId && !variant) || stock === 0) {
      changed = true
      continue
    }
    const quantity = stock === null ? asked : Math.min(asked, stock)
    if (quantity !== asked) changed = true
    lines.push({ item, key, price, quantity, variant })
  }
  const subtotal = lines.reduce((sum, line) => sum + line.price.amount * line.quantity, 0)
  const prefix = lines[0]?.price.prefix ?? ''
  const suffix = lines[0]?.price.suffix ?? ''
  const freeOver = settings.freeShippingOver ? Math.round(settings.freeShippingOver * 100) : null
  const baseFee = lines.length ? Math.round((settings.shippingFee ?? 0) * 100) : 0
  const shipping = freeOver !== null && subtotal >= freeOver ? 0 : baseFee
  return { changed, freeLeft: baseFee && freeOver !== null && subtotal < freeOver ? freeOver - subtotal : 0, freeOver: baseFee ? freeOver : null, lines, prefix, shipping, subtotal, suffix, total: subtotal + shipping }
}

const page = (site: SiteRow, url: URL, title: string, body: string, customer: Customer | null, count: number) =>
  html(
    renderLayout(site, {
      canonical: `${url.origin}${url.pathname}`,
      cartCount: count,
      customer,
      description: title,
      main: `<section class="block tone-plain"><div class="wrap account cart">${body}</div></section>`,
      robots: 'noindex',
      title,
    }),
    200,
    privateHeaders,
  )

const totals = (t: ReturnType<typeof words>, money: (amount: number) => string, subtotal: number, shipping: number, total: number) =>
  `<dl class="cart-totals"><div><dt>${t.subtotal}</dt><dd>${escapeHtml(money(subtotal))}</dd></div><div><dt>${t.shipping}</dt><dd>${shipping ? escapeHtml(money(shipping)) : t.free}</dd></div><div class="cart-totals__sum"><dt>${t.total}</dt><dd>${escapeHtml(money(total))}</dd></div></dl>`

const cleanCookie = (url: URL, lines: Line[]) => cartCookie(url, new Map(lines.map((line) => [line.key, line.quantity])))

const lineName = (line: { item: Item; variant: null | Variant }) => `${line.item.title}${line.variant ? ` · ${line.variant.name}` : ''}`

async function cartPage(request: Request, env: Env, url: URL, site: SiteRow, customer: Customer | null) {
  const t = words((JSON.parse(site.settings) as Settings).language)
  const cart = readCart(request)
  const priced = await priceCart(env, site, cart)
  const money = (amount: number) => formatMoney(amount, priced.prefix, priced.suffix)
  // Whatever had to change is saved, so the same warning doesn't come back or block checkout.
  const withCookie = (response: Response) => {
    if (priced.changed) response.headers.set('Set-Cookie', cleanCookie(url, priced.lines))
    return response
  }
  if (!priced.lines.length) return withCookie(page(site, url, t.cart, `<h1>${t.cart}</h1>${priced.changed ? `<p role="alert">${t.itemsRemoved}</p>` : ''}<p>${t.cartEmpty}</p><a class="button" href="/">${t.keepShopping}</a>`, customer, 0))
  const rows = priced.lines
    .map((line) => {
      const photo = pageImage(line.item.image_url, line.item.image_alt || line.item.title)
      return `<article class="cart-line">${photo ? `<a class="cart-line__photo" href="/product/${line.item.id}">${photo}</a>` : ''}<div class="cart-line__info"><h2><a href="/product/${line.item.id}">${escapeHtml(line.item.title)}</a></h2>${line.variant ? `<p>${escapeHtml(line.variant.name)}</p>` : ''}<p>${escapeHtml(formatMoney(line.price.amount, priced.prefix, priced.suffix))}</p></div>
<form action="/cart/update" class="cart-line__form" method="post"><input name="key" type="hidden" value="${line.key}"><label>${t.quantity}<input max="${maxQuantity}" min="1" name="quantity" required type="number" value="${line.quantity}"></label><button class="button button--small button--ghost" type="submit">${t.update}</button></form>
<form action="/cart/update" class="cart-line__remove" method="post"><input name="key" type="hidden" value="${line.key}"><input name="quantity" type="hidden" value="0"><button class="link-button" type="submit">${t.remove}</button></form>
<p class="cart-line__total">${escapeHtml(money(line.price.amount * line.quantity))}</p></article>`
    })
    .join('')
  const free = priced.freeOver === null ? '' : priced.freeLeft ? `<p class="free-shipping">${t.freeShipLeft.replace('{amount}', escapeHtml(money(priced.freeLeft)))}</p>` : `<p class="free-shipping free-shipping--done">${t.freeShipDone}</p>`
  return withCookie(page(
    site,
    url,
    t.cart,
    `<h1>${t.cart}</h1>${priced.changed || url.searchParams.has('changed') ? `<p role="alert">${t.itemsRemoved}</p>` : ''}${free}${rows}${totals(t, money, priced.subtotal, priced.shipping, priced.total)}
<div class="cart-actions"><a class="button" href="/checkout">${t.checkout}</a><a href="/">${t.keepShopping}</a></div>`,
    customer,
    priced.lines.reduce((sum, line) => sum + line.quantity, 0),
  ))
}

async function updateCart(request: Request, url: URL, adding: boolean, env: Env, site: SiteRow) {
  const form = await request.formData().catch((): null => null)
  const cart = readCart(request)
  const itemId = Number(form?.get('item'))
  const variantId = Number(form?.get('variant'))
  const key = adding ? `${itemId}${variantId ? `_${variantId}` : ''}` : String(form?.get('key') ?? '')
  if (!/^\d{1,10}(_\d{1,10})?$/.test(key)) return see(url, '/cart')
  const asked = Math.floor(Number(form?.get('quantity') ?? 1))
  if (adding) {
    // A product with options needs one chosen, so send people back to choose.
    const item = await getProduct(env, site.id, itemId)
    if (item?.variants?.length && !item.variants.some((option) => option.id === variantId)) return see(url, `/product/${itemId}?choose=1`)
  }
  const quantity = Math.min(adding ? (cart.get(key) ?? 0) + (Number.isFinite(asked) && asked > 0 ? asked : 1) : Number.isFinite(asked) ? asked : 1, maxQuantity)
  if (quantity > 0 && (cart.has(key) || cart.size < maxLines)) cart.set(key, quantity)
  else if (quantity <= 0) cart.delete(key)
  return see(url, '/cart', cartCookie(url, cart))
}

// With a total, PromptPay is offered only if that amount fits in a QR code.
const paymentChoices = (env: Env, settings: Settings, total?: number) => [
  // Cards are never charged in test mode.
  ...(canPayByCard(env, settings) && !env.test ? ['card'] : []),
  ...(canPayByPromptPay(settings) && (total === undefined || promptPayAmountOk(total)) ? ['promptpay'] : []),
  ...(settings.payTransfer ? ['transfer'] : []),
  ...(settings.payCod ? ['cod'] : []),
]

const paymentName = (t: ReturnType<typeof words>, payment: string) => ({ card: t.payCard, cod: t.payCod, promptpay: t.payPromptPay, transfer: t.payTransfer })[payment] ?? payment

async function checkoutPage(request: Request, env: Env, url: URL, site: SiteRow, customer: Customer | null, error?: string, values: Record<string, string> = {}) {
  const settings = JSON.parse(site.settings) as Settings
  const t = words(settings.language)
  const priced = await priceCart(env, site, readCart(request))
  if (priced.changed) return see(url, '/cart?changed=1', cleanCookie(url, priced.lines))
  if (!priced.lines.length) return see(url, '/cart')
  const money = (amount: number) => formatMoney(amount, priced.prefix, priced.suffix)
  const choices = paymentChoices(env, settings, priced.total)
  const payment = values.payment ?? choices[0]
  return page(
    site,
    url,
    t.checkout,
    `<h1>${t.checkout}</h1>${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
<ul class="cart-summary">${priced.lines.map((line) => `<li><span>${escapeHtml(lineName(line))} × ${line.quantity}</span><span>${escapeHtml(money(line.price.amount * line.quantity))}</span></li>`).join('')}</ul>
${totals(t, money, priced.subtotal, priced.shipping, priced.total)}
<form action="/checkout" class="contact-form" method="post">
<label>${t.name}<input autocomplete="name" maxlength="120" name="name" required value="${escapeHtml(values.name ?? customer?.name)}"></label>
<label>${t.phone}<input autocomplete="tel" maxlength="30" name="phone" required type="tel" value="${escapeHtml(values.phone)}"></label>
<label>${canSendEmail(env, settings) ? t.emailForOrder : t.emailOptional}<input autocomplete="email" maxlength="254" name="email" type="email" value="${escapeHtml(values.email ?? customer?.email)}"></label>
<label>${t.address}<textarea autocomplete="street-address" maxlength="1000" name="address" required rows="3">${escapeHtml(values.address)}</textarea></label>
<label>${t.note}<textarea maxlength="1000" name="note" rows="2">${escapeHtml(values.note)}</textarea></label>
${settings.newsletter ? `<label class="check"><input${values.newsletter === 'on' ? ' checked' : ''} name="newsletter" type="checkbox"> ${escapeHtml(t.newsAsk.replace('{site}', settings.name))}</label>` : ''}
<fieldset class="cart-payment"><legend>${t.payment}</legend>${choices.map((choice) => `<label class="check"><input${choice === payment ? ' checked' : ''} name="payment" required type="radio" value="${choice}"> ${paymentName(t, choice)}</label>`).join('')}</fieldset>
<label aria-hidden="true" class="trap">Leave this empty<input autocomplete="off" name="website" tabindex="-1"></label>
<button class="button" type="submit">${t.placeOrder}</button></form>`,
    customer,
    cartCount(request),
  )
}

const takeStock = (env: Env, itemId: number, variantId: null | number, quantity: number) =>
  variantId
    ? env.DB.prepare('UPDATE item_variants SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL').bind(quantity, variantId)
    : env.DB.prepare('UPDATE items SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL').bind(quantity, itemId)

export type OrderValues = { address: string; email?: string; name: string; note: string; payment: string; phone: string }

/** Checks and records an order. The checkout page and the API both come through here, so prices and stock follow one set of rules. */
export async function submitOrder(request: Request, env: Env, site: SiteRow, cart: Map<string, number>, values: OrderValues, customer: Customer | null, idempotencyKey?: string) {
  const settings = JSON.parse(site.settings) as Settings
  if (!values.name || values.name.length > 120 || !values.address || values.address.length > 1000 || values.note.length > 1000 || !/^[+\d][\d\s()-]{4,29}$/.test(values.phone)) return { problem: 'details' as const }
  if (values.email && !isEmail(values.email)) return { problem: 'details' as const }
  // A logged-in customer who leaves it empty still gets the confirmation, at their account's address.
  const email = values.email || customer?.email || ''
  if (!paymentChoices(env, settings).includes(values.payment)) return { problem: 'details' as const }
  // Check a retry before rate limits, current stock or current prices: those can legitimately change
  // after the original request succeeded, but must not turn its retry into a second order.
  const idempotencyHash = idempotencyKey ? await sha256(JSON.stringify({ customer: customer?.id ?? null, lines: [...cart].sort(), values })) : null
  if (idempotencyKey) {
    const prior = await env.DB.prepare('SELECT * FROM orders WHERE site_id = ? AND idempotency_key = ?').bind(site.id, idempotencyKey).first<Order & { idempotency_hash: string }>()
    if (prior) {
      if (prior.idempotency_hash !== idempotencyHash) return { problem: 'idempotency' as const }
      return { lines: (await orderLines(env, [prior.id])).get(prior.id) ?? [], order: prior, replayed: true }
    }
  }
  if (!(await allowAttempt(request, env, 'order', 20, 3600))) return { problem: 'busy' as const }
  const since = new Date(Date.now() - 3_600_000).toISOString()
  const recent = await env.DB.prepare('SELECT COUNT(*) AS total FROM orders WHERE site_id = ? AND created_at > ?').bind(site.id, since).first<{ total: number }>()
  if ((recent?.total ?? 0) >= maxOrdersPerHour) return { problem: 'busy' as const }

  const priced = await priceCart(env, site, cart)
  if (priced.changed) return { lines: priced.lines, problem: 'changed' as const }
  if (!priced.lines.length) return { problem: 'empty' as const }
  if (!paymentChoices(env, settings, priced.total).includes(values.payment)) return { problem: 'details' as const }
  const token = newToken()
  const tokenHash = await sha256(token)
  const orderId = '(SELECT id FROM orders WHERE token_hash = ?)'
  // One batch, so a line that would oversell cancels the whole order.
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO orders (site_id, customer_id, token_hash, name, phone, email, address, note, payment, subtotal, shipping, total, money_prefix, money_suffix, language, idempotency_key, idempotency_hash, test) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(site.id, customer?.id ?? null, tokenHash, values.name, values.phone, email, values.address, values.note, values.payment, priced.subtotal, priced.shipping, priced.total, priced.prefix, priced.suffix, settings.viewLanguage ?? '', idempotencyKey ?? null, idempotencyHash, env.test ? 1 : 0),
      ...priced.lines.flatMap((line) => [
        env.DB.prepare(`INSERT INTO order_lines (order_id, item_id, variant_id, title, variant, unit_price, quantity) VALUES (${orderId}, ?, ?, ?, ?, ?, ?)`).bind(tokenHash, line.item.id, line.variant?.id ?? null, line.item.title, line.variant?.name ?? '', line.price.amount, line.quantity),
        // A test order takes no stock, so cancelling it gives none back either.
        ...(env.test ? [] : [takeStock(env, line.item.id, line.variant?.id ?? null, line.quantity)]),
      ]),
    ])
  } catch (error) {
    if (idempotencyKey && String(error).includes('UNIQUE constraint')) {
      const prior = await env.DB.prepare('SELECT * FROM orders WHERE site_id = ? AND idempotency_key = ?').bind(site.id, idempotencyKey).first<Order & { idempotency_hash: string }>()
      if (prior?.idempotency_hash === idempotencyHash) return { lines: (await orderLines(env, [prior.id])).get(prior.id) ?? [], order: prior, replayed: true }
      return { problem: 'idempotency' as const }
    }
    if (!String(error).includes('CHECK constraint')) throw error
    return { problem: 'stock' as const }
  }
  const order = await env.DB.prepare('SELECT * FROM orders WHERE token_hash = ?').bind(tokenHash).first<Order>()
  const lines = (await orderLines(env, [order!.id])).get(order!.id) ?? []
  await countConversion(env, site, 'order')
  await fireEvent(env, site.id, 'order.created', orderForApi(order!, lines))
  await emailOrder(env, settings, new URL(request.url).origin, order!, lines, token)
  return { lines, order: order!, token }
}

/** An order's items, delivery, total and payment, as label and value pairs for an email. */
function orderFacts(order: Order, lines: OrderLine[], t: ReturnType<typeof words>): [string, string][] {
  const money = (amount: number) => formatMoney(amount, order.money_prefix, order.money_suffix)
  return [
    ...lines.map((line): [string, string] => [`${line.title}${line.variant ? ` · ${line.variant}` : ''} × ${line.quantity}`, money(line.unit_price * line.quantity)]),
    [t.shipping, order.shipping ? money(order.shipping) : t.free],
    [t.total, money(order.total)],
    [t.payment, paymentName(t, order.payment)],
  ]
}

/** The customer gets their private order link, and the owner hears about the order. Both go after the customer has their answer. */
async function emailOrder(env: Env, settings: Settings, origin: string, order: Order, lines: OrderLine[], token: string) {
  const number = orderNumber(order.id)
  if (isEmail(order.email) && canSendEmail(env, settings)) {
    const t = words(settings.language)
    await later(
      env,
      sendEmail(env, settings, order.email, {
        after: [
          ...(order.payment === 'transfer' && settings.transferDetails ? [`${t.transferHow}\n${settings.transferDetails}`] : []),
          // The QR code stays on the order page: many email apps block images, and the page always shows the current amount and status.
          ...(order.payment === 'promptpay' ? [t.promptPayEmail.replace('{amount}', () => formatMoney(order.total, order.money_prefix, order.money_suffix))] : []),
          `${t.deliverTo}\n${order.name}\n${order.phone}\n${order.address}`, t.orderEmailKeep],
        facts: orderFacts(order, lines, t),
        heading: `${t.order} ${number}`,
        lines: [t.orderPlaced],
        link: { href: `${origin}${languagePrefix(settings)}/order/${token}`, label: t.orderEmailLink },
        replyTo: settings.email,
        subject: t.orderEmailSubject.replace('{number}', number),
      }),
    )
  }
  await tellOwner(env, (_settings, t) => ({
    after: [t.ownerEmailMore],
    facts: [...orderFacts(order, lines, t), [t.name, order.name], [t.phone, order.phone], [t.email, order.email], [t.address, order.address], [t.orderNote, order.note]],
    heading: t.newOrder.replace('{number}', number),
    replyTo: order.email,
    subject: t.newOrder.replace('{number}', number),
  }))
}

/** An order as other systems see it. Its secret link hash stays in the database. */
export function orderForApi(order: Order, lines: OrderLine[]) {
  const { site_id: _site, token_hash: _hash, idempotency_hash: _idempotencyHash, idempotency_key: _idempotencyKey, ...shown } = order as Order & { idempotency_hash?: string; idempotency_key?: string; token_hash?: string }
  return { ...shown, lines: lines.map(({ order_id: _order, ...line }) => line) }
}

async function placeOrder(request: Request, env: Env, url: URL, site: SiteRow, customer: Customer | null) {
  const settings = JSON.parse(site.settings) as Settings
  const t = words(settings.language)
  if (Number(request.headers.get('content-length') || 0) > maxBodyBytes) return see(url, '/checkout')
  const form = await request.formData().catch((): null => null)
  if (!form) return see(url, '/checkout')
  // Bots fill in the hidden field. Send them away and keep nothing.
  if (form.get('website')) return see(url, '/')
  const values = Object.fromEntries(['name', 'phone', 'email', 'address', 'note', 'payment'].map((key) => [key, String(form.get(key) ?? '').trim()])) as OrderValues
  const newsletter = settings.newsletter && form.get('newsletter') === 'on' ? 'on' : ''
  const placed = await submitOrder(request, env, site, readCart(request), values, customer)
  if (placed.problem === 'details') return checkoutPage(request, env, url, site, customer, t.checkDetails, { ...values, newsletter })
  if (placed.problem === 'busy') return checkoutPage(request, env, url, site, customer, t.busy, { ...values, newsletter })
  if (placed.problem === 'changed') return see(url, '/cart?changed=1', cleanCookie(url, placed.lines as Line[]))
  if (placed.problem === 'stock') return see(url, '/cart?changed=1')
  if (!placed.order) return see(url, '/cart')
  // Only when they ticked the box themselves. It starts unticked, and they still confirm by email.
  if (newsletter && placed.order.email) await addSubscriber(env, site, url.origin, { customerId: customer?.id ?? null, email: placed.order.email, name: placed.order.name, source: 'checkout' })
  // A visitor of an extra language comes back from paying to the order in their language.
  const orderPath = `${languagePrefix(settings)}/order/${placed.token}`
  const empty = cartCookie(url, new Map())
  if (values.payment !== 'card') return see(url, `${orderPath}?new=1`, empty)
  const payUrl = await startCardPayment(env, url, settings, placed.order, placed.lines as OrderLine[], orderPath)
  return payUrl ? new Response(null, { headers: { 'Cache-Control': 'no-store', Location: payUrl, 'Set-Cookie': empty }, status: 303 }) : see(url, `${orderPath}?payfail=1`, empty)
}

/** Who changed an order: for its history, and for the link in the customer's email. */
export type OrderChange = { actor: 'api' | 'claude' | 'owner' | 'staff' | 'system'; notifyCustomer?: boolean; origin: string; staff?: Customer | null }

// Customers hear about these. Going back to pending is someone fixing a mistake, so it stays quiet.
const emailedStatuses = ['paid', 'shipped', 'done', 'cancelled']

/** Changes an order's status. Cancelling puts its items back in stock, and un-cancelling takes them out again. */
export async function setOrderStatus(env: Env, siteId: number, id: number, status: string, change?: OrderChange) {
  const order = await env.DB.prepare('SELECT status, test FROM orders WHERE id = ? AND site_id = ?').bind(id, siteId).first<{ status: string; test: number }>()
  if (!order) return 'missing'
  // Choosing the status an order already has changes nothing, so nothing is logged, sent or emailed.
  if (order.status === status) return 'ok'
  const direction = order.test ? 0 : order.status !== 'cancelled' && status === 'cancelled' ? -1 : order.status === 'cancelled' && status !== 'cancelled' ? 1 : 0
  const lines = direction ? ((await orderLines(env, [id])).get(id) ?? []) : []
  let changed = 0
  try {
    // Only from the status just read, so two people pressing at the same moment can't both email the customer.
    const [result] = await env.DB.batch([
      env.DB.prepare("UPDATE orders SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND site_id = ? AND status = ?").bind(status, id, siteId, order.status),
      ...lines.filter((line) => line.item_id !== null).map((line) => takeStock(env, line.item_id!, line.variant_id, line.quantity * direction)),
    ])
    changed = result.meta.changes
  } catch (error) {
    if (String(error).includes('CHECK constraint')) return 'no-stock'
    throw error
  }
  if (!changed) return 'ok'
  if (change) {
    const name = change.staff ? `${change.staff.name} <${change.staff.email}>` : ''
    await env.DB.prepare('INSERT INTO order_events (order_id, status, actor, customer_id, actor_name) VALUES (?, ?, ?, ?, ?)').bind(id, status, change.actor, change.staff?.id ?? null, name).run()
  }
  // A test order stays quiet when the owner moves it on: no emails, chats or webhooks.
  if (order.test) return 'ok'
  await fireEvent(env, siteId, 'order.updated', { id, status })
  if (change && change.notifyCustomer !== false && emailedStatuses.includes(status)) await emailStatus(env, change.origin, id)
  return 'ok'
}

/** Card checkout reserves stock before Stripe confirms payment. Release abandoned holds after one hour, but never touch bank, PromptPay or COD orders. */
export async function releaseExpiredCardOrders(env: Env, now = Date.now()) {
  const before = new Date(now - 3_600_000).toISOString()
  const { results } = await env.DB.prepare("SELECT id, site_id FROM orders WHERE payment = 'card' AND status = 'pending' AND created_at < ? ORDER BY id LIMIT 100").bind(before).all<{ id: number; site_id: number }>()
  let released = 0
  for (const order of results) {
    if ((await setOrderStatus(env, order.site_id, order.id, 'cancelled', { actor: 'system', notifyCustomer: false, origin: '' })) === 'ok') released += 1
  }
  return released
}

/** Tells the customer their order moved on. Only a hash of the first private link is kept, so the email brings a new link to the same order. */
async function emailStatus(env: Env, origin: string, id: number) {
  // Without a key there is nothing to send, so skip even reading the order.
  if (!env.RESEND_API_KEY) return
  await later(
    env,
    (async () => {
      const site = await getSite(env)
      if (!site) return
      const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ? AND site_id = ?').bind(id, site.id).first<Order>()
      // In the language the customer ordered in, while the site still has it.
      const settings = localizeSettings(JSON.parse(liveSite(site).settings) as Settings, order?.language || null)
      if (!order || !isEmail(order.email) || !canSendEmail(env, settings)) return
      const t = words(settings.language)
      const token = newToken()
      await env.DB.prepare('INSERT INTO order_links (token_hash, order_id) VALUES (?, ?)').bind(await sha256(token), order.id).run()
      const lines = (await orderLines(env, [order.id])).get(order.id) ?? []
      const number = orderNumber(order.id)
      const state = t.orderState[order.status] ?? order.status
      await sendEmail(env, settings, order.email, {
        after: [t.orderEmailKeep],
        facts: [[t.orderStatus, state], ...orderFacts(order, lines, t)],
        heading: `${t.order} ${number}: ${state}`,
        lines: [t.statusEmail[order.status] ?? ''],
        link: { href: `${origin}${languagePrefix(settings)}/order/${token}`, label: t.orderEmailLink },
        replyTo: settings.email,
        subject: t.statusEmailSubject.replace('{number}', number).replace('{status}', state),
      })
    })(),
  )
}

/** Finds an order by a private link: the one from checkout, or one sent later in a status email. */
async function orderByToken(env: Env, siteId: number, token: string, extra = '') {
  const hash = await sha256(token)
  return env.DB.prepare(`SELECT * FROM orders WHERE site_id = ? AND (token_hash = ? OR id = (SELECT order_id FROM order_links WHERE token_hash = ?))${extra}`).bind(siteId, hash, hash).first<Order>()
}

export type OrderEvent = { actor: string; actor_name: string; created_at: string; order_id: number; status: string }

/** Each order's status changes, oldest first, for the back office. */
export async function orderHistory(env: Env, ids: number[]) {
  const history = new Map<number, OrderEvent[]>()
  if (!ids.length) return history
  const { results } = await env.DB.prepare(`SELECT order_id, status, actor, actor_name, created_at FROM order_events WHERE order_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`).bind(...ids).all<OrderEvent>()
  for (const event of results) history.set(event.order_id, [...(history.get(event.order_id) ?? []), event])
  return history
}

export async function orderLines(env: Env, ids: number[]) {
  if (!ids.length) return new Map<number, OrderLine[]>()
  const { results } = await env.DB.prepare(`SELECT * FROM order_lines WHERE order_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`).bind(...ids).all<OrderLine>()
  const lines = new Map<number, OrderLine[]>()
  for (const line of results) lines.set(line.order_id, [...(lines.get(line.order_id) ?? []), line])
  return lines
}

export const orderNumber = (id: number) => `#${String(id).padStart(4, '0')}`

/** The order's items and totals, shared by the customer's order page, account page and back office. */
export function orderDetails(order: Order, lines: OrderLine[], t: ReturnType<typeof words>) {
  const money = (amount: number) => formatMoney(amount, order.money_prefix, order.money_suffix)
  return `<ul class="cart-summary">${lines.map((line) => `<li><span>${escapeHtml(line.title)}${line.variant ? ` · ${escapeHtml(line.variant)}` : ''} × ${line.quantity}</span><span>${escapeHtml(money(line.unit_price * line.quantity))}</span></li>`).join('')}</ul>${totals(t, money, order.subtotal, order.shipping, order.total)}`
}

export { paymentName }

async function orderPage(request: Request, env: Env, url: URL, site: SiteRow, customer: Customer | null, token: string) {
  const settings = JSON.parse(site.settings) as Settings
  const t = words(settings.language)
  const order = await orderByToken(env, site.id, token)
  // A wrong link looks the same as a page that doesn't exist.
  if (!order) return notFound()
  const lines = (await orderLines(env, [order.id])).get(order.id) ?? []
  const waiting = order.status === 'pending'
  const cardDue = waiting && order.payment === 'card' && canPayByCard(env, settings)
  return page(
    site,
    url,
    `${t.order} ${orderNumber(order.id)}`,
    `<h1>${t.order} ${orderNumber(order.id)}</h1>
${url.searchParams.has('new') ? `<p role="status">${t.orderPlaced}</p>` : ''}${url.searchParams.has('payfail') ? `<p role="alert">${t.cardFailed}</p>` : ''}${url.searchParams.has('paid') && waiting ? `<p role="status">${t.cardChecking}</p>` : ''}
<p><strong>${t.orderStatus}:</strong> ${escapeHtml(t.orderState[order.status] ?? order.status)}<br><strong>${t.payment}:</strong> ${paymentName(t, order.payment)}</p>
${cardDue ? `<form action="/order/${escapeHtml(token)}/pay" method="post"><button class="button" type="submit">${t.payNow}</button></form>` : ''}
${waiting && order.payment === 'transfer' && settings.transferDetails ? `<div class="card cart-transfer"><h2>${t.transferHow}</h2><p class="pre-line">${escapeHtml(settings.transferDetails)}</p></div>` : ''}
${waiting && order.payment === 'promptpay' ? promptPayCard(order, settings, t) : ''}
${orderDetails(order, lines, t)}
<h2>${t.deliverTo}</h2><p class="pre-line">${escapeHtml(order.name)}<br>${escapeHtml(order.phone)}<br>${escapeHtml(order.address)}</p>
${customer ? '' : `<p role="alert">${t.keepOrderLink}</p>`}
<a class="button button--ghost" href="/">${t.keepShopping}</a>`,
    customer,
    cartCount(request),
  )
}

/** The QR code for this order's exact amount, with plain steps. It is drawn on the server, so the page still needs no scripts. */
function promptPayCard(order: Order, settings: Settings, t: ReturnType<typeof words>) {
  const amount = formatMoney(order.total, order.money_prefix, order.money_suffix)
  // The ID comes from today's settings. If the owner has since removed it, say so rather than show a code for nobody.
  const payload = settings.payPromptPay && settings.promptPayId ? promptPayPayload(settings.promptPayId, order.total) : null
  if (!payload) return `<div class="card cart-transfer"><h2>${t.promptPayHeading}</h2><p>${t.promptPayMissing}</p></div>`
  const name = settings.promptPayName ? escapeHtml(settings.promptPayName) : ''
  return `<div class="card cart-transfer cart-promptpay"><h2>${t.promptPayHeading}</h2>
<div class="promptpay-qr">${qrSvg(payload, t.promptPayQrLabel.replace('{amount}', () => amount))}</div>
<p class="promptpay-amount"><strong>${t.promptPayAmount}:</strong> ${escapeHtml(amount)}</p>${name ? `<p class="promptpay-amount">${t.promptPayName}: ${name}</p>` : ''}
<ol class="promptpay-steps"><li>${t.promptPayStepOpen}</li><li>${escapeHtml(t.promptPayStepScan.replace('{amount}', () => amount))}${name ? ` ${t.promptPayStepName.replace('{name}', () => name)}` : ''}</li><li>${t.promptPayStepConfirm}</li></ol>
<p>${t.promptPayPhone}</p></div>`
}

async function payAgain(env: Env, url: URL, site: SiteRow, token: string) {
  const settings = JSON.parse(site.settings) as Settings
  const order = await orderByToken(env, site.id, token, " AND payment = 'card' AND status = 'pending'")
  if (!order || !canPayByCard(env, settings)) return see(url, `/order/${token}`)
  const lines = (await orderLines(env, [order.id])).get(order.id) ?? []
  const payUrl = await startCardPayment(env, url, settings, order, lines, `/order/${token}`)
  return payUrl ? new Response(null, { headers: { 'Cache-Control': 'no-store', Location: payUrl }, status: 303 }) : see(url, `/order/${token}?payfail=1`)
}

async function productPage(request: Request, env: Env, url: URL, site: SiteRow, id: number) {
  const settings = JSON.parse(site.settings) as Settings
  const t = words(settings.language)
  const item = await getProduct(env, site.id, id, settings.viewLanguage)
  if (!item) return notFound()
  const customer = settings.accounts ? await getCustomer(request, env, site.id) : null
  const options = item.variants ?? []
  const available = isAvailable(item)
  const firstOpen = options.find((option) => option.stock === null || option.stock > 0)
  const buyable = settings.cart && !item.link_href && available && parsePrice(firstOpen?.price || item.price)
  const compare = item.compare_price
  const photo = pageImage(item.image_url, item.image_alt || item.title, true)
  const picker = options.length
    ? `<fieldset class="option-picker"><legend>${t.option}</legend>${options
        .map((option) => {
          const soldOut = option.stock === 0
          return `<label class="option-pill${soldOut ? ' option-pill--out' : ''}"><input${option === firstOpen ? ' checked' : ''}${soldOut ? ' disabled' : ''} name="variant" required type="radio" value="${option.id}"><span>${escapeHtml(option.name)}${option.price ? ` · ${escapeHtml(option.price)}` : ''}${soldOut ? ` (${t.soldOut})` : ''}</span></label>`
        })
        .join('')}</fieldset>`
    : ''
  const stockNote = !options.length && item.stock !== null && item.stock > 0 && item.stock <= lowStock ? `<p class="product-page__stock">${t.stockLeft.replace('{n}', String(item.stock))}</p>` : ''
  const buy = buyable
    ? `<form action="/cart/add" class="product-page__buy" method="post"><input name="item" type="hidden" value="${item.id}">${picker}${stockNote}<label class="product-page__quantity">${t.quantity}<input max="${maxQuantity}" min="1" name="quantity" type="number" value="1"></label><button class="button product-page__add" type="submit">${t.addToCart}</button></form>`
    : item.link_href
      ? `<a class="button" href="${escapeHtml(item.link_href)}">${escapeHtml(item.link_label || t.viewDetails)}</a>`
      : !available
        ? `<p class="product-page__sold-out">${t.soldOut}</p>`
        : ''
  const free = settings.cart && settings.freeShippingOver && settings.shippingFee ? (() => {
    const price = parsePrice(item.price)
    return price ? `<p class="product-page__note">${t.freeShipOver.replace('{amount}', escapeHtml(formatMoney(Math.round(settings.freeShippingOver * 100), price.prefix, price.suffix)))}</p>` : ''
  })() : ''
  const price = parsePrice(firstOpen?.price || item.price)
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    description: item.body || item.title,
    ...(item.image_url ? { image: item.image_url.startsWith('/') ? `${url.origin}${item.image_url}` : item.image_url } : {}),
    name: item.title,
    ...(price && settings.currency ? { offers: { '@type': 'Offer', availability: `https://schema.org/${available ? 'InStock' : 'OutOfStock'}`, price: (price.amount / 100).toFixed(2), priceCurrency: settings.currency.toUpperCase(), url: `${url.origin}${languagePrefix(settings)}${url.pathname}` } } : {}),
  }).replace(/</g, '\\u003c')
  return html(
    renderLayout(site, {
      canonical: `${url.origin}${url.pathname}`,
      cartCount: cartCount(request),
      customer,
      description: (item.body || item.title).slice(0, 160),
      head: `<script type="application/ld+json">${jsonLd}</script>`,
      main: `<section class="block tone-plain"><div class="wrap product-page">${photo ? `<div class="product-page__image">${photo}</div>` : ''}<div class="product-page__info">${item.category ? `<p class="eyebrow">${escapeHtml(item.category)}</p>` : ''}<h1>${escapeHtml(item.title)}</h1><p class="product-price">${item.price ? `<strong>${escapeHtml(item.price)}</strong>` : ''}${compare ? `<s>${escapeHtml(compare)}</s>` : ''}</p>${url.searchParams.has('choose') ? `<p role="alert">${t.chooseOptions}</p>` : ''}${item.body ? `<div class="prose">${item.body.split(/\n\s*\n/).filter(Boolean).map((part) => `<p>${escapeHtml(part)}</p>`).join('')}</div>` : ''}${buy}${free}</div></div></section>`,
      title: `${item.title} | ${settings.name}`,
    }),
  )
}

/** Handles product, cart, checkout and order pages. */
export async function handleShop(request: Request, env: Env, url: URL, site: SiteRow, parts: string[]) {
  const settings = JSON.parse(site.settings) as Settings
  const post = request.method === 'POST'
  if (parts[0] === 'product' && parts.length === 2 && /^\d{1,10}$/.test(parts[1]) && !post) return productPage(request, env, url, site, Number(parts[1]))
  // Old order links keep working after the cart is turned off.
  if (parts[0] === 'order' && /^[0-9a-f]{64}$/.test(parts[1] ?? '')) {
    if (parts.length === 3 && parts[2] === 'pay' && post) return payAgain(env, url, site, parts[1])
    if (parts.length === 2 && !post) {
      const reader = settings.accounts ? await getCustomer(request, env, site.id) : null
      return orderPage(request, env, url, site, reader, parts[1])
    }
    return notFound()
  }
  if (!settings.cart) return notFound()
  const customer = settings.accounts ? await getCustomer(request, env, site.id) : null

  if (parts[0] === 'cart' && parts.length === 1 && !post) return cartPage(request, env, url, site, customer)
  if (parts[0] === 'cart' && parts.length === 2 && post && parts[1] === 'add') return updateCart(request, url, true, env, site)
  if (parts[0] === 'cart' && parts.length === 2 && post && parts[1] === 'update') return updateCart(request, url, false, env, site)
  if (parts[0] === 'checkout' && parts.length === 1) {
    if (settings.cartMembersOnly && settings.accounts && !customer) return see(url, '/login?next=/checkout')
    return post ? placeOrder(request, env, url, site, customer) : checkoutPage(request, env, url, site, customer)
  }
  return notFound()
}
