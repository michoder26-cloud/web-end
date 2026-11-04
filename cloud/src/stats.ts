// Visitor statistics without tracking people. Pages are counted on the server as they are sent: no cookies, no scripts,
// no stored IP address and no fingerprint that lasts. Only counts per day are kept.
//
// What is kept, per day in the site's time zone:
// - stats_daily: views and visitors per page path, referring site (its host name only), country (from Cloudflare) and
//   device (phone, tablet or desktop, from the browser's name).
// - stats_events: orders placed, form entries and records visitors added.
// To count a person once a day, each view is turned into a short hash of today's random salt, the site, the date, the IP
// address and the browser's name. The salt is made at the first visit of the day, replaced on the first visit of the next,
// and deleted with that day's hashes in the first scheduled run after midnight. Without the salt a hash can't be matched to
// an address, and across days the same person gets unrelated hashes, so nobody is followed from one day to the next.
//
// Rows written, the scarce part of Cloudflare's free plan (100,000 a day):
// - each counted view: 1 (one upsert into stats_daily, a table with no other index)
// - a person's first view of the day: 1 more (their hash in stats_seen), and 1 when the cleanup deletes it
// - once a day: 1 for the salt, and the cleanup's deletes and its 1 marker
// - each conversion: 1
// So 1,000 views from 400 people is about 1,800 rows written, roughly 1.8 per view. Batching across requests would need
// a Durable Object or a queue, which the free plan doesn't cover, so each view writes in one batch after the page is sent.
// Exact daily uniques cost those 2 rows per person. A HyperLogLog sketch could estimate them with fewer writes, but it
// would still need one read and usually one write per new person, and its rounding shows on a small site.

import { addDays, localTime, zoneOf } from './clock'
import type { Env, Settings, SiteRow } from './types'

/** Days of statistics kept: today and the 399 before. */
export const keptDays = 400
export const maxReportDays = 90
export const devices = ['phone', 'tablet', 'desktop'] as const
export type Device = (typeof devices)[number]
export const conversionKinds = ['order', 'entry', 'record'] as const
export type ConversionKind = (typeof conversionKinds)[number]

// Crawlers, link previews, uptime checks and scripts. Real browsers all say Mozilla or Opera, and don't use these words.
const botAgent = /bot|crawl|spider|slurp|archiver|facebookexternalhit|facebookcatalog|embedly|preview|monitor|uptime|pingdom|lighthouse|pagespeed|headless|phantom|selenium|puppeteer|playwright|curl|wget|python|java\/|okhttp|go-http|httpclient|libwww|axios|scrapy|feedfetcher|validator|whatsapp/i

// First parts of an address that are never a page view: the back office, Claude, the API, files and private links.
const notPages = new Set(['__scheduled', 'account', 'api', 'cart', 'checkout', 'data', 'form', 'frame', 'login', 'logout', 'mcp', 'media', 'order', 'owner', 'preview', 'reset', 'setup', 'signup', 'staff', 'stripe'])

/** The path to count, or null. Pages, product pages and the same behind a language prefix such as /en/about. */
export function countablePath(path: string) {
  if (path.length > 300) return null
  const parts = path.split('/').filter(Boolean)
  const rest = parts.length > 1 && /^[a-z]{2}(-[a-z]{2,4})?$/i.test(parts[0]) ? parts.slice(1) : parts
  if (rest.length > 2 || rest.some((part) => part.includes('.') || part.length > 120)) return null
  if (rest.length === 2 && !(rest[0] === 'product' && /^\d{1,12}$/.test(rest[1]))) return null
  if (rest.length && notPages.has(rest[0].toLowerCase())) return null
  return `/${parts.join('/')}`
}

export const isBot = (agent: string) => !/mozilla\/|opera\//i.test(agent) || botAgent.test(agent)

export const deviceOf = (agent: string): Device => (/ipad|tablet|kindle|silk|playbook|android(?!.*mobile)/i.test(agent) ? 'tablet' : /mobi|iphone|ipod|android|phone/i.test(agent) ? 'phone' : 'desktop')

/** The referring site's host name, without www, or '' for none and for this site's own pages. */
export function referrerOf(request: Request, ownHost: string) {
  const given = request.headers.get('referer')
  if (!given) return ''
  try {
    const host = new URL(given).hostname.toLowerCase().replace(/^www\./, '')
    return !host || host === ownHost.toLowerCase().replace(/^www\./, '') ? '' : host.slice(0, 100)
  } catch {
    return ''
  }
}

const countryOf = (request: Request) => {
  const country = String(request.cf?.country ?? '').toUpperCase()
  return /^[A-Z][A-Z0-9]$/.test(country) && country !== 'XX' ? country : ''
}

// Browsers ask for some pages before anyone opens them.
const prefetched = (request: Request) => /prefetch|prerender/i.test(`${request.headers.get('sec-purpose') ?? ''} ${request.headers.get('purpose') ?? ''} ${request.headers.get('x-moz') ?? ''}`)

const hex = (bytes: ArrayBuffer | Uint8Array) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

