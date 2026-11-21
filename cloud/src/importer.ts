// Turns a reading of an old page into normal web-end blocks, with fixed rules and no AI:
// the words stay exactly as they were, only the layout is chosen from what each part of the page holds.
import type { FlowItem, PageReading } from './moving'
import { readableOn } from './theme'
import type { Block } from './types'

type Group = FlowItem[]
type Heading = Extract<FlowItem, { kind: 'heading' }>
type Image = Extract<FlowItem, { kind: 'image' }>
type Link = Extract<FlowItem, { kind: 'link' }>
type Form = Extract<FlowItem, { kind: 'form' }>

// The site's own header, menu and footer come from web-end, so the old ones are not rebuilt as page content.
const chrome = new Set(['header', 'footer', 'nav', 'aside'])
const maxBlocks = 40
const badge = /^(edit with |made with |built with |powered by |created with )?(base44|wix|webflow|framer|squarespace|lovable|bolt|weebly|jimdo|carrd)\b/i
const isBadge = (item: FlowItem) => (item.kind === 'image' && (badge.test(item.alt) || item.url.startsWith('data:'))) || ((item.kind === 'link' || item.kind === 'text' || item.kind === 'button') && badge.test(item.text))
// A price such as ฿1,290, € 12,50, $9.99, 1.290 €, 890 บาท.
const price = /^(?:[฿€$£]\s?\d[\d.,\s]*|\d[\d.,\s]*\s?(?:[฿€$£]|บาท|THB|EUR|USD|CHF))$/i
// Small figures with a label: "1,200+" "customers", "7 วัน" "returns".
const figure = (text: string) => text.length <= 14 && /\d/.test(text) && !price.test(text)

export type FoundProduct = { title: string; price?: string; comparePrice?: string; body?: string; imageUrl?: string; imageAlt?: string; category?: string; stock?: number; variants?: { name: string }[] }

type Plain = string | number | boolean | null | Plain[]

