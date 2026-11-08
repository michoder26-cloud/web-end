import { newToken, sha256 } from './auth'
import { escapeHtml, see } from './http'
import type { Env } from './types'

// Test mode lets the owner try their own site as a customer. While its cookie is in the browser, orders, bookings,
// sign-ups and form messages are marked as tests, take no stock, send no emails, chats or webhooks, run automations only
// as a dry run, and are left out of statistics. The owner removes them all in one step from the overview.

const cookieName = 'we_test'
const hours = 2

const cookie = (url: URL, value: string, seconds: number) => `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${url.protocol === 'https:' ? '; Secure' : ''}`

const tokenOf = (request: Request) => {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [name, value] = part.trim().split('=')
    if (name === cookieName && /^[0-9a-f]{64}$/.test(value ?? '')) return value
  }
  return null
}

/** Starts test mode for this browser and opens the site. Only the owner's back office calls this. */
export async function startTestMode(env: Env, url: URL) {
  const token = newToken()
  await env.DB.prepare(`UPDATE sites SET test_hash = ?, test_until = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+${hours} hours')`).bind(await sha256(token)).run()
  return see(url, '/', cookie(url, token, hours * 3600))
}

/** Ends test mode everywhere. What was made in it stays, marked as a test, until the owner removes it. */
export async function endTestMode(env: Env, url: URL) {
  await env.DB.prepare('UPDATE sites SET test_hash = NULL, test_until = NULL').run()
  return see(url, '/', cookie(url, '', 0))
}

/** The site's language when this browser is in test mode, or null when it isn't. */
export async function testModeLanguage(request: Request, env: Env) {
  const token = tokenOf(request)
  if (!token) return null
  const site = await env.DB.prepare("SELECT settings FROM sites WHERE test_hash = ? AND test_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").bind(await sha256(token)).first<{ settings: string }>()
  if (!site) return null
  return (JSON.parse(site.settings) as { language?: string }).language?.toLowerCase().startsWith('th') ? 'th' : 'en'
}

const bannerWords = {
  en: { end: 'End test mode', text: 'Test mode: nothing here is real. No stock is taken and no emails or messages are sent. Do not pay.' },
  th: { end: 'ออกจากโหมดทดลอง', text: 'โหมดทดลอง: ทุกอย่างที่นี่ไม่ใช่ของจริง ไม่ตัดสต็อก และไม่ส่งอีเมลหรือข้อความ อย่าโอนเงิน' },
}

/** Puts the test mode banner at the top of every page, and keeps those pages out of any cache. */
export function withTestBanner(response: Response, language: 'en' | 'th') {
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'private, no-store')
  const marked = new Response(response.body, { headers, status: response.status, statusText: response.statusText })
  if (!(headers.get('content-type') ?? '').includes('text/html')) return marked
  const words = bannerWords[language]
  const banner = `<div class="test-banner" role="status"><span>${escapeHtml(words.text)}</span><form action="/test-mode/end" method="post"><button class="button button--small" type="submit">${escapeHtml(words.end)}</button></form></div>`
  return new HTMLRewriter().on('body', { element: (body) => void body.prepend(banner, { html: true }) }).transform(marked)
}

/** The test rows that exist now, for the overview. */
export async function testCounts(env: Env) {
  const row = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM orders WHERE test = 1) AS orders, (SELECT COUNT(*) FROM data_records WHERE test = 1) AS records, (SELECT COUNT(*) FROM entries WHERE test = 1) AS entries, (SELECT COUNT(*) FROM customers WHERE test = 1) AS customers, (SELECT COUNT(*) FROM sites WHERE test_until > strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\')) AS active')
    .first<{ active: number; customers: number; entries: number; orders: number; records: number }>()
    .catch((): null => null)
  return row ?? { active: 0, customers: 0, entries: 0, orders: 0, records: 0 }
}

/** Removes everything made in test mode. Real rows are never touched. */
export async function clearTestData(env: Env) {
  await env.DB.batch([
    // Tables keep a count of their records, so take the test ones off first.
    env.DB.prepare('UPDATE data_tables SET record_count = record_count - (SELECT COUNT(*) FROM data_records WHERE data_records.table_id = data_tables.id AND data_records.test = 1) WHERE id IN (SELECT table_id FROM data_records WHERE test = 1)'),
    env.DB.prepare('DELETE FROM data_records WHERE test = 1'),
    env.DB.prepare('DELETE FROM orders WHERE test = 1'),
    env.DB.prepare('DELETE FROM entries WHERE test = 1'),
    env.DB.prepare('DELETE FROM customers WHERE test = 1 AND id IS NOT (SELECT owner_customer_id FROM sites LIMIT 1)'),
    env.DB.prepare("DELETE FROM change_log WHERE actor = 'test'"),
  ])
}
