import { allowAttempt, customerFromToken, endToken, newToken, openSession, registerCustomer, sha256, verifyLogin } from './auth'
import { canChange, canCreate, createRecord, deleteRecord, getRecord, getTable, listRecords, listTables, readScope, showRecord, spotsLeft, updateRecord } from './data'
import type { Actor, DataField, DataTable } from './data'
import { getProduct, isAvailable } from './items'
import { parsePrice } from './money'
import { canPayByCard, orderForApi, orderLines, orderStatuses, setOrderStatus, submitOrder } from './shop'
import { startCardPayment } from './stripe'
import type { Env, Item, Order, Settings, SiteRow, Variant } from './types'
import { version } from './version'

const maxBodyBytes = 64 * 1024
const maxOrderLines = 30
const maxQuantity = 99

export const apiKeyPrefix = 'wek_'
export const newApiKey = () => `${apiKeyPrefix}${newToken()}`

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }, status })

const fail = (status: number, code: string, message: string, field?: string) => json({ error: { code, message, ...(field ? { field } : {}) } }, status)
const notFound = () => fail(404, 'not_found', 'There is nothing at this address.')
const forbidden = () => fail(403, 'forbidden', "You don't have permission to do this.")

/** Browsers may only call from sites the owner listed. A rule like https://*.example.com covers its subdomains. */
export function originAllowed(origin: string, allowed: string[] = []) {
  return allowed.some((rule) => {
    if (rule === origin) return true
    if (!rule.startsWith('https://*.') || !origin.startsWith('https://')) return false
    try {
      return new URL(origin).hostname.endsWith(rule.slice('https://*'.length))
    } catch {
      return false
    }
  })
}

