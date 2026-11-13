import { sha256 } from './auth'
import { loadPageRecords } from './data'
import { loadItems, saveImage } from './items'
import { renderPage } from './render'
import type { Block, Env, Settings, SiteRow } from './types'
import { findWorkingPage } from './versions'
import { safeWebUrl } from './webhooks'

const maxPageBytes = 3_000_000
const maxTextChars = 60_000
const maxListed = 200
// Raise this when the reader finds more or reads differently, so readings an older version saved are read again.
const readerVersion = 3
// Cloudflare's free plan allows 50 outside requests per visit, so one check re-reads only some pages and the rest on the next.
const maxRereads = 20
const maxProducts = 500
export const maxRedirects = 2000

const currencySigns: Record<string, string> = { aud: 'A$', cad: 'C$', chf: 'CHF ', eur: '€', gbp: '£', jpy: '¥', thb: '฿', usd: '$' }

const fetchPublic = (target: URL, accept: string) =>
  fetch(target, { headers: { Accept: accept, 'User-Agent': 'web-end-site-mover/1.0 (moving an owner\'s own site)' }, signal: AbortSignal.timeout(10_000) })

/** Wix serves blurred, resized copies of photos. This finds the original file. */
export function originalImage(value: string) {
  const wix = /^(https?:)?\/\/static\.wixstatic\.com\/media\/([^/?#]+)/.exec(value)
  if (wix) return `https://static.wixstatic.com/media/${wix[2]}`
  return /^[a-z0-9_]+~mv2(_d_\d+_\d+_s_\d+_\d+)?\.[a-z]+$/i.test(value) ? `https://static.wixstatic.com/media/${value}` : value
}

const namedEntities: Record<string, string> = { amp: '&', apos: "'", bull: '•', copy: '©', euro: '€', gt: '>', hellip: '…', laquo: '«', ldquo: '“', lsquo: '‘', lt: '<', mdash: '—', middot: '·', nbsp: ' ', ndash: '–', pound: '£', quot: '"', raquo: '»', rdquo: '”', reg: '®', rsquo: '’', trade: '™' }

const decode = (value: string) =>
  value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] !== '#') return namedEntities[code.toLowerCase()] ?? match
    const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match
  })

const clean = (value: string) => decode(value).replace(/ /g, ' ').replace(/​/g, '').replace(/\s+/g, ' ').trim()