/** Reads one object literal of plain values ({id:`p1`,name:`…`,price:890,variants:[`a`,`b`]}) starting at a brace. */
function literalAt(code: string, start: number): Record<string, Plain> | null {
  let at = start + 1
  const out: Record<string, Plain> = {}
  const space = () => { while (/\s/.test(code[at] ?? '')) at++ }
  const value = (): Plain | undefined => {
    space()
    const c = code[at]
    if (c === '"' || c === "'" || c === '`') {
      let text = ''
      at++
      while (at < code.length && code[at] !== c) {
        if (code[at] === '\\') { at++; text += code[at] === 'n' ? '\n' : code[at] }
        else if (c === '`' && code[at] === '$' && code[at + 1] === '{') return undefined
        else text += code[at]
        at++
      }
      at++
      return text
    }
    if (c === '[') {
      at++
      const list: Plain[] = []
      for (;;) {
        space()
        if (code[at] === ']') { at++; return list }
        const item = value()
        if (item === undefined || list.length > 50) return undefined
        list.push(item)
        space()
        if (code[at] === ',') at++
      }
    }
    const word = /^(-?\d+(?:\.\d+)?|null|true|false|!0|!1)/.exec(code.slice(at, at + 24))?.[1]
    if (!word) return undefined
    at += word.length
    return word === 'null' ? null : word === 'true' || word === '!0' ? true : word === 'false' || word === '!1' ? false : Number(word)
  }
  for (let fields = 0; fields < 40; fields++) {
    space()
    if (code[at] === '}') return out
    const key = /^["']?([A-Za-z_$][\w$]*)["']?\s*:/.exec(code.slice(at, at + 60))
    if (!key) return null
    at += key[0].length
    const read = value()
    if (read === undefined) return null
    out[key[1]] = read
    space()
    if (code[at] === ',') at++
  }
  return null
}

const asText = (value: Plain | undefined) => (typeof value === 'string' ? value.trim() : '')

/** Fills in what a product card leaves out (description, category, stock, sizes) from the site's own product list in its code. */
export function productDetailsFrom(code: string, products: FoundProduct[]) {
  let filled = 0
  for (const product of products) {
    const name = product.title.replace(/[\\`'"]/g, '')
    if (name.length < 2) continue
    for (const quote of ['`', '"', "'"]) {
      const at = code.indexOf(`${quote}${name}${quote}`)
      if (at < 0) continue
      // The object the name sits in: the nearest opening brace before it.
      let depth = 0
      let start = -1
      for (let i = at; i >= Math.max(0, at - 400); i--) {
        if (code[i] === '}') depth++
        else if (code[i] === '{') { if (depth === 0) { start = i; break } depth-- }
      }
      const found = start >= 0 ? literalAt(code, start) : null
      if (!found || ![found.name, found.title].some((value) => asText(value) === name)) continue
      const description = asText(found.description ?? found.desc ?? found.body ?? found.details)
      const tagline = asText(found.tagline ?? found.subtitle ?? found.short_description ?? found.shortDescription)
      const body = [tagline, description].filter(Boolean).join('\n\n')
      if (body) product.body = cut(body, 4000)
      const category = asText(found.category ?? found.type ?? found.collection)
      if (category && category.length <= 60) product.category = category
      const stock = found.stock ?? found.inventory ?? found.quantity
      if (typeof stock === 'number' && Number.isInteger(stock) && stock >= 0) product.stock = stock
      const compare = found.compare_at ?? found.compareAt ?? found.compare_price ?? found.comparePrice ?? found.original_price
      if (typeof compare === 'number' && !product.comparePrice && product.price) product.comparePrice = product.price.replace(/[\d.,]+/, compare.toLocaleString('en-US'))
      const variants = found.variants ?? found.options ?? found.sizes
      if (Array.isArray(variants)) {
        const names = variants.map((item) => asText(item)).filter((item) => item && item.length <= 60).slice(0, 30)
        if (names.length) product.variants = names.map((variant) => ({ name: variant }))
      }
      filled++
      break
    }
  }
  return filled
}

/** Shortens text at a word end, so a limit never cuts a word in half. */
export function cut(text: string, max: number) {
  if (text.length <= max) return text
  const part = text.slice(0, max - 1)
  const end = part.lastIndexOf(' ')
  return `${end > max * 0.6 ? part.slice(0, end) : part}…`
}

/** The page name for an old address: its last path part in plain letters, and home for the start page. */
export function slugFor(address: string) {
  let path = '/'
  try {
    path = new URL(address).pathname
  } catch {
    // An address that can't be read gets the plain name below.
  }
  const last = path.split('/').filter(Boolean).pop()
  if (!last) return 'home'
  let name = last
  try {
    name = decodeURIComponent(last)
  } catch {
    // Keep the raw text.
  }
  const slug = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\.(html?|php|aspx?)$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '')
  return slug === 'index' ? 'home' : slug || 'page'
}

/** Links within the old site point to the rebuilt pages; others stay as they are. */
function linkFor(href: string, origin: string): string | undefined {
  try {
    const url = new URL(href)
    if (url.protocol === 'mailto:' || url.protocol === 'tel:') return href.slice(0, 500)
    if (url.origin === origin) {
      const slug = slugFor(url.href)
      const part = /^#[A-Za-z][\w-]{0,39}$/.test(url.hash) ? url.hash.toLowerCase() : ''
      return `${slug === 'home' ? '/' : `/${slug}`}${part}`
    }
    return url.protocol === 'https:' ? url.href.slice(0, 500) : undefined
  } catch {
    return undefined
  }
}

/** Splits the page into parts: each section of the old page, and a new part at each big heading after content. */
function groupsOf(flow: FlowItem[]) {
  const groups: Group[] = []
  let current: Group = []
  for (const item of flow) {
    if ((item.section && chrome.has(item.section.kind)) || isBadge(item)) continue
    const newSection = current.length > 0 && item.section !== current[0].section
    const bigHeading = item.kind === 'heading' && item.level <= 2 && current.some((earlier) => earlier.kind !== 'heading')
    // A short line just above a big heading is its label ("New collection"), so it stays with that heading.
    const label = bigHeading && !newSection && current.every((earlier) => earlier.kind === 'text' && earlier.text.length <= 80) && current.length <= 2
    if ((newSection || bigHeading) && !label) {
      groups.push(current)
      current = []
    }
    current.push(item)
  }
  if (current.length) groups.push(current)
  return groups
}

function fieldName(label: string, taken: Set<string>) {
  let name = label.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^[^a-z]+|_+$/g, '').slice(0, 30) || 'field'
  if (name === 'website') name = 'website_field'
  let unique = name
  for (let n = 2; taken.has(unique); n++) unique = `${name}_${n}`
  taken.add(unique)
  return unique
}

const fieldTypes: Record<string, string> = { checkbox: 'checkbox', date: 'date', email: 'email', number: 'number', select: 'select', tel: 'phone', textarea: 'textarea', time: 'time' }

