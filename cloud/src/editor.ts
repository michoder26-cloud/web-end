import { z } from 'zod'

import { catalog, firstProblem } from './cms'
import type { Desk } from './cms'
import { escapeHtml, html, notFound, privateHeaders } from './http'
import { saveImage, showImage } from './items'
import { blockSchema, maxBlocksBytes } from './mcp'
import { officeText } from './office-words'
import { rememberPage } from './page-history'
import { siteLook } from './render'
import type { Block, Env, Settings, SiteRow } from './types'

/**
 * The visual editor: the page as visitors see it, with text typed in place, sections dragged into order,
 * and photos changed with a click. It saves to the working copy, like the form editor, and Publish makes it live.
 * Its script and styles are files in /public, so the page allows scripts from this site only.
 */

const editorHeaders = { ...privateHeaders, 'Content-Security-Policy': privateHeaders['Content-Security-Policy'].replace("script-src 'none'", "script-src 'self'") }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { headers: { ...privateHeaders, 'Cache-Control': 'no-store', 'Content-Type': 'application/json' }, status })

// What the editor's settings panel may show: the catalog's own fields, without lists (those are edited in place).
const fieldsFor = (t: ReturnType<typeof officeText>) =>
  Object.fromEntries(
    Object.entries(catalog).map(([type, entry]) => [
      type,
      {
        label: t.label(entry.label),
        start: entry.start,
        fields: entry.fields.filter((field) => field.kind !== 'list').map(({ key, kind, label, options }) => ({ key, kind, label: t.label(label), options: options?.map((value) => ({ label: t.option(value), value })) })),
      },
    ]),
  )

/** The editor for one page. A site without a home page yet opens it empty; the first section saved creates it. */
export async function editorPage(env: Env, site: SiteRow, desk: Desk, slug: string) {
  const [found, { results: pages }, { results: media }] = await Promise.all([
    env.DB.prepare('SELECT title, blocks, published FROM pages WHERE site_id = ? AND slug = ?').bind(site.id, slug).first<{ blocks: string; published: number; title: string }>(),
    env.DB.prepare('SELECT slug, title FROM pages WHERE site_id = ? ORDER BY slug').bind(site.id).all<{ slug: string; title: string }>(),
    env.DB.prepare('SELECT id, name FROM media WHERE site_id = ? ORDER BY id DESC LIMIT 60').bind(site.id).all<{ id: number; name: string }>(),
  ])
  const settings = JSON.parse(site.settings) as Settings
  const page = found ?? (slug === 'home' ? { blocks: '[]', published: 1, title: settings.name } : null)
  if (!page) return notFound()
  if (!found) pages.unshift({ slug: 'home', title: settings.name })
  const t = officeText(site)
  const { style, vars } = siteLook(settings)
  const data = {
    base: desk.base,
    dashboard: `${desk.base}/dashboard`,
    // Until the owner has a sign-in, the secret address is their only way back in, so the editor says so too.
    keepKey: Boolean(desk.code && !site.owner_customer_id),
    blocks: JSON.parse(page.blocks) as Block[],
    canPublish: !desk.staff || desk.staff.permissions.includes('publish'),
    catalog: fieldsFor(t),
    lang: t.lang,
    media: media.map((image) => ({ name: image.name, url: `/media/${image.id}` })),
    pages: pages.map((one) => ({ slug: one.slug, title: one.title })),
    published: Boolean(page.published),
    siteName: settings.name,
    slug,
    title: page.title,
  }
  // The data is read by the script, never run: "<" is escaped so the text can't close the tag.
  const embedded = JSON.stringify(data).replace(/</g, '\\u003c')
  const lang = t.lang === 'th' ? 'th' : 'en'
  return html(
    `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(settings.name)}: ${lang === 'th' ? 'แก้ไขเว็บ' : 'Edit site'}</title>
<link rel="stylesheet" href="/fonts/fonts.css">
<link rel="stylesheet" href="/site.css">
<link rel="stylesheet" href="/editor.css">
</head>
<body class="ed-body" data-style="${escapeHtml(style)}" style="${escapeHtml(vars)}">
<div id="editor"><noscript><p class="ed-noscript">${lang === 'th' ? 'ตัวแก้เว็บต้องใช้ JavaScript ใช้ฟอร์มแก้ไขแทนได้ที่' : 'The editor needs JavaScript. Use the form editor instead at'} <a href="${escapeHtml(desk.base)}/page/${escapeHtml(slug)}">${escapeHtml(desk.base)}/page/${escapeHtml(slug)}</a></p></noscript></div>
<script id="editor-data" type="application/json">${embedded}</script>
<script src="/editor.js"></script>
</body>
</html>`,
    200,
    editorHeaders,
  )
}