/** Lists a site's pages from its sitemap, following the sub-lists Wix uses for pages, products and blog posts. */
export async function scanWebsite(env: Env, start: URL) {
  const path = start.pathname.replace(/\/$/, '')
  const candidates = [...new Set([`${start.origin}${path}/sitemap.xml`, `${start.origin}/sitemap.xml`])]
  const groups: Record<string, string[]> = {}
  let total = 0
  const locations = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => clean(match[1]))
  for (const candidate of candidates) {
    const first = await fetchPublic(new URL(candidate), 'application/xml').catch((): null => null)
    if (!first?.ok) continue
    const xml = await first.text()
    if (!xml.includes('<loc>')) continue
    const sources: [string, string][] = xml.includes('<sitemapindex') ? [] : [['pages', xml]]
    if (xml.includes('<sitemapindex')) {
      for (const child of locations(xml).slice(0, 8)) {
        const target = safeWebUrl(env, child)
        const response = target ? await fetchPublic(target, 'application/xml').catch((): null => null) : null
        if (response?.ok) sources.push([child.split('/').pop()?.replace(/-?sitemap\.xml$/, '') || 'pages', await response.text()])
      }
    }
    for (const [name, body] of sources) {
      const found = locations(body).slice(0, maxListed)
      groups[name || 'pages'] = found
      total += found.length
    }
    if (total) break
  }
  if (total) return { groups, total, discovery: 'sitemap' as const }

  // Free Wix addresses may expose every menu/product/post link but no sitemap.
  const home = await readWebPage(start)
  if ('error' in home) return { groups, total, discovery: 'none' as const }
  const base = start.pathname.replace(/\/$/, '')
  const found = new Set<string>([start.origin + (base || '/')])
  for (const link of home.links) {
    const url = new URL(link.href)
    if (url.origin !== start.origin || (url.pathname !== base && !url.pathname.startsWith(base + '/'))) continue
    found.add(url.origin + url.pathname)
  }
  const paths = [...found].slice(0, maxListed)
  groups.pages = paths.filter((url) => !/\/(?:product-page|post)\//.test(new URL(url).pathname))
  groups.products = paths.filter((url) => /\/product-page\//.test(new URL(url).pathname))
  groups.posts = paths.filter((url) => /\/post\//.test(new URL(url).pathname))
  return { groups, total: paths.length, discovery: 'home_page_links' as const }
}

const usefulData = new Set(['BreadcrumbList', 'LocalBusiness', 'Offer', 'Organization', 'Product', 'Service', 'Store'])

type PageDesign = { accent?: string; background?: string; buttonText?: string; fonts: string[]; text?: string }
type PageSection = { buttons: string[]; firstLines: string[]; headings: string[]; images: string[]; kind: string; lines: number }
type PageReading = { buttons: string[]; data: unknown[]; description: string; design: PageDesign; headings: { level: number; text: string }[]; images: { alt: string; url: string }[]; links: { href: string; text: string }[]; reviewReason?: string; sections: PageSection[]; text: string[]; title: string; tooFewWords?: boolean; truncated: boolean; url: string }

const maxSections = 40
const maxPerSection = 12
const maxStyleChars = 120_000
const hexFrom = (rgb: string | undefined) => (rgb ? `#${rgb.split(',').map((part) => Number(part).toString(16).padStart(2, '0')).join('')}` : undefined)
const systemFont = /^(var\(|inherit|initial|sans-serif|serif|monospace|system-ui|-apple|blinkmacsystem|wix|madefor|helvetica|din-next|arial|times|courier|segoe)/i

function readDesign(css: string, themeColor: string): PageDesign {
  const colors = new Map<string, string>()
  for (const match of css.matchAll(/--color_(\d+):\s*(\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3})\s*[;}]/g)) if (!colors.has(match[1])) colors.set(match[1], match[2].replace(/\s/g, ''))
  const counts = new Map<string, number>()
  for (const match of css.matchAll(/font-family:\s*["']?([^;"'},!]+)/g)) {
    const name = match[1].trim().toLowerCase()
    if (!systemFont.test(name)) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const design: PageDesign = { fonts: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name]) => name) }
  const accent = hexFrom(colors.get('48') ?? colors.get('18')) ?? (/^#[0-9a-f]{6}$/i.test(themeColor) ? themeColor.toLowerCase() : undefined)
  if (accent) design.accent = accent
  const background = hexFrom(colors.get('11'))
  if (background) design.background = background
  const buttonText = hexFrom(colors.get('50'))
  if (buttonText) design.buttonText = buttonText
  const text = hexFrom(colors.get('15'))
  if (text) design.text = text
  return design
}

/** Reads one page with the runtime's streaming HTML parser, keeping what a person would see and leaving out scripts. */
export async function readWebPage(target: URL): Promise<PageReading | { error: string }> {
  const response = await fetchPublic(target, 'text/html').catch((): null => null)
  if (!response) return { error: "That address couldn't be reached." }
  if (!response.ok) return { error: `That address answered with status ${response.status}. Is the page published?` }
  if (!(response.headers.get('content-type') ?? '').includes('html')) return { error: "That address isn't a web page." }
  if (Number(response.headers.get('content-length') || 0) > maxPageBytes) return { error: 'That page is too large to read here.' }

  const page: PageReading = { buttons: [], data: [], description: '', design: { fonts: [] }, headings: [], images: [], links: [], sections: [], text: [], title: '', truncated: false, url: response.url || target.href }
  const seenText = new Set<string>()
  const seenImages = new Set<string>()
  const seenLinks = new Set<string>()
  let chars = 0
  const open: PageSection[] = []
  const noteLabel = (label: string) => {
    const section = open.at(-1)
    if (section && !section.buttons.includes(label) && section.buttons.length < maxPerSection) section.buttons.push(label)
  }
  let themeColor = ''
  const addImage = (url: string | null | undefined, alt: string | null | undefined) => {
    if (!url || url.startsWith('data:')) return
    let full: string
    try {
      full = new URL(originalImage(url), target).href
    } catch {
      return
    }
    if (seenImages.has(full) || page.images.length >= maxListed) return
    seenImages.add(full)
    page.images.push({ alt: clean(alt ?? ''), url: full })
    const section = open.at(-1)
    if (section && section.images.length < maxPerSection) section.images.push(full)
  }
  // Wix splits lines with <br>, which has no text of its own, so each open element is told about it.
  const reading = new Set<{ value: string }>()
  const collect = (done: (text: string, href: string) => void) => {
    let buffer = { value: '' }
    return {
      element(element: Element) {
        buffer = { value: '' }
        const own = buffer
        reading.add(own)
        // An element can only be read while its own handler runs, so its link is kept for the end tag.
        const href = decode(element.getAttribute('href') ?? '')
        element.onEndTag(() => {
          reading.delete(own)
          const text = clean(own.value)
          if (text) done(text, href)
        })
      },
      text(chunk: Text) {
        if (buffer.value.length < 8000) buffer.value += chunk.text
      },
    }
  }
  const addText = (text: string) => {
    if (seenText.has(text)) return
    if (chars + text.length > maxTextChars) {
      page.truncated = true
      return
    }
    seenText.add(text)
    chars += text.length
    page.text.push(text)
    const section = open.at(-1)
    if (section) {
      section.lines++
      if (section.firstLines.length < 3) section.firstLines.push(text.slice(0, 80))
    }
  }
  let themeStyles = ''
  let otherStyles = ''
  let inThemeStyles = false
  const rewriter = new HTMLRewriter()
    .on('br', { element: () => reading.forEach((open) => (open.value += '\n')) })
    .on('title', collect((text) => (page.title ||= text)))
    .on('section, header, footer', {
      element(element) {
        if (page.sections.length >= maxSections) return
        const section: PageSection = { buttons: [], firstLines: [], headings: [], images: [], kind: element.tagName.toLowerCase(), lines: 0 }
        page.sections.push(section)
        open.push(section)
        element.onEndTag(() => {
          open.pop()
        })
      },
    })
    .on('style', {
      element(element) { inThemeStyles = element.getAttribute('id') === 'css_masterPage' },
      text(chunk) {
        if (inThemeStyles) { if (themeStyles.length < maxStyleChars) themeStyles += chunk.text }
        else if (otherStyles.length < maxStyleChars) otherStyles += chunk.text
      },
    })
    .on('meta', {
      element(element) {
        const name = (element.getAttribute('name') ?? element.getAttribute('property') ?? '').toLowerCase()
        const content = decode(element.getAttribute('content') ?? '')
        if (name === 'theme-color') themeColor = content.trim()
        if (name === 'description' || (name === 'og:description' && !page.description)) page.description = clean(content)
        if (name === 'og:image') addImage(content, 'Main image')
      },
    })
    .on('img', { element: (element) => addImage(decode(element.getAttribute('src') ?? element.getAttribute('data-src') ?? ''), element.getAttribute('alt')) })
    .on('wow-image', {
      element(element) {
        // The parser hands over attributes as written, and Wix writes this JSON with its quotes encoded.
        const info = decode(element.getAttribute('data-image-info') ?? '')
        const uri = /"uri"\s*:\s*"([^"]+)"/.exec(info)?.[1]
        const alt = /"alt"\s*:\s*"([^"]+)"/.exec(info)?.[1] ?? /"name"\s*:\s*"([^"]+)"/.exec(info)?.[1]
        if (uri) addImage(uri, alt)
      },
    })
    .on('a[href]', collect((text, href) => {
      try {
        const full = new URL(href, target)
        if (full.host === target.host) noteLabel(text)
        if (full.host !== target.host || seenLinks.has(full.href) || page.links.length >= maxListed) return
        seenLinks.add(full.href)
        page.links.push({ href: full.href, text })
      } catch {
        // Not a real link, so there is nothing to keep.
      }
    }))
  for (const level of [1, 2, 3, 4, 5, 6]) {
    rewriter.on(`h${level}`, collect((text) => {
      if (page.headings.length < maxListed) page.headings.push({ level, text })
      const section = open.at(-1)
      if (section && section.headings.length < maxPerSection) section.headings.push(text)
      seenText.add(text)
    }))
  }
  // Shops usually state prices and stock here, even when the page shows them in ways text reading misses.
  let script = ''
  rewriter.on('script[type="application/ld+json"]', {
    element(element) {
      script = ''
      element.onEndTag(() => {
        try {
          const found = JSON.parse(script) as unknown
          for (const item of (Array.isArray(found) ? found : [found]) as { '@type'?: string }[]) if (usefulData.has(String(item?.['@type'])) && page.data.length < 5 && JSON.stringify(item).length < 10_000) page.data.push(item)
        } catch {
          // Broken data on the old page is simply left out.
        }
      })
    },
    text(chunk) {
      if (script.length < 20_000) script += chunk.text
    },
  })
  // Wix buttons often have no link in the page, so they don't show up among the links.
  rewriter.on('button', collect((text) => {
    if (!page.buttons.includes(text) && page.buttons.length < maxListed) page.buttons.push(text)
    noteLabel(text)
  }))
  rewriter.on('p', collect(addText)).on('li', collect(addText)).on('blockquote', collect(addText))
  const transformed = rewriter.transform(response)
  const reader = transformed.body?.getReader()
  let bytes = 0
  while (reader) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value?.length ?? 0
    if (bytes > maxPageBytes) {
      page.truncated = true
      await reader.cancel()
      break
    }
  }
  page.design = readDesign(themeStyles || otherStyles, themeColor)
  page.sections = page.sections.filter((section) => section.headings.length || section.images.length || section.buttons.length || section.lines)
  const usable = page.headings.length + page.buttons.length + page.images.length + page.links.length
  if (page.text.join(' ').length < 60 && usable === 0) {
    page.tooFewWords = true
    page.reviewReason = 'This page looks like it is rendered by JavaScript in the browser, so its text could not be read here. Please compare this page with the original side by side.'
  }
  return page
}