async function readBody(request: Request) {
  const text = await request.text().catch(() => '')
  if (text.length > maxBodyBytes) return null
  try {
    const body = JSON.parse(text) as unknown
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Works out who is calling. A key is for servers, and a customer token is what logging in returns. Cookies are ignored, so other sites can't act for a visitor. */
async function findActor(request: Request, env: Env, site: SiteRow, settings: Settings): Promise<Actor | Response> {
  const header = request.headers.get('authorization')
  if (!header) return { admin: false, customer: null }
  const token = /^Bearer\s+(\S+)$/i.exec(header)?.[1] ?? ''
  if (token.startsWith(apiKeyPrefix)) {
    // A browser would show the key to every visitor, so refuse it before it becomes a habit.
    if (request.headers.get('origin')) return fail(403, 'key_in_browser', 'Secret keys only work from server code, such as Wix backend code. Never put one in a web page.')
    const row = await env.DB.prepare('SELECT id, scope, last_used_at FROM api_keys WHERE site_id = ? AND key_hash = ?').bind(site.id, await sha256(token)).first<{ id: number; last_used_at: null | string; scope: string }>()
    if (!row) return fail(401, 'bad_token', "That key isn't valid.")
    if (!row.last_used_at || Date.now() - Date.parse(row.last_used_at) > 3_600_000) await env.DB.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').bind(new Date().toISOString(), row.id).run()
    return { admin: true, customer: null, readOnly: row.scope === 'read' }
  }
  const customer = settings.accounts && /^[0-9a-f]{64}$/.test(token) ? await customerFromToken(env, token, site.id) : null
  return customer ? { admin: false, customer } : fail(401, 'bad_token', 'That login has expired. Please log in again.')
}

const product = (item: Item, actor: Actor) => {
  const options = item.variants ?? []
  const amount = (price?: string) => parsePrice(price)?.amount ?? null
  const showStock = (stock: null | number) => (actor.admin ? { stock } : {})
  return {
    id: item.id,
    collection: item.collection,
    title: item.title,
    description: item.body,
    category: item.category,
    image: item.image_url,
    image_alt: item.image_alt,
    price: item.price,
    price_cents: amount(item.price),
    compare_price: item.compare_price,
    available: isAvailable(item),
    ...showStock(item.stock),
    variants: options.map((option) => ({ id: option.id, name: option.name, price: option.price || item.price, price_cents: amount(option.price || item.price), compare_price: option.compare_price, available: option.stock === null || option.stock > 0, ...showStock(option.stock) })),
  }
}

async function listProducts(env: Env, url: URL, site: SiteRow, actor: Actor) {
  const collection = url.searchParams.get('collection')
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 100)
  const { results } = await (collection
    ? env.DB.prepare('SELECT * FROM items WHERE site_id = ? AND published = 1 AND collection = ? ORDER BY sort, id LIMIT ?').bind(site.id, collection, limit)
    : env.DB.prepare('SELECT * FROM items WHERE site_id = ? AND published = 1 ORDER BY sort, id LIMIT ?').bind(site.id, limit)
  ).all<Item>()
  if (results.length) {
    const byId = new Map(results.map((item) => [item.id, item]))
    for (const item of results) item.variants = []
    const { results: variants } = await env.DB.prepare(`SELECT * FROM item_variants WHERE item_id IN (${results.map(() => '?').join(',')}) ORDER BY sort, id`).bind(...results.map((item) => item.id)).all<Variant>()
    for (const variant of variants) byId.get(variant.item_id)?.variants?.push(variant)
  }
  return json({ products: results.map((item) => product(item, actor)) })
}

async function handleAuth(request: Request, env: Env, site: SiteRow, settings: Settings, actor: Actor, action: string) {
  if (!settings.accounts) return fail(404, 'accounts_off', 'Customer accounts are turned off on this site.')
  if (action === 'me' && request.method === 'GET') return actor.customer ? json({ customer: actor.customer }) : fail(401, 'not_logged_in', 'Please log in.')
  if (request.method !== 'POST') return fail(405, 'bad_method', 'Use POST.')
  if (action === 'logout') {
    const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]
    if (token && actor.customer) await endToken(env, token)
    return json({ ok: true })
  }
  const body = await readBody(request)
  if (!body) return fail(400, 'bad_body', 'Send a JSON object.')
  const email = typeof body.email === 'string' ? body.email : ''
  const password = typeof body.password === 'string' ? body.password : ''
  let customerId: number | null | undefined
  if (action === 'login') {
    if (!(await allowAttempt(request, env, 'login', 10, 900))) return fail(429, 'too_many', 'Too many attempts. Please wait a while.')
    customerId = await verifyLogin(env, site.id, email, password)
    if (!customerId) return fail(401, 'bad_login', 'The email or password is wrong.')
  } else if (action === 'signup') {
    if (!(await allowAttempt(request, env, 'signup', 10, 3600))) return fail(429, 'too_many', 'Too many attempts. Please wait a while.')
    const created = await registerCustomer(env, site.id, { email, name: typeof body.name === 'string' ? body.name : '', password })
    if (!created.id) return fail(400, created.problem === 'password' ? 'bad_password' : 'bad_email', created.problem === 'password' ? 'Use a password of 8 to 200 characters.' : "That name or email can't be used.")
    customerId = created.id
  } else return notFound()
  const session = await openSession(env, customerId)
  const customer = await customerFromToken(env, session.token, site.id)
  return json({ customer, expires_at: session.expires, token: session.token }, action === 'signup' ? 201 : 200)
}

