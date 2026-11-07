import { z } from 'zod'

import { approvalWords, handleApprovalsOffice } from './approvals-office'
import { createResetLink, getCustomer } from './auth'
import { reschedule } from './automations'
import { handleAutomationsOffice } from './automations-office'
import { itemInLanguage, itemLanguageLinks, languageTabs, pageInLanguage, settingsInLanguage } from './cms-languages'
import { handlePlatform } from './cms-platform'
import { zoneOf } from './clock'
import { canSendEmail } from './email'
import { checklist, claudeLinkField, connectGuide, firstSteps, handleStarters, isStarter } from './first-steps'
import { escapeHtml, html, notFound, privateHeaders, see } from './http'
import { saveImage } from './items'
import { extraLanguages, languageName, localizePage, mainLanguage, siteMissing } from './languages'
import { handleNewsOffice } from './news-office'
import { blockSchema, itemSchema, maxBlocksBytes, maxPagesPerSite, pageSlugSchema, settingsShape } from './mcp'
import { officeText, officeWords } from './office-words'
import type { OfficeWords } from './office-words'
import { entryFields, shell } from './owner'
import { pageRevisions, rememberPage, restorePageRevision } from './page-history'
import { validPromptPayId } from './promptpay'
import { orderDetails, orderHistory, orderLines, orderNumber, orderStatuses, paymentName, setOrderStatus } from './shop'
import { setStaff, staffAreas, staffPermissions } from './staff'
import { statsPage } from './stats-office'
import type { StaffArea, StaffMember } from './staff'
import { words } from './text'
import { isNewer, latestRelease, repoPattern, updatesBody } from './updates'
import { version } from './version'
import { liveSite } from './versions'
import { siteFontNames, siteStyles } from './theme'
import type { Block, Env, FormField, Item, Order, Settings, SiteRow, Variant } from './types'

const maxOfficeBytes = 3_000_000
const statuses = ['new', 'confirmed', 'done']

type Kind = 'bool' | 'image' | 'lines' | 'list' | 'long' | 'number' | 'select' | 'text'
export type Spec = { fields?: Spec[]; key: string; kind: Kind; label: string; options?: string[] }

export type Notice = { error?: string; saved?: string }

/** Who is in the back office and where it lives: an owner, through a private link or an account, or a staff member. */
export type Desk = { accountOwner: boolean; base: string; code: null | string; staff: null | StaffMember }
export const ownerDesk = (code: string): Desk => ({ accountOwner: true, base: `/owner/${code}`, code, staff: null })
export const adminDesk = (): Desk => ({ accountOwner: true, base: '/admin', code: null, staff: null })
export const staffDesk = (staff: StaffMember): Desk => ({ accountOwner: false, base: '/staff', code: null, staff })

/** The owner can do everything. Staff only what they were given. */
export const allows = (desk: Desk, area: StaffArea) => !desk.staff || desk.staff.permissions.includes(area)

// The menu entries staff can see, with the area each one needs. Anything else in the menu is for the owner alone.
const staffMenu: Record<string, StaffArea> = { '/customers': 'customers', '/data': 'data', '/items': 'products', '/media': 'products', '/news': 'news', '/orders': 'orders', '/pages': 'pages', '/publish': 'publish', '/stats': 'stats' }

// Staff addresses hold no secret, and their changes are checked by where they come from, which needs the browser to say so.
const staffHeaders = { ...privateHeaders, 'Referrer-Policy': 'same-origin' }

export const spec = (key: string, label: string, kind: Kind = 'text', extra: Partial<Spec> = {}): Spec => ({ key, kind, label, ...extra })
const tone = spec('tone', 'Background', 'select', { options: ['', 'plain', 'tint', 'dark'] })
const heading = spec('heading', 'Heading')
const intro = spec('intro', 'Intro', 'long')
const buttons = [spec('buttonLabel', 'Button text'), spec('buttonHref', 'Button link')]
const list = (key: string, label: string, fields: Spec[]) => spec(key, label, 'list', { fields })
const titled = list('items', 'Items', [spec('title', 'Title'), spec('text', 'Text', 'long')])

export const catalog: Record<string, { label: string; fields: Spec[]; start: Block }> = {
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
  links: { label: 'Links', start: { items: [{ href: '/', label: 'Home' }], type: 'links' }, fields: [heading, intro, list('items', 'Links', [spec('label', 'Text'), spec('href', 'Link, such as /about'), spec('text', 'Short description, shows the links as cards', 'long')]), tone] },
  cta: { label: 'Call to action', start: { heading: 'New heading', type: 'cta' }, fields: [heading, spec('text', 'Text', 'long'), ...buttons, tone] },
  form: { label: 'Form', start: { fields: [{ label: 'Name', name: 'name', type: 'text' }, { label: 'Email', name: 'email', type: 'email' }], name: 'contact', type: 'form' }, fields: [spec('name', 'Form name, English letters'), heading, spec('intro', 'Intro', 'long'), spec('buttonLabel', 'Button text'), spec('sentMessage', 'Message after sending'), spec('errorMessage', 'Message on error'), spec('membersOnly', 'Members only', 'bool'), list('fields', 'Fields', [spec('name', 'Field name, English letters'), spec('label', 'Label'), spec('type', 'Type', 'select', { options: ['text', 'textarea', 'email', 'phone', 'number', 'date', 'time', 'select', 'checkbox'] }), spec('required', 'Required', 'bool'), spec('options', 'Choices, one per line', 'lines'), spec('optionsFrom', 'Choices from collection')]), tone] },
  collection: { label: 'Products or list', start: { collection: 'products', type: 'collection' }, fields: [spec('id', 'Link name, such as products'), spec('collection', 'Collection name'), heading, intro, ...buttons, spec('orderField', 'Form field to fill in'), spec('limit', 'How many to show', 'number'), spec('filters', 'Show category filters', 'bool'), tone] },
  records: { label: 'Records from a table', start: { table: 'bookings', type: 'records' }, fields: [spec('id', 'Link name, such as bookings'), spec('table', 'Table name'), heading, intro, spec('fields', 'Fields to show, one per line. Leave empty for all', 'lines'), spec('limit', 'How many to show', 'number'), spec('newestFirst', 'Newest first', 'bool'), spec('allowDelete', 'People can delete what they may change', 'bool'), tone] },
  table: { label: 'Table of records', start: { search: true, table: 'bookings', type: 'table' }, fields: [spec('id', 'Link name, such as bookings'), spec('table', 'Table name'), heading, intro, spec('columns', 'Fields to show as columns, one per line. Leave empty for the first few', 'lines'), spec('sort', 'Sort by this field at first'), spec('dir', 'Sort direction', 'select', { options: ['', 'asc', 'desc'] }), spec('search', 'Show a search box', 'bool'), spec('filters', 'Drop-down filters, field names one per line', 'lines'), spec('pageSize', 'Rows per page', 'number'), spec('detailPage', 'Page name that opens a row, such as class-details'), spec('detail', 'This block shows one row opened from a table', 'bool'), tone] },
  'record-form': { label: 'Add record form', start: { table: 'bookings', type: 'record-form' }, fields: [spec('table', 'Table name'), heading, spec('intro', 'Intro', 'long'), spec('fields', 'Fields to ask for, one per line. Leave empty for all', 'lines'), spec('buttonLabel', 'Button text'), spec('sentMessage', 'Message after sending'), spec('errorMessage', 'Message on error'), tone] },
  record: { label: 'Edit own records', start: { table: 'bookings', type: 'record' }, fields: [spec('table', 'Table name'), heading, spec('intro', 'Intro', 'long'), spec('fields', 'Fields to show, one per line. Leave empty for all', 'lines'), spec('buttonLabel', 'Button text'), spec('sentMessage', 'Message after saving'), spec('errorMessage', 'Message on error'), spec('allowDelete', 'People can cancel (delete) their record', 'bool'), spec('limit', 'How many to show', 'number'), tone] },
  html: { label: 'Custom code', start: { code: '<p>New section</p>', type: 'html' }, fields: [spec('code', 'HTML, CSS and JavaScript', 'long'), spec('height', 'Height in pixels', 'number'), spec('title', 'Title'), tone] },
}

