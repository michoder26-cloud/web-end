import { z } from 'zod'

import { cleanEditedBody, editCopy, isCopyPage, maxCopyBytes, renderCopy, withoutConsentBoxes } from './copying'

import { allows, catalog, firstProblem, writeItem } from './cms'
import type { Desk } from './cms'
import { releaseSummary } from './cms-platform'
import { escapeHtml, html, notFound, privateHeaders } from './http'
import { saveImage, showImage } from './items'
import { blockSchema, itemSchema, maxBlocksBytes, maxPagesPerSite, pageSlugSchema, settingsShape } from './mcp'
import { officeText } from './office-words'
import { rememberPage } from './page-history'
import { siteLook } from './render'
import { siteFontNames, siteStyles } from './theme'
import { publishVersion, unpublishedChanges } from './versions'
import { formatMoney } from './money'
import { orderStatuses, setOrderStatus } from './shop'
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
  const stored = JSON.parse(page.blocks) as Block[]
  if (isCopyPage(stored)) return copyEditor(site, desk, slug, page.title, stored[0])
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

// ---- Pages moved with their own look: the page itself, with words and photos changed in place ------------

const copyEditorHeaders = { ...editorHeaders, 'Content-Security-Policy': editorHeaders['Content-Security-Policy'].replace("font-src 'self'", "font-src 'self' https: data:") }

function copyEditor(site: SiteRow, desk: Desk, slug: string, title: string, block: Parameters<typeof renderCopy>[2]) {
  const t = officeText(site)
  const th = t.lang === 'th'
  const page = renderCopy(site, { description: '', slug, title }, block, '/')
  const data = JSON.stringify({ base: desk.base, lang: th ? 'th' : 'en', slug }).replace(/</g, '\\u003c')
  const canPublish = allows(desk, 'publish')
  const bar = `<div id="we-edit-bar" role="toolbar"><a href="${escapeHtml(desk.base)}/dashboard" target="_top">${th ? '← แดชบอร์ด' : '← Dashboard'}</a><span id="we-edit-status">${th ? 'คลิกเพื่อเลือก ลากเพื่อย้าย ดับเบิลคลิกเพื่อพิมพ์' : 'Click to select, drag to move, double-click to type'}</span><label id="we-edit-free-label"><input id="we-edit-free" type="checkbox">${th ? 'วางแทรกระหว่างส่วน' : 'Drop between parts'}</label><button id="we-edit-undo" type="button" disabled>${th ? 'เลิกทำ' : 'Undo'}</button><button id="we-edit-save" type="button" disabled>${th ? 'บันทึก' : 'Save'}</button>${canPublish ? `<button id="we-edit-publish" type="button">${th ? 'เผยแพร่' : 'Publish'}</button>` : ''}</div>`
  const tools = `${bar}<script id="copy-edit-data" type="application/json">${data}</script><link rel="stylesheet" href="/copy-editor.css"><script src="/copy-editor.js"></script>`
  return html(page.replace(/<\/body>\s*<\/html>\s*$/, `${tools}</body></html>`).replace('<head>', '<head><meta name="robots" content="noindex">'), 200, copyEditorHeaders)
}

const copyEditSchema = z.object({
  html: z.string().min(1).max(maxCopyBytes).optional(),
  texts: z.array(z.object({ from: z.string().min(1).max(4000), nth: z.number().int().min(0).max(100_000), to: z.string().max(4000) })).max(500).optional(),
  images: z.array(z.object({ from: z.string().min(1).max(2000), to: z.string().trim().max(1000).refine((value) => value.startsWith('https://') || /^\/media\/\d+$/.test(value)) })).max(100).optional(),
})

