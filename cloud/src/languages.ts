import type { Block, Item, Settings, SiteRow, SiteTranslation } from './types'

// One site in more than one language. The main language stays at the usual addresses and is the only copy a single-language site has.
// Each extra language lives under its own prefix, such as /en/about, and its words are stored beside the original:
// a page's in pages.translations, a product's in items.translations, and the menu, tagline and footer in settings.translations.
// Anything not translated yet shows the main language's words, so a page never breaks. Only the owner's preview marks it.

export const languageCodePattern = /^[a-z]{2}(-[a-z]{2})?$/

export type PageTranslation = { blocks?: Block[]; description?: string; title?: string }
/** Option names are keyed by the option's name in the main language, so they survive the product being saved again. */
export type ItemTranslation = { body?: string; category?: string; image_alt?: string; link_label?: string; title?: string; variants?: Record<string, string> }

export const siteTranslationKeys = ['name', 'tagline', 'footerText', 'headerButtonLabel', 'transferDetails'] as const

/** The site's languages, main one first, or nothing when it has only one. */
export function siteLanguages(settings: Settings): string[] {
  const list = Array.isArray(settings.languages) ? [...new Set(settings.languages.filter((code) => typeof code === 'string' && languageCodePattern.test(code)))] : []
  return list.length > 1 ? list : []
}

export const mainLanguage = (settings: Settings) => siteLanguages(settings)[0] ?? settings.language ?? 'en'
export const extraLanguages = (settings: Settings) => siteLanguages(settings).slice(1)

/** The address prefix of the copy these settings show, such as /en, or nothing for the main language. */
export const languagePrefix = (settings: Settings) => (settings.viewLanguage ? `/${settings.viewLanguage}` : '')

/** A language's own name for itself, such as English or ไทย, or its name in another language. */
export function languageName(code: string, inLanguage = code) {
  try {
    const name = new Intl.DisplayNames([inLanguage], { type: 'language' }).of(code)
    if (name && name !== code) return name.charAt(0).toLocaleUpperCase(inLanguage) + name.slice(1)
  } catch {
    // An unknown code shows as itself.
  }
  return code.toUpperCase()
}

export const readJson = <T>(value: unknown): Partial<Record<string, T>> => {
  if (typeof value !== 'string' || !value) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Partial<Record<string, T>>) : {}
  } catch {
    return {}
  }
}

/** The settings visitors of one language see: its words where they exist, the main language's elsewhere. */
export function localizeSettings(settings: Settings, language: null | string): Settings {
  const languages = siteLanguages(settings)
  if (!languages.length) return settings
  const { viewLanguage: _view, ...plain } = settings
  if (!language || language === languages[0] || !languages.includes(language)) return { ...plain, language: languages[0] }
  const words = settings.translations?.[language] ?? {}
  const pick = (key: (typeof siteTranslationKeys)[number]) => (typeof words[key] === 'string' && words[key]?.trim() ? words[key] : settings[key])
  return {
    ...plain,
    footerText: pick('footerText'),
    headerButtonLabel: pick('headerButtonLabel'),
    language,
    name: pick('name') ?? settings.name,
    nav: settings.nav?.map((item) => ({ ...item, label: words.nav?.[item.href]?.trim() || item.label })),
    tagline: pick('tagline'),
    transferDetails: pick('transferDetails'),
    viewLanguage: language,
  }
}

export const localizeSite = (site: SiteRow, language: null | string): SiteRow => {
  const settings = JSON.parse(site.settings) as Settings
  return siteLanguages(settings).length ? { ...site, settings: JSON.stringify(localizeSettings(settings, language)) } : site
}

