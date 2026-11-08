import { allowAttempt, endCookie, endSession, getCustomer, hashPassword, registerCustomer, startSession, verifyLogin } from './auth'
import { adminDesk, handleOffice } from './cms'
import { escapeHtml, html, notFound, privateHeaders, see } from './http'
import { claudeLinkPage, firstSteps } from './first-steps'
import { hashCode, isOwner, newCode, shell } from './owner'
import { officeText } from './office-words'
import type { Env, SiteRow } from './types'

const maxBodyBytes = 16 * 1024

const formData = async (request: Request) => (Number(request.headers.get('content-length') || 0) > maxBodyBytes ? null : request.formData().catch((): null => null))

const page = (site: SiteRow, title: string, body: string, status = 200) => html(shell(`${JSON.parse(site.settings).name}: ${title}`, `<h1>${escapeHtml(title)}</h1>${body}`, false, officeText(site).lang), status, privateHeaders)

const loginPage = (site: SiteRow, error = '') => {
  const a = officeText(site).admin
  return page(
    site,
    a.signInTitle,
    `${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}<p>${a.signInIntro}</p>
<form action="/admin/login" class="contact-form" method="post"><label>${a.email}<input autocomplete="email" maxlength="254" name="email" required type="email"></label><label>${a.password}<input autocomplete="current-password" maxlength="200" name="password" required type="password"></label><button class="button" type="submit">${a.signIn}</button></form><p><a href="/admin/recover">${a.recoverLink}</a></p>`,
  )
}

const claimPage = (site: SiteRow, error = '', code = '') => {
  const a = officeText(site).admin
  return page(
    site,
    a.setupTitle,
    `${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}<p>${a.setupIntro}</p>
<form action="/admin/claim" class="contact-form" method="post"><label>${a.code}<input autocomplete="off" maxlength="500" name="code" required value="${escapeHtml(code)}"></label><label>${a.name}<input autocomplete="name" maxlength="120" name="name" required></label><label>${a.email}<input autocomplete="email" maxlength="254" name="email" required type="email"></label><label>${a.newPasswordHint}<input autocomplete="new-password" maxlength="200" minlength="8" name="password" required type="password"></label><button class="button" type="submit">${a.createAccount}</button></form>`,
  )
}

const recoverPage = (site: SiteRow, error = '') => {
  const a = officeText(site).admin
  return page(
    site,
    a.recoverTitle,
    `${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}<p>${a.recoverIntro}</p>
<form action="/admin/recover" class="contact-form" method="post"><label>${a.code}<input autocomplete="off" maxlength="500" name="code" required></label><label>${a.newPassword}<input autocomplete="new-password" maxlength="200" minlength="8" name="password" required type="password"></label><button class="button" type="submit">${a.setPassword}</button></form>`,
  )
}

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
  const a = officeText(site).admin
  // Sign in, set up, recover and sign out change who is logged in, so another site must not be able to post them.
  if (request.method === 'POST' && ['claim', 'claude-link', 'login', 'logout', 'recover'].includes(action) && fromAnotherSite(request, url)) return page(site, a.signInTitle, `<p role="alert">${a.otherSite}</p>`, 403)
  if (!site.owner_customer_id) {
    if (action !== 'claim') return request.method === 'GET' ? claimPage(site) : notFound()
    if (request.method !== 'POST') return claimPage(site)
    if (!(await allowAttempt(request, env, 'admin-claim', 5, 3600))) return claimPage(site, a.wait)
    const form = await formData(request)
    const code = ownerCode(form?.get('code'))
    if (!code || !(await isOwner(env, code))) return claimPage(site, a.badCode)
    const email = String(form?.get('email') ?? '')
    const password = String(form?.get('password') ?? '')
    const created = await registerCustomer(env, site.id, { email, name: String(form?.get('name') ?? ''), password })
    // A site may already have customer accounts. Let its real owner keep that
    // existing account, but require both its password and the private link.
    const customerId = created.id ?? (await verifyLogin(env, site.id, email, password))
    if (!customerId) return claimPage(site, created.problem === 'password' ? a.shortPassword : a.badAccount, code)
    const claimed = await env.DB.prepare("UPDATE sites SET owner_customer_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND owner_customer_id IS NULL").bind(customerId, site.id).run()
    if (!claimed.meta.changes) return loginPage(site, a.alreadySetUp)
    return see(url, '/admin', await startSession(env, url, customerId))
  }

  if (action === 'login') {
    if (request.method !== 'POST') return loginPage(site)
    if (!(await allowAttempt(request, env, 'admin-login', 10, 900))) return loginPage(site, a.wait)
    const form = await formData(request)
    const id = await verifyLogin(env, site.id, String(form?.get('email') ?? ''), String(form?.get('password') ?? ''))
    if (!id || id !== site.owner_customer_id) return loginPage(site, a.wrongLogin)
    return see(url, '/admin', await startSession(env, url, id))
  }
  if (action === 'recover') {
    if (request.method !== 'POST') return recoverPage(site)
    if (!(await allowAttempt(request, env, 'admin-recover', 5, 3600))) return recoverPage(site, a.wait)
    const form = await formData(request)
    const code = ownerCode(form?.get('code'))
    const password = String(form?.get('password') ?? '')
    if (!code || !(await isOwner(env, code)) || password.length < 8 || password.length > 200) return recoverPage(site, a.badRecover)
    // If the owner's account is gone, the private link sets up a new one rather than signing in to nobody.
    const exists = await env.DB.prepare('SELECT 1 FROM customers WHERE id = ? AND site_id = ?').bind(site.owner_customer_id, site.id).first()
    if (!exists) {
      await env.DB.prepare('UPDATE sites SET owner_customer_id = NULL WHERE id = ? AND owner_customer_id = ?').bind(site.id, site.owner_customer_id).run()
      return claimPage({ ...site, owner_customer_id: null }, officeText(site).admin.removed)
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
  if (action === 'claude-link') {
    if (request.method !== 'POST') return see(url, '/admin#claude')
    // A new private link replaces the old one, which stops working at once. Once Claude has connected, the owner confirms that.
    const form = await formData(request)
    const steps = await firstSteps(env, site)
    if (steps?.claude && form?.get('confirm') !== 'on') return see(url, '/admin#claude')
    const code = newCode()
    await env.DB.prepare("UPDATE sites SET edit_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(await hashCode(code), site.id).run()
    return claudeLinkPage(url.origin, code, officeText(site))
  }

  return handleOffice(request, env, url, site, adminDesk(), parts)
}
