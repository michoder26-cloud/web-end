// A signed-in owner's list of web-end sites. Each site runs on the owner's own
// Cloudflare account; this list only remembers its name and address.
import { currentUser, json, sameOrigin } from './auth.js'

const MAX_APPS = 50
const fields = 'id, name, url, title, image_url AS imageUrl, status, checked_at AS checkedAt, created_at AS createdAt, updated_at AS updatedAt'

// Only public https addresses are accepted.
export function cleanUrl(value) {
  let url
  try { url = new URL(String(value || '').trim()) } catch { return null }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
  const host = url.hostname.toLowerCase()
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || /^[\d.]+$/.test(host) || host.includes(':')) return null
  return `https://${host}`
}

const cleanName = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80)

const decode = (text) =>
  text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()

// Reads the page title and preview image, and whether the site answers.
export async function inspect(url, fetcher = fetch) {
  try {
    const response = await fetcher(url, { redirect: 'follow', headers: { 'User-Agent': 'web-end-dashboard/1.0', Accept: 'text/html' }, signal: AbortSignal.timeout(8000) })
    if (!response.ok) return { status: 'down' }
    const reader = response.body?.getReader()
    let html = ''
    if (reader) {
      const decoder = new TextDecoder()
      while (html.length < 200000) {
        const { done, value } = await reader.read()
        if (done) break
        html += decoder.decode(value, { stream: true })
      }
      reader.cancel().catch(() => {})
    }
    const title = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(html)?.[1]
    const meta = (key) =>
      new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i').exec(html)?.[1] ||
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, 'i').exec(html)?.[1]
    let imageUrl = null
    const image = meta('og:image') || meta('twitter:image')
    if (image) {
      try {
        const resolved = new URL(decode(image), response.url || url)
        if (resolved.protocol === 'https:') imageUrl = resolved.href.slice(0, 1000)
      } catch {}
    }
    return { status: 'live', title: title ? decode(title).slice(0, 120) : null, imageUrl }
  } catch {
    return { status: 'down' }
  }
}

async function owned(env, userId, id) {
  return env.DB.prepare(`SELECT ${fields} FROM apps WHERE id = ? AND user_id = ?`).bind(id, userId).first()
}

export async function handleApps(request, env, { id, action } = {}, fetcher = fetch) {
  const user = await currentUser(request, env)
  if (!user) return json({ error: 'Please log in again.' }, 401)
  const method = request.method
  if (method !== 'GET' && !sameOrigin(request)) return json({ error: 'bad origin' }, 403)

  if (!id && method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT ${fields} FROM apps WHERE user_id = ? ORDER BY updated_at DESC`).bind(user.id).all()
    return json({ apps: results })
  }

  if (!id && method === 'POST') {
    const body = await request.json().catch(() => ({}))
    const url = cleanUrl(body.url)
    if (!url) return json({ error: 'Enter your site address, starting with https://' }, 400)
    const count = await env.DB.prepare('SELECT count(*) AS n FROM apps WHERE user_id = ?').bind(user.id).first()
    if (count.n >= MAX_APPS) return json({ error: `You can keep up to ${MAX_APPS} apps here.` }, 400)
    if (await env.DB.prepare('SELECT 1 FROM apps WHERE user_id = ? AND url = ?').bind(user.id, url).first()) return json({ error: 'That app is already in your list.' }, 409)
    const found = await inspect(url, fetcher)
    const now = Date.now()
    const name = cleanName(body.name) || found.title || new URL(url).hostname.split('.')[0]
    const appId = crypto.randomUUID()
    await env.DB.prepare('INSERT INTO apps (id, user_id, name, url, title, image_url, status, checked_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(appId, user.id, name, url, found.title || null, found.imageUrl || null, found.status, now, now, now).run()
    return json({ app: await owned(env, user.id, appId) }, 201)
  }

  const app = id && (await owned(env, user.id, id))
  if (!app) return json({ error: 'That app is not in your list.' }, 404)

  if (action === 'check' && method === 'POST') {
    const found = await inspect(app.url, fetcher)
    const now = Date.now()
    await env.DB.prepare('UPDATE apps SET status = ?, title = COALESCE(?, title), image_url = COALESCE(?, image_url), checked_at = ?, updated_at = ? WHERE id = ?')
      .bind(found.status, found.title || null, found.imageUrl || null, now, now, app.id).run()
    return json({ app: await owned(env, user.id, app.id) })
  }
  if (!action && method === 'PATCH') {
    const body = await request.json().catch(() => ({}))
    const name = cleanName(body.name)
    if (!name) return json({ error: 'Give the app a name.' }, 400)
    await env.DB.prepare('UPDATE apps SET name = ?, updated_at = ? WHERE id = ?').bind(name, Date.now(), app.id).run()
    return json({ app: await owned(env, user.id, app.id) })
  }
  if (!action && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM apps WHERE id = ?').bind(app.id).run()
    return json({ ok: true })
  }
  return json({ error: 'not allowed' }, 405)
}