// The words in a block. Everything else, such as photos, links, form field names and collections, always comes from the main language.
const textKeys = new Set(['answer', 'body', 'buttonLabel', 'caption', 'errorMessage', 'eyebrow', 'features', 'heading', 'imageAlt', 'intro', 'label', 'note', 'price', 'question', 'quote', 'role', 'sentMessage', 'text', 'title', 'value'])
const listKeys = new Set(['fields', 'images', 'items', 'members', 'plans'])
// A person's or plan's name is words, but a form's or a field's name is what entries are saved under.
export const isText = (key: string, list?: string) => (key === 'name' ? ['items', 'members', 'plans'].includes(list ?? '') : key === 'options' ? list === 'fields' : textKeys.has(key))
const isRow = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const filled = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''
const sameOptions = (original: unknown, given: unknown): given is string[] => Array.isArray(original) && Array.isArray(given) && given.length === original.length && given.every(filled)

/** One block in another language: its words over the original, where they exist. */
function overlay(original: Record<string, any>, words: unknown, list?: string, found?: { missing: string[]; path: string }) {
  const given = isRow(words) ? words : {}
  const out: Record<string, any> = { ...original }
  for (const [key, value] of Object.entries(original)) {
    const at = found ? `${found.path}.${key}` : ''
    if (listKeys.has(key) && Array.isArray(value)) {
      const rows = Array.isArray(given[key]) ? (given[key] as unknown[]) : []
      out[key] = value.map((row, index) => (isRow(row) ? overlay(row, rows[index], key, found && { missing: found.missing, path: `${at}.${index}` }) : row))
    } else if (isText(key, list)) {
      if (key === 'options' ? sameOptions(value, given[key]) : filled(value) && filled(given[key])) out[key] = given[key]
      else if ((key === 'options' ? Array.isArray(value) && value.length : filled(value)) && found) found.missing.push(at)
    }
  }
  return out
}

/** Only the words of blocks given in another language, lined up with the main language's blocks. */
function wordsOf(original: Record<string, any>, given: unknown, list?: string) {
  if (!isRow(given)) return undefined
  const out: Record<string, any> = {}
  for (const [key, value] of Object.entries(original)) {
    if (listKeys.has(key) && Array.isArray(value)) {
      const rows = Array.isArray(given[key]) ? (given[key] as unknown[]) : []
      const kept = value.map((row, index) => (isRow(row) ? (wordsOf(row, rows[index], key) ?? {}) : {}))
      if (kept.some((row) => Object.keys(row).length)) out[key] = kept
    } else if (isText(key, list)) {
      if (key === 'options' ? sameOptions(value, given[key]) : filled(given[key]) && typeof value === 'string') out[key] = key === 'options' ? (given[key] as string[]).map((option) => option.trim().slice(0, 80)) : (given[key] as string).trim().slice(0, 8000)
    }
  }
  return out
}

/** Keeps only the words of a page given in another language. Says what is wrong when its blocks don't match the main page. */
export function pageWords(blocks: Block[], given: unknown[]): { blocks: Block[] } | { error: string } {
  if (given.length !== blocks.length) return { error: `The page has ${blocks.length} blocks in its main language, but ${given.length} were given. Keep the same blocks in the same order, and only change the words.` }
  const out: Block[] = []
  for (const [index, block] of blocks.entries()) {
    const other = given[index]
    if (!isRow(other) || other.type !== block.type) return { error: `Block ${index + 1} is a ${block.type} block in the main language. Keep the same blocks in the same order, and only change the words.` }
    out.push({ ...wordsOf(block, other), type: block.type })
  }
  return { blocks: out }
}

/** A page in one language, with the main language's words wherever a translation is missing, and where those are. */
export function localizePage<Page extends { blocks: Block[]; description: string; title: string; translations?: null | string }>(page: Page, language: null | string) {
  const words = language ? readJson<PageTranslation>(page.translations)[language] : undefined
  const missing: string[] = []
  const untranslated = new Set<number>()
  if (!language) return { ...page, missing, untranslated }
  const given = Array.isArray(words?.blocks) ? words.blocks : []
  const blocks = page.blocks.map((block, index) => {
    const other = given[index]
    const before = missing.length
    const merged = overlay(block, isRow(other) && other.type === block.type ? other : undefined, undefined, { missing, path: `blocks.${index}` }) as Block
    if (missing.length > before) untranslated.add(index)
    return merged
  })
  if (!filled(words?.title)) missing.unshift('title')
  if (!filled(words?.description)) missing.unshift('description')
  return { ...page, blocks, description: filled(words?.description) ? words.description : page.description, missing, title: filled(words?.title) ? words.title : page.title, untranslated }
}

