import { allowAttempt, createResetLink, endCookie, endSession, getCustomer, hashPassword, registerCustomer, sha256, startSession, verifyLogin, withinLimit } from './auth'
import { canSendEmail, isEmail, later, sendEmail } from './email'
import { canUseGoogle, endGoogleCookie, finishGoogle, startGoogle } from './google'
import { escapeHtml, html, notFound, privateHeaders, see } from './http'
import { entryFields } from './owner'
import { renderLayout } from './render'
import { orderDetails, orderLines, orderNumber, paymentName } from './shop'
import { words } from './text'
import type { Customer, Env, FormField, Order, Settings, SiteRow } from './types'

const maxBodyBytes = 16 * 1024

const safeNext = (value: unknown) => (typeof value === 'string' && /^\/[a-z0-9-]*$/.test(value) ? value : '/')

const page = (site: SiteRow, url: URL, title: string, body: string, customer: Customer | null = null) =>
  html(
    renderLayout(site, {
      canonical: `${url.origin}${url.pathname}`,
      customer,
      description: title,
      main: `<section class="block tone-plain"><div class="wrap account">${body}</div></section>`,
      robots: 'noindex',
      title,
    }),
    200,
    privateHeaders,
  )

const message = (text?: string, role = 'alert') => (text ? `<p role="${role}">${escapeHtml(text)}</p>` : '')

// Shown only once the owner has added both Google secrets in Cloudflare. A link, not a form, because the page's rules only let forms post to this site.
const googleButton = (env: Env, t: ReturnType<typeof words>, next: string) =>
  canUseGoogle(env) ? `<p><a class="button button--ghost" href="/login/google?next=${encodeURIComponent(next)}">${t.continueWithGoogle}</a></p><p>${t.orEmail}</p>` : ''

function loginPage(env: Env, site: SiteRow, url: URL, error?: string) {
  const settings = JSON.parse(site.settings) as Settings
  const t = words(settings.language)
  const next = safeNext(url.searchParams.get('next'))
  return page(
    site,
    url,
    t.logIn,
    `<h1>${t.logIn}</h1>${message(error)}${url.searchParams.has('changed') ? message(t.passwordChanged, 'status') : ''}${googleButton(env, t, next)}
<form action="/login" class="contact-form" method="post"><input name="next" type="hidden" value="${escapeHtml(next)}">
<label>${t.email}<input autocomplete="email" maxlength="254" name="email" required type="email"></label>
<label>${t.password}<input autocomplete="current-password" maxlength="200" name="password" required type="password"></label>
<button class="button" type="submit">${t.logIn}</button></form>
${canSendEmail(env, settings) ? `<p class="account__alt"><a href="/reset">${t.forgotPassword}</a></p>` : ''}
<p class="account__alt">${t.noAccount} <a href="/signup?next=${encodeURIComponent(next)}">${t.signUp}</a></p>`,
  )
}

function signupPage(env: Env, site: SiteRow, url: URL, error?: string) {
  const t = words((JSON.parse(site.settings) as Settings).language)
  const next = safeNext(url.searchParams.get('next'))
  return page(
    site,
    url,
    t.newAccount,
    `<h1>${t.newAccount}</h1>${message(error)}${googleButton(env, t, next)}
<form action="/signup" class="contact-form" method="post"><input name="next" type="hidden" value="${escapeHtml(next)}">
<label>${t.name}<input autocomplete="name" maxlength="120" name="name" required></label>
<label>${t.email}<input autocomplete="email" maxlength="254" name="email" required type="email"></label>
<label>${t.password}<input autocomplete="new-password" maxlength="200" minlength="8" name="password" required type="password"></label>
<label aria-hidden="true" class="trap">Leave this empty<input autocomplete="off" name="website" tabindex="-1"></label>
<button class="button" type="submit">${t.signUp}</button></form>
<p class="account__alt">${t.haveAccount} <a href="/login?next=${encodeURIComponent(next)}">${t.logIn}</a></p>`,
  )
}