/** One back office page. Owner-only pages may pass the owner's code instead of a desk. */
export const office = (site: SiteRow, at: Desk | string, title: string, body: string, notice?: Notice, status = 200) => {
  const desk = typeof at === 'string' ? ownerDesk(at) : at
  const settings = JSON.parse(site.settings) as Settings
  const t = officeText(site)
  const base = `${escapeHtml(desk.base)}`
  const links: [string, string][] = [['', t.nav.overview], ['/stats', t.nav.stats], ['/orders', t.nav.orders], ['/pages', t.nav.pages], ['/items', t.nav.products], ['/data', t.nav.data], ['/approvals', approvalWords(site).title], ['/automations', t.automations.title], ['/media', t.nav.images], ['/customers', t.nav.customers], ['/news', t.news.title], ['/publish', t.nav.publish], ['/connect', t.nav.connect], ['/move', t.nav.move], ['/wordpress', t.nav.wordpress], ['/settings', t.nav.settings], ['/system', t.nav.system], ['/updates', t.nav.updates]]
  // Any staff member may be an approver, so Approvals is always in their menu. The page shows only what they may see.
  const shown = desk.staff ? links.filter(([path]) => !path || path === '/approvals' || (staffMenu[path] && allows(desk, staffMenu[path]))) : links
  const who = desk.staff ? `<p class="cms-who">${t.staffLoggedIn(escapeHtml(desk.staff.name))}</p><form action="/logout" method="post"><button class="button button--small button--ghost" type="submit">${t.logOut}</button></form>` : ''
  return html(
    shell(
      `${settings.name}: ${title}`,
      `<nav aria-label="${t.navLabel}" class="cms-nav">${shown.map(([path, label]) => `<a href="${base}${path}">${label}</a>`).join('')}<a href="/" target="_blank" rel="noopener">${t.openWebsite}</a></nav>${who}
<h1>${escapeHtml(title)}</h1>
${notice?.error ? `<p role="alert">${escapeHtml(t.problem(notice.error))}</p>` : ''}${notice?.saved ? `<p role="status">${escapeHtml(notice.saved)}</p>` : ''}${body}`,
      true,
      t.lang,
    ),
    status,
    desk.staff ? staffHeaders : privateHeaders,
  )
}

/** One field of a form. `translate` is false for names the owner chose, such as the fields of their tables. */
export const input = (name: string, field: Spec, value: unknown, t: OfficeWords = officeWords(), translate = true): string => {
  const label = escapeHtml(translate ? t.label(field.label) : field.label)
  const key = escapeHtml(name)
  if (field.kind === 'bool') return `<label class="check"><input name="${key}" type="checkbox"${value ? ' checked' : ''}> ${label}</label>`
  if (field.kind === 'long') return `<label>${label}<textarea name="${key}" rows="4">${escapeHtml(value)}</textarea></label>`
  if (field.kind === 'lines') return `<label>${label}<textarea name="${key}" rows="3">${escapeHtml(Array.isArray(value) ? value.join('\n') : '')}</textarea></label>`
  if (field.kind === 'number') return `<label>${label}<input name="${key}" type="number" value="${escapeHtml(value)}"></label>`
  if (field.kind === 'image') return `<label>${label}<input list="media-list" name="${key}" placeholder="${escapeHtml(t.imagePlaceholder)}" value="${escapeHtml(value)}"></label>`
  if (field.kind === 'select') return `<label>${label}<select name="${key}">${(field.options ?? []).map((option) => `<option value="${escapeHtml(option)}"${option === (value ?? '') ? ' selected' : ''}>${escapeHtml(translate || !option ? t.option(option) : option)}</option>`).join('')}</select></label>`
  if (field.kind === 'list') {
    const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : []
    // One empty row at the end adds an item. Clearing a row removes it.
    const shown = [...rows, {}]
    return `<fieldset class="cms-list"><legend>${label}</legend><input name="${key}.count" type="hidden" value="${shown.length}">${shown
      .map((row, index) => `<div class="cms-row">${(field.fields ?? []).map((sub) => input(`${name}.${index}.${sub.key}`, sub, row[sub.key], t, translate)).join('')}</div>`)
      .join('')}</fieldset>`
  }
  return `<label>${label}<input name="${key}" value="${escapeHtml(value)}"></label>`
}

