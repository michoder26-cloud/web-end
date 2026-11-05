import { catalog, office } from './cms'
import type { Desk, Notice, Spec } from './cms'
import { escapeHtml, notFound, see } from './http'
import { extraLanguages, isText, itemMissing, itemTextKeys, languageName, localizePage, mainLanguage, pageWords, readJson, siteMissing, siteTranslationKeys } from './languages'
import type { ItemTranslation, PageTranslation } from './languages'
import { officeText } from './office-words'
import type { OfficeWords } from './office-words'
import { rememberPage } from './page-history'
import type { Block, Env, Item, Settings, SiteRow, Variant } from './types'

// The back office's language tabs: the same page, product or menu, in each extra language of the site.
// Each box shows the main language's words above it. An empty box shows those words to visitors.

const original = (t: OfficeWords, text: string) => `<small class="cms-original">${t.original} ${escapeHtml(text)}</small>`

/** The tabs at the top of an editor: the main language, then each extra one with what is left to translate. */
export function languageTabs(site: SiteRow, href: (language: string | null) => string, current: null | string, left?: (language: string) => number) {
  const settings = JSON.parse(site.settings) as Settings
  const extra = extraLanguages(settings)
  if (!extra.length) return ''
  const t = officeText(site)
  const tab = (language: null | string, label: string) => `<a${language === current ? ' aria-current="page"' : ''} href="${escapeHtml(href(language))}">${escapeHtml(label)}</a>`
  return `<nav aria-label="${t.languages}" class="cms-actions cms-languages">${tab(null, t.mainTag(languageName(mainLanguage(settings), t.lang)))}${extra.map((language) => tab(language, `${languageName(language, t.lang)}${left ? ` · ${t.leftToTranslate(left(language))}` : ''}`)).join('')}</nav>`
}

const box = (name: string, label: string, main: string, value: unknown, long: boolean, t: OfficeWords) =>
  `<label>${escapeHtml(label)}${original(t, main)}${long ? `<textarea name="${escapeHtml(name)}" rows="3">${escapeHtml(value)}</textarea>` : `<input name="${escapeHtml(name)}" value="${escapeHtml(value)}">`}</label>`

/** The boxes for one field's words, or nothing when the field holds no words. */
function wordsInput(name: string, field: Spec, main: unknown, given: unknown, t: OfficeWords, list?: string): string {
  if (field.kind === 'list') {
    const rows = Array.isArray(main) ? (main as Record<string, unknown>[]) : []
    const other = Array.isArray(given) ? (given as Record<string, unknown>[]) : []
    const inner = rows.map((row, index) => `<div class="cms-row">${(field.fields ?? []).map((sub) => wordsInput(`${name}.${index}.${sub.key}`, sub, row?.[sub.key], other[index]?.[sub.key], t, field.key)).join('')}</div>`).join('')
    return inner.includes('<label') ? `<fieldset class="cms-list"><legend>${escapeHtml(t.label(field.label))}</legend>${inner}</fieldset>` : ''
  }
  if (!isText(field.key, list)) return ''
  if (field.kind === 'lines') return Array.isArray(main) && main.length ? box(name, t.label(field.label), main.join(' / '), Array.isArray(given) ? given.join('\n') : '', true, t) : ''
  return typeof main === 'string' && main.trim() ? box(name, t.label(field.label), main, given, field.kind === 'long', t) : ''
}

/** Reads the boxes back into blocks shaped like the main page's. */
function readWords(form: FormData, name: string, field: Spec, main: unknown, list?: string): unknown {
  if (field.kind === 'list') return Array.isArray(main) ? main.map((row, index) => Object.fromEntries((field.fields ?? []).map((sub) => [sub.key, readWords(form, `${name}.${index}.${sub.key}`, sub, (row as Record<string, unknown>)?.[sub.key], field.key)]))) : undefined
  if (!isText(field.key, list)) return undefined
  const value = String(form.get(name) ?? '').trim()
  return field.kind === 'lines' ? value.split('\n').map((line) => line.trim()).filter(Boolean) : value
}

