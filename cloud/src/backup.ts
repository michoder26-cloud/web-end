import { newToken, sha256, startSession } from './auth'
import { notFound } from './http'
import type { Env, SiteRow } from './types'
import { version } from './version'

// A complete backup that can be put back. The owner's browser fetches it in small parts and joins them into one file,
// and sends it back the same way, so no single request needs more than a moment of the Worker's time on the free plan.
// One database holds one site, so every row of these tables belongs to it.

export const backupFormat = 1

/** In the order they can be put back: a row's parents always come before it. Short-lived rows, such as sessions, are left out. */
export const backupTables = [
  'customers',
  'pages',
  'page_revisions',
  'items',
  'item_variants',
  'media',
  'orders',
  'order_lines',
  'order_events',
  'order_links',
  'entries',
  'data_tables',
  'data_records',
  'api_keys',
  'webhooks',
  'versions',
  'version_pages',
  'redirects',
  'move_sources',
  'automations',
  'automation_done',
  'stats_daily',
  'stats_events',
  'subscribers',
  'campaigns',
  'campaign_recipients',
  'news_daily',
  'approval_flows',
  'approval_requests',
  'approval_decisions',
  'app_plans',
  'app_plan_revisions',
  'change_log',
] as const

type BackupTable = (typeof backupTables)[number]
const isBackupTable = (value: unknown): value is BackupTable => (backupTables as readonly unknown[]).includes(value)

// Tables whose rows can be large get smaller parts, so each part stays well under the back office's 3 MB limit.
const partSize = (table: BackupTable) => (table === 'media' ? 2 : ['pages', 'page_revisions', 'version_pages', 'app_plans', 'app_plan_revisions'].includes(table) ? 10 : table === 'data_records' ? 100 : 200)

// The site's own row, put back last. Its private link and its id stay as they are on this install.
const siteColumns = ['settings', 'slug', 'move_differences_shown', 'claude_seen_at', 'phone_seen_at', 'news_secret'] as const

const columnsOf = async (env: Env, table: string) => (await env.DB.prepare('SELECT name FROM pragma_table_info(?)').bind(table).all<{ name: string }>()).results.map((row) => row.name)

// Images and other binary values travel as base64 text.
const toBase64 = (bytes: Uint8Array) => {
  let text = ''
  for (let index = 0; index < bytes.length; index += 0x8000) text += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(text)
}
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
const encode = (value: unknown) => {
  if (value instanceof ArrayBuffer) return { $b64: toBase64(new Uint8Array(value)) }
  if (ArrayBuffer.isView(value)) return { $b64: toBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) }
  if (Array.isArray(value)) return { $b64: toBase64(Uint8Array.from(value as number[])) }
  return value
}
const decode = (value: unknown) => (value && typeof value === 'object' && typeof (value as { $b64?: unknown }).$b64 === 'string' ? fromBase64((value as { $b64: string }).$b64) : value)

/** The page of the backup that starts after `after`. */
async function backupPart(env: Env, url: URL, site: SiteRow) {
  const table = url.searchParams.get('table')
  if (table === 'site') {
    const row = await env.DB.prepare(`SELECT ${siteColumns.join(', ')}, live_version, owner_customer_id FROM sites WHERE id = ?`).bind(site.id).first()
    return Response.json({ appVersion: version, format: backupFormat, site: row, tables: backupTables }, { headers: { 'Cache-Control': 'no-store' } })
  }
  if (!isBackupTable(table)) return notFound()
  const after = Number(url.searchParams.get('after') ?? 0)
  if (!Number.isSafeInteger(after) || after < 0) return notFound()
  // Statistics tables have no row numbers, so they are read by position instead. They only grow by one row per page and day.
  const byPosition = table === 'stats_daily' || table === 'stats_events'
  const { results } = await (byPosition
    ? env.DB.prepare(`SELECT * FROM ${table} LIMIT ? OFFSET ?`).bind(partSize(table), after)
    : env.DB.prepare(`SELECT rowid AS backup_row, * FROM ${table} WHERE rowid > ? ORDER BY rowid LIMIT ?`).bind(after, partSize(table))
  ).all<Record<string, unknown>>()
  const columns = results.length ? Object.keys(results[0]).filter((name) => name !== 'backup_row') : await columnsOf(env, table)
  const rows = results.map((row) => columns.map((name) => encode(row[name])))
  const next = results.length < partSize(table) ? null : byPosition ? after + results.length : results.at(-1)!.backup_row
  return Response.json({ columns, next, rows, table }, { headers: { 'Cache-Control': 'no-store' } })
}

const fromThisSite = (request: Request, url: URL) => {
  const origin = request.headers.get('origin')
  if (origin && origin !== 'null') return origin === url.origin
  return request.headers.get('sec-fetch-site') === 'same-origin'
}

const refuse = (problem: string, status = 400) => Response.json({ problem }, { status })

/**
 * One step of putting a backup back: `start` empties the site, each part adds rows with their own ids, and `finish`
 * puts back the site's settings and its links to its owner account and live version.
 */
