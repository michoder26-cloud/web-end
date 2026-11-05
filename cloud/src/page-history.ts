import type { Env } from './types'

export type PageRevision = { blocks: string; created_at: string; description: string; id: number; published: number; slug: string; title: string; translations: string }

/** Keeps a small, private undo trail for a single page before it changes. */
export async function rememberPage(env: Env, siteId: number, slug: string) {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO page_revisions (site_id, slug, title, description, published, blocks, translations) SELECT site_id, slug, title, description, published, blocks, translations FROM pages WHERE site_id = ? AND slug = ?').bind(siteId, slug),
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