async function accountPage(env: Env, site: SiteRow, url: URL, customer: Customer) {
  const t = words((JSON.parse(site.settings) as Settings).language)
  const [{ results: entries }, { results: pages }] = await Promise.all([
    env.DB.prepare('SELECT form, page, data, status, created_at FROM entries WHERE site_id = ? AND customer_id = ? ORDER BY id DESC LIMIT 100').bind(site.id, customer.id).all<{ created_at: string; data: string; form: string; page: string; status: string }>(),
    env.DB.prepare('SELECT slug, blocks FROM pages WHERE site_id = ?').bind(site.id).all<{ blocks: string; slug: string }>(),
  ])
  const { results: orders } = await env.DB.prepare('SELECT * FROM orders WHERE site_id = ? AND customer_id = ? ORDER BY id DESC LIMIT 50').bind(site.id, customer.id).all<Order>()
  const lines = await orderLines(env, orders.map((order) => order.id))
  const orderRows = orders
    .map((order) => `<article class="card account__record"><h3>${t.order} ${orderNumber(order.id)} · ${escapeHtml(t.orderState[order.status] ?? order.status)}</h3><p class="post-date">${escapeHtml(order.created_at.slice(0, 16).replace('T', ' '))} UTC · ${paymentName(t, order.payment)}</p>${orderDetails(order, lines.get(order.id) ?? [], t)}</article>`)
    .join('')
  const labels = entryFields(pages)
  const rows = entries.length
    ? entries
        .map((entry) => {
          const data = JSON.parse(entry.data) as Record<string, unknown>
          const fields: FormField[] = labels.get(`${entry.page}/${entry.form}`) ?? Object.keys(data).map((name) => ({ label: name, name, type: 'text' }))
          const list = fields
            .filter((field) => data[field.name] !== undefined)
            .map((field) => `<div><dt>${escapeHtml(field.label)}</dt><dd class="pre-line">${escapeHtml(data[field.name] === true ? '✓' : data[field.name] === false ? '—' : data[field.name])}</dd></div>`)
            .join('')
          return `<article class="card account__record"><h3>${escapeHtml(t.status[entry.status] ?? entry.status)}</h3><p class="post-date">${escapeHtml(entry.created_at.slice(0, 16).replace('T', ' '))} UTC</p><dl>${list}</dl></article>`
        })
        .join('')
    : `<p>${t.historyEmpty}</p>`
  return page(
    site,
    url,
    t.account,
    `<h1>${t.account}</h1><p>${escapeHtml(customer.name)}<br>${escapeHtml(customer.email)}</p>
<form action="/logout" method="post"><button class="button button--small" type="submit">${t.logOut}</button></form>
${orderRows ? `<h2>${t.orders}</h2>${orderRows}` : ''}<h2>${t.history}</h2>${rows}`,
    customer,
  )
}

async function receive(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > maxBodyBytes) return null
  return request.formData().catch((): null => null)
}

async function login(request: Request, env: Env, url: URL, site: SiteRow) {
  const t = words((JSON.parse(site.settings) as Settings).language)
  if (!(await allowAttempt(request, env, 'login', 10, 900))) return loginPage(env, site, url, t.busy)
  const form = await receive(request)
  const id = await verifyLogin(env, site.id, String(form?.get('email') ?? ''), String(form?.get('password') ?? ''))
  if (!id) return loginPage(env, site, url, t.badLogin)
  return see(url, safeNext(form?.get('next')), await startSession(env, url, id))
}