function formBlock(form: Form, heading: string | undefined, intro: string, index: number): Block | null {
  const taken = new Set<string>()
  const fields = form.fields.slice(0, 30).map((field) => {
    const type = fieldTypes[field.type] ?? 'text'
    const usable = type === 'select' && !field.options.length ? 'text' : type
    return { name: fieldName(field.label, taken), label: cut(field.label, 80), type: usable, ...(field.required ? { required: true } : {}), ...(usable === 'select' ? { options: field.options.slice(0, 50) } : {}) }
  })
  if (!fields.length) return null
  return { type: 'form', name: index ? `contact-${index + 1}` : 'contact', ...(heading ? { heading } : {}), ...(intro ? { intro: cut(intro, 600) } : {}), fields }
}

/** Rebuilds the page as blocks. image() gives the address to use for an old photo, or nothing to leave it out. */
export function blocksFromReading(reading: PageReading, image: (url: string) => string | undefined, products: FoundProduct[] = []) {
  const origin = (() => {
    try {
      return new URL(reading.url).origin
    } catch {
      return ''
    }
  })()
  const blocks: Block[] = []
  let heroUsed = false
  let forms = 0
  let side: 'left' | 'right' = 'right'
  const tone = () => ({})
  const groups = groupsOf(reading.flow ?? [])

  groups.forEach((group, index) => {
    const headings = group.filter((item): item is Heading => item.kind === 'heading')
    const top = Math.min(...headings.map((item) => item.level))
    const main = headings.find((item) => item.level === top)
    const heading = main ? cut(main.text, 160) : undefined
    const texts = group.filter((item) => item.kind === 'text').map((item) => (item.kind === 'text' ? item.text : ''))
    const images = group
      .filter((item): item is Image => item.kind === 'image')
      .map((item) => ({ url: image(item.url), alt: cut(item.alt || heading || reading.title || 'Photo', 200) }))
      .filter((item): item is { alt: string; url: string } => Boolean(item.url))
    const link = group.find((item): item is Link => item.kind === 'link' && Boolean(linkFor(item.href, origin)))
    const button = link ? { buttonLabel: cut(link.text, 60), buttonHref: linkFor(link.href, origin)! } : {}
    const form = group.find((item): item is Form => item.kind === 'form' && item.fields.length > 0)
    const subheadings = headings.filter((item) => item !== main)
    const textChars = texts.join(' ').length
    const add = (block: Block) => { if (blocks.length < maxBlocks) blocks.push(block) }

    // Every word of the part, in order, except the main heading: nothing is dropped when a part becomes text.
    const body = group
      .filter((item) => (item.kind === 'text') || (item.kind === 'heading' && item !== main))
      .map((item) => (item.kind === 'text' ? (item.listItem ? `• ${item.text}` : item.text) : item.kind === 'heading' ? item.text : ''))
      .join('\n\n')

    if (form) {
      const built = formBlock(form, heading, texts.join(' '), forms++)
      if (built) {
        add({ ...built, ...tone() })
        return
      }
    }

    // Questions with answers under them.
    const questions = subheadings.filter((item) => /\?\s*$/.test(item.text))
    // Several small headings, each with words under it, read as a list of features.
    const answered = (start: Heading) => {
      const at = group.indexOf(start)
      const words: string[] = []
      for (const item of group.slice(at + 1)) {
        if (item.kind === 'heading') break
        if (item.kind === 'text') words.push(item.text)
      }
      return words.join('\n\n')
    }
    if (questions.length >= 2 && questions.length >= subheadings.length / 2) {
      const items = questions.slice(0, 30).map((item) => ({ question: cut(item.text, 240), answer: cut(answered(item) || '—', 2000) }))
      add({ type: 'faq', ...(heading ? { heading } : {}), items, ...tone() })
      return
    }

    if (!heroUsed && heading && (top === 1 || index === 0)) {
      heroUsed = true
      const first: string[] = []
      for (const line of texts) {
        if ([...first, line].join(' ').length > 600) break
        first.push(line)
      }
      const before = group.slice(0, group.indexOf(main!)).find((item) => item.kind === 'text' && item.text.length <= 80)
      const eyebrow = before?.kind === 'text' ? before.text : undefined
      if (eyebrow) first.splice(first.indexOf(eyebrow), first.includes(eyebrow) ? 1 : 0)
      const stats: { value: string; label: string }[] = []
      for (let i = 0; i < texts.length - 1; i++) {
        if (figure(texts[i]) && !figure(texts[i + 1]) && texts[i + 1].length <= 40) { stats.push({ value: texts[i], label: texts[i + 1] }); i++ }
        else if (stats.length && stats.length < 2) stats.length = 0
        else if (stats.length) break
      }
      const statWords = stats.length >= 2 ? stats.flatMap((item) => [item.value, item.label]) : []
      for (const word of statWords) if (first.includes(word)) first.splice(first.indexOf(word), 1)
      const second = group.find((item): item is Link => item.kind === 'link' && item !== link && Boolean(linkFor(item.href, origin)) && item.text.length <= 60)
      const secondButton = link && second ? { secondLabel: cut(second.text, 60), secondHref: linkFor(second.href, origin)! } : {}
      const figures = statWords.length && statWords.length <= 8 ? { figures: stats.slice(0, 4).map((item) => ({ value: cut(item.value, 24), label: cut(item.label, 120) })) } : {}
      add({ type: 'hero', ...(eyebrow ? { eyebrow } : {}), heading, ...(first.length ? { text: first.join(' ') } : {}), ...button, ...secondButton, ...figures, ...(images[0] ? { imageUrl: images[0].url, imageAlt: images[0].alt, layout: 'split' } : { layout: 'centered' }) })
      if (statWords.length > 8) add({ type: 'stats', items: stats.slice(0, 6).map((item) => ({ value: cut(item.value, 24), label: cut(item.label, 120) })) })
      const rest = group
        .filter((item) => (item.kind === 'text' && !first.includes(item.text) && item.text !== eyebrow && !statWords.includes(item.text)) || (item.kind === 'heading' && item !== main))
        .map((item) => (item.kind === 'text' || item.kind === 'heading' ? item.text : ''))
      if (rest.length) add({ type: 'text', body: cut(rest.join('\n\n'), 8000), ...tone() })
      if (images.length > 1) add({ type: 'gallery', images: images.slice(1, 25).map((item) => ({ imageUrl: item.url, imageAlt: item.alt })), ...tone() })
      return
    }

    // Cards with a photo, a name and a price are products: they become shop items shown together.
    const cards = subheadings.flatMap((item) => {
      const at = group.indexOf(item)
      let photo: Image | undefined
      for (let i = at - 1; i >= 0 && group[i].kind !== 'heading'; i--) if (group[i].kind === 'image') { photo = group[i] as Image; break }
      const words: string[] = []
      for (const next of group.slice(at + 1)) {
        if (next.kind === 'heading' || next.kind === 'image') break
        if (next.kind === 'text') words.push(next.text)
      }
      const prices = words.filter((word) => price.test(word))
      if (!prices.length) return []
      const url = photo ? image(photo.url) : undefined
      const card: FoundProduct = { title: cut(item.text, 160), price: prices[0].slice(0, 40), ...(prices[1] ? { comparePrice: prices[1].slice(0, 40) } : {}) }
      const body = words.filter((word) => !price.test(word) && word.length > 12).join('\n\n')
      if (body) card.body = cut(body, 4000)
      if (url) Object.assign(card, { imageUrl: url, imageAlt: cut(photo!.alt || item.text, 200) })
      return [card]
    })
    if (cards.length >= 3 && cards.length >= subheadings.length - 1) {
      products.push(...cards.slice(0, 60))
      const intro = texts.filter((line) => !cards.some((card) => card.body?.includes(line)) && !price.test(line) && line.length > 30).join(' ')
      add({ type: 'collection', id: 'products', collection: 'products', filters: true, ...(heading ? { heading } : {}), ...(intro ? { intro: cut(intro, 400) } : {}), ...tone() })
      return
    }

    // A row of features with no title above it: every heading is one feature.
    const flat = headings.length >= 3 && headings.every((item) => item.level === top && answered(item)) && !images.length && group[0]?.kind === 'heading'
    if (flat && (heroUsed || index > 0)) {
      add({ type: 'features', items: headings.slice(0, 12).map((item) => ({ title: cut(item.text, 120), text: cut(answered(item), 600) })), ...tone() })
      return
    }

    const featureHeads = subheadings.filter((item) => answered(item))
    if (featureHeads.length >= 3 && featureHeads.length >= subheadings.length - 1) {
      const intro = group.slice(0, group.indexOf(featureHeads[0])).filter((item) => item.kind === 'text').map((item) => (item.kind === 'text' ? item.text : '')).join(' ')
      add({ type: 'features', ...(heading ? { heading } : {}), ...(intro ? { intro: cut(intro, 400) } : {}), items: featureHeads.slice(0, 12).map((item) => ({ title: cut(item.text, 120), text: cut(answered(item), 600) })), ...tone() })
      if (images.length) add({ type: 'gallery', images: images.slice(0, 24).map((item) => ({ imageUrl: item.url, imageAlt: item.alt })), ...tone() })
      return
    }

    if (images.length >= 3 && textChars < 200) {
      add({ type: 'gallery', ...(heading ? { heading } : {}), images: images.slice(0, 24).map((item) => ({ imageUrl: item.url, imageAlt: item.alt, ...(texts[0] && images.length === 1 ? { caption: cut(texts[0], 200) } : {}) })), ...tone() })
      if (texts.length) add({ type: 'text', body: cut(body, 8000), ...tone() })
      return
    }

    if (images.length === 1 && body) {
      add({ type: 'split', ...(heading ? { heading } : {}), body: cut(body, 3000), imageUrl: images[0].url, imageAlt: images[0].alt, imageSide: side, ...button, ...tone() })
      side = side === 'right' ? 'left' : 'right'
      return
    }

    if (body) {
      add({ type: 'text', ...(heading ? { heading } : {}), body: cut(body, 8000), ...tone() })
      if (link) add({ type: 'cta', heading: cut(link.text, 160), ...button, ...tone() })
    } else if (heading && link) {
      add({ type: 'cta', heading, ...button, ...tone() })
    } else if (heading && !images.length) {
      add({ type: 'text', body: heading, ...tone() })
    }
    if (images.length && !(images.length === 1 && body)) add({ type: 'gallery', ...(body || !heading ? {} : { heading }), images: images.slice(0, 24).map((item) => ({ imageUrl: item.url, imageAlt: item.alt })), ...tone() })
  })
  return blocks
}

