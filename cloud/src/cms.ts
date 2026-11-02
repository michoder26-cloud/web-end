import { z } from 'zod'

import { newToken, sha256 } from './auth'
import { escapeHtml, html, notFound, privateHeaders, see } from './http'
import { saveImage } from './items'
import { blockSchema, itemSchema, maxBlocksBytes, maxPagesPerSite, pageSlugSchema, settingsShape } from './mcp'
import { entryFields, shell } from './owner'
import { orderDetails, orderLines, orderNumber, orderStatuses, paymentName, setOrderStatus } from './shop'
import { words } from './text'
import { isNewer, latestRelease, repoPattern, updatesBody } from './updates'
import { version } from './version'
import { siteStyles } from './theme'
import type { Block, Env, FormField, Item, Order, Settings, SiteRow, Variant } from './types'

const maxOfficeBytes = 3_000_000
const statuses = ['new', 'confirmed', 'done']

type Kind = 'bool' | 'image' | 'lines' | 'list' | 'long' | 'number' | 'select' | 'text'
type Spec = { fields?: Spec[]; key: string; kind: Kind; label: string; options?: string[] }

const spec = (key: string, label: string, kind: Kind = 'text', extra: Partial<Spec> = {}): Spec => ({ key, kind, label, ...extra })
const tone = spec('tone', 'Background', 'select', { options: ['', 'plain', 'tint', 'dark'] })
const heading = spec('heading', 'Heading')
const intro = spec('intro', 'Intro', 'long')
const buttons = [spec('buttonLabel', 'Button text'), spec('buttonHref', 'Button link')]
const list = (key: string, label: string, fields: Spec[]) => spec(key, label, 'list', { fields })
const titled = list('items', 'Items', [spec('title', 'Title'), spec('text', 'Text', 'long')])

const catalog: Record<string, { label: string; fields: Spec[]; start: Block }> = {
  hero: { label: 'Top banner', start: { heading: 'New heading', type: 'hero' }, fields: [spec('eyebrow', 'Small line above'), spec('heading', 'Heading'), spec('text', 'Text', 'long'), ...buttons, spec('imageUrl', 'Photo', 'image'), spec('imageAlt', 'Photo description'), spec('layout', 'Layout', 'select', { options: ['', 'split', 'centered', 'cover'] }), tone] },
  text: { label: 'Text', start: { body: 'New text', type: 'text' }, fields: [heading, spec('body', 'Text', 'long'), tone] },
  split: { label: 'Text beside photo', start: { body: 'New text', imageAlt: 'Photo', imageUrl: 'https://', type: 'split' }, fields: [heading, spec('body', 'Text', 'long'), spec('imageUrl', 'Photo', 'image'), spec('imageAlt', 'Photo description'), spec('imageSide', 'Photo side', 'select', { options: ['', 'left', 'right'] }), ...buttons, tone] },
  features: { label: 'Features', start: { items: [{ title: 'New item' }], type: 'features' }, fields: [heading, intro, titled, tone] },
  steps: { label: 'Steps', start: { items: [{ title: 'New step' }], type: 'steps' }, fields: [heading, intro, titled, tone] },
  stats: { label: 'Numbers', start: { items: [{ label: 'Label', value: '1' }], type: 'stats' }, fields: [heading, list('items', 'Numbers', [spec('value', 'Number'), spec('label', 'Label')]), tone] },
  pricing: { label: 'Prices', start: { plans: [{ name: 'New plan', price: '0' }], type: 'pricing' }, fields: [heading, intro, list('plans', 'Plans', [spec('name', 'Name'), spec('price', 'Price'), spec('note', 'Note'), spec('features', 'Features, one per line', 'long'), ...buttons, spec('highlighted', 'Highlight', 'bool')]), tone] },
  testimonials: { label: 'Customer quotes', start: { items: [{ name: 'Name', quote: 'Real quote' }], type: 'testimonials' }, fields: [heading, list('items', 'Quotes', [spec('quote', 'Quote', 'long'), spec('name', 'Name'), spec('role', 'Role')]), tone] },
  team: { label: 'Team', start: { members: [{ name: 'Name' }], type: 'team' }, fields: [heading, intro, list('members', 'People', [spec('name', 'Name'), spec('role', 'Role'), spec('text', 'Text', 'long'), spec('imageUrl', 'Photo', 'image')]), tone] },
  gallery: { label: 'Photo gallery', start: { images: [{ imageAlt: 'Photo', imageUrl: 'https://' }], type: 'gallery' }, fields: [heading, list('images', 'Photos', [spec('imageUrl', 'Photo', 'image'), spec('imageAlt', 'Description'), spec('caption', 'Caption')]), tone] },
  info: { label: 'Information rows', start: { items: [{ label: 'Label', value: 'Value' }], type: 'info' }, fields: [spec('id', 'Link name, such as hours'), heading, list('items', 'Rows', [spec('label', 'Label'), spec('value', 'Value', 'long')]), ...buttons, tone] },
  faq: { label: 'Questions', start: { items: [{ answer: 'Answer', question: 'Question' }], type: 'faq' }, fields: [heading, list('items', 'Questions', [spec('question', 'Question'), spec('answer', 'Answer', 'long')]), tone] },
  cta: { label: 'Call to action', start: { heading: 'New heading', type: 'cta' }, fields: [heading, spec('text', 'Text', 'long'), ...buttons, tone] },
  form: { label: 'Form', start: { fields: [{ label: 'Name', name: 'name', type: 'text' }, { label: 'Email', name: 'email', type: 'email' }], name: 'contact', type: 'form' }, fields: [spec('name', 'Form name, English letters'), heading, spec('intro', 'Intro', 'long'), spec('buttonLabel', 'Button text'), spec('sentMessage', 'Message after sending'), spec('errorMessage', 'Message on error'), spec('membersOnly', 'Members only', 'bool'), list('fields', 'Fields', [spec('name', 'Field name, English letters'), spec('label', 'Label'), spec('type', 'Type', 'select', { options: ['text', 'textarea', 'email', 'phone', 'number', 'date', 'time', 'select', 'checkbox'] }), spec('required', 'Required', 'bool'), spec('options', 'Choices, one per line', 'lines'), spec('optionsFrom', 'Choices from collection')]), tone] },
  collection: { label: 'Products or list', start: { collection: 'products', type: 'collection' }, fields: [spec('id', 'Link name, such as products'), spec('collection', 'Collection name'), heading, intro, ...buttons, spec('orderField', 'Form field to fill in'), spec('limit', 'How many to show', 'number'), spec('filters', 'Show category filters', 'bool'), tone] },
  html: { label: 'Custom code', start: { code: '<p>New section</p>', type: 'html' }, fields: [spec('code', 'HTML, CSS and JavaScript', 'long'), spec('height', 'Height in pixels', 'number'), spec('title', 'Title'), tone] },
}