async function pageWordsEditor(site: SiteRow, desk: Desk, slug: string, language: string, page: { blocks: string; description: string; title: string; translations: string }, notice?: Notice) {
  const t = officeText(site)
  const settings = JSON.parse(site.settings) as Settings
  const blocks = JSON.parse(page.blocks) as Block[]
  const stored = readJson<PageTranslation>(page.translations)[language] ?? {}
  const given = Array.isArray(stored.blocks) ? stored.blocks : []
  const { missing } = localizePage({ ...page, blocks }, language)
  const action = `${desk.base}/page/${slug}?lang=${language}`
  const sections = blocks
    .map((block, index) => {
      const entry = catalog[block.type]
      const other: Record<string, unknown> = given[index]?.type === block.type ? given[index] : {}
      const inner = entry ? entry.fields.map((field) => wordsInput(`b${index}.${field.key}`, field, block[field.key], other[field.key], t)).join('') : ''
      return inner ? `<fieldset class="cms-block"><legend>${escapeHtml(t.label(entry.label))}</legend>${inner}</fieldset>` : ''
    })
    .join('')
  const name = languageName(language, t.lang)
  return office(
    site,
    desk,
    t.editPage(page.title),
    `${languageTabs(site, (code) => `${desk.base}/page/${slug}${code ? `?lang=${code}` : ''}`, language, (code) => localizePage({ ...page, blocks }, code).missing.length)}
<p>${escapeHtml(t.translateIntro(name, languageName(mainLanguage(settings), t.lang)))} ${escapeHtml(t.leftToTranslate(missing.length))}.</p>
<form action="${escapeHtml(action)}" class="contact-form cms-form" lang="${escapeHtml(language)}" method="post">
${box('title', t.pageTitle, page.title, stored.title, false, t)}
${box('description', t.pageDescription, page.description, stored.description, true, t)}
${sections}
<button class="button cms-save" type="submit">${t.saveTranslation}</button></form>`,
    notice,
  )
}

async function savePageWords(request: Request, env: Env, url: URL, site: SiteRow, desk: Desk, slug: string, language: string, page: { blocks: string; translations: string }) {
  const form = await request.formData()
  const blocks = JSON.parse(page.blocks) as Block[]
  const given = blocks.map((block, index) => ({ type: block.type, ...Object.fromEntries((catalog[block.type]?.fields ?? []).map((field) => [field.key, readWords(form, `b${index}.${field.key}`, field, block[field.key])])) }))
  const kept = pageWords(blocks, given)
  if ('error' in kept) return notFound()
  const words = { title: String(form.get('title') ?? '').trim().slice(0, 120), description: String(form.get('description') ?? '').trim().slice(0, 300), blocks: kept.blocks }
  await rememberPage(env, site.id, slug)
  await env.DB.prepare("UPDATE pages SET translations = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE site_id = ? AND slug = ?").bind(JSON.stringify({ ...readJson<PageTranslation>(page.translations), [language]: words }), site.id, slug).run()
  return see(url, `${desk.base}/page/${slug}?lang=${language}&saved=1`)
}

/** A page's language tabs and its editor in an extra language. Returns null when the address is for the main language. */
export async function pageInLanguage(request: Request, env: Env, url: URL, site: SiteRow, desk: Desk, slug: string, notice?: Notice) {
  const language = url.searchParams.get('lang')
  if (!language || !extraLanguages(JSON.parse(site.settings) as Settings).includes(language)) return null
  const page = await env.DB.prepare('SELECT title, description, blocks, translations FROM pages WHERE site_id = ? AND slug = ?').bind(site.id, slug).first<{ blocks: string; description: string; title: string; translations: string }>()
  if (!page) return notFound()
  return request.method === 'POST' ? savePageWords(request, env, url, site, desk, slug, language, page) : pageWordsEditor(site, desk, slug, language, page, notice)
}

/** A product's words in an extra language, from a link beside it on the products page. */
export async function itemInLanguage(request: Request, env: Env, url: URL, site: SiteRow, desk: Desk, id: number, notice?: Notice) {
  const language = url.searchParams.get('lang')
  const settings = JSON.parse(site.settings) as Settings
  if (!language || !extraLanguages(settings).includes(language)) return notFound()
  const item = await env.DB.prepare('SELECT * FROM items WHERE id = ? AND site_id = ?').bind(id, site.id).first<Item>()
  if (!item) return notFound()
  item.variants = (await env.DB.prepare('SELECT * FROM item_variants WHERE item_id = ? ORDER BY sort, id').bind(id).all<Variant>()).results
  const all = readJson<ItemTranslation>(item.translations)
  if (request.method === 'POST') {
    const form = await request.formData()
    const words: ItemTranslation = {}
    const limits: Record<string, number> = { body: 4000, category: 60, image_alt: 200, link_label: 60, title: 160 }
    for (const key of itemTextKeys) {
      const value = String(form.get(key) ?? '').trim().slice(0, limits[key])
      if (value) words[key] = value
    }
    const variants = Object.fromEntries((item.variants ?? []).map((variant, index) => [variant.name, String(form.get(`variant.${index}`) ?? '').trim().slice(0, 60)]).filter(([, name]) => name))
    if (Object.keys(variants).length) words.variants = variants
    await env.DB.prepare("UPDATE items SET translations = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND site_id = ?").bind(JSON.stringify({ ...all, [language]: words }), id, site.id).run()
    return see(url, `${desk.base}/items/${id}?lang=${language}&saved=1`)
  }
  const t = officeText(site)
  const words = all[language] ?? {}
  const labels: Record<(typeof itemTextKeys)[number], [string, boolean]> = { body: [t.itemDescription, true], category: [t.itemCategory, false], image_alt: [t.itemImageAlt, false], link_label: [t.itemLinkLabel, false], title: [t.itemName, false] }
  const boxes = itemTextKeys.filter((key) => item[key]).map((key) => box(key, labels[key][0], item[key], words[key], labels[key][1], t)).join('')
  const options = (item.variants ?? []).map((variant, index) => box(`variant.${index}`, variant.name, variant.name, words.variants?.[variant.name], false, t)).join('')
  const name = languageName(language, t.lang)
  return office(
    site,
    desk,
    item.title,
    `${languageTabs(site, (code) => (code ? `${desk.base}/items/${id}?lang=${code}` : `${desk.base}/items`), language, (code) => itemMissing(item, code).length)}
<p>${escapeHtml(t.translateIntro(name, languageName(mainLanguage(settings), t.lang)))}</p>
<form action="${escapeHtml(`${desk.base}/items/${id}?lang=${language}`)}" class="contact-form cms-form" lang="${escapeHtml(language)}" method="post">${boxes}${options ? `<fieldset class="cms-list"><legend>${t.translateOptions}</legend>${options}</fieldset>` : ''}
<button class="button" type="submit">${t.saveTranslation}</button></form>`,
    notice,
  )
}