async function saveCopy(request: Request, env: Env, site: SiteRow, slug: string) {
  const t = officeText(site)
  const parsed = copyEditSchema.safeParse(await request.json().catch((): null => null))
  if (!parsed.success) return json({ error: t.notSaved(firstProblem(parsed.error)) }, 400)
  const current = await env.DB.prepare('SELECT blocks FROM pages WHERE site_id = ? AND slug = ?').bind(site.id, slug).first<{ blocks: string }>()
  const blocks = current ? (JSON.parse(current.blocks) as Block[]) : []
  if (!isCopyPage(blocks)) return json({ error: 'not found' }, 404)
  // The editor sends the whole page as the owner arranged it; it is cleaned again here, so nothing in it can run.
  const edited = parsed.data.html ? { block: { ...blocks[0], html: withoutConsentBoxes(await cleanEditedBody(parsed.data.html)) }, notFound: [] as string[] } : editCopy(blocks[0], parsed.data)
  if (parsed.data.html && !edited.block.html.trim()) return json({ error: t.notSaved('the page would be empty') }, 400)
  const stored = JSON.stringify([edited.block])
  if (stored.length > maxCopyBytes) return json({ error: t.notSaved(t.pageTooLarge) }, 400)
  await rememberPage(env, site.id, slug)
  await env.DB.prepare("UPDATE pages SET blocks = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE site_id = ? AND slug = ?").bind(stored, site.id, slug).run()
  return json({ ok: true, notFound: edited.notFound.length })
}

// ---- The side panel: pages, products, shop and payment, the site's look, and publishing -----------------

// Settings the editor's panel may change. Email, API and code settings stay in the dashboard.
const panelKeys = ['name', 'tagline', 'style', 'headingFont', 'bodyFont', 'accent', 'background', 'text', 'footerText', 'phone', 'email', 'address',
  'cart', 'accounts', 'currency', 'payCard', 'payTransfer', 'transferDetails', 'payPromptPay', 'promptPayId', 'promptPayName', 'payCod', 'shippingFee', 'freeShippingOver'] as const
const panelSettings = z.object(Object.fromEntries(panelKeys.map((key) => [key, settingsShape[key]])) as { [K in (typeof panelKeys)[number]]: (typeof settingsShape)[K] }).strict()