const office = (site: SiteRow, code: string, title: string, body: string, notice?: { error?: string; saved?: string }) => {
  const settings = JSON.parse(site.settings) as Settings
  const base = `/owner/${escapeHtml(code)}`
  const links: [string, string][] = [['', 'Overview'], ['/orders', 'Orders'], ['/pages', 'Pages'], ['/items', 'Products'], ['/media', 'Images'], ['/customers', 'Customers'], ['/settings', 'Settings'], ['/updates', 'Updates']]
  return html(
    shell(
      `${settings.name}: ${title}`,
      `<nav aria-label="Back office" class="cms-nav">${links.map(([path, label]) => `<a href="${base}${path}">${label}</a>`).join('')}<a href="/" target="_blank" rel="noopener">Open website</a></nav>
<h1>${escapeHtml(title)}</h1>
${notice?.error ? `<p role="alert">${escapeHtml(notice.error)}</p>` : ''}${notice?.saved ? `<p role="status">${escapeHtml(notice.saved)}</p>` : ''}${body}`,
      true,
    ),
    200,
    privateHeaders,
  )
}

const input = (name: string, field: Spec, value: unknown): string => {
  const label = escapeHtml(field.label)
  const key = escapeHtml(name)
  if (field.kind === 'bool') return `<label class="check"><input name="${key}" type="checkbox"${value ? ' checked' : ''}> ${label}</label>`
  if (field.kind === 'long') return `<label>${label}<textarea name="${key}" rows="4">${escapeHtml(value)}</textarea></label>`
  if (field.kind === 'lines') return `<label>${label}<textarea name="${key}" rows="3">${escapeHtml(Array.isArray(value) ? value.join('\n') : '')}</textarea></label>`
  if (field.kind === 'number') return `<label>${label}<input name="${key}" type="number" value="${escapeHtml(value)}"></label>`
  if (field.kind === 'image') return `<label>${label}<input list="media-list" name="${key}" placeholder="https:// or /media/1" value="${escapeHtml(value)}"></label>`
  if (field.kind === 'select') return `<label>${label}<select name="${key}">${(field.options ?? []).map((option) => `<option value="${escapeHtml(option)}"${option === (value ?? '') ? ' selected' : ''}>${escapeHtml(option || 'Default')}</option>`).join('')}</select></label>`
  if (field.kind === 'list') {
    const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : []
    // One empty row at the end adds an item. Clearing a row removes it.
    const shown = [...rows, {}]
    return `<fieldset class="cms-list"><legend>${label}</legend><input name="${key}.count" type="hidden" value="${shown.length}">${shown
      .map((row, index) => `<div class="cms-row">${(field.fields ?? []).map((sub) => input(`${name}.${index}.${sub.key}`, sub, row[sub.key])).join('')}</div>`)
      .join('')}</fieldset>`
  }
  return `<label>${label}<input name="${key}" value="${escapeHtml(value)}"></label>`
}

const readField = (form: FormData, name: string, field: Spec): unknown => {
  const raw = form.get(name)
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (field.kind === 'bool') return raw === 'on' ? true : undefined
  if (field.kind === 'number') return value ? Number(value) : undefined
  if (field.kind === 'lines') {
    const lines = value.split('\n').map((line) => line.trim()).filter(Boolean)
    return lines.length ? lines : undefined
  }
  if (field.kind === 'list') {
    const rows: Record<string, unknown>[] = []
    for (let index = 0; index < Math.min(Number(form.get(`${name}.count`)) || 0, 60); index++) {
      const row: Record<string, unknown> = {}
      for (const sub of field.fields ?? []) {
        const read = readField(form, `${name}.${index}.${sub.key}`, sub)
        if (read !== undefined) row[sub.key] = read
      }
      // A select always sends a value, so it alone doesn't make a row count.
      if (Object.keys(row).some((key) => field.fields?.find((sub) => sub.key === key)?.kind !== 'select')) rows.push(row)
    }
    return rows
  }
  return value || undefined
}

const firstProblem = (error: z.ZodError) => {
  const issue = error.issues[0]
  return `${issue.path.join(' › ')}: ${issue.message}`
}