/** On unless the owner turned it off. */
export const statsOn = (settings: Settings) => settings.statistics !== false

const today = (settings: Settings, now = Date.now()) => localTime(now, zoneOf(settings)).date

// This copy of the worker remembers today's salt, so most views skip reading it. It is forgotten when the day changes.
let remembered: null | { day: string; site: number; value: string } = null

/** Today's salt. The first visit of a day replaces yesterday's, so only one is ever stored. */
async function saltFor(env: Env, siteId: number, day: string) {
  if (remembered?.day === day && remembered.site === siteId) return remembered.value
  const name = `salt:${siteId}`
  const fresh = `${day}:${hex(crypto.getRandomValues(new Uint8Array(16)))}`
  const [, read] = await env.DB.batch<{ value: string }>([
    // Moves only forward, so a request finishing just before midnight can't swap the salt back.
    env.DB.prepare('INSERT INTO stats_meta (name, value) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value WHERE substr(stats_meta.value, 1, 10) < substr(excluded.value, 1, 10)').bind(name, fresh),
    env.DB.prepare('SELECT value FROM stats_meta WHERE name = ?').bind(name),
  ])
  const value = read.results[0]?.value ?? fresh
  if (value.startsWith(`${day}:`)) remembered = { day, site: siteId, value }
  return value
}

async function countView(env: Env, request: Request, path: string, agent: string) {
  const site = await env.DB.prepare('SELECT id, settings FROM sites LIMIT 1').first<{ id: number; settings: string }>()
  if (!site) return
  const settings = JSON.parse(site.settings) as Settings
  if (!statsOn(settings)) return
  const day = today(settings)
  const salt = await saltFor(env, site.id, day)
  const address = request.headers.get('cf-connecting-ip') ?? ''
  // 16 hex digits: enough to tell a day's visitors apart, and the address and browser never reach the database.
  const hash = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}|${site.id}|${day}|${address}|${agent}`))).slice(0, 16)
  const host = new URL(request.url).hostname
  // One transaction: the count first, with a visitor only if today's hashes don't have this one yet, then the hash.
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO stats_daily (day, site_id, path, referrer, country, device, views, visitors)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, NOT EXISTS (SELECT 1 FROM stats_seen WHERE day = ?1 AND site_id = ?2 AND hash = ?7))
       ON CONFLICT DO UPDATE SET views = views + 1, visitors = visitors + excluded.visitors`,
    ).bind(day, site.id, path, referrerOf(request, host), countryOf(request), deviceOf(agent), hash),
    env.DB.prepare('INSERT OR IGNORE INTO stats_seen (day, site_id, hash) VALUES (?, ?, ?)').bind(day, site.id, hash),
  ])
}

/**
 * Counts a view of a public page, after the page has been sent. index.ts calls this once for every answer, with the
 * address's path and the final status, so pages behind a language prefix count the same way. Only a 200 answer to a GET
 * from a browser counts: not HEAD, bots, prefetching, the back office, Claude, the API, images, files or previews.
 */
export function countVisit(env: Env, request: Request, path: string, status: number) {
  if (status !== 200 || request.method !== 'GET') return
  const counted = countablePath(path)
  const agent = request.headers.get('user-agent') ?? ''
  if (!counted || isBot(agent) || prefetched(request)) return
  const work = countView(env, request, counted, agent).catch((error) => console.error('A visit could not be counted', error))
  env.defer?.(work)
}

/** Counts an order placed, a form entry or a record a visitor added. Waits only when nothing can finish it later. */
export async function countConversion(env: Env, site: Pick<SiteRow, 'id' | 'settings'>, kind: ConversionKind) {
  const settings = JSON.parse(site.settings) as Settings
  if (!statsOn(settings)) return
  const work = env.DB.prepare('INSERT INTO stats_events (day, site_id, event, count) VALUES (?, ?, ?, 1) ON CONFLICT DO UPDATE SET count = count + 1')
    .bind(today(settings), site.id, kind)
    .run()
    .then(() => undefined)
    .catch((error) => console.error('A conversion could not be counted', error))
  if (env.defer) env.defer(work)
  else await work
}

/**
 * Runs from the scheduled handler every 15 minutes, and does its work once a day: deletes the hashes and salt of days
 * that are over, and statistics older than keptDays. The day it last ran is kept, so the other runs read one row.
 */
export async function cleanStats(env: Env, now = Date.now()) {
  const site = await env.DB.prepare("SELECT sites.settings, stats_meta.value AS cleaned FROM sites LEFT JOIN stats_meta ON stats_meta.name = 'cleaned' LIMIT 1").first<{ cleaned: null | string; settings: string }>()
  if (!site) return
  const day = today(JSON.parse(site.settings) as Settings, now)
  if (site.cleaned === day) return
  const oldest = addDays(day, -(keptDays - 1))
  await env.DB.batch([
    env.DB.prepare('DELETE FROM stats_seen WHERE day < ?').bind(day),
    env.DB.prepare("DELETE FROM stats_meta WHERE name LIKE 'salt:%' AND substr(value, 1, 10) < ?").bind(day),
    env.DB.prepare('DELETE FROM stats_daily WHERE day < ?').bind(oldest),
    env.DB.prepare('DELETE FROM stats_events WHERE day < ?').bind(oldest),
    env.DB.prepare("INSERT INTO stats_meta (name, value) VALUES ('cleaned', ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value").bind(day),
  ])
}

