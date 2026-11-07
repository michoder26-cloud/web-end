import { allowAttempt, endCookie, endSession, getCustomer, hashPassword, registerCustomer, startSession, verifyLogin } from './auth'
import { adminDesk, handleOffice } from './cms'
import { escapeHtml, html, notFound, privateHeaders, see } from './http'
import { isOwner, shell } from './owner'
import { officeText } from './office-words'
import type { Env, SiteRow } from './types'

const maxBodyBytes = 16 * 1024

const formData = async (request: Request) => (Number(request.headers.get('content-length') || 0) > maxBodyBytes ? null : request.formData().catch((): null => null))

const page = (site: SiteRow, title: string, body: string, status = 200) => html(shell(`${JSON.parse(site.settings).name}: ${title}`, `<h1>${escapeHtml(title)}</h1>${body}`, false, officeText(site).lang), status, privateHeaders)

const loginPage = (site: SiteRow, error = '') =>
  page(
    site,
    'Owner sign in',
    `${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}<p>Sign in to manage your website, customers, orders and settings.</p>
<form action="/admin/login" class="contact-form" method="post"><label>Email<input autocomplete="email" maxlength="254" name="email" required type="email"></label><label>Password<input autocomplete="current-password" maxlength="200" name="password" required type="password"></label><button class="button" type="submit">Sign in</button></form><p><a href="/admin/recover">Use private owner link to recover access</a></p>`,
  )

const claimPage = (site: SiteRow, error = '') =>
  page(
    site,
    'Set up owner account',
    `${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}<p>Use the private owner link you received when this website was installed. This proves that you own the site. After this one-time step, you will sign in here with your email and password.</p>
<form action="/admin/claim" class="contact-form" method="post"><label>Private owner link or code<input autocomplete="off" maxlength="500" name="code" required></label><label>Your name<input autocomplete="name" maxlength="120" name="name" required></label><label>Email<input autocomplete="email" maxlength="254" name="email" required type="email"></label><label>Password<input autocomplete="new-password" maxlength="200" minlength="8" name="password" required type="password"></label><button class="button" type="submit">Create owner account</button></form>`,
  )

const recoverPage = (site: SiteRow, error = '') =>
  page(
    site,
    'Recover owner account',
    `${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}<p>Your private owner link can recover this account. Use it only in a private browser window.</p>
<form action="/admin/recover" class="contact-form" method="post"><label>Private owner link or code<input autocomplete="off" maxlength="500" name="code" required></label><label>New password<input autocomplete="new-password" maxlength="200" minlength="8" name="password" required type="password"></label><button class="button" type="submit">Set new password</button></form>`,
  )

const ownerCode = (value: unknown) => {
  const raw = String(value ?? '').trim()
  if (/^[a-z0-9-]{20,60}$/.test(raw)) return raw
  try {
    const url = new URL(raw)
    const parts = url.pathname.split('/').filter(Boolean)
    return parts[0] === 'owner' && parts.length === 2 && /^[a-z0-9-]{20,60}$/.test(parts[1]) ? parts[1] : ''
  } catch {
    return ''
  }
}

/**
 * Another website's form posting here in the owner's browser. Browsers always send Origin with such a post, so a post
 * that names another site, or that the browser marks as cross-site, is refused. Tools that send neither still work.
 */
const fromAnotherSite = (request: Request, url: URL) => {
  const origin = request.headers.get('origin')
  if (origin && origin !== 'null') return origin !== url.origin
  const fetchSite = request.headers.get('sec-fetch-site')
  return Boolean(fetchSite) && fetchSite !== 'same-origin' && fetchSite !== 'none'
}

const isAccountOwner = async (request: Request, env: Env, site: SiteRow) => {
  if (!site.owner_customer_id) return false
  const customer = await getCustomer(request, env, site.id)
  return customer?.id === site.owner_customer_id
}