const readBlocks = (form: FormData) => {
  const blocks: Block[] = []
  for (let index = 0; index < Math.min(Number(form.get('count')) || 0, 40); index++) {
    const type = String(form.get(`b${index}.type`) ?? '')
    const entry = catalog[type]
    if (!entry) continue
    const block: Block = { type }
    for (const field of entry.fields) {
      const read = readField(form, `b${index}.${field.key}`, field)
      if (read !== undefined) block[field.key] = read
    }
    blocks.push(block)
  }
  return blocks
}

const mediaList = async (env: Env, site: SiteRow) => {
  const { results } = await env.DB.prepare('SELECT id, name FROM media WHERE site_id = ? ORDER BY id DESC LIMIT 200').bind(site.id).all<{ id: number; name: string }>()
  return `<datalist id="media-list">${results.map((image) => `<option value="/media/${image.id}">${escapeHtml(image.name)}</option>`).join('')}</datalist>`
}

async function pageEditor(env: Env, site: SiteRow, code: string, slug: string, page: { blocks: Block[]; description: string; published: boolean; title: string }, notice?: { error?: string; saved?: string }) {
  const blocks = page.blocks
    .map((block, index) => {
      const entry = catalog[block.type]
      if (!entry) return ''
      return `<fieldset class="cms-block"><legend>${escapeHtml(entry.label)}</legend><input name="b${index}.type" type="hidden" value="${escapeHtml(block.type)}">
${entry.fields.map((field) => input(`b${index}.${field.key}`, field, block[field.key])).join('')}
<div class="cms-actions"><button class="button button--small" name="op" type="submit" value="up:${index}">Move up</button><button class="button button--small" name="op" type="submit" value="down:${index}">Move down</button><button class="button button--small" name="op" type="submit" value="delete:${index}">Delete section</button></div></fieldset>`
    })
    .join('')
  const adders = Object.entries(catalog).map(([type, entry]) => `<button class="button button--small" name="op" type="submit" value="add:${type}">${escapeHtml(entry.label)}</button>`).join('')
  return office(
    site,
    code,
    `Edit page: ${page.title}`,
    `${await mediaList(env, site)}<form action="/owner/${escapeHtml(code)}/page/${escapeHtml(slug)}" class="contact-form cms-form" method="post"><input name="count" type="hidden" value="${page.blocks.length}">
<label>Page title<input maxlength="120" name="title" required value="${escapeHtml(page.title)}"></label>
<label>Description for search results<textarea maxlength="300" name="description" required rows="2">${escapeHtml(page.description)}</textarea></label>
<label class="check"><input name="published" type="checkbox"${page.published ? ' checked' : ''}> Show this page to visitors</label>
${blocks}
<fieldset class="cms-block"><legend>Add a section</legend><div class="cms-actions">${adders}</div></fieldset>
<button class="button cms-save" name="op" type="submit" value="save">Save page</button></form>
${slug === 'home' ? '' : `<form action="/owner/${escapeHtml(code)}/page/${escapeHtml(slug)}/delete" class="cms-danger contact-form" method="post"><label class="check"><input name="confirm" required type="checkbox"> Yes, delete this page</label><button class="button button--small" type="submit">Delete page</button></form>`}`,
    notice,
  )
}

async function savePageFromForm(request: Request, env: Env, url: URL, site: SiteRow, code: string, slug: string) {
  const form = await request.formData()
  const blocks = readBlocks(form)
  const op = String(form.get('op') ?? 'save')
  const [action, target] = op.split(':')
  const index = Number(target)
  if (action === 'up' && index > 0) blocks.splice(index - 1, 0, ...blocks.splice(index, 1))
  if (action === 'down' && index < blocks.length - 1) blocks.splice(index + 1, 0, ...blocks.splice(index, 1))
  if (action === 'delete') blocks.splice(index, 1)
  if (action === 'add' && catalog[target]) blocks.push(structuredClone(catalog[target].start))

  const page = { blocks, description: String(form.get('description') ?? '').trim(), published: form.get('published') === 'on', title: String(form.get('title') ?? '').trim() }
  const invalid = z.object({ blocks: z.array(blockSchema).min(1).max(40), description: z.string().min(1).max(300), title: z.string().min(1).max(120) }).safeParse(page)
  if (!invalid.success) return pageEditor(env, site, code, slug, page, { error: `Not saved. ${firstProblem(invalid.error)}` })
  const stored = JSON.stringify(invalid.data.blocks)
  if (stored.length > maxBlocksBytes) return pageEditor(env, site, code, slug, page, { error: 'Not saved. This page is too large. Split it into smaller pages.' })
  await env.DB.prepare(`INSERT INTO pages (site_id, slug, title, description, published, blocks) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (site_id, slug) DO UPDATE SET title = excluded.title, description = excluded.description, published = excluded.published, blocks = excluded.blocks, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`)
    .bind(site.id, slug, page.title, page.description, page.published ? 1 : 0, stored)
    .run()
  return see(url, `/owner/${code}/page/${slug}?saved=1`)
}