/** Links from the products page to each product's words in the extra languages. */
export function itemLanguageLinks(site: SiteRow, desk: Desk, item: Item) {
  const settings = JSON.parse(site.settings) as Settings
  const t = officeText(site)
  const extra = extraLanguages(settings)
  return extra.length ? `<p class="cms-actions">${extra.map((language) => `<a class="button button--small button--ghost" href="${escapeHtml(`${desk.base}/items/${item.id}?lang=${language}`)}">${escapeHtml(t.editIn(languageName(language, t.lang)))} · ${escapeHtml(t.leftToTranslate(itemMissing(item, language).length))}</a>`).join('')}</p>` : ''
}

/** The menu, tagline and footer in an extra language, reached from the settings page. Owner only, like the settings. */
export async function settingsInLanguage(request: Request, env: Env, url: URL, site: SiteRow, desk: Desk, notice?: Notice) {
  const language = url.searchParams.get('lang')
  const settings = JSON.parse(site.settings) as Settings
  if (!language || !extraLanguages(settings).includes(language)) return null
  const t = officeText(site)
  if (request.method === 'POST') {
    const form = await request.formData()
    const words = Object.fromEntries(siteTranslationKeys.map((key) => [key, String(form.get(key) ?? '').trim().slice(0, 1000)]).filter(([, value]) => value))
    const nav = Object.fromEntries((settings.nav ?? []).map((item, index) => [item.href, String(form.get(`nav.${index}`) ?? '').trim().slice(0, 40)]).filter(([, label]) => label))
    const next = { ...settings, translations: { ...settings.translations, [language]: { ...words, ...(Object.keys(nav).length ? { nav } : {}) } } }
    await env.DB.prepare("UPDATE sites SET settings = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(JSON.stringify(next), site.id).run()
    return see(url, `${desk.base}/settings?lang=${language}&saved=1`)
  }
  const words = settings.translations?.[language] ?? {}
  const labels: Record<(typeof siteTranslationKeys)[number], [string, boolean]> = { footerText: [t.footerText, true], headerButtonLabel: [t.headerButtonLabel, false], name: [t.siteName, false], tagline: [t.tagline, false], transferDetails: [t.transferDetails, true] }
  const boxes = siteTranslationKeys.filter((key) => settings[key]).map((key) => box(key, labels[key][0], String(settings[key]), words[key], labels[key][1], t)).join('')
  const menu = (settings.nav ?? []).map((item, index) => box(`nav.${index}`, item.href, item.label, words.nav?.[item.href], false, t)).join('')
  const name = languageName(language, t.lang)
  return office(
    site,
    desk,
    t.translateSite(name),
    `${languageTabs(site, (code) => `${desk.base}/settings${code ? `?lang=${code}` : ''}`, language, (code) => siteMissing(settings, code).length)}
<p>${escapeHtml(t.translateIntro(name, languageName(mainLanguage(settings), t.lang)))}</p>
<form action="${escapeHtml(`${desk.base}/settings?lang=${language}`)}" class="contact-form cms-form" lang="${escapeHtml(language)}" method="post">${boxes}${menu ? `<fieldset class="cms-list"><legend>${t.menu}</legend>${menu}</fieldset>` : ''}
<button class="button" type="submit">${t.saveTranslation}</button></form>`,
    notice,
  )
}
