import type { Env, PageRow, Settings, SiteRow } from './types'

const keptVersions = 20
const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"

// These connect the site to the outside world, or only change the owner's back office and automations, so they work at once and a rollback must not undo them.
// Settings that work at once and stay out of publishing and going back to a version.
export const systemSettingKeys: readonly string[] = ['allowedOrigins', 'emailFrom', 'githubRepo', 'newsDailyLimit', 'newsletter', 'notifyEmail', 'officeLanguage', 'statistics', 'timeZone']
const systemSettings = (settings: Settings) => ({ allowedOrigins: settings.allowedOrigins, emailFrom: settings.emailFrom, githubRepo: settings.githubRepo, newsDailyLimit: settings.newsDailyLimit, newsletter: settings.newsletter, notifyEmail: settings.notifyEmail, officeLanguage: settings.officeLanguage, statistics: settings.statistics, timeZone: settings.timeZone })

/** What visitors see. Once something is published they get that copy, and changes wait until the next publish. */
export function liveSite(site: SiteRow): SiteRow {
  if (!site.live_version || !site.live_settings) return site
  return { ...site, settings: JSON.stringify({ ...(JSON.parse(site.live_settings) as Settings), ...systemSettings(JSON.parse(site.settings) as Settings) }) }
}

export const findLivePage = (env: Env, site: SiteRow, slug: string) =>
  site.live_version
    ? env.DB.prepare('SELECT slug, title, description, published, blocks, translations FROM version_pages WHERE version_id = ? AND slug = ? AND published = 1').bind(site.live_version, slug).first<PageRow>()
    : env.DB.prepare('SELECT slug, title, description, published, blocks, translations FROM pages WHERE site_id = ? AND slug = ? AND published = 1').bind(site.id, slug).first<PageRow>()

export const findWorkingPage = (env: Env, site: SiteRow, slug: string) => env.DB.prepare('SELECT slug, title, description, published, blocks, translations FROM pages WHERE site_id = ? AND slug = ?').bind(site.id, slug).first<PageRow>()

export const liveSlugs = async (env: Env, site: SiteRow) => {
  const query = site.live_version ? env.DB.prepare('SELECT slug FROM version_pages WHERE version_id = ? AND published = 1').bind(site.live_version) : env.DB.prepare('SELECT slug FROM pages WHERE site_id = ? AND published = 1').bind(site.id)
  return (await query.all<{ slug: string }>()).results.map((row) => row.slug)
}

const comparable = (settings: string) => {
  const { allowedOrigins: _origins, emailFrom: _from, githubRepo: _repo, notifyEmail: _notify, officeLanguage: _office, statistics: _statistics, timeZone: _zone, ...rest } = JSON.parse(settings) as Settings
  return JSON.stringify(Object.entries(rest).sort(([a], [b]) => a.localeCompare(b)))
}

/** Lists what would change for visitors at the next publish. */
export async function unpublishedChanges(env: Env, site: SiteRow) {
  if (!site.live_version) return null
  const row = (page: PageRow) => JSON.stringify([page.title, page.description, page.published, page.blocks, page.translations])
  const [{ results: working }, { results: live }] = await Promise.all([
    env.DB.prepare('SELECT slug, title, description, published, blocks, translations FROM pages WHERE site_id = ?').bind(site.id).all<PageRow>(),
    env.DB.prepare('SELECT slug, title, description, published, blocks, translations FROM version_pages WHERE version_id = ?').bind(site.live_version).all<PageRow>(),
  ])
  const before = new Map(live.map((page) => [page.slug, row(page)]))
  const after = new Set(working.map((page) => page.slug))
  return {
    pages: [...working.filter((page) => before.get(page.slug) !== row(page)).map((page) => page.slug), ...live.filter((page) => !after.has(page.slug)).map((page) => page.slug)],
    settings: comparable(site.settings) !== comparable(site.live_settings ?? '{}'),
  }
}