async function overview(env: Env, url: URL, site: SiteRow, code: string) {
  const [{ results: pages }, { results: entries }] = await Promise.all([
    env.DB.prepare('SELECT slug, blocks FROM pages WHERE site_id = ?').bind(site.id).all<{ blocks: string; slug: string }>(),
    env.DB.prepare('SELECT entries.id, form, page, data, status, entries.created_at, customers.email AS customer FROM entries LEFT JOIN customers ON customers.id = entries.customer_id WHERE entries.site_id = ? ORDER BY entries.id DESC LIMIT 200').bind(site.id).all<{ created_at: string; customer: null | string; data: string; form: string; id: number; page: string; status: string }>(),
  ])
  const latest = await latestRelease()
  const newer = latest && isNewer(latest.version, version) ? `<p role="status">Version ${escapeHtml(latest.version)} is available. <a href="/owner/${escapeHtml(code)}/updates">See how to update</a>.</p>` : ''
  const labels = entryFields(pages)
  const rows = entries.length
    ? entries
        .map((entry) => {
          const data = JSON.parse(entry.data) as Record<string, unknown>
          const fields = labels.get(`${entry.page}/${entry.form}`) ?? Object.keys(data).map((name) => ({ label: name, name }) as FormField)
          const list = fields
            .filter((field) => data[field.name] !== undefined)
            .map((field) => `<div><dt>${escapeHtml(field.label)}</dt><dd class="pre-line">${escapeHtml(data[field.name] === true ? 'Yes' : data[field.name] === false ? 'No' : data[field.name])}</dd></div>`)
            .join('')
          const buttons = [...statuses.filter((status) => status !== entry.status), 'delete']
            .map((status) => `<button class="button button--small" name="status" type="submit" value="${status}">${status}</button> `)
            .join('')
          return `<article class="card account__record"><h3>${escapeHtml(entry.form)} · ${escapeHtml(entry.status)}</h3><p class="post-date">${escapeHtml(entry.created_at.slice(0, 16).replace('T', ' '))} UTC${entry.customer ? ` · ${escapeHtml(entry.customer)}` : ''}</p><dl>${list}</dl><form action="/owner/${escapeHtml(code)}/entry/${entry.id}" method="post">${buttons}</form></article>`
        })
        .join('')
    : '<p>Nothing yet. Orders, messages and bookings from your forms will appear here.</p>'
  return office(
    site,
    code,
    'Overview',
    `${newer}<h2>Messages and bookings</h2>${rows}
<h2>Change your site with Claude</h2>
<p>Add this link as a custom connector in Claude, with no sign-in. Keep it private.</p>
<p><code style="overflow-wrap:anywhere">${escapeHtml(`${url.origin}/mcp/${code}`)}</code></p>`,
  )
}

async function ordersPage(env: Env, site: SiteRow, code: string, error?: string) {
  const settings = JSON.parse(site.settings) as Settings
  const t = words(settings.language)
  const { results: orders } = await env.DB.prepare('SELECT * FROM orders WHERE site_id = ? ORDER BY id DESC LIMIT 200').bind(site.id).all<Order>()
  const lines = await orderLines(env, orders.map((order) => order.id))
  const rows = orders
    .map((order) => {
      const buttons = orderStatuses
        .filter((status) => status !== order.status)
        .map((status) => `<button class="button button--small" name="status" type="submit" value="${status}">${escapeHtml(status)}</button> `)
        .join('')
      return `<article class="card account__record"><h3>${orderNumber(order.id)} · ${escapeHtml(order.status)}</h3><p class="post-date">${escapeHtml(order.created_at.slice(0, 16).replace('T', ' '))} UTC · ${paymentName(words('en'), order.payment)}</p>${orderDetails(order, lines.get(order.id) ?? [], t)}<p class="pre-line"><strong>${escapeHtml(order.name)}</strong>
${escapeHtml(order.phone)}
${escapeHtml(order.address)}${order.note ? `\n\nNote: ${escapeHtml(order.note)}` : ''}</p><form action="/owner/${escapeHtml(code)}/orders/${order.id}" method="post">${buttons}</form></article>`
    })
    .join('')
  return office(site, code, 'Orders', `${settings.cart ? '' : '<p role="alert">The cart is off. Turn it on in Settings.</p>'}<p>Check each bank transfer yourself before confirming it. Card payments confirm themselves. Cancelling an order puts its items back in stock.</p>${rows || '<p>No orders yet.</p>'}`, error ? { error } : undefined)
}

async function pagesList(env: Env, site: SiteRow, code: string, notice?: { error?: string }) {
  const { results } = await env.DB.prepare('SELECT slug, title, published FROM pages WHERE site_id = ? ORDER BY slug').bind(site.id).all<{ published: number; slug: string; title: string }>()
  const rows = results.map((page) => `<li><a href="/owner/${escapeHtml(code)}/page/${escapeHtml(page.slug)}">${escapeHtml(page.title)}</a> ${page.published ? '' : '(hidden)'} <small>/${page.slug === 'home' ? '' : escapeHtml(page.slug)}</small></li>`).join('')
  return office(
    site,
    code,
    'Pages',
    `<ul>${rows || '<li>No pages yet.</li>'}</ul><h2>Add a page</h2><form action="/owner/${escapeHtml(code)}/pages" class="contact-form" method="post"><label>Page title<input maxlength="120" name="title" required></label><label>Page address, English letters, such as about<input maxlength="60" name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" required></label><button class="button" type="submit">Create page</button></form>`,
    notice,
  )
}

async function addPage(request: Request, env: Env, url: URL, site: SiteRow, code: string) {
  const form = await request.formData()
  const title = String(form.get('title') ?? '').trim().slice(0, 120)
  const slug = pageSlugSchema.safeParse(String(form.get('slug') ?? '').trim())
  if (!title || !slug.success) return pagesList(env, site, code, { error: 'Use a title, and an address with only small English letters, numbers and dashes.' })
  const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM pages WHERE site_id = ?').bind(site.id).first<{ total: number }>()
  if ((count?.total ?? 0) >= maxPagesPerSite) return pagesList(env, site, code, { error: `A site can have up to ${maxPagesPerSite} pages.` })
  await env.DB.prepare('INSERT INTO pages (site_id, slug, title, description, published, blocks) VALUES (?, ?, ?, ?, 0, ?) ON CONFLICT (site_id, slug) DO NOTHING')
    .bind(site.id, slug.data, title, title, JSON.stringify([{ heading: title, type: 'hero' }]))
    .run()
  return see(url, `/owner/${code}/page/${slug.data}`)
}