/** Copies a photo into the owner's own database, so it keeps working after they leave the old host. */
export async function copyImage(env: Env, siteId: number, target: URL): Promise<{ error?: string; url?: string }> {
  const source = originalImage(target.href)
  const held = await env.DB.prepare('SELECT id FROM media WHERE site_id = ? AND source = ?').bind(siteId, source).first<{ id: number }>()
  if (held) return { url: `/media/${held.id}` }
  const original = /static\.wixstatic\.com\/media\/([^/?#]+)/.exec(target.href)?.[1]
  // A smaller copy fits the 1 MB limit far more often than the original upload does.
  const attempts = original ? [`https://static.wixstatic.com/media/${original}/v1/fit/w_1600,h_1600,q_80/${original.replace(/\.[a-z]+$/i, '.jpg')}`, target.href] : [target.href]
  let problem = "That image couldn't be downloaded."
  for (const attempt of attempts) {
    const response = await fetchPublic(new URL(attempt), 'image/*').catch((): null => null)
    if (!response?.ok) continue
    if (Number(response.headers.get('content-length') || 0) > 8_000_000) {
      problem = 'That image is too large.'
      continue
    }
    const blob = await response.blob()
    const stored = await saveImage(env, siteId, new File([blob], decodeURIComponent(target.pathname.split('/').pop() || 'image').slice(0, 120)), source)
    if (stored.url) return stored
    problem = stored.error ?? problem
  }
  return { error: problem }
}

// Compares words only, so "Way<br>San Francisco" and "Way, San Francisco" count as the same line.
const comparable = (value: string) => clean(value).normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim()

const pageText = (html: string) => comparable(html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' '))

const maxReported = 60

type Reading = { buttons?: string[]; design?: PageDesign; reader?: number; description: string; headings: { level: number; text: string }[]; images: { url: string }[]; links: { text: string }[]; reviewReason?: string; text: string[]; title: string; tooFewWords?: boolean; truncated: boolean; url: string }
type WorkingPage = { blocks: string; description: string; published: number; slug: string; title: string }

const sourcesKeptDays = 30

/** Keeps what an old page contained, so the move can be checked later by any tool, without reading the page again. */
export async function rememberReading(env: Env, siteId: number, reading: Reading, slug: null | string = null) {
  const kept = { buttons: reading.buttons, design: reading.design, description: reading.description, reader: reading.reader ?? readerVersion, headings: reading.headings.map((heading) => ({ level: heading.level, text: heading.text })), images: reading.images.map((image) => ({ url: image.url })), links: reading.links.map((link) => ({ text: link.text })), reviewReason: reading.reviewReason, text: reading.text, title: reading.title, tooFewWords: reading.tooFewWords, truncated: reading.truncated, url: reading.url }
  await env.DB.prepare(`INSERT INTO move_sources (site_id, url, page_slug, reading) VALUES (?, ?, ?, ?)
    ON CONFLICT (site_id, url) DO UPDATE SET page_slug = COALESCE(excluded.page_slug, page_slug), reading = excluded.reading, read_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`)
    .bind(siteId, reading.url, slug, JSON.stringify(kept))
    .run()
}

function outOfOrder(headings: string[], text: string) {
  const found = [...new Set(headings)].map((heading) => ({ at: text.indexOf(comparable(heading)), heading })).filter((item) => item.at >= 0 && comparable(item.heading).length > 1)
  const longest = found.map(() => 1)
  const before = found.map(() => -1)
  let end = -1
  found.forEach((item, index) => {
    for (let earlier = 0; earlier < index; earlier++) if (found[earlier].at < item.at && longest[earlier] + 1 > longest[index]) { longest[index] = longest[earlier] + 1; before[index] = earlier }
    if (end < 0 || longest[index] > longest[end]) end = index
  })
  const inOrder = new Set<number>()
  for (let index = end; index >= 0; index = before[index]) inOrder.add(index)
  return found.filter((_, index) => !inOrder.has(index)).map((item) => item.heading)
}

const channels = (hex: string) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16))
const sameColor = (a: string | undefined, b: string | undefined) => Boolean(a && b) && channels(a!).reduce((sum, value, index) => sum + Math.abs(value - channels(b!)[index]), 0) <= 24