async function restorePart(request: Request, env: Env, url: URL, site: SiteRow, signedIn: boolean) {
  // Replacing everything is the most destructive thing the back office does, so it must come from this site's own page.
  if (!fromThisSite(request, url)) return refuse('This came from another website, so nothing was changed.', 403)
  const body = (await request.json().catch((): null => null)) as null | Record<string, unknown>
  if (!body) return refuse('That is not a part of a web-end backup.')

  if (body.start === true) {
    if (body.format !== backupFormat) return refuse('This backup was made by a newer web-end. Update this site first, then restore it.')
    if (body.confirm !== true) return refuse('Tick the box to confirm that everything on this site is replaced.')
    // Children first, so nothing is left pointing at a row that is gone.
    await env.DB.batch([
      env.DB.prepare('UPDATE sites SET live_version = NULL, owner_customer_id = NULL WHERE id = ?').bind(site.id),
      env.DB.prepare('DELETE FROM sessions'),
      env.DB.prepare('DELETE FROM password_resets'),
      env.DB.prepare('DELETE FROM webhook_deliveries'),
      env.DB.prepare('DELETE FROM automation_runs'),
      // Approval history can never be deleted or changed, not even by a restore. It is kept, and the backup only adds what is missing.
      ...[...backupTables].reverse().filter((table) => table !== 'approval_decisions').map((table) => env.DB.prepare(`DELETE FROM ${table}`)),
    ])
    // The owner's own sign-in is gone now too, so the rest of this restore carries a token instead. It lasts an hour.
    const token = newToken()
    await env.DB.prepare("UPDATE sites SET restore_hash = ?, restore_until = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+1 hour') WHERE id = ?").bind(await sha256(token), site.id).run()
    return Response.json({ ok: true, token })
  }

  if (!(await restoreTokenValid(request, env))) return refuse('This restore has expired. Start it again from the System page.', 403)

  if (body.finish === true) {
    const saved = (body.site ?? {}) as Record<string, unknown>
    if (typeof saved.settings !== 'string') return refuse('The backup has no site settings.')
    const values = siteColumns.map((name) => (saved[name] === undefined ? null : saved[name]))
    values[siteColumns.indexOf('slug')] ??= site.slug
    await env.DB.prepare(`UPDATE sites SET ${siteColumns.map((name) => `${name} = ?`).join(', ')}, live_version = (SELECT id FROM versions WHERE id = ?), owner_customer_id = (SELECT id FROM customers WHERE id = ?), restore_hash = NULL, restore_until = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`)
      .bind(...values, saved.live_version ?? null, saved.owner_customer_id ?? null, site.id)
      .run()
    // An owner who signed in with their account was signed out when the accounts were replaced. Sign the backup's owner back in.
    const ownerId = Number(saved.owner_customer_id)
    const cookie = signedIn && Number.isSafeInteger(ownerId) && (await env.DB.prepare('SELECT 1 FROM customers WHERE id = ?').bind(ownerId).first()) ? await startSession(env, url, ownerId) : null
    return Response.json({ ok: true }, cookie ? { headers: { 'Set-Cookie': cookie } } : undefined)
  }

  const table = body.table
  if (!isBackupTable(table)) return refuse('That part names a table this site does not have.')
  const columns = Array.isArray(body.columns) ? body.columns.map(String) : []
  const rows = Array.isArray(body.rows) ? (body.rows as unknown[][]) : []
  const known = new Set(await columnsOf(env, table))
  // Columns from an older backup that this version no longer has are skipped; new columns take their defaults.
  const kept = columns.map((name, index) => [name, index] as const).filter(([name]) => known.has(name))
  if (!kept.length || rows.some((row) => !Array.isArray(row) || row.length !== columns.length)) return refuse('That part of the backup is damaged.')
  const sql = `INSERT${table === 'approval_decisions' ? ' OR IGNORE' : ''} INTO ${table} (${kept.map(([name]) => name).join(', ')}) VALUES (${kept.map(() => '?').join(', ')})`
  try {
    if (rows.length) await env.DB.batch(rows.map((row) => env.DB.prepare(sql).bind(...kept.map(([, index]) => decode(row[index]) ?? null))))
  } catch (error) {
    console.error(error)
    return refuse(`Part of the backup for ${table} could not be put back. The backup may come from a different site or be damaged.`)
  }
  return Response.json({ added: rows.length, ok: true })
}

/** Whether a request carries the token of the restore that is running now. */
export async function restoreTokenValid(request: Request, env: Env) {
  const token = request.headers.get('x-restore-token')
  if (!token || token.length > 100) return false
  return Boolean(await env.DB.prepare("SELECT 1 FROM sites WHERE restore_hash = ? AND restore_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").bind(await sha256(token)).first())
}

/** The owner's backup routes. Staff never reach them. */
export function handleBackup(request: Request, env: Env, url: URL, site: SiteRow, area: string, id: string | undefined, signedIn: boolean) {
  if (id !== 'part') return null
  if (area === 'backup' && request.method === 'GET') return backupPart(env, url, site)
  if (area === 'restore' && request.method === 'POST') return restorePart(request, env, url, site, signedIn)
  return null
}