const variantLines = (variants: Variant[] = []) => variants.map((variant) => [variant.name, variant.price, variant.compare_price, variant.stock ?? ''].join(' | ')).join('\n')

const readVariants = (text: string) =>
  text
    .split('\n')
    .map((line) => line.split('|').map((part) => part.trim()))
    .filter(([name]) => name)
    .map(([name, price, comparePrice, stock]) => ({ comparePrice: comparePrice || undefined, name, price: price || undefined, stock: stock ? Number(stock) : null }))

const itemForm = (code: string, item: Partial<Item>, collections: string[]) => `<form action="/owner/${escapeHtml(code)}/items${item.id ? `/${item.id}` : ''}" class="contact-form cms-form" enctype="multipart/form-data" method="post">
<label>Name<input maxlength="160" name="title" required value="${escapeHtml(item.title)}"></label>
<label>Collection<input list="collections" maxlength="40" name="collection" pattern="[a-z0-9-]+" required value="${escapeHtml(item.collection ?? 'products')}"></label>
<datalist id="collections">${collections.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
<label>Category, optional<input maxlength="60" name="category" value="${escapeHtml(item.category)}"></label>
<label>Price<input maxlength="40" name="price" value="${escapeHtml(item.price)}"></label>
<label>Original price, shown crossed out for a sale<input maxlength="40" name="comparePrice" value="${escapeHtml(item.compare_price)}"></label>
<label>Stock, leave empty for unlimited<input min="0" name="stock" type="number" value="${escapeHtml(item.stock)}"></label>
<label>Options such as size or colour, one per line: Name | price | original price | stock<textarea name="variants" rows="3">${escapeHtml(variantLines(item.variants))}</textarea></label>
<label>Description<textarea maxlength="4000" name="body" rows="3">${escapeHtml(item.body)}</textarea></label>
<label>Upload a photo, up to 1 MB<input accept="image/png,image/jpeg,image/webp,image/gif" name="file" type="file"></label>
<label>Or photo link<input list="media-list" maxlength="1000" name="imageUrl" value="${escapeHtml(item.image_url)}"></label>
<label>Photo description<input maxlength="200" name="imageAlt" value="${escapeHtml(item.image_alt)}"></label>
<label>Button text, optional<input maxlength="60" name="linkLabel" value="${escapeHtml(item.link_label)}"></label>
<label>Button link, optional<input maxlength="500" name="linkHref" value="${escapeHtml(item.link_href)}"></label>
<label>Order, smaller shows first<input name="sort" type="number" value="${escapeHtml(item.sort ?? 0)}"></label>
<label class="check"><input name="published" type="checkbox"${item.published === 0 ? '' : ' checked'}> Show to visitors</label>
<button class="button" type="submit">Save</button></form>`

async function itemsPage(env: Env, site: SiteRow, code: string, notice?: { error?: string; saved?: string }) {
  const { results } = await env.DB.prepare('SELECT * FROM items WHERE site_id = ? ORDER BY collection, sort, id LIMIT 500').bind(site.id).all<Item>()
  const { results: variants } = await env.DB.prepare('SELECT item_variants.* FROM item_variants JOIN items ON items.id = item_variants.item_id WHERE items.site_id = ? ORDER BY item_variants.sort, item_variants.id').bind(site.id).all<Variant>()
  for (const item of results) item.variants = variants.filter((variant) => variant.item_id === item.id)
  const collections = [...new Set(results.map((item) => item.collection))]
  const rows = results
    .map(
      (item) => `<details class="cms-item"><summary>${escapeHtml(item.title)}${item.price ? ` · ${escapeHtml(item.price)}` : ''} <small>${escapeHtml(item.collection)}${item.published ? '' : ', hidden'}</small></summary>${itemForm(code, item, collections)}<form action="/owner/${escapeHtml(code)}/items/${item.id}/delete" class="cms-danger contact-form" method="post"><label class="check"><input name="confirm" required type="checkbox"> Yes, delete this</label><button class="button button--small" type="submit">Delete</button></form></details>`,
    )
    .join('')
  return office(site, code, 'Products', `${await mediaList(env, site)}${rows || '<p>Nothing yet.</p>'}<h2>Add new</h2>${itemForm(code, {}, collections)}`, notice)
}

async function saveItemFromForm(request: Request, env: Env, url: URL, site: SiteRow, code: string, id?: number) {
  const form = await request.formData()
  const file = form.get('file')
  let imageUrl = String(form.get('imageUrl') ?? '').trim()
  if (file instanceof File && file.size) {
    const saved = await saveImage(env, site.id, file)
    if (saved.error) return itemsPage(env, site, code, { error: saved.error })
    imageUrl = saved.url!
  }
  const stock = String(form.get('stock') ?? '').trim()
  const item = itemSchema.safeParse({
    body: String(form.get('body') ?? ''),
    category: String(form.get('category') ?? '').trim(),
    collection: String(form.get('collection') ?? '').trim(),
    comparePrice: String(form.get('comparePrice') ?? '').trim(),
    stock: stock ? Number(stock) : null,
    variants: readVariants(String(form.get('variants') ?? '')),
    imageAlt: String(form.get('imageAlt') ?? '').trim(),
    imageUrl,
    linkHref: String(form.get('linkHref') ?? '').trim(),
    linkLabel: String(form.get('linkLabel') ?? '').trim(),
    price: String(form.get('price') ?? '').trim(),
    published: form.get('published') === 'on',
    sort: Number(form.get('sort')) || 0,
    title: String(form.get('title') ?? '').trim(),
  })
  if (!item.success) return itemsPage(env, site, code, { error: `Not saved. ${firstProblem(item.error)}` })
  await writeItem(env, site.id, item.data, id)
  return see(url, `/owner/${code}/items?saved=1`)
}

