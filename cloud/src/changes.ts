import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { office } from './cms'
import type { Desk } from './cms'
import { escapeHtml, notFound, see } from './http'
import { officeText } from './office-words'
import { rememberPage } from './page-history'
import type { Env, SiteRow } from './types'

// "What changed": every change Claude makes is written down with a way to undo it where one exists,
// and Claude is told to stop when it keeps changing the same thing, instead of fixing in circles.

const keep = 500
const loopLimit = 5
const loopMinutes = 30

type Undo = { kind: 'page'; revision: number; slug: string } | { kind: 'new-page'; slug: string } | { kind: 'settings'; settings: string }

/** The tools that change something. Reading tools are never logged. */
const changingTools = new Set([
  'apply_starter', 'copy_image', 'decide_approval', 'delete_approval_flow', 'delete_automation', 'delete_item', 'delete_page', 'delete_record', 'delete_redirect', 'delete_table', 'delete_webhook',
  'duplicate_page', 'import_products', 'publish_site', 'restore_page_revision', 'restore_version', 'save_app_plan', 'save_approval_flow', 'save_automation', 'save_campaign', 'save_item', 'save_page',
  'save_record', 'save_redirects', 'save_table', 'save_translation', 'save_webhook', 'send_campaign', 'set_customer_role', 'update_entry', 'update_order', 'update_site',
])

/** What a tool call changes, in one short word the owner can recognise, such as the page's address. */
const targetOf = (tool: string, args: Record<string, unknown>) => {
  if (tool === 'update_site') return 'settings'
  const name = args.slug ?? args.newSlug ?? args.name ?? args.table ?? args.title ?? args.collection ?? ''
  const id = args.id ?? args.recordId ?? ''
  return [String(name), id === '' ? '' : `#${String(id)}`].filter(Boolean).join(' ').slice(0, 120) || tool
}

export async function logChange(env: Env, actor: string, action: string, target: string, summary: string, undo: null | Undo) {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO change_log (site_id, actor, action, target, summary, undo) SELECT id, ?, ?, ?, ?, ? FROM sites LIMIT 1').bind(actor, action, target, summary.slice(0, 300), undo ? JSON.stringify(undo) : null),
    env.DB.prepare(`DELETE FROM change_log WHERE id <= (SELECT id FROM change_log ORDER BY id DESC LIMIT 1 OFFSET ${keep})`),
  ])
}

type ToolResult = { content: { text: string; type: 'text' }[]; isError?: boolean }

/** Wraps every tool registered after this, so each change Claude makes is logged, with the loop guard added to its answer. */
export function watchChanges(server: McpServer, env: Env) {
  const register = server.registerTool.bind(server) as (...args: unknown[]) => unknown
  ;(server as unknown as { registerTool: (...args: unknown[]) => unknown }).registerTool = (name: unknown, config: unknown, handler: unknown) => {
    if (typeof name !== 'string' || !changingTools.has(name) || typeof handler !== 'function') return register(name, config, handler)
    const title = (config as { title?: string }).title ?? name
    const run = handler as (args: Record<string, unknown>, extra: unknown) => Promise<ToolResult>
    return register(name, config, async (args: Record<string, unknown>, extra: unknown) => {
      const target = targetOf(name, args ?? {})
      const slug = typeof args?.slug === 'string' ? args.slug : null
      const [before, settings] = await Promise.all([
        env.DB.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM page_revisions').first<{ id: number }>(),
        name === 'update_site' ? env.DB.prepare('SELECT settings FROM sites LIMIT 1').first<{ settings: string }>() : null,
      ])
      const result = await run(args, extra)
      if (result?.isError) return result
      try {
        let undo: null | Undo = null
        if (settings) undo = { kind: 'settings', settings: settings.settings }
        else if (slug && ['save_page', 'delete_page', 'restore_page_revision', 'save_translation'].includes(name)) {
          const revision = await env.DB.prepare('SELECT id FROM page_revisions WHERE slug = ? AND id > ? ORDER BY id DESC LIMIT 1').bind(slug, before?.id ?? 0).first<{ id: number }>()
          undo = revision ? { kind: 'page', revision: revision.id, slug } : name === 'save_page' ? { kind: 'new-page', slug } : null
        }
        await logChange(env, 'claude', name, target, title, undo)
        // The same thing changed again and again usually means a fix that isn't working. Say so, and stop.
        const recent = await env.DB.prepare(`SELECT COUNT(*) AS total FROM change_log WHERE actor = 'claude' AND target = ? AND action = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${loopMinutes} minutes')`)
          .bind(target, name)
          .first<{ total: number }>()
        if ((recent?.total ?? 0) >= loopLimit) {
          result.content.push({ text: `Stop here: you have changed "${target}" ${recent?.total} times in the last ${loopMinutes} minutes, which usually means a fix is not working. Do not change it again now. Tell the owner, in plain words, what you were trying to do and what keeps going wrong, and ask how they want to continue. They can undo any of these changes on the "What changed" page of their back office.`, type: 'text' })
        }
      } catch (error) {
        // The change itself worked. A missing log line must not turn it into a failure.
        console.error(error)
      }
      return result
    })
  }
}