async function signup(request: Request, env: Env, url: URL, site: SiteRow) {
  const t = words((JSON.parse(site.settings) as Settings).language)
  if (!(await allowAttempt(request, env, 'signup', 10, 3600))) return signupPage(env, site, url, t.busy)
  const form = await receive(request)
  // Bots fill in the hidden field. Send them away and keep nothing.
  if (!form || form.get('website')) return see(url, '/')
  const created = await registerCustomer(env, site.id, { email: String(form.get('email') ?? ''), name: String(form.get('name') ?? ''), password: String(form.get('password') ?? '') })
  if (!created.id) return signupPage(env, site, url, created.problem === 'password' ? t.badPassword : t.badEmail)
  return see(url, safeNext(form.get('next')), await startSession(env, url, created.id))
}

async function resetPassword(request: Request, env: Env, url: URL, site: SiteRow, token: string) {
  const t = words((JSON.parse(site.settings) as Settings).language)
  const tokenHash = await sha256(token)
  const reset = await env.DB.prepare('SELECT password_resets.customer_id AS id FROM password_resets JOIN customers ON customers.id = password_resets.customer_id WHERE password_resets.token_hash = ? AND password_resets.expires_at > ? AND customers.site_id = ?')
    .bind(tokenHash, new Date().toISOString(), site.id)
    .first<{ id: number }>()
  if (!reset) {
    const again = canSendEmail(env, JSON.parse(site.settings) as Settings)
    return page(site, url, t.changePassword, `<h1>${t.changePassword}</h1>${message(again ? t.resetExpired : t.invalidReset)}${again ? `<p><a href="/reset">${t.getNewLink}</a></p>` : ''}`)
  }
  const form_ = (error?: string) =>
    page(
      site,
      url,
      t.changePassword,
      `<h1>${t.changePassword}</h1>${message(error)}<form action="/reset/${escapeHtml(token)}" class="contact-form" method="post"><label>${t.newPassword}<input autocomplete="new-password" maxlength="200" minlength="8" name="password" required type="password"></label><button class="button" type="submit">${t.changePassword}</button></form>`,
    )
  if (request.method !== 'POST') return form_()
  const form = await receive(request)
  const password = String(form?.get('password') ?? '')
  if (password.length < 8 || password.length > 200) return form_(t.badPassword)
  const secret = await hashPassword(password)
  await env.DB.batch([
    env.DB.prepare('UPDATE customers SET password_hash = ?, salt = ?, iterations = ? WHERE id = ?').bind(secret.password_hash, secret.salt, secret.iterations, reset.id),
    env.DB.prepare('DELETE FROM sessions WHERE customer_id = ?').bind(reset.id),
    env.DB.prepare('DELETE FROM password_resets WHERE customer_id = ?').bind(reset.id),
  ])
  return see(url, '/login?changed=1')
}

/** Emails a reset link if an account uses this address. It runs after the answer, so how long the answer takes can't reveal who has an account. */
export async function emailResetLink(env: Env, site: SiteRow, origin: string, address: string) {
  const settings = JSON.parse(site.settings) as Settings
  const email = address.trim().toLowerCase()
  if (!settings.accounts || !canSendEmail(env, settings) || !isEmail(email)) return
  await later(
    env,
    (async () => {
      // A few emails an hour per address, so nobody can fill someone's inbox with reset links.
      if (!(await withinLimit(env, `reset-email:${(await sha256(`${site.id}:${email}`)).slice(0, 32)}`, 3, 3600))) return
      const customer = await env.DB.prepare('SELECT id FROM customers WHERE site_id = ? AND email = ?').bind(site.id, email).first<{ id: number }>()
      if (!customer) return
      const t = words(settings.language)
      await sendEmail(env, settings, email, {
        after: [t.resetEmailIgnore],
        heading: t.changePassword,
        lines: [t.resetEmailBody.replace('{site}', settings.name)],
        link: { href: `${origin}${await createResetLink(env, customer.id)}`, label: t.changePassword },
        replyTo: settings.email,
        subject: t.resetEmailSubject,
      })
    })(),
  )
}