export async function writeItem(env: Env, siteId: number, item: z.infer<typeof itemSchema>, id?: number) {
  const values = [item.collection, item.title, item.price ?? '', item.comparePrice ?? '', item.category ?? '', item.stock ?? null, item.body ?? '', item.imageUrl ?? '', item.imageAlt ?? '', item.linkLabel ?? '', item.linkHref ?? '', item.sort ?? 0, item.published === false ? 0 : 1]
  let saved: null | number = null
  if (id) {
    const result = await env.DB.prepare("UPDATE items SET collection = ?, title = ?, price = ?, compare_price = ?, category = ?, stock = ?, body = ?, image_url = ?, image_alt = ?, link_label = ?, link_href = ?, sort = ?, published = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND site_id = ?")
      .bind(...values, id, siteId)
      .run()
    saved = result.meta.changes ? id : null
  } else {
    const row = await env.DB.prepare('INSERT INTO items (collection, title, price, compare_price, category, stock, body, image_url, image_alt, link_label, link_href, sort, published, site_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id')
      .bind(...values, siteId)
      .first<{ id: number }>()
    saved = row?.id ?? null
  }
  // Options keep their ids when only their details change, so carts and old orders still match.
  if (saved && item.variants) {
    const names = item.variants.map((variant) => variant.name)
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM item_variants WHERE item_id = ?${names.length ? ` AND name NOT IN (${names.map(() => '?').join(',')})` : ''}`).bind(saved, ...names),
      ...item.variants.map((variant, sort) =>
        env.DB.prepare('INSERT INTO item_variants (item_id, name, price, compare_price, stock, sort) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (item_id, name) DO UPDATE SET price = excluded.price, compare_price = excluded.compare_price, stock = excluded.stock, sort = excluded.sort').bind(saved, variant.name, variant.price ?? '', variant.comparePrice ?? '', variant.stock ?? null, sort),
      ),
    ])
  }
  return saved
}

async function mediaPage(env: Env, site: SiteRow, code: string, notice?: { error?: string; saved?: string }) {
  const { results } = await env.DB.prepare('SELECT id, name, size FROM media WHERE site_id = ? ORDER BY id DESC LIMIT 200').bind(site.id).all<{ id: number; name: string; size: number }>()
  const rows = results
    .map((image) => `<figure class="cms-media"><img alt="${escapeHtml(image.name)}" loading="lazy" src="/media/${image.id}"><figcaption><code>/media/${image.id}</code><br>${escapeHtml(image.name)}</figcaption><form action="/owner/${escapeHtml(code)}/media/${image.id}/delete" method="post"><button class="button button--small" type="submit">Delete</button></form></figure>`)
    .join('')
  return office(
    site,
    code,
    'Images',
    `<form action="/owner/${escapeHtml(code)}/media" class="contact-form" enctype="multipart/form-data" method="post"><label>Upload a PNG, JPEG, WebP or GIF, up to 1 MB<input accept="image/png,image/jpeg,image/webp,image/gif" name="file" required type="file"></label><button class="button" type="submit">Upload</button></form><div class="cms-gallery">${rows || '<p>No images yet.</p>'}</div>`,
    notice,
  )
}

async function customersPage(env: Env, url: URL, site: SiteRow, code: string, notice?: { error?: string; saved?: string }, resetLink?: string) {
  const settings = JSON.parse(site.settings) as Settings
  const { results } = await env.DB.prepare('SELECT id, email, name, created_at FROM customers WHERE site_id = ? ORDER BY id DESC LIMIT 500').bind(site.id).all<{ created_at: string; email: string; id: number; name: string }>()
  const rows = results
    .map(
      (customer) => `<article class="card account__record"><h3>${escapeHtml(customer.name)}</h3><p>${escapeHtml(customer.email)}<br><small>Joined ${escapeHtml(customer.created_at.slice(0, 10))}</small></p><form action="/owner/${escapeHtml(code)}/customers/${customer.id}/reset" method="post"><button class="button button--small" type="submit">Make a password reset link</button></form><form action="/owner/${escapeHtml(code)}/customers/${customer.id}/delete" class="cms-danger contact-form" method="post"><label class="check"><input name="confirm" required type="checkbox"> Yes, delete this account</label><button class="button button--small" type="submit">Delete account</button></form></article>`,
    )
    .join('')
  return office(
    site,
    code,
    'Customers',
    `${settings.accounts ? '' : '<p role="alert">Customer accounts are off. Turn them on in Settings.</p>'}${resetLink ? `<p role="status">Send this link to the customer yourself. It works once and expires in 24 hours:<br><code style="overflow-wrap:anywhere">${escapeHtml(`${url.origin}${resetLink}`)}</code></p>` : ''}${rows || '<p>No customers yet.</p>'}`,
    notice,
  )
}

const settingsForm = (site: SiteRow, code: string, notice?: { error?: string; saved?: string }, draft?: Partial<Settings>) => {
  const settings = { ...(JSON.parse(site.settings) as Settings), ...draft }
  const text = (key: keyof Settings, label: string, kind = 'text') => `<label>${label}<input name="${key}" type="${kind}" value="${escapeHtml(settings[key])}"></label>`
  return office(
    site,
    code,
    'Settings',
    `<form action="/owner/${escapeHtml(code)}/settings" class="contact-form cms-form" method="post">
${text('name', 'Site name')}${text('tagline', 'Tagline')}${text('language', 'Language, such as en or th')}
<label>Style<select name="style">${siteStyles.map((style) => `<option${style === settings.style ? ' selected' : ''}>${style}</option>`).join('')}</select></label>
${text('accent', 'Main colour', 'color').replace('value=""', 'value="#1f4d3a"')}${text('background', 'Background colour', 'color').replace('value=""', 'value="#fbfaf6"')}${text('text', 'Text colour', 'color').replace('value=""', 'value="#16201b"')}
<label class="check"><input name="accounts" type="checkbox"${settings.accounts ? ' checked' : ''}> Let customers sign up and log in</label>
<fieldset class="cms-block"><legend>Shop</legend>
<label class="check"><input name="cart" type="checkbox"${settings.cart ? ' checked' : ''}> Turn on the cart and checkout</label>
<label class="check"><input name="cartMembersOnly" type="checkbox"${settings.cartMembersOnly ? ' checked' : ''}> Only logged-in customers can check out</label>
<label class="check"><input name="payTransfer" type="checkbox"${settings.payTransfer ? ' checked' : ''}> Accept bank transfer</label>
<label>Bank transfer instructions, such as bank, account name and number<textarea maxlength="1000" name="transferDetails" rows="3">${escapeHtml(settings.transferDetails)}</textarea></label>
<label class="check"><input name="payCod" type="checkbox"${settings.payCod ? ' checked' : ''}> Accept pay on delivery</label>
<label>Delivery fee per order<input min="0" name="shippingFee" step="any" type="number" value="${escapeHtml(settings.shippingFee)}"></label>
<label>Free delivery on orders of this amount or more, optional<input min="0" name="freeShippingOver" step="any" type="number" value="${escapeHtml(settings.freeShippingOver)}"></label>
<label>Currency code, such as thb or eur<input maxlength="3" name="currency" value="${escapeHtml(settings.currency)}"></label>
<label class="check"><input name="payCard" type="checkbox"${settings.payCard ? ' checked' : ''}> Accept cards through your own Stripe account</label>
<p>Cards also need a currency code, plus the STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET secrets in your Cloudflare account. Point the Stripe webhook at <code>/stripe/webhook</code>.</p>
</fieldset>
<label>Menu, one per line: Name | link<textarea name="nav" rows="5">${escapeHtml((settings.nav ?? []).map((item) => `${item.label} | ${item.href}`).join('\n'))}</textarea></label>
${text('headerButtonLabel', 'Header button text')}${text('headerButtonHref', 'Header button link')}
<label>Footer text<textarea name="footerText" rows="3">${escapeHtml(settings.footerText)}</textarea></label>
${text('email', 'Email', 'email')}${text('phone', 'Phone')}<label>Address<textarea name="address" rows="2">${escapeHtml(settings.address)}</textarea></label>
<label>Extra CSS<textarea name="customCss" rows="6">${escapeHtml(settings.customCss)}</textarea></label>
<button class="button" type="submit">Save settings</button></form>`,
    notice,
  )
}

async function saveSettings(request: Request, env: Env, url: URL, site: SiteRow, code: string) {
  const form = await request.formData()
  const draft: Record<string, unknown> = {
    githubRepo: (JSON.parse(site.settings) as Settings).githubRepo,
    accounts: form.get('accounts') === 'on',
    cart: form.get('cart') === 'on',
    cartMembersOnly: form.get('cartMembersOnly') === 'on',
    payCard: form.get('payCard') === 'on',
    payCod: form.get('payCod') === 'on',
    payTransfer: form.get('payTransfer') === 'on',
  }
  const fee = String(form.get('shippingFee') ?? '').trim()
  if (fee) draft.shippingFee = Number(fee)
  const freeOver = String(form.get('freeShippingOver') ?? '').trim()
  if (freeOver) draft.freeShippingOver = Number(freeOver)
  for (const key of ['name', 'tagline', 'language', 'style', 'accent', 'background', 'text', 'headerButtonLabel', 'headerButtonHref', 'footerText', 'email', 'phone', 'address', 'customCss', 'transferDetails', 'currency']) {
    const value = String(form.get(key) ?? '').trim()
    if (value) draft[key] = value
  }
  draft.nav = String(form.get('nav') ?? '')
    .split('\n')
    .map((line) => line.split('|').map((part) => part.trim()))
    .filter(([label, href]) => label && href)
    .map(([label, href]) => ({ href, label }))
  const parsed = z.object(settingsShape).safeParse(draft)
  if (!parsed.success || !draft.name) return settingsForm(site, code, { error: parsed.success ? 'Give your site a name.' : `Not saved. ${firstProblem(parsed.error)}` }, draft as Partial<Settings>)
  await env.DB.prepare("UPDATE sites SET settings = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(JSON.stringify(parsed.data), site.id).run()
  return see(url, `/owner/${code}/settings?saved=1`)
}

/** The private back office. Its address holds the owner's secret, so anyone who reaches this is the owner. */
export async function handleOffice(request: Request, env: Env, url: URL, site: SiteRow, code: string, parts: string[]) {
  const post = request.method === 'POST'
  if (!post && request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
  if (Number(request.headers.get('content-length') || 0) > maxOfficeBytes) return new Response('That is too large.', { status: 413 })
  const saved = url.searchParams.has('saved') ? { saved: 'Saved.' } : undefined
  const [area, id, action] = parts.slice(2)
  const owner = `/owner/${code}`

  if (!area) return post ? notFound() : overview(env, url, site, code)

  if (area === 'entry' && post && /^\d+$/.test(id ?? '') && !action) {
    const form = await request.formData().catch((): null => null)
    const status = form?.get('status')
    if (status === 'delete') {
      await env.DB.prepare('DELETE FROM entries WHERE id = ? AND site_id = ?').bind(Number(id), site.id).run()
    } else if (typeof status === 'string' && statuses.includes(status)) {
      await env.DB.prepare('UPDATE entries SET status = ? WHERE id = ? AND site_id = ?').bind(status, Number(id), site.id).run()
    }
    return see(url, owner)
  }

  if (area === 'orders') {
    if (!id) return post ? notFound() : ordersPage(env, site, code)
    if (!post || action || !/^\d+$/.test(id)) return notFound()
    const status = (await request.formData().catch((): null => null))?.get('status')
    if (typeof status === 'string' && orderStatuses.includes(status)) {
      const result = await setOrderStatus(env, site.id, Number(id), status)
      if (result === 'no-stock') return ordersPage(env, site, code, 'Not changed. There is no longer enough stock to restore this order.')
    }
    return see(url, `${owner}/orders`)
  }

  if (area === 'pages' && !id) return post ? addPage(request, env, url, site, code) : pagesList(env, site, code)

  if (area === 'page' && id) {
    const page = await env.DB.prepare('SELECT title, description, published, blocks FROM pages WHERE site_id = ? AND slug = ?').bind(site.id, id).first<{ blocks: string; description: string; published: number; title: string }>()
    if (!page) return notFound()
    if (action === 'delete' && post && id !== 'home') {
      const form = await request.formData()
      if (form.get('confirm') === 'on') await env.DB.prepare('DELETE FROM pages WHERE site_id = ? AND slug = ?').bind(site.id, id).run()
      return see(url, `${owner}/pages`)
    }
    if (action) return notFound()
    if (post) return savePageFromForm(request, env, url, site, code, id)
    return pageEditor(env, site, code, id, { blocks: JSON.parse(page.blocks) as Block[], description: page.description, published: Boolean(page.published), title: page.title }, saved)
  }

  if (area === 'items') {
    if (!id) return post ? saveItemFromForm(request, env, url, site, code) : itemsPage(env, site, code, saved)
    if (!/^\d+$/.test(id) || !post) return notFound()
    if (!action) return saveItemFromForm(request, env, url, site, code, Number(id))
    if (action === 'delete') {
      const form = await request.formData()
      if (form.get('confirm') === 'on') await env.DB.prepare('DELETE FROM items WHERE id = ? AND site_id = ?').bind(Number(id), site.id).run()
      return see(url, `${owner}/items`)
    }
    return notFound()
  }

  if (area === 'media') {
    if (!id) {
      if (!post) return mediaPage(env, site, code, saved)
      const file = (await request.formData()).get('file')
      if (!(file instanceof File) || !file.size) return mediaPage(env, site, code, { error: 'Choose an image first.' })
      const stored = await saveImage(env, site.id, file)
      return stored.error ? mediaPage(env, site, code, { error: stored.error }) : see(url, `${owner}/media?saved=1`)
    }
    if (post && action === 'delete' && /^\d+$/.test(id)) {
      await env.DB.prepare('DELETE FROM media WHERE id = ? AND site_id = ?').bind(Number(id), site.id).run()
      return see(url, `${owner}/media`)
    }
    return notFound()
  }

  if (area === 'customers') {
    if (!id) return post ? notFound() : customersPage(env, url, site, code, saved)
    if (!post || !/^\d+$/.test(id)) return notFound()
    const customer = await env.DB.prepare('SELECT id FROM customers WHERE id = ? AND site_id = ?').bind(Number(id), site.id).first<{ id: number }>()
    if (!customer) return notFound()
    if (action === 'reset') {
      const token = newToken()
      await env.DB.batch([
        env.DB.prepare('DELETE FROM password_resets WHERE customer_id = ?').bind(customer.id),
        env.DB.prepare('INSERT INTO password_resets (token_hash, customer_id, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), customer.id, new Date(Date.now() + 86_400_000).toISOString()),
      ])
      return customersPage(env, url, site, code, undefined, `/reset/${token}`)
    }
    if (action === 'delete') {
      const form = await request.formData()
      if (form.get('confirm') === 'on') await env.DB.prepare('DELETE FROM customers WHERE id = ?').bind(customer.id).run()
      return see(url, `${owner}/customers`)
    }
    return notFound()
  }

  if (area === 'updates' && !id) {
    const settings = JSON.parse(site.settings) as Settings
    if (post) {
      const repo = String((await request.formData().catch((): null => null))?.get('repo') ?? '').trim()
      if (!repoPattern.test(repo)) return office(site, code, 'Updates', updatesBody(code, settings.githubRepo, await latestRelease()), { error: 'Enter it like this: your-name/my-website' })
      await env.DB.prepare("UPDATE sites SET settings = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(JSON.stringify({ ...settings, githubRepo: repo }), site.id).run()
      return see(url, `${owner}/updates?saved=1`)
    }
    return office(site, code, 'Updates', updatesBody(code, settings.githubRepo, await latestRelease()), saved)
  }

  if (area === 'settings' && !id) return post ? saveSettings(request, env, url, site, code) : settingsForm(site, code, saved)
  return notFound()
}
