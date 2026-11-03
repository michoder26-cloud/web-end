import { loadPageRecords } from './data'
import { loadItems, saveImage } from './items'
import { renderPage } from './render'
import type { Block, Env, Settings, SiteRow } from './types'
import { findWorkingPage } from './versions'

const maxPageBytes = 3_000_000
const maxTextChars = 60_000
const maxListed = 200
const maxProducts = 500
export const maxRedirects = 2000

const currencySigns: Record<string, string> = { aud: 'A$', cad: 'C$', chf: 'CHF ', eur: '€', gbp: '£', jpy: '¥', thb: '฿', usd: '$' }

const isIpAddress = (host: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || host.startsWith('[')

/** Only public https addresses, so nobody can point this at a private service. The local tests are the one exception. */
export function safeWebUrl(env: Env, value: string) {
  try {
    const target = new URL(value)
    if (env.WEBHOOK_ALLOW_HTTP === '1' && (target.protocol === 'http:' || target.protocol === 'https:')) return target
    if (target.protocol !== 'https:' || target.username || target.password || isIpAddress(target.hostname) || !target.hostname.includes('.') || /(^|\.)(localhost|local|internal)$/.test(target.hostname)) return null
    return target
  } catch {
    return null
  }
}

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
  return { groups, total }
}

const usefulData = new Set(['BreadcrumbList', 'LocalBusiness', 'Offer', 'Organization', 'Product', 'Service', 'Store'])

type PageReading = { data: unknown[]; description: string; headings: { level: number; text: string }[]; images: { alt: string; url: string }[]; links: { href: string; text: string }[]; text: string[]; title: string; truncated: boolean; url: string }