/** Extra CSS that gives the site the old site's button colour and shape and its rounded corners. */
export function lookCss(design: PageReading['design']) {
  const rules: string[] = []
  const safe = (value: string | undefined) => (value && /^(\d{1,3}px|0|#[0-9a-fA-F]{6})$/.test(value) ? value : undefined)
  const corner = safe(design.cornerRadius)
  // Rounded photos, as on the old site. Cards with only a line on top stay straight.
  if (corner) rules.push(`body[data-style] main img { border-radius: ${corner}; }`)
  const button: string[] = []
  const color = safe(design.buttonColor)
  if (color) button.push(`background: ${color}`, `color: ${readableOn(color)}`)
  const radius = safe(design.buttonRadius)
  if (radius) button.push(`border-radius: ${radius}`)
  if (button.length) rules.push(`body[data-style] .button:not(.button--ghost) { ${button.join('; ')}; }`)
  if (radius) rules.push(`body[data-style] .button--ghost { border-radius: ${radius}; }`)
  const ink = safe(design.text)
  const paper = safe(design.background)
  if (design.darkFooter && ink && paper) rules.push(`body[data-style] .site-footer { background: ${ink}; color: ${paper}; }`, `body[data-style] .site-footer a { color: inherit; }`)
  return rules.length ? `/* The look of the moved site */\n${rules.join('\n')}` : ''
}

/** The old page's photos that would show in the rebuilt page, in page order, without the site's header and footer. */
export function photosOf(reading: PageReading) {
  const seen = new Set<string>()
  for (const item of reading.flow ?? []) {
    if (item.kind === 'image' && !(item.section && chrome.has(item.section.kind)) && !isBadge(item)) seen.add(item.url)
  }
  return [...seen]
}

/** The old site's menu and footer words, for the site's own menu and footer. */
export function chromeOf(reading: PageReading) {
  const origin = (() => {
    try {
      return new URL(reading.url).origin
    } catch {
      return ''
    }
  })()
  const nav: { href: string; label: string }[] = []
  const footer: string[] = []
  for (const item of reading.flow ?? []) {
    const kind = item.section?.kind
    if ((kind === 'header' || kind === 'nav') && item.kind === 'link' && nav.length < 8) {
      const href = linkFor(item.href, origin)
      // The logo links to the start page, and the site's own name already does that.
      if (href && href.startsWith('/') && href !== '/' && href !== '/#top' && !(reading.title && item.text.startsWith(reading.title.split(/\s+[—–|·-]\s+/)[0].trim())) && item.text.length <= 40 && !nav.some((entry) => entry.href === href || entry.label === item.text)) nav.push({ href, label: item.text })
    }
    if (kind === 'footer' && (item.kind === 'text' || item.kind === 'heading' || (item.kind === 'link' && !item.href.startsWith(origin)))) {
      const words = item.kind === 'link' ? item.text : item.text
      if (!footer.includes(words)) footer.push(words)
    }
  }
  // "Araya — Things for every day" names the site in its first part.
  const name = cut(reading.title.split(/\s+[—–|·-]\s+/)[0].trim(), 80)
  return { name, nav, footerText: footer.length ? cut(footer.join(' · '), 500) : '' }
}