async function handleData(request: Request, env: Env, url: URL, site: SiteRow, actor: Actor, name: string, id?: string, extra?: string) {
  if (extra) return notFound()
  const table = await getTable(env, site.id, name)
  // A table nobody here may touch looks the same as one that doesn't exist.
  if (!table || (!readScope(table, actor) && !canCreate(table, actor))) return notFound()
  const writing = request.method !== 'GET' && request.method !== 'HEAD'
  if (writing && !actor.admin && !(await allowAttempt(request, env, 'record', 120, 3600))) return fail(429, 'too_many', 'Too many changes. Please wait a while.')

  if (!id) {
    if (request.method === 'GET') {
      const filters: Record<string, string> = {}
      url.searchParams.forEach((value, key) => {
        if (key.startsWith('filter.')) filters[key.slice(7)] = value
      })
      const list = await listRecords(env, table, actor, { after: Number(url.searchParams.get('after')) || undefined, filters, limit: Number(url.searchParams.get('limit')) || undefined, newestFirst: url.searchParams.get('order') === 'newest' })
      if (list.error === 'forbidden') return forbidden()
      if (list.error) return fail(400, 'bad_filter', "You can't filter by that field.", list.field)
      const left = await spotsLeft(env, site.id, table, list.rows ?? [])
      return json({ next: list.next, records: (list.rows ?? []).map((row) => ({ ...showRecord(table, row, actor), ...(left.has(row.id) ? { spots_left: left.get(row.id) } : {}) })) })
    }
    if (request.method !== 'POST') return fail(405, 'bad_method', 'Use GET or POST.')
    if (!canCreate(table, actor)) return actor.customer || actor.admin ? forbidden() : fail(401, 'not_logged_in', 'Please log in.')
    const body = await readBody(request)
    if (!body) return fail(400, 'bad_body', 'Send a JSON object of up to 64 KB.')
    const saved = await createRecord(env, site.id, table, body, actor)
    return saved.row ? json({ record: showRecord(table, saved.row, actor) }, 201) : fail(saved.code ? 409 : 400, saved.code ?? 'invalid', saved.error ?? 'That is not valid.', saved.field)
  }

  if (!/^\d{1,12}$/.test(id)) return notFound()
  const row = await getRecord(env, table, Number(id))
  const scope = readScope(table, actor)
  const mine = Boolean(actor.customer && row?.customer_id === actor.customer.id)
  if (!row || (scope !== 'all' && !mine)) return notFound()
  if (request.method === 'GET') return scope ? json({ record: showRecord(table, row, actor) }) : notFound()
  if (!canChange(table, actor, row)) return forbidden()
  if (request.method === 'DELETE') {
    await deleteRecord(env, site.id, table, row)
    return json({ deleted: row.id })
  }
  if (request.method !== 'PATCH') return fail(405, 'bad_method', 'Use GET, PATCH or DELETE.')
  const body = await readBody(request)
  if (!body) return fail(400, 'bad_body', 'Send a JSON object of up to 64 KB.')
  const saved = await updateRecord(env, site.id, table, row, body, actor)
  return saved.row ? json({ record: showRecord(table, saved.row, actor) }) : fail(saved.code ? 409 : 400, saved.code ?? 'invalid', saved.error ?? 'That is not valid.', saved.field)
}