function askResetPage(site: SiteRow, url: URL, notice?: { error?: string; sent?: boolean }) {
  const t = words((JSON.parse(site.settings) as Settings).language)
  return page(
    site,
    url,
    t.forgotPassword,
    `<h1>${t.forgotPassword}</h1>${message(notice?.error)}${notice?.sent ? message(t.resetSent, 'status') : `<p>${t.resetIntro}</p>`}
<form action="/reset" class="contact-form" method="post">
<label>${t.email}<input autocomplete="email" maxlength="254" name="email" required type="email"></label>
<label aria-hidden="true" class="trap">Leave this empty<input autocomplete="off" name="website" tabindex="-1"></label>
<button class="button" type="submit">${t.sendResetLink}</button></form>
<p class="account__alt"><a href="/login">${t.logIn}</a></p>`,
  )
}

async function askReset(request: Request, env: Env, url: URL, site: SiteRow) {
  const t = words((JSON.parse(site.settings) as Settings).language)
  if (!(await allowAttempt(request, env, 'reset', 5, 900))) return askResetPage(site, url, { error: t.busy })
  const form = await receive(request)
  // Bots fill in the hidden field. They get the same answer as everyone, and nothing is sent.
  if (form && !form.get('website')) await emailResetLink(env, site, url.origin, String(form.get('email') ?? ''))
  return askResetPage(site, url, { sent: true })
}

/** Starts a Google login, or finishes one when Google sends the visitor back. */
async function googleLogin(request: Request, env: Env, url: URL, site: SiteRow, step?: string) {
  const t = words((JSON.parse(site.settings) as Settings).language)
  if (!step) return (await startGoogle(request, env, url, safeNext(url.searchParams.get('next')))) ?? loginPage(env, site, url, t.busy)
  const result = await finishGoogle(request, env, url, site.id)
  if ('problem' in result) {
    const problems = { busy: t.busy, cancelled: t.googleFailed, failed: t.googleFailed, taken: t.googleTaken, unverified: t.googleUnverified }
    const answer = loginPage(env, site, url, problems[result.problem])
    answer.headers.append('Set-Cookie', endGoogleCookie(url))
    return answer
  }
  const headers = new Headers({ 'Cache-Control': 'no-store', Location: `${url.origin}${safeNext(result.next)}` })
  headers.append('Set-Cookie', await startSession(env, url, result.customerId))
  headers.append('Set-Cookie', endGoogleCookie(url))
  return new Response(null, { headers, status: 303 })
}

/** Handles the customer account pages. They exist only when the site turns accounts on. */
export async function handleAccount(request: Request, env: Env, url: URL, site: SiteRow, parts: string[]) {
  if (!(JSON.parse(site.settings) as Settings).accounts) return notFound()
  const post = request.method === 'POST'
  if (parts[0] === 'reset' && parts.length === 2 && /^[0-9a-f]{64}$/.test(parts[1])) return resetPassword(request, env, url, site, parts[1])
  if (parts[0] === 'login' && parts[1] === 'google' && (parts.length === 2 || (parts.length === 3 && parts[2] === 'callback')) && !post && canUseGoogle(env)) {
    if (await getCustomer(request, env, site.id)) return see(url, '/account')
    return googleLogin(request, env, url, site, parts[2])
  }
  if (parts.length !== 1) return notFound()

  if (parts[0] === 'logout') {
    if (!post) return see(url, '/')
    await endSession(request, env)
    return see(url, '/', endCookie(url))
  }
  const customer = await getCustomer(request, env, site.id)
  if (parts[0] === 'account') return customer ? accountPage(env, site, url, customer) : see(url, '/login?next=/account')
  if (customer && !post) return see(url, '/account')
  if (parts[0] === 'login') return post ? login(request, env, url, site) : loginPage(env, site, url)
  if (parts[0] === 'signup') return post ? signup(request, env, url, site) : signupPage(env, site, url)
  // Asking for a reset email only exists while the site can send one.
  if (parts[0] === 'reset' && canSendEmail(env, JSON.parse(site.settings) as Settings)) return post ? askReset(request, env, url, site) : askResetPage(site, url)
  return notFound()
}