async function panelData(env: Env, site: SiteRow, desk: Desk) {
  const settings = JSON.parse(site.settings) as Settings
  const [{ results: items }, { results: pages }, waiting, summary] = await Promise.all([
    allows(desk, 'products')
      ? env.DB.prepare("SELECT id, title, price, compare_price AS comparePrice, category, stock, body, image_url AS imageUrl, image_alt AS imageAlt, published FROM items WHERE site_id = ? AND collection = 'products' ORDER BY sort, id LIMIT 200").bind(site.id).all()
      : Promise.resolve({ results: [] }),
    env.DB.prepare('SELECT slug, title, published, blocks FROM pages WHERE site_id = ? ORDER BY slug = \'home\' DESC, slug').bind(site.id).all<{ blocks: string; published: number; slug: string; title: string }>(),
    unpublishedChanges(env, site),
    allows(desk, 'publish') ? releaseSummary(env, site) : Promise.resolve(null),
  ])
  // What this site actually has, so the editor shows the tools for that and nothing else.
  const counts = await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM items WHERE site_id = ?1) AS items,
      (SELECT COUNT(*) FROM data_tables WHERE site_id = ?1) AS tables,
      (SELECT COUNT(*) FROM customers WHERE site_id = ?1) AS customers,
      (SELECT COUNT(*) FROM entries WHERE site_id = ?1) AS entries,
      (SELECT COUNT(*) FROM orders WHERE site_id = ?1) AS orders`).bind(site.id).first<{ customers: number; entries: number; items: number; orders: number; tables: number }>()
  // The latest orders, members and form messages, shown in the editor itself.
  const [{ results: orders }, { results: members }, { results: messages }] = await Promise.all([
    allows(desk, 'orders')
      ? env.DB.prepare('SELECT id, name, phone, address, note, payment, status, total, money_prefix, money_suffix, created_at FROM orders WHERE site_id = ? ORDER BY id DESC LIMIT 30').bind(site.id).all<{ address: string; created_at: string; id: number; money_prefix: string; money_suffix: string; name: string; note: string; payment: string; phone: string; status: string; total: number }>()
      : Promise.resolve({ results: [] as never[] }),
    allows(desk, 'customers') ? env.DB.prepare('SELECT name, email, created_at FROM customers WHERE site_id = ? ORDER BY id DESC LIMIT 30').bind(site.id).all<{ created_at: string; email: string; name: string }>() : Promise.resolve({ results: [] as never[] }),
    allows(desk, 'messages') ? env.DB.prepare('SELECT form, page, data, status, created_at FROM entries WHERE site_id = ? ORDER BY id DESC LIMIT 30').bind(site.id).all<{ created_at: string; data: string; form: string; page: string; status: string }>() : Promise.resolve({ results: [] as never[] }),
  ])
  const used = new Set(pages.flatMap((page) => { try { return (JSON.parse(page.blocks) as Block[]).map((block) => block.type) } catch { return [] } }))
  const content = pages.filter((page) => page.blocks !== '[]').length
  return {
    owner: !desk.staff,
    canProducts: allows(desk, 'products'),
    canPublish: allows(desk, 'publish'),
    settings: desk.staff ? {} : Object.fromEntries(panelKeys.map((key) => [key, settings[key] ?? null])),
    fonts: siteFontNames,
    styles: siteStyles,
    items,
    pages: pages.map((page) => ({ slug: page.slug, title: page.title, published: Boolean(page.published) })),
    has: {
      empty: content === 0 && !counts?.items && !counts?.tables,
      shop: Boolean(settings.cart || counts?.items || used.has('collection')),
      members: Boolean(settings.accounts || counts?.customers || used.has('record')),
      forms: Boolean(used.has('form') || counts?.entries),
      data: Boolean(counts?.tables || used.has('table') || used.has('records') || used.has('record-form')),
      orders: counts?.orders ?? 0,
      customers: counts?.customers ?? 0,
      entries: counts?.entries ?? 0,
      tables: counts?.tables ?? 0,
    },
    orders: orders.map((order) => ({ id: order.id, name: order.name, phone: order.phone, address: order.address, note: order.note, payment: order.payment, status: order.status, total: formatMoney(order.total, order.money_prefix, order.money_suffix), at: order.created_at })),
    orderStatuses,
    members: members.map((member) => ({ name: member.name, email: member.email, at: member.created_at })),
    messages: messages.map((entry) => {
      let fields: Record<string, unknown> = {}
      try { fields = JSON.parse(entry.data) } catch { /* shown empty */ }
      return { form: entry.form, page: entry.page, status: entry.status, at: entry.created_at, fields: Object.entries(fields).slice(0, 8).map(([key, value]) => [key, String(value ?? '').slice(0, 300)]) }
    }),
    // Card payments need the owner's Stripe account connected to the site.
    cardReady: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
    // null: never published, so everything waits. Otherwise the pages and settings that differ from the live site.
    waiting: waiting ? waiting.pages.length + (waiting.settings ? 1 : 0) : null,
    problems: summary?.problems ?? [],
  }
}

async function saveSettings(request: Request, env: Env, site: SiteRow, desk: Desk) {
  if (desk.staff) return json({ error: 'Only the owner can change these settings.' }, 403)
  const body = (await request.json().catch((): null => null)) as Record<string, unknown> | null
  // Empty boxes come as null: they remove the setting, so they are not checked like values.
  const given = Object.fromEntries(Object.entries(body ?? {}).filter(([, value]) => value !== null && value !== ''))
  const cleared = Object.keys(body ?? {}).filter((key) => (body![key] === null || body![key] === '') && key !== 'name' && (panelKeys as readonly string[]).includes(key))
  const parsed = panelSettings.safeParse(given)
  if (!parsed.success) return json({ error: firstProblem(parsed.error), field: parsed.error.issues[0]?.path[0] ?? null }, 400)
  const current = JSON.parse(site.settings) as Settings
  const next: Settings = { ...current }
  // An emptied box or a font set back to the style's own removes the setting.
  for (const key of cleared) delete (next as Record<string, unknown>)[key]
  Object.assign(next, parsed.data)
  await env.DB.prepare("UPDATE sites SET settings = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(JSON.stringify(next), site.id).run()
  return json({ ok: true })
}

async function saveProduct(request: Request, env: Env, site: SiteRow, desk: Desk) {
  if (!allows(desk, 'products')) return json({ error: 'You may not change products.' }, 403)
  const body = (await request.json().catch((): null => null)) as Record<string, unknown> | null
  const id = typeof body?.id === 'number' && Number.isInteger(body.id) && body.id > 0 ? body.id : undefined
  if (body?.delete === true && id) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM item_variants WHERE item_id = ? AND item_id IN (SELECT id FROM items WHERE site_id = ?)').bind(id, site.id),
      env.DB.prepare('DELETE FROM items WHERE id = ? AND site_id = ?').bind(id, site.id),
    ])
    return json({ ok: true })
  }
  const { id: _, delete: __, ...fields } = body ?? {}
  const parsed = itemSchema.safeParse({ collection: 'products', ...fields })
  if (!parsed.success) return json({ error: firstProblem(parsed.error), field: parsed.error.issues[0]?.path[0] ?? null }, 400)
  if (!id) {
    const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM items WHERE site_id = ?').bind(site.id).first<{ total: number }>()
    if ((count?.total ?? 0) >= 500) return json({ error: 'A site can have up to 500 items.' }, 400)
  }
  const saved = await writeItem(env, site.id, parsed.data, id)
  return saved ? json({ ok: true, id: saved }) : json({ error: 'not found' }, 404)
}

/** A new page from a title: its address comes from the title, or page-2, page-3 … for titles in other scripts. */
async function newPage(request: Request, env: Env, site: SiteRow, desk: Desk) {
  const body = (await request.json().catch((): null => null)) as { title?: unknown } | null
  const title = String(body?.title ?? '').trim().slice(0, 120)
  if (!title) return json({ error: 'Give the page a name.' }, 400)
  const { results } = await env.DB.prepare('SELECT slug FROM pages WHERE site_id = ?').bind(site.id).all<{ slug: string }>()
  if (results.length >= maxPagesPerSite) return json({ error: `A site can have up to ${maxPagesPerSite} pages.` }, 400)
  const taken = new Set(results.map((row) => row.slug))
  const base = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '') || 'page'
  let slug = pageSlugSchema.safeParse(base).success && !taken.has(base) ? base : ''
  for (let n = 2; !slug; n++) if (!taken.has(`${base}-${n}`) && pageSlugSchema.safeParse(`${base}-${n}`).success) slug = `${base}-${n}`
  await rememberPage(env, site.id, slug)
  await env.DB.prepare('INSERT INTO pages (site_id, slug, title, description, published, blocks) VALUES (?, ?, ?, ?, 1, ?)')
    .bind(site.id, slug, title, title, JSON.stringify([{ type: 'hero', heading: title }])).run()
  return json({ ok: true, slug, url: `${desk.base}/editor/${slug}` })
}

async function changeOrder(request: Request, env: Env, site: SiteRow, desk: Desk) {
  if (!allows(desk, 'orders')) return json({ error: 'You may not change orders.' }, 403)
  const body = (await request.json().catch((): null => null)) as { id?: unknown; status?: unknown } | null
  const id = typeof body?.id === 'number' && Number.isInteger(body.id) ? body.id : 0
  const status = typeof body?.status === 'string' && orderStatuses.includes(body.status) ? body.status : ''
  if (!id || !status) return json({ error: 'not found' }, 400)
  const result = await setOrderStatus(env, site.id, id, status, { actor: desk.staff ? 'staff' : 'owner', origin: new URL(request.url).origin, staff: desk.staff })
  if (result === 'missing') return json({ error: 'not found' }, 404)
  if (result === 'no-stock') return json({ error: officeText(site).noStock }, 409)
  return json({ ok: true })
}

async function publishNow(env: Env, site: SiteRow, desk: Desk) {
  if (!allows(desk, 'publish')) return json({ error: 'You may not publish.' }, 403)
  const published = await publishVersion(env, site, officeText(site).lang === 'th' ? 'เผยแพร่จากตัวแก้เว็บ' : 'Published from the editor')
  return published.error ? json({ error: published.error }, 409) : json({ ok: true, version: published.id })
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
  if (action === 'copy') return saveCopy(request, env, site, page)
  if (action === 'panel') return json(await panelData(env, site, desk))
  if (action === 'settings') return saveSettings(request, env, site, desk)
  if (action === 'product') return saveProduct(request, env, site, desk)
  if (action === 'new-page') return newPage(request, env, site, desk)
  if (action === 'publish') return publishNow(env, site, desk)
  if (action === 'order') return changeOrder(request, env, site, desk)
  return notFound()
}