async function handleOrders(request: Request, env: Env, url: URL, site: SiteRow, settings: Settings, actor: Actor, id?: string) {
  const staff = actor.admin || actor.customer?.role === 'staff'
  if (!id) {
    if (request.method === 'GET') {
      if (!staff && !actor.customer) return fail(401, 'not_logged_in', 'Please log in.')
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 100)
      const { results } = await (staff ? env.DB.prepare('SELECT * FROM orders WHERE site_id = ? ORDER BY id DESC LIMIT ?').bind(site.id, limit) : env.DB.prepare('SELECT * FROM orders WHERE site_id = ? AND customer_id = ? ORDER BY id DESC LIMIT ?').bind(site.id, actor.customer!.id, limit)).all<Order>()
      const lines = await orderLines(env, results.map((order) => order.id))
      return json({ orders: results.map((order) => orderForApi(order, lines.get(order.id) ?? [])) })
    }
    if (request.method !== 'POST') return fail(405, 'bad_method', 'Use GET or POST.')
    if (actor.readOnly) return forbidden()
    if (!settings.cart) return fail(409, 'cart_off', 'The cart is turned off on this site.')
    if (settings.cartMembersOnly && !actor.customer) return fail(401, 'not_logged_in', 'Please log in to order.')
    const body = await readBody(request)
    const asked = Array.isArray(body?.lines) ? (body.lines as Record<string, unknown>[]) : []
    if (!body || !asked.length || asked.length > maxOrderLines) return fail(400, 'bad_lines', `Send lines, a list of 1 to ${maxOrderLines} products.`)
    const cart = new Map<string, number>()
    for (const line of asked) {
      const [item, variant, quantity] = [line?.item, line?.variant ?? 0, line?.quantity ?? 1].map(Number)
      if (!Number.isInteger(item) || item < 1 || !Number.isInteger(variant) || variant < 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > maxQuantity) return fail(400, 'bad_lines', `Each line needs an item and a quantity from 1 to ${maxQuantity}.`)
      cart.set(variant ? `${item}_${variant}` : String(item), quantity)
    }
    const text = (key: string) => (typeof body[key] === 'string' ? (body[key] as string).trim() : '')
    const values = { address: text('address'), name: text('name'), note: text('note'), payment: text('payment'), phone: text('phone') }
    const placed = await submitOrder(request, env, site, cart, values, actor.customer)
    if (placed.problem === 'details') return fail(400, 'bad_details', 'Check the name, phone, address and payment method.')
    if (placed.problem === 'busy') return fail(429, 'too_many', 'Too many orders right now. Please try again soon.')
    if (placed.problem || !placed.order) return fail(409, 'unavailable', 'Something in this order is no longer on sale or in stock.')
    const orderPath = `/order/${placed.token}`
    const payUrl = values.payment === 'card' && canPayByCard(env, settings) ? await startCardPayment(env, url, settings, placed.order, placed.lines as never, orderPath) : null
    return json({ order: orderForApi(placed.order, placed.lines as never), order_url: `${url.origin}${orderPath}`, ...(payUrl ? { pay_url: payUrl } : {}) }, 201)
  }

  if (!/^\d{1,12}$/.test(id)) return notFound()
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ? AND site_id = ?').bind(Number(id), site.id).first<Order>()
  if (!order || (!staff && (!actor.customer || order.customer_id !== actor.customer.id))) return notFound()
  if (request.method === 'GET') return json({ order: orderForApi(order, (await orderLines(env, [order.id])).get(order.id) ?? []) })
  if (request.method !== 'PATCH') return fail(405, 'bad_method', 'Use GET or PATCH.')
  if (!staff || actor.readOnly) return forbidden()
  const status = (await readBody(request))?.status
  if (typeof status !== 'string' || !orderStatuses.includes(status)) return fail(400, 'bad_status', `Use one of: ${orderStatuses.join(', ')}.`)
  const result = await setOrderStatus(env, site.id, order.id, status)
  return result === 'ok' ? json({ id: order.id, status }) : fail(409, 'no_stock', 'There is no longer enough stock to restore this order.')
}

const jsonTypes: Record<DataField['type'], object> = {
  boolean: { type: 'boolean' },
  date: { format: 'date', type: 'string' },
  email: { format: 'email', type: 'string' },
  image: { type: 'string' },
  number: { type: 'number' },
  phone: { type: 'string' },
  reference: { type: 'integer' },
  select: { type: 'string' },
  text: { type: 'string' },
  textarea: { type: 'string' },
  time: { type: 'string' },
  url: { format: 'uri', type: 'string' },
}