function compareDesign(site: SiteRow, sources: Reading[]) {
  const old = sources.find((source) => source.design?.background || source.design?.fonts.length)?.design
  if (!old) return null
  const settings = JSON.parse(site.settings) as Settings
  const now = { accent: settings.accent, background: settings.background, text: settings.text }
  const differs = (['accent', 'background', 'text'] as const).filter((key) => old[key] && !sameColor(old[key], now[key]))
  return { differs, now: { ...now, bodyFont: settings.bodyFont ?? `from the ${settings.style ?? 'studio'} style`, headingFont: settings.headingFont ?? `from the ${settings.style ?? 'studio'} style` }, old }
}

/** Compares a rebuilt page with a saved reading of its old page, using what the two contain and not what anyone says was moved. */
async function comparePage(env: Env, site: SiteRow, old: Reading, page: WorkingPage) {
  const blocks = JSON.parse(page.blocks) as Block[]
  const [items, records] = await Promise.all([loadItems(env, site.id, blocks), loadPageRecords(env, site.id, blocks, { admin: false, customer: null })])
  const html = renderPage(site, { ...page, blocks }, { canonical: 'https://site.invalid/', customer: null, items, records })
  // Custom code shows in its own frame, so its words are checked from the source.
  const customCode = blocks.filter((block) => block.type === 'html').map((block) => String(block.code)).join(' ')
  const text = pageText(`${html} ${customCode}`)
  const uses = (line: string) => text.includes(comparable(line))
  const lines = [...new Set([...old.headings.map((heading) => heading.text), ...old.text])].filter((line) => comparable(line).length > 1)
  const textMissing = lines.filter((line) => !uses(line))
  const linkTextMissing = [...new Set([...old.links.map((link) => link.text), ...(old.buttons ?? [])])].filter((line) => comparable(line).length > 1 && !uses(line) && !textMissing.includes(line))
  const sources = old.images.map((image) => image.url)
  const { results: copies } = sources.length
    ? await env.DB.prepare(`SELECT id, source FROM media WHERE site_id = ? AND source IN (${sources.map(() => '?').join(',')})`).bind(site.id, ...sources).all<{ id: number; source: string }>()
    : { results: [] as { id: number; source: string }[] }
  const copied = new Map(copies.map((row) => [row.source, row.id]))
  const shows = `${html} ${customCode}`
  const usedOnPage = (id: number) => new RegExp(`/media/${id}(?![0-9])`).test(shows)
  const imagesNotCopied = sources.filter((source) => !copied.has(source))
  const imagesCopiedNotUsed = sources.filter((source) => copied.has(source) && !usedOnPage(copied.get(source)!))
  const imagesStillOnOldHost = [...new Set([...shows.matchAll(/(?:src|href)="(https:\/\/static\.wixstatic\.com\/[^"]+)"/g)].map((match) => match[1]))]
  const titleKept = comparable(page.title) === comparable(old.title) || comparable(old.title).includes(comparable(page.title)) || comparable(page.title).includes(comparable(old.title))
  const descriptionKept = !old.description || comparable(page.description) === comparable(old.description)
  const headingsOutOfOrder = outOfOrder(old.headings.map((heading) => heading.text), pageText(/<main\b[\s\S]*<\/main>/i.exec(html)?.[0] ?? html))
  const needsManualReview = Boolean(old.tooFewWords)
  const counts = { headingsOutOfOrder: headingsOutOfOrder.length, imagesCopiedNotUsed: imagesCopiedNotUsed.length, imagesNotCopied: imagesNotCopied.length, imagesOnOldHost: imagesStillOnOldHost.length, linkTextMissing: linkTextMissing.length, textMissing: textMissing.length }
  return {
    counts,
    descriptionKept,
    headingsOutOfOrder: headingsOutOfOrder.slice(0, maxReported),
    imagesCopiedNotUsed: imagesCopiedNotUsed.slice(0, maxReported),
    imagesFoundOnOldPage: sources.length,
    imagesNotCopied: imagesNotCopied.slice(0, maxReported),
    imagesStillOnOldHost: imagesStillOnOldHost.slice(0, maxReported),
    linesOnOldPage: lines.length,
    linkTextMissing: linkTextMissing.slice(0, maxReported),
    newPage: page.slug,
    needsManualReview,
    oldPageWasCut: old.truncated,
    oldUrl: old.url,
    problems: Object.values(counts).reduce((sum, count) => sum + count, 0) + (titleKept ? 0 : 1) + (descriptionKept ? 0 : 1) + (needsManualReview ? 1 : 0),
    reviewReason: needsManualReview ? old.reviewReason : undefined,
    textMissing: textMissing.slice(0, maxReported),
    titleKept,
  }
}

export type MoveReport = Awaited<ReturnType<typeof comparePage>>

/** Reads an old page now and compares a chosen page with it. */
export async function checkMove(env: Env, site: SiteRow, target: URL, slug: string) {
  const page = await findWorkingPage(env, site, slug)
  if (!page) return { error: `There is no page called "${slug}".` }
  const old = await readWebPage(target)
  if ('error' in old) return { error: old.error }
  await rememberReading(env, site.id, old, slug)
  return { report: await comparePage(env, site, old, page as WorkingPage) }
}

/** The state of a whole move: each old page that was read, matched with the page rebuilt from it. */
export async function moveStatus(env: Env, site: SiteRow) {
  const since = new Date(Date.now() - sourcesKeptDays * 86_400_000).toISOString()
  const { results: sources } = await env.DB.prepare('SELECT url, page_slug, reading FROM move_sources WHERE site_id = ? AND read_at > ? ORDER BY url LIMIT 60').bind(site.id, since).all<{ page_slug: null | string; reading: string; url: string }>()
  if (!sources.length) return { design: null, notRebuilt: [] as string[], pages: [] as MoveReport[], problems: 0 }
  const { results: pages } = await env.DB.prepare('SELECT slug, title, description, published, blocks FROM pages WHERE site_id = ?').bind(site.id).all<WorkingPage>()
  const reports: MoveReport[] = []
  const notRebuilt: string[] = []
  const readings: Reading[] = []
  let rereads = 0
  for (const source of sources) {
    let old = JSON.parse(source.reading) as Reading
    if ((old.reader ?? 1) < readerVersion && rereads < maxRereads) {
      rereads += 1
      const target = safeWebUrl(env, source.url)
      const fresh = target ? await readWebPage(target) : { error: 'Not a public address.' }
      // If the old site is gone, keep what was read before, marked as current so it isn't fetched on every check.
      old = 'error' in fresh ? { ...old, reader: readerVersion } : { ...fresh, reader: readerVersion, url: source.url }
      await rememberReading(env, site.id, old, source.page_slug)
    }
    readings.push(old)
    const wanted = comparable(old.title)
    const page = pages.find((item) => item.slug === source.page_slug) ?? pages.find((item) => comparable(item.title) === wanted) ?? pages.find((item) => wanted && wanted.includes(comparable(item.title)) && item.title.length > 3)
    if (page) reports.push(await comparePage(env, site, old, page))
    else notRebuilt.push(source.url)
  }
  return { design: compareDesign(site, readings), notRebuilt, pages: reports, problems: reports.reduce((sum, report) => sum + report.problems, 0) + notRebuilt.length }
}

/** A portable, secret-free record the owner can keep with a completed migration. */
export async function moveReport(env: Env, site: SiteRow) {
  const since = new Date(Date.now() - sourcesKeptDays * 86_400_000).toISOString()
  const [status, { results: sources }, redirects] = await Promise.all([
    moveStatus(env, site),
    env.DB.prepare('SELECT url, page_slug, read_at FROM move_sources WHERE site_id = ? AND read_at > ? ORDER BY url LIMIT 60').bind(site.id, since).all<{ page_slug: null | string; read_at: string; url: string }>(),
    env.DB.prepare('SELECT COUNT(*) AS total FROM redirects WHERE site_id = ?').bind(site.id).first<{ total: number }>(),
  ])
  const designDifferences = status.design?.differs ?? []
  // A page that could not be read can never count as verified; it is already part of status.problems, and is also surfaced on its own so the owner sees how many pages a person must still compare.
  const manualReview = status.pages.filter((page) => page.needsManualReview).length
  const verification = !sources.length ? 'not_started' : status.problems || designDifferences.length ? 'needs_review' : 'verified'
  return {
    format: 'web-end-move-report-1',
    generated_at: new Date().toISOString(),
    verification,
    summary: { compared_pages: status.pages.length, design_differences: designDifferences.length, known_old_pages: sources.length, manual_review: manualReview, problems: status.problems, redirects: redirects?.total ?? 0, unrebuild_pages: status.notRebuilt.length },
    sources: sources.map((source) => ({ checked_at: source.read_at, old_url: source.url, page: source.page_slug })),
    pages: status.pages.map((page) => ({ description_kept: page.descriptionKept, differences: page.problems, headings_out_of_order: page.headingsOutOfOrder, images_not_copied: page.imagesNotCopied, images_not_used: page.imagesCopiedNotUsed, images_still_on_old_host: page.imagesStillOnOldHost, lines_on_old_page: page.linesOnOldPage, links_missing: page.linkTextMissing, manual_review: page.needsManualReview, new_page: page.newPage, old_url: page.oldUrl, review_reason: page.reviewReason, text_missing: page.textMissing, title_kept: page.titleKept })),
    not_rebuilt: status.notRebuilt,
    design: status.design ? { differences: status.design.differs, new: status.design.now, old: status.design.old } : null,
  }
}

/** A move's differences stop a publish once, so they get seen. If nothing changes after that, going ahead is the owner's call. */
export async function moveGate(env: Env, site: SiteRow) {
  const status = await moveStatus(env, site)
  if (!status.problems) return { status, stop: false }
  const fingerprint = await sha256(JSON.stringify([status.notRebuilt, status.pages.map((page) => [page.newPage, page.problems, page.textMissing, page.linkTextMissing, page.headingsOutOfOrder])]))
  const row = await env.DB.prepare('SELECT move_differences_shown AS shown FROM sites WHERE id = ?').bind(site.id).first<{ shown: null | string }>()
  if (row?.shown === fingerprint) return { status, stop: false }
  await env.DB.prepare('UPDATE sites SET move_differences_shown = ? WHERE id = ?').bind(fingerprint, site.id).run()
  return { status, stop: true }
}

export const finishMove = (env: Env, siteId: number) => env.DB.prepare('DELETE FROM move_sources WHERE site_id = ?').bind(siteId).run()

export function parseCsv(input: string) {
  const text = input.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"'
        index++
      } else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++
      row.push(cell)
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  row.push(cell)
  if (row.some((value) => value !== '')) rows.push(row)
  return rows
}

type ImportedVariant = { amount: number; compare: string; name: string; price: string; stock: null | number }
export type ImportedProduct = { alt: string; body: string; category: string; compare: string; image: string; price: string; published: boolean; stock: null | number; title: string; variants: ImportedVariant[] }

const stockFrom = (value: string) => {
  const text = value.trim().toUpperCase()
  if (!text || text === 'IN_STOCK' || text === 'INSTOCK') return null
  if (text === 'OUT_OF_STOCK' || text === 'OUTOFSTOCK') return 0
  const amount = Number(text)
  return Number.isInteger(amount) && amount >= 0 ? amount : null
}

const noTags = (value: string) => clean(value.replace(/<\/(p|div|li|br)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')).slice(0, 4000)

/** Reads the product file Wix exports. Wix has used two layouts, so both are understood. */
export function parseWixProducts(csv: string, sign: string) {
  const rows = parseCsv(csv)
  if (rows.length < 2) return { error: 'That file has no products.' }
  const columns = new Map(rows[0].map((name, index) => [name.toLowerCase().replace(/[\[\]\s]/g, ''), index]))
  const get = (row: string[], ...names: string[]) => {
    for (const name of names) {
      const index = columns.get(name.toLowerCase())
      if (index !== undefined && row[index]?.trim()) return row[index].trim()
    }
    return ''
  }
  if (!columns.has('fieldtype') || !columns.has('name') || !(columns.has('handle') || columns.has('handleid'))) return { error: "That doesn't look like a product file exported from Wix." }
  const money = (value: string) => (value && Number.isFinite(Number(value)) ? `${sign}${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 2 })}` : value)
  const optionColumns = [...columns.keys()].filter((name) => /^productoption(choices|description)\d+$/.test(name))
  const choiceName = (value: string) => (value.includes(':') && value.startsWith('#') ? value.slice(value.indexOf(':') + 1) : value)
  const products = new Map<string, ImportedProduct & { base: number; list: string[][] }>()
  let extraImages = 0
  for (const row of rows.slice(1)) {
    const handle = get(row, 'handle', 'handleid')
    const kind = get(row, 'fieldtype').toUpperCase()
    if (kind === 'PRODUCT') {
      const images = get(row, 'media', 'productimageurl').split(';').map((value) => value.trim()).filter(Boolean)
      extraImages += Math.max(images.length - 1, 0)
      const listed = Number(get(row, 'price'))
      const mode = get(row, 'discountmode').toUpperCase()
      const off = Number(get(row, 'discountvalue')) || 0
      const sale = mode === 'PERCENT' && off ? listed * (1 - off / 100) : mode === 'AMOUNT' && off ? listed - off : listed
      const compare = get(row, 'strikethroughprice') || (sale !== listed ? String(listed) : '')
      const lists = optionColumns.map((name) => row[columns.get(name)!]?.split(';').map((value) => choiceName(value.trim())).filter(Boolean) ?? []).filter((list) => list.length)
      products.set(handle || `row-${products.size}`, {
        alt: get(row, 'mediaalttext'),
        base: sale,
        body: noTags(get(row, 'plaindescription', 'description')),
        category: (get(row, 'primarycategoryslug') || get(row, 'categoryslugs', 'collection').split(';')[0] || '').trim().slice(0, 60),
        compare: money(compare),
        image: images[0] ? originalImage(images[0]) : '',
        list: lists,
        price: money(sale === listed ? get(row, 'price') : sale.toFixed(2)),
        published: get(row, 'visible').toUpperCase() !== 'FALSE',
        stock: stockFrom(get(row, 'inventory')),
        title: get(row, 'name').slice(0, 160),
        variants: [],
      })
    } else if (kind === 'VARIANT') {
      const product = products.get(handle)
      if (!product) continue
      const name = optionColumns.map((column) => choiceName(row[columns.get(column)!]?.trim() ?? '')).filter(Boolean).join(' / ').slice(0, 60)
      if (!name || product.variants.some((variant) => variant.name === name) || product.variants.length >= 30) continue
      const surcharge = Number(get(row, 'surcharge')) || 0
      const price = get(row, 'price') || (surcharge ? String(product.base + surcharge) : '')
      product.variants.push({ amount: Number(price) || 0, compare: money(get(row, 'strikethroughprice')), name, price: money(price), stock: stockFrom(get(row, 'inventory')) })
    } else if (kind === 'MEDIA') {
      const product = products.get(handle)
      const media = get(row, 'media')
      if (!product || !media) continue
      if (product.image) extraImages++
      else product.image = originalImage(media)
    }
  }
  const list = [...products.values()].filter((product) => product.title)
  for (const product of list) {
    if (!product.variants.length && product.list.length === 1) product.variants = product.list[0].slice(0, 30).map((name) => ({ amount: 0, compare: '', name: name.slice(0, 60), price: '', stock: product.stock }))
    // Wix leaves the price off the product row when a product has options, so the cards show the lowest option price.
    const lowest = product.price ? undefined : product.variants.filter((variant) => variant.amount > 0).sort((a, b) => a.amount - b.amount)[0]
    if (lowest) {
      product.price = lowest.price
      product.compare = lowest.compare
    }
  }
  return { extraImages, products: list as ImportedProduct[] }
}

/** Adds products in one step. Anything already there by name is skipped, so running it twice is safe. */
export async function importProducts(env: Env, site: SiteRow, csv: string, collection = 'products') {
  const settings = JSON.parse(site.settings) as Settings
  const parsed = parseWixProducts(csv, currencySigns[settings.currency ?? ''] ?? '')
  if (parsed.error || !parsed.products) return { error: parsed.error ?? 'That file could not be read.' }
  const { results: existing } = await env.DB.prepare('SELECT title FROM items WHERE site_id = ? AND collection = ?').bind(site.id, collection).all<{ title: string }>()
  const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM items WHERE site_id = ?').bind(site.id).first<{ total: number }>()
  const names = new Set(existing.map((row) => row.title))
  const fresh = parsed.products.filter((product) => !names.has(product.title))
  const room = Math.max(maxProducts - (count?.total ?? 0), 0)
  const chosen = fresh.slice(0, room)
  if (chosen.length) {
    const inserted = await env.DB.batch<{ id: number }>(
      chosen.map((product, index) =>
        env.DB.prepare('INSERT INTO items (site_id, collection, title, price, compare_price, category, stock, body, image_url, image_alt, sort, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id').bind(site.id, collection, product.title, product.price, product.compare, product.category, product.variants.length ? null : product.stock, product.body, product.image, product.alt.slice(0, 200), index, product.published ? 1 : 0),
      ),
    )
    const variants = chosen.flatMap((product, index) => product.variants.map((variant, sort) => env.DB.prepare('INSERT INTO item_variants (item_id, name, price, compare_price, stock, sort) VALUES (?, ?, ?, ?, ?, ?)').bind(inserted[index].results[0].id, variant.name, variant.price, variant.compare, variant.stock, sort)))
    if (variants.length) await env.DB.batch(variants)
  }
  return {
    imagesStillOnOldHost: chosen.filter((product) => product.image).length,
    imported: chosen.length,
    notImportedExtraImages: parsed.extraImages,
    skippedAlreadyThere: parsed.products.length - fresh.length,
    skippedNoRoom: fresh.length - chosen.length,
  }
}

export const cleanPath = (value: string) => {
  let path = value.trim()
  try {
    if (/^https?:\/\//i.test(path)) path = new URL(path).pathname
    path = decodeURI(path)
  } catch {
    return null
  }
  path = path.split(/[?#]/)[0].replace(/\/+$/, '').toLowerCase() || '/'
  return path.startsWith('/') && !path.startsWith('//') && path.length <= 500 ? path : null
}

const validTarget = (value: string) => /^\/(?!\/)[^\s\\]*$/.test(value.trim()) && value.length <= 500

/** Saves old addresses and where they now live. An address can't point at itself, and every target stays on this site. */
export async function saveRedirects(env: Env, siteId: number, pairs: { from: string; to: string }[]) {
  const rows: { from: string; to: string }[] = []
  const problems: string[] = []
  for (const pair of pairs) {
    const from = cleanPath(pair.from)
    const to = pair.to.trim()
    if (!from || from === '/' || !validTarget(to) || cleanPath(to) === from) problems.push(`${pair.from} → ${pair.to}`)
    else rows.push({ from, to })
  }
  const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM redirects WHERE site_id = ?').bind(siteId).first<{ total: number }>()
  if ((count?.total ?? 0) + rows.length > maxRedirects) return { error: `A site can have up to ${maxRedirects} old addresses.` }
  if (rows.length) await env.DB.batch(rows.map((row) => env.DB.prepare('INSERT INTO redirects (site_id, from_path, to_path) VALUES (?, ?, ?) ON CONFLICT (site_id, from_path) DO UPDATE SET to_path = excluded.to_path').bind(siteId, row.from, row.to)))
  return { problems, saved: rows.length }
}

/** Sends an old address to its new home with a permanent redirect, so search engines carry the page over. */
export async function followRedirect(env: Env, url: URL) {
  const from = cleanPath(url.pathname)
  if (!from || from === '/') return null
  const row = await env.DB.prepare('SELECT to_path FROM redirects WHERE from_path = ?').bind(from).first<{ to_path: string }>()
  if (!row) return null
  return new Response(null, { headers: { 'Cache-Control': 'public, max-age=3600', Location: `${url.origin}${row.to_path}${row.to_path.includes('?') ? '' : url.search}` }, status: 301 })
}