async function savePage(request: Request, env: Env, site: SiteRow, slug: string) {
  const t = officeText(site)
  const body = (await request.json().catch((): null => null)) as { blocks?: unknown } | null
  const parsed = z.object({ blocks: z.array(blockSchema).min(1).max(40) }).safeParse(body)
  // The section with the problem comes back too, so the editor can show it.
  if (!parsed.success) {
    const [where, index] = parsed.error.issues[0].path
    return json({ block: where === 'blocks' && typeof index === 'number' ? index : null, error: t.notSaved(firstProblem(parsed.error)) }, 400)
  }
  const stored = JSON.stringify(parsed.data.blocks)
  if (stored.length > maxBlocksBytes) return json({ error: t.notSaved(t.pageTooLarge) }, 400)
  const current = await env.DB.prepare('SELECT blocks FROM pages WHERE site_id = ? AND slug = ?').bind(site.id, slug).first<{ blocks: string }>()
  if (!current && slug === 'home') {
    // The first section dropped on an empty site's home page creates that page.
    const settings = JSON.parse(site.settings) as Settings
    await rememberPage(env, site.id, slug)
    await env.DB.prepare('INSERT INTO pages (site_id, slug, title, description, published, blocks) VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT (site_id, slug) DO NOTHING')
      .bind(site.id, slug, settings.name, (settings.tagline || settings.name).slice(0, 300), stored).run()
    return json({ ok: true, created: true })
  }
  if (!current) return json({ error: 'not found' }, 404)
  if (current.blocks === stored) return json({ ok: true, unchanged: true })
  await rememberPage(env, site.id, slug)
  await env.DB.prepare("UPDATE pages SET blocks = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE site_id = ? AND slug = ?").bind(stored, site.id, slug).run()
  return json({ ok: true })
}

async function uploadImage(request: Request, env: Env, site: SiteRow) {
  const file = (await request.formData().catch((): null => null))?.get('file')
  if (!(file instanceof File) || !file.size) return json({ error: officeText(site).chooseImage }, 400)
  const stored = await saveImage(env, site.id, file)
  return stored.error ? json({ error: stored.error }, 400) : json({ url: stored.url })
}

/**
 * /editor/<page>, and POST to it to save; POST /editor/<page>/image to upload a photo.
 * GET /editor/<page>/media/<id> shows an uploaded photo, which visitors can't see before the first publish.
 */
export async function handleEditor(request: Request, env: Env, site: SiteRow, desk: Desk, slug: string | undefined, action: string | undefined, extra: string | undefined) {
  const page = slug && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? slug : null
  if (!page) return notFound()
  if (request.method === 'GET' && action === 'media' && /^\d{1,12}$/.test(extra ?? '')) {
    const image = await showImage(env, site.id, extra!)
    if (!image) return notFound()
    const headers = new Headers(image.headers)
    headers.set('Cache-Control', 'private, max-age=3600')
    headers.set('Referrer-Policy', 'no-referrer')
    return new Response(image.body, { headers })
  }
  if (extra) return notFound()
  if (request.method === 'GET' && !action) return editorPage(env, site, desk, page)
  if (request.method !== 'POST') return notFound()
  if (!action) return savePage(request, env, site, page)
  if (action === 'image') return uploadImage(request, env, site)
  return notFound()
}