export const readField = (form: FormData, name: string, field: Spec): unknown => {
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

export const firstProblem = (error: z.ZodError) => {
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

async function pageEditor(env: Env, site: SiteRow, desk: Desk, slug: string, page: { blocks: Block[]; description: string; published: boolean; title: string; translations?: string }, notice?: { error?: string; saved?: string }) {
  const t = officeText(site)
  const tabs = languageTabs(site, (code) => `${desk.base}/page/${slug}${code ? `?lang=${code}` : ''}`, null, (code) => localizePage({ ...page, translations: page.translations ?? '{}' }, code).missing.length)
  const blocks = page.blocks
    .map((block, index) => {
      const entry = catalog[block.type]
      if (!entry) return ''
      return `<fieldset class="cms-block"><legend>${escapeHtml(t.label(entry.label))}</legend><input name="b${index}.type" type="hidden" value="${escapeHtml(block.type)}">
${entry.fields.map((field) => input(`b${index}.${field.key}`, field, block[field.key], t)).join('')}
<div class="cms-actions"><button class="button button--small" name="op" type="submit" value="up:${index}">${t.moveUp}</button><button class="button button--small" name="op" type="submit" value="down:${index}">${t.moveDown}</button><button class="button button--small" name="op" type="submit" value="delete:${index}">${t.deleteSection}</button></div></fieldset>`
    })
    .join('')
  const adders = Object.entries(catalog).map(([type, entry]) => `<button class="button button--small" name="op" type="submit" value="add:${type}">${escapeHtml(t.label(entry.label))}</button>`).join('')
  const revisions = await pageRevisions(env, site.id, slug)
  const history = revisions.length
    ? `<details class="cms-history"><summary>${t.pageHistory}</summary><p>${t.pageHistoryHelp}</p>${revisions.map((revision) => `<form action="${escapeHtml(desk.base)}/page/${escapeHtml(slug)}/restore/${revision.id}" method="post"><span>${escapeHtml(revision.title)} · ${escapeHtml(revision.created_at.slice(0, 16).replace('T', ' '))} UTC${revision.published ? '' : ` ${t.hiddenPage}`}</span><label class="check"><input name="confirm" required type="checkbox"> ${t.confirmRestorePageVersion}</label> <button class="button button--small" type="submit">${t.restorePageVersion}</button></form>`).join('')}</details>`
    : ''
  return office(
    site,
    desk,
    t.editPage(page.title),
    `${tabs}${await mediaList(env, site)}<form action="${escapeHtml(desk.base)}/page/${escapeHtml(slug)}" class="contact-form cms-form" method="post"><input name="count" type="hidden" value="${page.blocks.length}">
<label>${t.pageTitle}<input maxlength="120" name="title" required value="${escapeHtml(page.title)}"></label>
<label>${t.pageDescription}<textarea maxlength="300" name="description" required rows="2">${escapeHtml(page.description)}</textarea></label>
<label class="check"><input name="published" type="checkbox"${page.published ? ' checked' : ''}> ${t.showPage}</label>
${blocks}
<fieldset class="cms-block"><legend>${t.addSection}</legend><div class="cms-actions">${adders}</div></fieldset>
<button class="button cms-save" name="op" type="submit" value="save">${t.savePage}</button></form>
${history}
${slug === 'home' ? '' : `<form action="${escapeHtml(desk.base)}/page/${escapeHtml(slug)}/delete" class="cms-danger contact-form" method="post"><label class="check"><input name="confirm" required type="checkbox"> ${t.confirmDeletePage}</label><button class="button button--small" type="submit">${t.deletePage}</button></form>`}`,
    notice,
  )
}

async function savePageFromForm(request: Request, env: Env, url: URL, site: SiteRow, desk: Desk, slug: string) {
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
  const t = officeText(site)
  if (!invalid.success) return pageEditor(env, site, desk, slug, page, { error: t.notSaved(firstProblem(invalid.error)) })
  const stored = JSON.stringify(invalid.data.blocks)
  if (stored.length > maxBlocksBytes) return pageEditor(env, site, desk, slug, page, { error: t.notSaved(t.pageTooLarge) })
  await rememberPage(env, site.id, slug)
  await env.DB.prepare(`INSERT INTO pages (site_id, slug, title, description, published, blocks) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (site_id, slug) DO UPDATE SET title = excluded.title, description = excluded.description, published = excluded.published, blocks = excluded.blocks, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`)
    .bind(site.id, slug, page.title, page.description, page.published ? 1 : 0, stored)
    .run()
  return see(url, `${desk.base}/page/${slug}?saved=1`)
}

/** Messages and bookings sent through forms, with buttons to move them along. */
async function messageList(env: Env, site: SiteRow, desk: Desk) {
  const [{ results: pages }, { results: entries }] = await Promise.all([
    env.DB.prepare('SELECT slug, blocks FROM pages WHERE site_id = ?').bind(site.id).all<{ blocks: string; slug: string }>(),
    env.DB.prepare('SELECT entries.id, form, page, data, status, entries.created_at, customers.email AS customer FROM entries LEFT JOIN customers ON customers.id = entries.customer_id WHERE entries.site_id = ? ORDER BY entries.id DESC LIMIT 200').bind(site.id).all<{ created_at: string; customer: null | string; data: string; form: string; id: number; page: string; status: string }>(),
  ])
  const t = officeText(site)
  const labels = entryFields(pages)
  return entries.length
    ? entries
        .map((entry) => {
          const data = JSON.parse(entry.data) as Record<string, unknown>
          const fields = labels.get(`${entry.page}/${entry.form}`) ?? Object.keys(data).map((name) => ({ label: name, name }) as FormField)
          const list = fields
            .filter((field) => data[field.name] !== undefined)
            .map((field) => `<div><dt>${escapeHtml(field.label)}</dt><dd class="pre-line">${escapeHtml(data[field.name] === true ? t.yes : data[field.name] === false ? t.no : data[field.name])}</dd></div>`)
            .join('')
          const buttons = statuses.filter((status) => status !== entry.status)
            .map((status) => `<button class="button button--small" name="status" type="submit" value="${status}">${escapeHtml(t.entryAction(status))}</button> `)
            .join('')
          const remove = `<label class="check"><input name="confirm" type="checkbox"> ${escapeHtml(t.confirmDeleteEntry)}</label><button class="button button--small" name="status" type="submit" value="delete">${escapeHtml(t.entryAction('delete'))}</button>`
          return `<article class="card account__record"><h3>${escapeHtml(entry.form)} · ${escapeHtml(t.entryState(entry.status))}</h3><p class="post-date">${escapeHtml(entry.created_at.slice(0, 16).replace('T', ' '))} UTC${entry.customer ? ` · ${escapeHtml(entry.customer)}` : ''}</p><dl>${list}</dl><form action="${escapeHtml(desk.base)}/entry/${entry.id}" method="post">${buttons}${remove}</form></article>`
        })
        .join('')
    : `<p>${t.noEntries}</p>`
}

async function overview(env: Env, url: URL, site: SiteRow, desk: Desk) {
  const t = officeText(site)
  if (desk.staff) {
    const intro = desk.staff.permissions.length ? `<p>${t.staffIntro}</p>` : `<p role="status">${t.staffNoAreas}</p>`
    return office(site, desk, t.nav.overview, `${intro}${allows(desk, 'messages') ? `<h2>${t.messagesHeading}</h2>${await messageList(env, site, desk)}` : ''}`)
  }
  const [latest, steps] = await Promise.all([latestRelease(), firstSteps(env, site)])
  const newer = latest && isNewer(latest.version, version) ? `<p role="status">${t.versionAvailable(escapeHtml(latest.version), `${escapeHtml(desk.base)}/updates`)}</p>` : ''
  const started = isStarter(url.searchParams.get('started')) ? `<p role="status">${site.live_version ? t.start.startedLive(`${escapeHtml(desk.base)}/publish`) : t.start.started}</p>` : ''
  // A new site gets its first steps on top, until every one of them is done.
  const firstTime = steps && !Object.values(steps).every(Boolean) ? checklist(steps, escapeHtml(desk.base), t) : ''
  const mcpUrl = desk.code ? `${url.origin}/mcp/${desk.code}` : ''
  return office(
    site,
    desk,
    t.nav.overview,
    `${started}${newer}${firstTime}<h2>${t.messagesHeading}</h2>${await messageList(env, site, desk)}
${site.live_version ? `<p>${t.seeWaiting(`${escapeHtml(desk.base)}/publish`)}</p>` : ''}
<h2 id="claude">${t.claudeHeading}</h2>
<p>${t.claudeHelp}</p>
${desk.code ? (steps && !steps.claude ? `<div class="contact-form">${claudeLinkField(mcpUrl, t)}${connectGuide(t)}</div>` : `<p><code style="overflow-wrap:anywhere">${escapeHtml(mcpUrl)}</code></p>`) : `<p>Claude is connected with the private link shown during setup. This account dashboard never reveals it.</p>`}`,
  )
}

async function ordersPage(env: Env, site: SiteRow, desk: Desk, error?: string) {
  const settings = JSON.parse(site.settings) as Settings
  const o = officeText(site)
  const t = words(o.lang)
  const { results: orders } = await env.DB.prepare('SELECT * FROM orders WHERE site_id = ? ORDER BY id DESC LIMIT 200').bind(site.id).all<Order>()
  const [lines, history] = await Promise.all([orderLines(env, orders.map((order) => order.id)), orderHistory(env, orders.map((order) => order.id))])
  const rows = orders
    .map((order) => {
      const buttons = orderStatuses
        .filter((status) => status !== order.status)
        .map((status) => `<button class="button button--small" name="status" type="submit" value="${status}">${escapeHtml(o.orderAction(status))}</button> `)
        .join('')
      const changes = (history.get(order.id) ?? []).map((event) => `<li>${escapeHtml(event.created_at.slice(0, 16).replace('T', ' '))} UTC · ${escapeHtml(o.orderState(event.status))} · ${escapeHtml(event.actor_name || o.orderActor(event.actor))}</li>`).join('')
      return `<article class="card account__record"><h3>${orderNumber(order.id)} · ${escapeHtml(o.orderState(order.status))}</h3><p class="post-date">${escapeHtml(order.created_at.slice(0, 16).replace('T', ' '))} UTC · ${paymentName(t, order.payment)}</p>${orderDetails(order, lines.get(order.id) ?? [], t)}<p class="pre-line"><strong>${escapeHtml(order.name)}</strong>
${escapeHtml(order.phone)}${order.email ? `\n${escapeHtml(order.email)}` : ''}
${escapeHtml(order.address)}${order.note ? `\n\n${o.orderNote}: ${escapeHtml(order.note)}` : ''}</p>${changes ? `<details class="order-history"><summary>${o.orderHistory}</summary><ul>${changes}</ul></details>` : ''}<form action="${escapeHtml(desk.base)}/orders/${order.id}" method="post">${buttons}</form></article>`
    })
    .join('')
  return office(site, desk, o.nav.orders, `${settings.cart ? '' : `<p role="alert">${o.cartOff}</p>`}<p>${o.ordersHelp}</p>${rows || `<p>${o.noOrders}</p>`}`, error ? { error } : undefined)
}

async function pagesList(env: Env, site: SiteRow, desk: Desk, notice?: { error?: string }) {
  const t = officeText(site)
  const { results } = await env.DB.prepare('SELECT slug, title, published FROM pages WHERE site_id = ? ORDER BY slug').bind(site.id).all<{ published: number; slug: string; title: string }>()
  const rows = results
    .map(
      (page) => `<li><a href="${escapeHtml(desk.base)}/page/${escapeHtml(page.slug)}">${escapeHtml(page.title)}</a> ${page.published ? '' : t.hiddenPage} <small>/${page.slug === 'home' ? '' : escapeHtml(page.slug)}</small>
<form action="${escapeHtml(desk.base)}/pages/${escapeHtml(page.slug)}/duplicate" method="post"><label>${t.duplicatePageAddress}<input maxlength="60" name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" required></label><button class="button button--small" type="submit">${t.duplicatePage}</button></form></li>`,
    )
    .join('')
  return office(
    site,
    desk,
    t.nav.pages,
    `<p>${t.duplicatePageHelp}</p><ul>${rows || `<li>${t.noPages}</li>`}</ul><h2>${t.addPage}</h2><form action="${escapeHtml(desk.base)}/pages" class="contact-form" method="post"><label>${t.pageTitle}<input maxlength="120" name="title" required></label><label>${t.pageAddress}<input maxlength="60" name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" required></label><button class="button" type="submit">${t.createPage}</button></form>`,
    notice,
  )
}

/** Copies a page into an unpublished draft. Translation words deliberately stay behind: their page title can no longer be right. */
async function duplicatePage(request: Request, env: Env, url: URL, site: SiteRow, desk: Desk, sourceSlug: string) {
  const form = await request.formData()
  const slug = pageSlugSchema.safeParse(String(form.get('slug') ?? '').trim())
  const t = officeText(site)
  if (!slug.success || slug.data === sourceSlug) return pagesList(env, site, desk, { error: t.badPage })
  const [source, count] = await Promise.all([
    env.DB.prepare('SELECT title, description, blocks FROM pages WHERE site_id = ? AND slug = ?').bind(site.id, sourceSlug).first<{ blocks: string; description: string; title: string }>(),
    env.DB.prepare('SELECT COUNT(*) AS total FROM pages WHERE site_id = ?').bind(site.id).first<{ total: number }>(),
  ])
  if (!source) return notFound()
  if ((count?.total ?? 0) >= maxPagesPerSite) return pagesList(env, site, desk, { error: t.pagesLimit(maxPagesPerSite) })
  const title = `Copy of ${source.title}`.slice(0, 120)
  const saved = await env.DB.prepare('INSERT INTO pages (site_id, slug, title, description, published, blocks, translations) VALUES (?, ?, ?, ?, 0, ?, ?) ON CONFLICT (site_id, slug) DO NOTHING')
    .bind(site.id, slug.data, title, source.description, source.blocks, '{}')
    .run()
  if (!saved.meta.changes) return pagesList(env, site, desk, { error: t.pageAddressUsed })
  return see(url, `${desk.base}/page/${slug.data}`)
}

async function addPage(request: Request, env: Env, url: URL, site: SiteRow, desk: Desk) {
  const form = await request.formData()
  const title = String(form.get('title') ?? '').trim().slice(0, 120)
  const slug = pageSlugSchema.safeParse(String(form.get('slug') ?? '').trim())
  const t = officeText(site)
  if (!title || !slug.success) return pagesList(env, site, desk, { error: t.badPage })
  const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM pages WHERE site_id = ?').bind(site.id).first<{ total: number }>()
  if ((count?.total ?? 0) >= maxPagesPerSite) return pagesList(env, site, desk, { error: t.pagesLimit(maxPagesPerSite) })
  await env.DB.prepare('INSERT INTO pages (site_id, slug, title, description, published, blocks) VALUES (?, ?, ?, ?, 0, ?) ON CONFLICT (site_id, slug) DO NOTHING')
    .bind(site.id, slug.data, title, title, JSON.stringify([{ heading: title, type: 'hero' }]))
    .run()
  return see(url, `${desk.base}/page/${slug.data}`)
}

const variantLines = (variants: Variant[] = []) => variants.map((variant) => [variant.name, variant.price, variant.compare_price, variant.stock ?? ''].join(' | ')).join('\n')

const readVariants = (text: string) =>
  text
    .split('\n')
    .map((line) => line.split('|').map((part) => part.trim()))
    .filter(([name]) => name)
    .map(([name, price, comparePrice, stock]) => ({ comparePrice: comparePrice || undefined, name, price: price || undefined, stock: stock ? Number(stock) : null }))

const itemForm = (desk: Desk, item: Partial<Item>, collections: string[], t: OfficeWords) => `<form action="${escapeHtml(desk.base)}/items${item.id ? `/${item.id}` : ''}" class="contact-form cms-form" enctype="multipart/form-data" method="post">
<label>${t.itemName}<input maxlength="160" name="title" required value="${escapeHtml(item.title)}"></label>
<label>${t.itemCollection}<input list="collections" maxlength="40" name="collection" pattern="[a-z0-9-]+" required value="${escapeHtml(item.collection ?? 'products')}"></label>
<datalist id="collections">${collections.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
<label>${t.itemCategory}<input maxlength="60" name="category" value="${escapeHtml(item.category)}"></label>
<label>${t.itemPrice}<input maxlength="40" name="price" value="${escapeHtml(item.price)}"></label>
<label>${t.itemComparePrice}<input maxlength="40" name="comparePrice" value="${escapeHtml(item.compare_price)}"></label>
<label>${t.itemStock}<input min="0" name="stock" type="number" value="${escapeHtml(item.stock)}"></label>
<label>${t.itemVariants}<textarea name="variants" rows="3">${escapeHtml(variantLines(item.variants))}</textarea></label>
<label>${t.itemDescription}<textarea maxlength="4000" name="body" rows="3">${escapeHtml(item.body)}</textarea></label>
<label>${t.itemUpload}<input accept="image/png,image/jpeg,image/webp,image/gif" name="file" type="file"></label>
<label>${t.itemImageUrl}<input list="media-list" maxlength="1000" name="imageUrl" value="${escapeHtml(item.image_url)}"></label>
<label>${t.itemImageAlt}<input maxlength="200" name="imageAlt" value="${escapeHtml(item.image_alt)}"></label>
<label>${t.itemLinkLabel}<input maxlength="60" name="linkLabel" value="${escapeHtml(item.link_label)}"></label>
<label>${t.itemLinkHref}<input maxlength="500" name="linkHref" value="${escapeHtml(item.link_href)}"></label>
<label>${t.itemSort}<input name="sort" type="number" value="${escapeHtml(item.sort ?? 0)}"></label>
<label class="check"><input name="published" type="checkbox"${item.published === 0 ? '' : ' checked'}> ${t.showToVisitors}</label>
<button class="button" type="submit">${t.save}</button></form>`

async function itemsPage(env: Env, site: SiteRow, desk: Desk, notice?: { error?: string; saved?: string }) {
  const t = officeText(site)
  const { results } = await env.DB.prepare('SELECT * FROM items WHERE site_id = ? ORDER BY collection, sort, id LIMIT 500').bind(site.id).all<Item>()
  const { results: variants } = await env.DB.prepare('SELECT item_variants.* FROM item_variants JOIN items ON items.id = item_variants.item_id WHERE items.site_id = ? ORDER BY item_variants.sort, item_variants.id').bind(site.id).all<Variant>()
  for (const item of results) item.variants = variants.filter((variant) => variant.item_id === item.id)
  const collections = [...new Set(results.map((item) => item.collection))]
  const rows = results
    .map(
      (item) => `<details class="cms-item"><summary>${escapeHtml(item.title)}${item.price ? ` · ${escapeHtml(item.price)}` : ''} <small>${escapeHtml(item.collection)}${item.published ? '' : t.hiddenItem}</small></summary>${itemLanguageLinks(site, desk, item)}${itemForm(desk, item, collections, t)}<form action="${escapeHtml(desk.base)}/items/${item.id}/delete" class="cms-danger contact-form" method="post"><label class="check"><input name="confirm" required type="checkbox"> ${t.confirmDeleteItem}</label><button class="button button--small" type="submit">${t.delete}</button></form></details>`,
    )
    .join('')
  return office(site, desk, t.nav.products, `${await mediaList(env, site)}${rows || `<p>${t.nothingYet}</p>`}<h2>${t.addNew}</h2>${itemForm(desk, {}, collections, t)}`, notice)
}

async function saveItemFromForm(request: Request, env: Env, url: URL, site: SiteRow, desk: Desk, id?: number) {
  const form = await request.formData()
  const file = form.get('file')
  let imageUrl = String(form.get('imageUrl') ?? '').trim()
  if (file instanceof File && file.size) {
    const saved = await saveImage(env, site.id, file)
    if (saved.error) return itemsPage(env, site, desk, { error: saved.error })
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
  if (!item.success) return itemsPage(env, site, desk, { error: officeText(site).notSaved(firstProblem(item.error)) })
  await writeItem(env, site.id, item.data, id)
  return see(url, `${desk.base}/items?saved=1`)
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

async function mediaPage(env: Env, site: SiteRow, desk: Desk, notice?: { error?: string; saved?: string }) {
  const t = officeText(site)
  const { results } = await env.DB.prepare('SELECT id, name, size FROM media WHERE site_id = ? ORDER BY id DESC LIMIT 200').bind(site.id).all<{ id: number; name: string; size: number }>()
  const rows = results
    .map((image) => `<figure class="cms-media"><img alt="${escapeHtml(image.name)}" loading="lazy" src="/media/${image.id}"><figcaption><code>/media/${image.id}</code><br>${escapeHtml(image.name)}</figcaption><form action="${escapeHtml(desk.base)}/media/${image.id}/delete" method="post"><button class="button button--small" type="submit">${t.delete}</button></form></figure>`)
    .join('')
  return office(
    site,
    desk,
    t.nav.images,
    `<form action="${escapeHtml(desk.base)}/media" class="contact-form" enctype="multipart/form-data" method="post"><label>${t.uploadImage}<input accept="image/png,image/jpeg,image/webp,image/gif" name="file" required type="file"></label><button class="button" type="submit">${t.upload}</button></form><div class="cms-gallery">${rows || `<p>${t.noImages}</p>`}</div>`,
    notice,
  )
}

async function customersPage(env: Env, url: URL, site: SiteRow, desk: Desk, notice?: { error?: string; saved?: string }, resetLink?: string) {
  const settings = JSON.parse(site.settings) as Settings
  const t = officeText(site)
  const { results } = await env.DB.prepare('SELECT id, email, name, role, permissions, created_at FROM customers WHERE site_id = ? ORDER BY id DESC LIMIT 500').bind(site.id).all<{ created_at: string; email: string; id: number; name: string; permissions: string; role: string }>()
  const base = escapeHtml(desk.base)
  // Staff only look. Making links, changing roles and deleting accounts stay with the owner.
  const actions = (customer: (typeof results)[number]) =>
    desk.staff
      ? ''
      : customer.id === site.owner_customer_id
        ? ''
      : `<form action="${base}/customers/${customer.id}/reset" method="post"><button class="button button--small" type="submit">${t.makeResetLink}</button></form><form action="${base}/customers/${customer.id}/role" method="post"><button class="button button--small" name="role" type="submit" value="${customer.role === 'staff' ? 'member' : 'staff'}">${customer.role === 'staff' ? t.removeStaff : t.makeStaff}</button></form>${
          customer.role === 'staff'
            ? `<form action="${base}/customers/${customer.id}/access" class="contact-form" method="post"><fieldset class="cms-block"><legend>${t.staffAccess}</legend>${staffAreas.map((area) => `<label class="check"><input name="area" type="checkbox" value="${area}"${customer.permissions.split(',').includes(area) ? ' checked' : ''}> ${t.staffArea[area]}</label>`).join('')}<button class="button button--small" type="submit">${t.saveAccess}</button></fieldset></form>`
            : ''
        }<form action="${base}/customers/${customer.id}/delete" class="cms-danger contact-form" method="post"><label class="check"><input name="confirm" required type="checkbox"> ${t.confirmDeleteAccount}</label><button class="button button--small" type="submit">${t.deleteAccount}</button></form>`
  const rows = results
    .map((customer) => `<article class="card account__record"><h3>${escapeHtml(customer.name)}${customer.role === 'staff' ? t.staffTag : ''}</h3><p>${escapeHtml(customer.email)}<br><small>${t.joined(escapeHtml(customer.created_at.slice(0, 10)))}</small></p>${actions(customer)}</article>`)
    .join('')
  const help = desk.staff ? '' : `${settings.accounts ? `<p>${t.staffHelp(escapeHtml(`${url.origin}/staff`))}</p>` : `<p role="alert">${t.accountsOff}</p>`}${settings.accounts && canSendEmail(env, settings) ? `<p>${t.resetEmailHelp}</p>` : ''}`
  return office(site, desk, t.nav.customers, `${help}${resetLink ? `<p role="status">${t.resetLinkHelp}<br><code style="overflow-wrap:anywhere">${escapeHtml(`${url.origin}${resetLink}`)}</code></p>` : ''}${rows || `<p>${t.noCustomers}</p>`}`, notice)
}

const settingsForm = (site: SiteRow, desk: Desk, notice?: { error?: string; saved?: string }, draft?: Partial<Settings>) => {
  const settings = { ...(JSON.parse(site.settings) as Settings), ...draft }
  const t = officeText(site)
  const text = (key: keyof Settings, label: string, kind = 'text') => `<label>${label}<input name="${key}" type="${kind}" value="${escapeHtml(settings[key])}"></label>`
  return office(
    site,
    desk,
    t.nav.settings,
    `<form action="${escapeHtml(desk.base)}/settings" class="contact-form cms-form" method="post">
${text('name', t.siteName)}${text('tagline', t.tagline)}${text('language', t.siteLanguage)}
<label>${t.siteLanguages}<input name="languages" pattern="[a-z, -]*" value="${escapeHtml((settings.languages ?? []).join(', '))}"></label>
${extraLanguages(settings).map((code) => `<p><a href="${escapeHtml(desk.base)}/settings?lang=${code}">${escapeHtml(t.translateSite(languageName(code, t.lang)))}</a> · ${escapeHtml(t.leftToTranslate(siteMissing(settings, code).length))}</p>`).join('')}
${text('timeZone', t.timeZone)}
<label>${t.officeLanguage}<select name="officeLanguage">${[['', t.officeLanguageSame], ['en', 'English'], ['th', 'ภาษาไทย']].map(([value, name]) => `<option value="${value}"${value === (settings.officeLanguage === 'auto' ? '' : (settings.officeLanguage ?? '')) ? ' selected' : ''}>${name}</option>`).join('')}</select></label>
<label>${t.style}<select name="style">${siteStyles.map((style) => `<option${style === settings.style ? ' selected' : ''}>${style}</option>`).join('')}</select></label>
${(['headingFont', 'bodyFont'] as const).map((key) => `<label>${key === 'headingFont' ? 'Heading font' : 'Body font'}<select name="${key}"><option value="">From the style</option>${siteFontNames.map((font) => `<option${font === settings[key] ? ' selected' : ''}>${font}</option>`).join('')}</select></label>`).join('\n')}
${text('accent', t.accent, 'color').replace('value=""', 'value="#1f4d3a"')}${text('background', t.background, 'color').replace('value=""', 'value="#fbfaf6"')}${text('text', t.textColour, 'color').replace('value=""', 'value="#16201b"')}
<label class="check"><input name="accounts" type="checkbox"${settings.accounts ? ' checked' : ''}> ${t.accounts}</label>
<label class="check"><input name="statistics" type="checkbox"${settings.statistics === false ? '' : ' checked'}> ${t.stats.setting}</label>
<fieldset class="cms-block"><legend>${t.shop}</legend>
<label class="check"><input name="cart" type="checkbox"${settings.cart ? ' checked' : ''}> ${t.cart}</label>
<label class="check"><input name="cartMembersOnly" type="checkbox"${settings.cartMembersOnly ? ' checked' : ''}> ${t.cartMembersOnly}</label>
<label class="check"><input name="payTransfer" type="checkbox"${settings.payTransfer ? ' checked' : ''}> ${t.payTransfer}</label>
<label>${t.transferDetails}<textarea maxlength="1000" name="transferDetails" rows="3">${escapeHtml(settings.transferDetails)}</textarea></label>
<label class="check"><input name="payCod" type="checkbox"${settings.payCod ? ' checked' : ''}> ${t.payCod}</label>
<label class="check"><input name="payPromptPay" type="checkbox"${settings.payPromptPay ? ' checked' : ''}> ${t.payPromptPay}</label>
<label>${t.promptPayId}<input autocomplete="off" inputmode="numeric" maxlength="40" name="promptPayId" value="${escapeHtml(settings.promptPayId)}"></label>
<label>${t.promptPayName}<input maxlength="80" name="promptPayName" value="${escapeHtml(settings.promptPayName)}"></label>
<p>${t.promptPayHelp}</p>
<label>${t.shippingFee}<input min="0" name="shippingFee" step="any" type="number" value="${escapeHtml(settings.shippingFee)}"></label>
<label>${t.freeShippingOver}<input min="0" name="freeShippingOver" step="any" type="number" value="${escapeHtml(settings.freeShippingOver)}"></label>
<label>${t.currency}<input maxlength="3" name="currency" value="${escapeHtml(settings.currency)}"></label>
<label class="check"><input name="payCard" type="checkbox"${settings.payCard ? ' checked' : ''}> ${t.payCard}</label>
<p>${t.stripeHelp}</p>
</fieldset>
<label>${t.menu}<textarea name="nav" rows="5">${escapeHtml((settings.nav ?? []).map((item) => `${item.label} | ${item.href}`).join('\n'))}</textarea></label>
${text('headerButtonLabel', t.headerButtonLabel)}${text('headerButtonHref', t.headerButtonHref)}
<label>${t.footerText}<textarea name="footerText" rows="3">${escapeHtml(settings.footerText)}</textarea></label>
${text('email', t.email, 'email')}${text('phone', t.phone)}<label>${t.address}<textarea name="address" rows="2">${escapeHtml(settings.address)}</textarea></label>
<fieldset class="cms-block"><legend>${t.emailHeading}</legend>
<p>${t.emailHelp}</p>
${text('emailFrom', t.emailFrom, 'email')}${text('notifyEmail', t.notifyEmail, 'email')}
</fieldset>
<label>${t.customCss}<textarea name="customCss" rows="6">${escapeHtml(settings.customCss)}</textarea></label>
<button class="button" type="submit">${t.saveSettings}</button></form>`,
    notice,
  )
}

async function saveSettings(request: Request, env: Env, url: URL, site: SiteRow, desk: Desk) {
  const form = await request.formData()
  const draft: Record<string, unknown> = {
    allowedOrigins: (JSON.parse(site.settings) as Settings).allowedOrigins,
    githubRepo: (JSON.parse(site.settings) as Settings).githubRepo,
    // Set on the News page, so this form keeps them as they are.
    newsDailyLimit: (JSON.parse(site.settings) as Settings).newsDailyLimit,
    newsletter: (JSON.parse(site.settings) as Settings).newsletter,
    accounts: form.get('accounts') === 'on',
    cart: form.get('cart') === 'on',
    cartMembersOnly: form.get('cartMembersOnly') === 'on',
    payCard: form.get('payCard') === 'on',
    payCod: form.get('payCod') === 'on',
    payPromptPay: form.get('payPromptPay') === 'on',
    payTransfer: form.get('payTransfer') === 'on',
    statistics: form.get('statistics') === 'on',
  }
  const fee = String(form.get('shippingFee') ?? '').trim()
  if (fee) draft.shippingFee = Number(fee)
  const freeOver = String(form.get('freeShippingOver') ?? '').trim()
  if (freeOver) draft.freeShippingOver = Number(freeOver)
  for (const key of ['name', 'tagline', 'language', 'officeLanguage', 'timeZone', 'style', 'headingFont', 'bodyFont', 'accent', 'background', 'text', 'headerButtonLabel', 'headerButtonHref', 'footerText', 'email', 'emailFrom', 'notifyEmail', 'phone', 'address', 'customCss', 'transferDetails', 'currency', 'promptPayId', 'promptPayName']) {
    const value = String(form.get(key) ?? '').trim()
    if (value) draft[key] = value
  }
  const languages = [...new Set(String(form.get('languages') ?? '').split(/[\s,]+/).map((code) => code.trim().toLowerCase()).filter(Boolean))]
  if (languages.length) draft.languages = languages
  draft.nav = String(form.get('nav') ?? '')
    .split('\n')
    .map((line) => line.split('|').map((part) => part.trim()))
    .filter(([label, href]) => label && href)
    .map(([label, href]) => ({ href, label }))
  const t = officeText(site)
  // A wrong digit would send customers' money nowhere, so say exactly what is wrong, in the owner's language.
  if (draft.promptPayId && !validPromptPayId(draft.promptPayId)) return settingsForm(site, desk, { error: t.promptPayIdBad }, draft as Partial<Settings>)
  const parsed = z.object(settingsShape).safeParse(draft)
  if (!parsed.success || !draft.name) return settingsForm(site, desk, { error: parsed.success ? t.needName : t.notSaved(firstProblem(parsed.error)) }, draft as Partial<Settings>)
  // Translations of the menu and footer have their own page, so this form keeps them. The main language is the first of the languages.
  const next = { ...parsed.data, translations: (JSON.parse(site.settings) as Settings).translations } as Settings
  if (extraLanguages(next).length) next.language = mainLanguage(next)
  await env.DB.prepare("UPDATE sites SET settings = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(JSON.stringify(next), site.id).run()
  // Scheduled automations run on the site's clock, so a new time zone moves their next runs.
  if (zoneOf(parsed.data) !== zoneOf(JSON.parse(site.settings) as Settings)) await reschedule(env, site.id)
  return see(url, `${desk.base}/settings?saved=1`)
}

/** Staff are recognised by their login cookie, so a change must come from a page of this site. SameSite=Lax already stops most cross-site posts. This also stops the rest. */
const fromThisSite = (request: Request, url: URL) => {
  const origin = request.headers.get('origin')
  if (origin && origin !== 'null') return origin === url.origin
  return request.headers.get('sec-fetch-site') === 'same-origin'
}

/** Lets a logged-in staff member into /staff, or says why not. Visitors are sent to log in, and other customers find nothing here. */
export async function staffEntry(request: Request, env: Env, url: URL, working: SiteRow): Promise<Desk | Response> {
  const site = liveSite(working)
  if (!(JSON.parse(site.settings) as Settings).accounts) return notFound()
  const customer = await getCustomer(request, env, site.id)
  if (!customer) return request.method === 'POST' ? notFound() : see(url, '/login?next=/staff')
  if (customer.role !== 'staff') return notFound()
  const desk = staffDesk({ ...customer, permissions: await staffPermissions(env, customer.id) })
  const t = officeText(working)
  if (request.method === 'POST' && !fromThisSite(request, url)) return office(working, desk, t.staffRefusedTitle, `<p>${t.staffOtherSite}</p>`, undefined, 403)
  return desk
}

/** Whether a staff member may open this address of the back office. Anything not named here is for the owner alone. */
export function staffMay(staff: StaffMember, post: boolean, area?: string, id?: string, action?: string, extra?: string) {
  const has = (need: StaffArea) => staff.permissions.includes(need)
  if (!area) return !post
  if (area === 'orders') return has('orders')
  if (area === 'items' || area === 'media') return has('products')
  if (area === 'pages' || area === 'page' || area === 'preview') return has('pages')
  if (area === 'publish') return has('publish')
  if (area === 'entry') return has('messages')
  if (area === 'customers') return has('customers') && !post
  if (area === 'stats') return has('stats') && !post
  // Approvers are named by the flow, not by an area. The page and every decision check the person themselves.
  if (area === 'approvals') return true
  // Drafts and their preview only. Testing, sending, the people and their addresses stay with the owner.
  if (area === 'news') return has('news') && (post ? id === 'campaign' && !extra && (!action || /^\d{1,12}$/.test(action)) : !id || (id === 'campaign' && /^\d{1,12}$/.test(action ?? '') && (!extra || extra === 'preview')))
  // Records only. Creating or deleting a table stays with the owner, and so does changing its fields, which the data area checks itself.
  if (area === 'data') return has('data') && !(post && (!id || (action === 'delete' && !extra)))
  return false
}

/** The back office, for the owner through their secret link, or for staff through /staff with the areas the owner gave them. */
export async function handleOffice(request: Request, env: Env, url: URL, site: SiteRow, desk: Desk, parts: string[]) {
  const post = request.method === 'POST'
  if (!post && request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
  const t = officeText(site)
  if (Number(request.headers.get('content-length') || 0) > maxOfficeBytes) return new Response(t.tooLarge, { status: 413 })
  const saved = url.searchParams.has('saved') ? { saved: t.saved } : undefined
  const [area, id, action, extra] = parts
  const owner = desk.base
  // Checked here, before any page or change, so hiding a menu entry is never the only thing in the way.
  if (desk.staff && !staffMay(desk.staff, post, area, id, action, extra)) return office(site, desk, t.staffRefusedTitle, `<p>${t.staffRefused}</p>`, undefined, 403)
  // Capability URLs are unguessable. A signed-in owner instead needs the same
  // browser origin for every write, so another site cannot submit their forms.
  if (desk.accountOwner && !desk.code && post && !fromThisSite(request, url)) return office(site, desk, t.staffRefusedTitle, `<p>${t.staffOtherSite}</p>`, undefined, 403)

  if (!area) return post ? notFound() : overview(env, url, site, desk)

  const platform = handlePlatform(request, env, url, site, desk, area, id, action, extra, saved)
  if (platform) return platform
  // Automations stay the owner's alone: staffMay refuses the area, and this checks again.
  if (area === 'news') return handleNewsOffice(request, env, url, site, desk, id, action, extra, saved)
  if (area === 'automations' && !extra && !desk.staff) return handleAutomationsOffice(request, env, url, site, desk, id, action, saved)
  if (area === 'approvals') return handleApprovalsOffice(request, env, url, site, desk, id, action, extra, saved)

  if (area === 'entry' && post && /^\d+$/.test(id ?? '') && !action) {
    const form = await request.formData().catch((): null => null)
    const status = form?.get('status')
    if (status === 'delete') {
      if (form?.get('confirm') !== 'on') return see(url, owner)
      await env.DB.prepare('DELETE FROM entries WHERE id = ? AND site_id = ?').bind(Number(id), site.id).run()
    } else if (typeof status === 'string' && statuses.includes(status)) {
      await env.DB.prepare('UPDATE entries SET status = ? WHERE id = ? AND site_id = ?').bind(status, Number(id), site.id).run()
    }
    return see(url, owner)
  }

  if (area === 'orders') {
    if (!id) return post ? notFound() : ordersPage(env, site, desk)
    if (!post || action || !/^\d+$/.test(id)) return notFound()
    const status = (await request.formData().catch((): null => null))?.get('status')
    if (typeof status === 'string' && orderStatuses.includes(status)) {
      const result = await setOrderStatus(env, site.id, Number(id), status, { actor: desk.staff ? 'staff' : 'owner', origin: url.origin, staff: desk.staff })
      if (result === 'no-stock') return ordersPage(env, site, desk, t.noStock)
    }
    return see(url, `${owner}/orders`)
  }

  if (area === 'stats') return post || id ? notFound() : statsPage(env, url, site, desk)

  if (area === 'pages' && !id) return post ? addPage(request, env, url, site, desk) : pagesList(env, site, desk)
  if (area === 'pages' && id && action === 'duplicate' && !extra && post) return duplicatePage(request, env, url, site, desk, id)

  if (area === 'page' && id) {
    // The same page in an extra language, from the tabs at the top of its editor.
    if (!action) {
      const other = await pageInLanguage(request, env, url, site, desk, id, saved)
      if (other) return other
    }
    const page = await env.DB.prepare('SELECT title, description, published, blocks, translations FROM pages WHERE site_id = ? AND slug = ?').bind(site.id, id).first<{ blocks: string; description: string; published: number; title: string; translations: string }>()
    if (!page) return notFound()
    if (action === 'restore' && post && /^\d+$/.test(extra ?? '')) {
      if ((await request.formData()).get('confirm') !== 'on') return pageEditor(env, site, desk, id, { ...page, blocks: JSON.parse(page.blocks) as Block[], published: Boolean(page.published) }, { error: t.restorePageNeedsConfirm })
      if (!(await restorePageRevision(env, site.id, id, Number(extra)))) return notFound()
      return see(url, `${owner}/page/${id}?saved=1`)
    }
    if (action === 'delete' && post && id !== 'home') {
      const form = await request.formData()
      if (form.get('confirm') === 'on') await env.DB.prepare('DELETE FROM pages WHERE site_id = ? AND slug = ?').bind(site.id, id).run()
      return see(url, `${owner}/pages`)
    }
    if (action) return notFound()
    if (post) return savePageFromForm(request, env, url, site, desk, id)
    return pageEditor(env, site, desk, id, { blocks: JSON.parse(page.blocks) as Block[], description: page.description, published: Boolean(page.published), title: page.title, translations: page.translations }, saved)
  }

  if (area === 'items') {
    if (!id) return post ? saveItemFromForm(request, env, url, site, desk) : itemsPage(env, site, desk, saved)
    if (/^\d+$/.test(id) && !action && url.searchParams.has('lang')) return itemInLanguage(request, env, url, site, desk, Number(id), saved)
    if (!/^\d+$/.test(id) || !post) return notFound()
    if (!action) return saveItemFromForm(request, env, url, site, desk, Number(id))
    if (action === 'delete') {
      const form = await request.formData()
      if (form.get('confirm') === 'on') await env.DB.prepare('DELETE FROM items WHERE id = ? AND site_id = ?').bind(Number(id), site.id).run()
      return see(url, `${owner}/items`)
    }
    return notFound()
  }

  if (area === 'media') {
    if (!id) {
      if (!post) return mediaPage(env, site, desk, saved)
      const file = (await request.formData()).get('file')
      if (!(file instanceof File) || !file.size) return mediaPage(env, site, desk, { error: t.chooseImage })
      const stored = await saveImage(env, site.id, file)
      return stored.error ? mediaPage(env, site, desk, { error: stored.error }) : see(url, `${owner}/media?saved=1`)
    }
    if (post && action === 'delete' && /^\d+$/.test(id)) {
      await env.DB.prepare('DELETE FROM media WHERE id = ? AND site_id = ?').bind(Number(id), site.id).run()
      return see(url, `${owner}/media`)
    }
    return notFound()
  }

  if (area === 'customers') {
    if (!id) return post ? notFound() : customersPage(env, url, site, desk, saved)
    // Changing accounts is for the owner alone.
    if (!post || !/^\d+$/.test(id) || !desk.accountOwner) return notFound()
    const customer = await env.DB.prepare('SELECT id, role FROM customers WHERE id = ? AND site_id = ?').bind(Number(id), site.id).first<{ id: number; role: string }>()
    if (!customer) return notFound()
    if (customer.id === site.owner_customer_id) return notFound()
    if (action === 'reset') {
      return customersPage(env, url, site, desk, undefined, await createResetLink(env, customer.id))
    }
    if (action === 'role') {
      const role = (await request.formData()).get('role')
      if (role === 'staff' || role === 'member') await setStaff(env, site.id, customer.id, role)
      return see(url, `${owner}/customers`)
    }
    if (action === 'access' && customer.role === 'staff') {
      await setStaff(env, site.id, customer.id, 'staff', (await request.formData()).getAll('area').map(String))
      return see(url, `${owner}/customers?saved=1`)
    }
    if (action === 'delete') {
      const form = await request.formData()
      if (form.get('confirm') === 'on') await env.DB.prepare('DELETE FROM customers WHERE id = ?').bind(customer.id).run()
      return see(url, `${owner}/customers`)
    }
    return notFound()
  }

  // Everything below is for the owner alone.
  if (!desk.accountOwner) return notFound()

  if (area === 'updates' && !id) {
    const settings = JSON.parse(site.settings) as Settings
    if (post) {
      const repo = String((await request.formData().catch((): null => null))?.get('repo') ?? '').trim()
      if (!repoPattern.test(repo)) return office(site, desk, t.nav.updates, updatesBody(desk.base, settings.githubRepo, await latestRelease(), t), { error: t.badRepo })
      await env.DB.prepare("UPDATE sites SET settings = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(JSON.stringify({ ...settings, githubRepo: repo }), site.id).run()
      return see(url, `${owner}/updates?saved=1`)
    }
    return office(site, desk, t.nav.updates, updatesBody(desk.base, settings.githubRepo, await latestRelease(), t), saved)
  }

  if (area === 'settings' && !id) {
    const other = await settingsInLanguage(request, env, url, site, desk, saved)
    if (other) return other
    return post ? saveSettings(request, env, url, site, desk) : settingsForm(site, desk, saved)
  }
  if (area === 'starters' && !id) return handleStarters(request, env, url, site, desk)
  return notFound()
}
