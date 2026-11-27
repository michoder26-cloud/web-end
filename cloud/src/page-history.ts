import type { Env } from './types'

export type PageRevision = { blocks: string; created_at: string; description: string; id: number; published: number; slug: string; title: string; translations: string }

/** Keeps a small, private undo trail for a single page before it changes. The editors save every few seconds
 *  while someone works; with `every` set, a burst of saves keeps one copy (the page as it was before the burst),
 *  so the 20 kept copies reach back hours instead of minutes. */
export async function rememberPage(env: Env, siteId: number, slug: string, every?: { minutes: number }) {
  const recent = every
    ? ` AND NOT EXISTS (SELECT 1 FROM page_revisions WHERE site_id = pages.site_id AND slug = pages.slug AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${Math.max(1, Math.round(every.minutes))} minutes'))`
    : ''
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO page_revisions (site_id, slug, title, description, published, blocks, translations) SELECT site_id, slug, title, description, published, blocks, translations FROM pages WHERE site_id = ? AND slug = ?${recent}`).bind(siteId, slug),
    env.DB.prepare('DELETE FROM page_revisions WHERE site_id = ? AND slug = ? AND id NOT IN (SELECT id FROM page_revisions WHERE site_id = ? AND slug = ? ORDER BY id DESC LIMIT 20)').bind(siteId, slug, siteId, slug),
  ])
}

export async function pageRevisions(env: Env, siteId: number, slug: string) {
  return (await env.DB.prepare('SELECT id, slug, title, description, published, blocks, translations, created_at FROM page_revisions WHERE site_id = ? AND slug = ? ORDER BY id DESC LIMIT 20').bind(siteId, slug).all<PageRevision>()).results
}

/** Restoring is itself undoable: keep the working copy first, then apply the selected snapshot. */
export async function restorePageRevision(env: Env, siteId: number, slug: string, revisionId: number) {
  const revision = await env.DB.prepare('SELECT id, slug, title, description, published, blocks, translations, created_at FROM page_revisions WHERE id = ? AND site_id = ? AND slug = ?').bind(revisionId, siteId, slug).first<PageRevision>()
  if (!revision) return false
  await rememberPage(env, siteId, slug)
  await env.DB.prepare("UPDATE pages SET title = ?, description = ?, published = ?, blocks = ?, translations = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE site_id = ? AND slug = ?")
    .bind(revision.title, revision.description, revision.published, revision.blocks, revision.translations, siteId, slug)
    .run()
  return true
}

/** The page's saved copies for the editors' History panel: no page content, only what the list shows. A copy is
 *  marked as live when visitors see exactly that page now. */
export async function pageHistoryList(env: Env, siteId: number, slug: string, live: string | null, current: string | null) {
  const rows = (await env.DB.prepare('SELECT id, title, published, created_at, blocks FROM page_revisions WHERE site_id = ? AND slug = ? ORDER BY id DESC LIMIT 20').bind(siteId, slug).all<{ blocks: string; created_at: string; id: number; published: number; title: string }>()).results
  // A copy the same as the one after it (a save that changed nothing on the page) is left out.
  let after = current
  const kept = rows.filter((row) => {
    const same = row.blocks === after
    after = row.blocks
    return !same
  })
  return kept.map((row) => ({ at: row.created_at, id: row.id, live: live !== null && row.blocks === live, published: Boolean(row.published), title: row.title }))
}

export const pageRevision = (env: Env, siteId: number, slug: string, id: number) =>
  env.DB.prepare('SELECT id, slug, title, description, published, blocks, translations, created_at FROM page_revisions WHERE id = ? AND site_id = ? AND slug = ?').bind(id, siteId, slug).first<PageRevision>()