/** Makes the current pages and settings the live version. */
export async function publishVersion(env: Env, site: SiteRow, note: string) {
  // A unique token identifies this batch even when a restore reuses numeric IDs.
  // The generation is captured when the request loads the site, and changes at
  // the start of every restore, including restores that finish before this batch.
  const token = crypto.randomUUID()
  const [created] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO versions (site_id, note, settings, publish_token)
      SELECT id, ?, settings, ? FROM sites WHERE id = ? AND restore_generation = ? AND restore_hash IS NULL AND settings = ?
      AND EXISTS (SELECT 1 FROM pages WHERE site_id = sites.id AND slug = 'home' AND published = 1) RETURNING id`)
      .bind(note.slice(0, 200), token, site.id, site.restore_generation ?? -1, site.settings),
    env.DB.prepare('INSERT INTO version_pages (version_id, slug, title, description, published, blocks, translations) SELECT versions.id, pages.slug, pages.title, pages.description, pages.published, pages.blocks, pages.translations FROM versions JOIN pages ON pages.site_id = versions.site_id WHERE versions.publish_token = ?').bind(token),
    env.DB.prepare(`UPDATE sites SET live_version = (SELECT id FROM versions WHERE publish_token = ?), updated_at = ${now} WHERE id = ? AND EXISTS (SELECT 1 FROM versions WHERE publish_token = ?)`).bind(token, site.id, token),
    env.DB.prepare('DELETE FROM versions WHERE site_id = ? AND EXISTS (SELECT 1 FROM versions WHERE publish_token = ?) AND id NOT IN (SELECT id FROM versions WHERE site_id = ? ORDER BY id DESC LIMIT ?)').bind(site.id, token, site.id, keptVersions),
  ])
  const version = created.results[0] as { id: number } | undefined
  return version ? { id: version.id } : { error: 'The site changed or a restore is in progress. Reload and try publishing again.' }
}

/** Puts an older version back, both for visitors and in the working copy. Orders, customers and records stay as they are. */
export async function restoreVersion(env: Env, site: SiteRow, id: number) {
  const version = await env.DB.prepare('SELECT settings FROM versions WHERE id = ? AND site_id = ?').bind(id, site.id).first<{ settings: string }>()
  if (!version) return false
  const settings = { ...(JSON.parse(version.settings) as Settings), ...systemSettings(JSON.parse(site.settings) as Settings) }
  const guard = `EXISTS (SELECT 1 FROM sites WHERE id = ? AND restore_generation = ? AND restore_hash IS NULL AND settings = ?) AND EXISTS (SELECT 1 FROM versions WHERE id = ? AND site_id = ?)`
  const args = [site.id, site.restore_generation ?? -1, site.settings, id, site.id] as const
  const [, , , , updated] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO page_revisions (site_id, slug, title, description, published, blocks, translations) SELECT site_id, slug, title, description, published, blocks, translations FROM pages WHERE site_id = ? AND ${guard}`).bind(site.id, ...args),
    env.DB.prepare(`DELETE FROM page_revisions WHERE site_id = ? AND ${guard} AND slug IN (SELECT slug FROM pages WHERE site_id = ?) AND id NOT IN (SELECT id FROM page_revisions AS newer WHERE newer.site_id = page_revisions.site_id AND newer.slug = page_revisions.slug ORDER BY id DESC LIMIT 20)`).bind(site.id, ...args, site.id),
    env.DB.prepare(`DELETE FROM pages WHERE site_id = ? AND ${guard}`).bind(site.id, ...args),
    env.DB.prepare(`INSERT INTO pages (site_id, slug, title, description, published, blocks, translations) SELECT ?, slug, title, description, published, blocks, translations FROM version_pages WHERE version_id = ? AND ${guard}`).bind(site.id, id, ...args),
    env.DB.prepare(`UPDATE sites SET settings = ?, live_version = ?, updated_at = ${now} WHERE id = ? AND ${guard}`).bind(JSON.stringify(settings), id, site.id, ...args),
  ])
  return updated.meta.changes > 0
}

export const listVersions = async (env: Env, siteId: number) =>
  (await env.DB.prepare('SELECT id, note, created_at FROM versions WHERE site_id = ? ORDER BY id DESC LIMIT ?').bind(siteId, keptVersions).all<{ created_at: string; id: number; note: string }>()).results