/** Reads one page with the runtime's streaming HTML parser, keeping what a person would see and leaving out scripts. */
export async function readWebPage(target: URL): Promise<PageReading | { error: string }> {
  const response = await fetchPublic(target, 'text/html').catch((): null => null)
  if (!response) return { error: "That address couldn't be reached." }
  if (!response.ok) return { error: `That address answered with status ${response.status}. Is the page published?` }
  if (!(response.headers.get('content-type') ?? '').includes('html')) return { error: "That address isn't a web page." }
  if (Number(response.headers.get('content-length') || 0) > maxPageBytes) return { error: 'That page is too large to read here.' }

  const page: PageReading = { data: [], description: '', headings: [], images: [], links: [], text: [], title: '', truncated: false, url: response.url || target.href }
  const seenText = new Set<string>()
  const seenImages = new Set<string>()
  const seenLinks = new Set<string>()
  let chars = 0
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
  }
  const collect = (done: (text: string, href: string) => void) => {
    let buffer = ''
    return {
      element(element: Element) {
        buffer = ''
        // An element can only be read while its own handler runs, so its link is kept for the end tag.
        const href = decode(element.getAttribute('href') ?? '')
        element.onEndTag(() => {
          const text = clean(buffer)
          if (text) done(text, href)
        })
      },
      text(chunk: Text) {
        if (buffer.length < 8000) buffer += chunk.text
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
  }
  const rewriter = new HTMLRewriter()
    .on('title', collect((text) => (page.title ||= text)))
    .on('meta', {
      element(element) {
        const name = (element.getAttribute('name') ?? element.getAttribute('property') ?? '').toLowerCase()
        const content = decode(element.getAttribute('content') ?? '')
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

const comparable = (value: string) => clean(value).normalize('NFC').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').toLowerCase()

const pageText = (html: string) => comparable(html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' '))

const maxReported = 60

/** Compares a rebuilt page with its old page, using what the two actually contain and not what anyone says was moved. */
export async function checkMove(env: Env, site: SiteRow, target: URL, slug: string) {
  const page = await findWorkingPage(env, site, slug)
  if (!page) return { error: `There is no page called "${slug}".` }
  const old = await readWebPage(target)
  if ('error' in old) return { error: old.error }
  const blocks = JSON.parse(page.blocks) as Block[]
  const [items, records] = await Promise.all([loadItems(env, site.id, blocks), loadPageRecords(env, site.id, blocks, { admin: false, customer: null })])
  const html = renderPage(site, { ...page, blocks }, { canonical: `${new URL(old.url).origin}/`, customer: null, items, records })
  const text = pageText(html)
  const uses = (line: string) => text.includes(comparable(line))
  const lines = [...new Set([...old.headings.map((heading) => heading.text), ...old.text])].filter((line) => comparable(line).length > 1)
  const textMissing = lines.filter((line) => !uses(line))
  const linkTextMissing = [...new Set(old.links.map((link) => link.text))].filter((line) => comparable(line).length > 1 && !uses(line) && !textMissing.includes(line))
  const sources = old.images.map((image) => image.url)
  const { results: copies } = sources.length
    ? await env.DB.prepare(`SELECT id, source FROM media WHERE site_id = ? AND source IN (${sources.map(() => '?').join(',')})`).bind(site.id, ...sources).all<{ id: number; source: string }>()
    : { results: [] as { id: number; source: string }[] }
  const copied = new Map(copies.map((row) => [row.source, row.id]))
  const usedOnPage = (id: number) => new RegExp(`/media/${id}(?![0-9])`).test(html)
  const imagesNotCopied = sources.filter((source) => !copied.has(source))
  const imagesCopiedNotUsed = sources.filter((source) => copied.has(source) && !usedOnPage(copied.get(source)!))
  const imagesStillOnOldHost = [...new Set([...html.matchAll(/(?:src|href)="(https:\/\/static\.wixstatic\.com\/[^"]+)"/g)].map((match) => match[1]))]
  const titleKept = comparable(page.title) === comparable(old.title) || comparable(old.title).includes(comparable(page.title)) || comparable(page.title).includes(comparable(old.title))
  const descriptionKept = !old.description || comparable(page.description) === comparable(old.description)
  const counts = { imagesCopiedNotUsed: imagesCopiedNotUsed.length, imagesNotCopied: imagesNotCopied.length, imagesOnOldHost: imagesStillOnOldHost.length, linkTextMissing: linkTextMissing.length, textMissing: textMissing.length }
  const problems = Object.values(counts).reduce((sum, count) => sum + count, 0) + (titleKept ? 0 : 1) + (descriptionKept ? 0 : 1)
  const report = {
    counts,
    descriptionKept,
    imagesCopiedNotUsed: imagesCopiedNotUsed.slice(0, maxReported),
    imagesFoundOnOldPage: sources.length,
    imagesNotCopied: imagesNotCopied.slice(0, maxReported),
    imagesStillOnOldHost: imagesStillOnOldHost.slice(0, maxReported),
    linesOnOldPage: lines.length,
    linkTextMissing: linkTextMissing.slice(0, maxReported),
    newPage: slug,
    oldPageWasCut: old.truncated,
    oldUrl: old.url,
    problems,
    textMissing: textMissing.slice(0, maxReported),
    titleKept,
  }
  await env.DB.prepare(`INSERT INTO move_checks (site_id, page_slug, old_url, problems, report) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (site_id, page_slug) DO UPDATE SET old_url = excluded.old_url, problems = excluded.problems, report = excluded.report, checked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`)
    .bind(site.id, slug, old.url, problems, JSON.stringify(report))
    .run()
  return { report }
}

export type MoveReport = Extract<Awaited<ReturnType<typeof checkMove>>, { report: unknown }>['report']

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

type ImportedVariant = { compare: string; name: string; price: string; stock: null | number }
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
      product.variants.push({ compare: money(get(row, 'strikethroughprice')), name, price: money(price), stock: stockFrom(get(row, 'inventory')) })
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
    if (!product.variants.length && product.list.length === 1) product.variants = product.list[0].slice(0, 30).map((name) => ({ compare: '', name: name.slice(0, 60), price: '', stock: product.stock }))
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