/** How many changes Claude made today, for the overview. */
export const claudeChangesToday = async (env: Env) =>
  (await env.DB.prepare("SELECT COUNT(*) AS total FROM change_log WHERE actor = 'claude' AND created_at >= strftime('%Y-%m-%d', 'now')").first<{ total: number }>().catch((): null => null))?.total ?? 0

type ChangeRow = { action: string; actor: string; created_at: string; id: number; summary: string; target: string; undo: null | string; undone_at: null | string }

async function changesPage(env: Env, site: SiteRow, desk: Desk, saved?: string, error?: string) {
  const t = officeText(site).changes
  const { results } = await env.DB.prepare('SELECT id, actor, action, target, summary, undo, undone_at, created_at FROM change_log ORDER BY id DESC LIMIT 200').all<ChangeRow>()
  const base = escapeHtml(desk.base)
  const rows = results
    .map((change) => {
      const when = escapeHtml(change.created_at.slice(0, 16).replace('T', ' '))
      const undo = change.undone_at
        ? `<small>${t.undone}</small>`
        : change.undo
          ? `<form action="${base}/changes/${change.id}/undo" method="post"><button class="button button--small button--ghost" type="submit">${t.undo}</button></form>`
          : `<small>${t.noUndo}</small>`
      return `<li class="change"><div><b>${escapeHtml(change.summary)}</b>: ${escapeHtml(change.target)}<br><small>${escapeHtml(t.actor(change.actor))} · ${when} UTC</small></div>${undo}</li>`
    })
    .join('')
  return office(site, desk, t.title, `<p>${t.intro}</p>${rows ? `<ol class="changes">${rows}</ol>` : `<p>${t.none}</p>`}`, saved ? { saved } : error ? { error } : undefined)
}

/** Puts one change back. The undo is written down too, and can itself be undone. */
async function undoChange(env: Env, change: ChangeRow) {
  const undo = JSON.parse(change.undo ?? 'null') as null | Undo
  if (!undo) return false
  if (undo.kind === 'settings') {
    const now = await env.DB.prepare('SELECT settings FROM sites LIMIT 1').first<{ settings: string }>()
    await env.DB.prepare("UPDATE sites SET settings = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").bind(undo.settings).run()
    await logChange(env, 'owner', 'undo', change.target, `Undo: ${change.summary}`, now ? { kind: 'settings', settings: now.settings } : null)
  } else {
    const siteId = (await env.DB.prepare('SELECT id FROM sites LIMIT 1').first<{ id: number }>())!.id
    await rememberPage(env, siteId, undo.slug)
    const latest = await env.DB.prepare('SELECT id FROM page_revisions WHERE slug = ? ORDER BY id DESC LIMIT 1').bind(undo.slug).first<{ id: number }>()
    const exists = await env.DB.prepare('SELECT 1 FROM pages WHERE slug = ?').bind(undo.slug).first()
    if (undo.kind === 'new-page') await env.DB.prepare('DELETE FROM pages WHERE slug = ?').bind(undo.slug).run()
    else {
      // Brings back a deleted page as well as an edited one.
      const done = await env.DB.prepare(`INSERT INTO pages (site_id, slug, title, description, published, blocks, translations) SELECT site_id, slug, title, description, published, blocks, translations FROM page_revisions WHERE id = ? AND slug = ?
        ON CONFLICT (site_id, slug) DO UPDATE SET title = excluded.title, description = excluded.description, published = excluded.published, blocks = excluded.blocks, translations = excluded.translations, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`).bind(undo.revision, undo.slug).run()
      if (!done.meta.changes) return false
    }
    const back: null | Undo = exists && latest ? { kind: 'page', revision: latest.id, slug: undo.slug } : { kind: 'new-page', slug: undo.slug }
    await logChange(env, 'owner', 'undo', change.target, `Undo: ${change.summary}`, back)
  }
  await env.DB.prepare("UPDATE change_log SET undone_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(change.id).run()
  return true
}

/** The owner's "What changed" page. Staff never reach it. */
export async function handleChanges(request: Request, env: Env, url: URL, site: SiteRow, desk: Desk, id: string | undefined, action: string | undefined) {
  if (desk.staff || !desk.accountOwner) return notFound()
  const t = officeText(site).changes
  if (!id && request.method !== 'POST') return changesPage(env, site, desk, url.searchParams.has('undone') ? t.undoneNotice : undefined)
  if (request.method !== 'POST' || action !== 'undo' || !/^\d{1,12}$/.test(id ?? '')) return notFound()
  const change = await env.DB.prepare('SELECT id, actor, action, target, summary, undo, undone_at, created_at FROM change_log WHERE id = ?').bind(Number(id)).first<ChangeRow>()
  if (!change) return notFound()
  if (change.undone_at || !(await undoChange(env, change))) return changesPage(env, site, desk, undefined, t.cannotUndo)
  return see(url, `${desk.base}/changes?undone=${change.id}`)
}