/** Owner access is account-based. The original capability URL only proves ownership during the one-time enrollment. */
export async function handleAdmin(request: Request, env: Env, url: URL, site: SiteRow, parts: string[]) {
  const [action] = parts
  // Sign in, set up, recover and sign out change who is logged in, so another site must not be able to post them.
  if (request.method === 'POST' && ['claim', 'login', 'logout', 'recover'].includes(action) && fromAnotherSite(request, url)) return page(site, 'Owner sign in', '<p role="alert">This form was sent from another website, so nothing was changed. Open this page directly and try again.</p>', 403)
  if (!site.owner_customer_id) {
    if (action !== 'claim') return request.method === 'GET' ? claimPage(site) : notFound()
    if (request.method !== 'POST') return claimPage(site)
    if (!(await allowAttempt(request, env, 'admin-claim', 5, 3600))) return claimPage(site, 'Please wait before trying again.')
    const form = await formData(request)
    const code = ownerCode(form?.get('code'))
    if (!code || !(await isOwner(env, code))) return claimPage(site, 'That private owner link is not valid.')
    const email = String(form?.get('email') ?? '')
    const password = String(form?.get('password') ?? '')
    const created = await registerCustomer(env, site.id, { email, name: String(form?.get('name') ?? ''), password })
    // A site may already have customer accounts. Let its real owner keep that
    // existing account, but require both its password and the private link.
    const customerId = created.id ?? (await verifyLogin(env, site.id, email, password))
    if (!customerId) return claimPage(site, created.problem === 'password' ? 'Choose a password with at least 8 characters.' : 'Use a valid email address and password.')
    const claimed = await env.DB.prepare("UPDATE sites SET owner_customer_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND owner_customer_id IS NULL").bind(customerId, site.id).run()
    if (!claimed.meta.changes) return loginPage(site, 'An owner account is already set up. Sign in instead.')
    return see(url, '/admin', await startSession(env, url, customerId))
  }

  if (action === 'login') {
    if (request.method !== 'POST') return loginPage(site)
    if (!(await allowAttempt(request, env, 'admin-login', 10, 900))) return loginPage(site, 'Please wait before trying again.')
    const form = await formData(request)
    const id = await verifyLogin(env, site.id, String(form?.get('email') ?? ''), String(form?.get('password') ?? ''))
    if (!id || id !== site.owner_customer_id) return loginPage(site, 'Email or password is not correct.')
    return see(url, '/admin', await startSession(env, url, id))
  }
  if (action === 'recover') {
    if (request.method !== 'POST') return recoverPage(site)
    if (!(await allowAttempt(request, env, 'admin-recover', 5, 3600))) return recoverPage(site, 'Please wait before trying again.')
    const form = await formData(request)
    const code = ownerCode(form?.get('code'))
    const password = String(form?.get('password') ?? '')
    if (!code || !(await isOwner(env, code)) || password.length < 8 || password.length > 200) return recoverPage(site, 'The private owner link or password is not valid.')
    // If the owner's account is gone, the private link sets up a new one rather than signing in to nobody.
    const exists = await env.DB.prepare('SELECT 1 FROM customers WHERE id = ? AND site_id = ?').bind(site.owner_customer_id, site.id).first()
    if (!exists) {
      await env.DB.prepare('UPDATE sites SET owner_customer_id = NULL WHERE id = ? AND owner_customer_id = ?').bind(site.id, site.owner_customer_id).run()
      return claimPage({ ...site, owner_customer_id: null }, 'Your owner account was removed. Set it up again with your private owner link.')
    }
    const secret = await hashPassword(password)
    await env.DB.batch([
      env.DB.prepare('UPDATE customers SET password_hash = ?, salt = ?, iterations = ? WHERE id = ? AND site_id = ?').bind(secret.password_hash, secret.salt, secret.iterations, site.owner_customer_id, site.id),
      env.DB.prepare('DELETE FROM sessions WHERE customer_id = ?').bind(site.owner_customer_id),
    ])
    return see(url, '/admin', await startSession(env, url, site.owner_customer_id))
  }
  if (action === 'logout') {
    if (request.method !== 'POST') return see(url, '/admin')
    await endSession(request, env)
    return see(url, '/admin', endCookie(url))
  }
  if (!(await isAccountOwner(request, env, site))) return loginPage(site)

  return handleOffice(request, env, url, site, adminDesk(), parts)
}