export type Ranked = { name: string; views: number; visitors: number }
export type DayCount = { conversions: number; day: string; views: number; visitors: number }
export type Report = {
  conversionRate: null | number
  conversions: Record<ConversionKind, number> & { total: number }
  countries: Ranked[]
  counting: boolean
  daily: DayCount[]
  days: number
  devices: Ranked[]
  direct: number
  from: string
  pages: Ranked[]
  referrers: Ranked[]
  to: string
  views: number
  visitors: number
}

const top = (counts: Map<string, Ranked>, by: 'views' | 'visitors', limit = 10) =>
  [...counts.values()].sort((a, b) => b[by] - a[by] || b.views - a.views || a.name.localeCompare(b.name)).slice(0, limit)

/** The last few days, today included, added up. Reads each kept row of those days twice: once by day, once by kind. */
export async function readStats(env: Env, site: Pick<SiteRow, 'id' | 'settings'>, days: number, now = Date.now()): Promise<Report> {
  const settings = JSON.parse(site.settings) as Settings
  const span = Math.min(Math.max(Math.round(days) || 1, 1), maxReportDays)
  const to = today(settings, now)
  const from = addDays(to, -(span - 1))
  const [byDay, combined, events] = await env.DB.batch<Record<string, number | string>>([
    env.DB.prepare('SELECT day, SUM(views) AS views, SUM(visitors) AS visitors FROM stats_daily WHERE day >= ? AND day <= ? AND site_id = ? GROUP BY day').bind(from, to, site.id),
    env.DB.prepare('SELECT path, referrer, country, device, SUM(views) AS views, SUM(visitors) AS visitors FROM stats_daily WHERE day >= ? AND day <= ? AND site_id = ? GROUP BY path, referrer, country, device LIMIT 20000').bind(from, to, site.id),
    env.DB.prepare('SELECT day, event, count FROM stats_events WHERE day >= ? AND day <= ? AND site_id = ?').bind(from, to, site.id),
  ])
  const daily = new Map<string, DayCount>()
  for (let index = 0; index < span; index++) {
    const day = addDays(from, index)
    daily.set(day, { conversions: 0, day, views: 0, visitors: 0 })
  }
  for (const row of byDay.results) {
    const entry = daily.get(String(row.day))
    if (entry) Object.assign(entry, { views: Number(row.views), visitors: Number(row.visitors) })
  }
  const conversions = { entry: 0, order: 0, record: 0, total: 0 }
  for (const row of events.results) {
    const kind = String(row.event) as ConversionKind
    if (!(conversionKinds as readonly string[]).includes(kind)) continue
    conversions[kind] += Number(row.count)
    conversions.total += Number(row.count)
    const entry = daily.get(String(row.day))
    if (entry) entry.conversions += Number(row.count)
  }
  const groups = { country: new Map<string, Ranked>(), device: new Map<string, Ranked>(), path: new Map<string, Ranked>(), referrer: new Map<string, Ranked>() }
  let direct = 0
  for (const row of combined.results) {
    const views = Number(row.views)
    const visitors = Number(row.visitors)
    if (!row.referrer) direct += views
    for (const key of ['path', 'referrer', 'country', 'device'] as const) {
      const name = String(row[key])
      if (key === 'referrer' && !name) continue
      const entry = groups[key].get(name) ?? { name, views: 0, visitors: 0 }
      entry.views += views
      entry.visitors += visitors
      groups[key].set(name, entry)
    }
  }
  const totals = [...daily.values()].reduce((sum, day) => ({ views: sum.views + day.views, visitors: sum.visitors + day.visitors }), { views: 0, visitors: 0 })
  return {
    conversionRate: totals.visitors ? conversions.total / totals.visitors : null,
    conversions,
    countries: top(groups.country, 'visitors'),
    counting: statsOn(settings),
    daily: [...daily.values()],
    days: span,
    devices: top(groups.device, 'visitors', 3),
    direct,
    from,
    pages: top(groups.path, 'views'),
    referrers: top(groups.referrer, 'views'),
    to,
    ...totals,
  }
}

/** The counts for the full download: numbers only, never hashes or the salt. */
export async function exportStats(env: Env, siteId: number) {
  const [daily, events] = await env.DB.batch([
    env.DB.prepare('SELECT day, path, referrer, country, device, views, visitors FROM stats_daily WHERE site_id = ? ORDER BY day, path LIMIT 200000').bind(siteId),
    env.DB.prepare('SELECT day, event, count FROM stats_events WHERE site_id = ? ORDER BY day, event').bind(siteId),
  ])
  return { conversions: events.results, daily: daily.results, note: 'Counts per day. Visitors were counted without cookies, and no IP address or visitor hash is kept.' }
}