export const itemTextKeys = ['title', 'body', 'category', 'link_label', 'image_alt'] as const

/** A product in one language. Order lines keep the words the customer saw. */
export function localizeItem<Thing extends Item>(item: Thing, language: null | string): Thing {
  if (!language) return item
  const words = readJson<ItemTranslation>(item.translations)[language]
  if (!words) return item
  const out = { ...item }
  for (const key of itemTextKeys) if (filled(words[key]) && filled(item[key])) out[key] = words[key]
  if (item.variants) out.variants = item.variants.map((variant) => ({ ...variant, name: words.variants?.[variant.name]?.trim() || variant.name }))
  return out
}

/** What of a product is not in this language yet. */
export function itemMissing(item: Item, language: string) {
  const words = readJson<ItemTranslation>(item.translations)[language] ?? {}
  return [...itemTextKeys.filter((key) => filled(item[key]) && !filled(words[key])), ...(item.variants ?? []).filter((variant) => !filled(words.variants?.[variant.name])).map((variant) => `variant ${variant.name}`)]
}

/** What of the menu, tagline and footer is not in this language yet. */
export function siteMissing(settings: Settings, language: string) {
  const words = settings.translations?.[language] ?? {}
  return [...siteTranslationKeys.filter((key) => key !== 'name' && filled(settings[key]) && !filled(words[key])), ...(settings.nav ?? []).filter((item) => !filled(words.nav?.[item.href])).map((item) => `menu "${item.label}"`)]
}

// Addresses that are the same in every language: files, the owner's and staff's back office, and outside services.
const shared = /^\/(admin|media|fonts|owner|staff|api|mcp|frame|stripe|login\/google)(\/|$|[?#])|^\/(site\.css|sitemap\.xml|robots\.txt|favicon\.ico)([?#]|$)/

/** The address of a path in a language, such as /about becoming /en/about. */
export function inLanguage(path: string, prefix: string) {
  if (!prefix || !path.startsWith('/') || path.startsWith('//') || shared.test(path) || path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`) || path.startsWith(`${prefix}#`)) return path
  return `${prefix}${path}`
}

/** Keeps a visitor in their language: links, forms and redirects of a page made for the main language get the prefix. */
export async function keepLanguage(response: Response, prefix: string, origin: string) {
  const location = response.headers.get('Location')
  const isPage = (response.headers.get('Content-Type') ?? '').startsWith('text/html')
  const moves = Boolean(location?.startsWith(`${origin}/`))
  if (!moves && !isPage) return response
  const headers = new Headers(response.headers)
  if (moves) headers.set('Location', `${origin}${inLanguage(location!.slice(origin.length), prefix)}`)
  const body = isPage
    ? (await response.text())
        .replace(/(\s(?:href|action))="(\/[^"]*)"/g, (_match, attribute: string, path: string) => `${attribute}="${inLanguage(path, prefix)}"`)
        .replace(/(name="next" type="hidden" value=")(\/[^"]*)"/g, (_match, start: string, path: string) => `${start}${inLanguage(path, prefix)}"`)
    : response.body
  return new Response(body, { headers, status: response.status, statusText: response.statusText })
}

/** The address of the same page in each language, for hreflang links, the sitemap and the language switch. */
export function alternates(settings: Settings, origin: string, path: string) {
  return siteLanguages(settings).map((code, index) => ({ code, href: `${origin}${index ? `/${code}${path}` : path}` }))
}