/** A machine-readable description of this site's API, including the tables this caller may use. */
function openApi(url: URL, settings: Settings, tables: DataTable[], actor: Actor) {
  const staff = actor.admin || actor.customer?.role === 'staff'
  const paths: Record<string, object> = {
    '/auth/signup': { post: { summary: 'Create a customer account and get a token' } },
    '/auth/login': { post: { summary: 'Log a customer in and get a token' } },
    '/auth/logout': { post: { summary: 'End the session of this token' } },
    '/auth/me': { get: { summary: 'The logged-in customer' } },
    '/products': { get: { summary: 'Published products. Filter with ?collection=' } },
    '/products/{id}': { get: { summary: 'One product with its options' } },
    '/orders': { get: { summary: "The customer's own orders, or all orders for a key" }, post: { summary: 'Place an order. Prices and stock always come from the database.' } },
    '/orders/{id}': { get: { summary: 'One order' }, patch: { summary: 'Change the status. Staff or key only.' } },
  }
  const schemas: Record<string, object> = {}
  for (const table of tables) {
    const fields = table.fields.filter((field) => !field.staffOnly || staff)
    schemas[table.name] = { properties: Object.fromEntries(fields.map((field) => [field.name, { ...(jsonTypes[field.type] ?? { type: 'string' }), description: field.label, ...(field.options ? { enum: field.options } : {}), ...(field.readOnly && !staff ? { readOnly: true } : {}) }])), required: fields.filter((field) => field.required).map((field) => field.name), type: 'object' }
    const reference = { $ref: `#/components/schemas/${table.name}` }
    const body = { content: { 'application/json': { schema: reference } }, required: true }
    paths[`/data/${table.name}`] = { get: { summary: `List ${table.label}. Options: limit, after, order=newest, filter.<field>=<value>` }, post: { requestBody: body, summary: `Add to ${table.label}` } }
    paths[`/data/${table.name}/{id}`] = { delete: { summary: 'Delete a record' }, get: { summary: 'Read a record' }, patch: { requestBody: body, summary: 'Change some fields of a record' } }
  }
  return {
    components: { schemas, securitySchemes: { bearer: { scheme: 'bearer', type: 'http' } } },
    info: { title: `${settings.name} API`, version },
    openapi: '3.0.3',
    paths,
    security: [{}, { bearer: [] }],
    servers: [{ url: `${url.origin}/api/v1` }],
  }
}

async function route(request: Request, env: Env, url: URL, site: SiteRow, settings: Settings, parts: string[]) {
  const found = await findActor(request, env, site, settings)
  if (found instanceof Response) return found
  const actor = found
  const [area, id, extra] = parts.slice(2)

  if (!area || area === 'openapi.json') {
    if (request.method !== 'GET') return fail(405, 'bad_method', 'Use GET.')
    const tables = (await listTables(env, site.id)).filter((table) => readScope(table, actor) || canCreate(table, actor))
    if (area) return json(openApi(url, settings, tables, actor))
    return json({ accounts: Boolean(settings.accounts), api: 'web-end', cart: Boolean(settings.cart), docs: `${url.origin}/api/v1/openapi.json`, name: settings.name, tables: tables.map((table) => ({ count: actor.admin ? table.record_count : undefined, label: table.label, name: table.name })), version })
  }
  if (area === 'auth' && id && !extra) return handleAuth(request, env, site, settings, actor, id)
  if (area === 'data' && id) return handleData(request, env, url, site, actor, id, extra, parts[5])
  if (area === 'orders' && !extra) return handleOrders(request, env, url, site, settings, actor, id)
  if (area === 'products' && !extra) {
    if (request.method !== 'GET') return fail(405, 'bad_method', 'Use GET.')
    if (!id) return listProducts(env, url, site, actor)
    const item = /^\d{1,12}$/.test(id) ? await getProduct(env, site.id, Number(id)) : null
    return item ? json({ product: product(item, actor) }) : notFound()
  }
  return notFound()
}

/** The API other systems use, such as a Wix front end. It follows the same rules as the website. */
export async function handleApi(request: Request, env: Env, url: URL, site: SiteRow, parts: string[]) {
  const settings = JSON.parse(site.settings) as Settings
  const origin = request.headers.get('origin')
  const cors: Record<string, string> = origin && originAllowed(origin, settings.allowedOrigins) ? { 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Origin': origin, 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : { Vary: 'Origin' }
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors, status: 204 })
  const response = parts[1] === 'v1' ? await route(request, env, url, site, settings, parts) : notFound()
  for (const [key, value] of Object.entries(cors)) response.headers.set(key, value)
  return response
}
