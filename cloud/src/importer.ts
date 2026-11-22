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

const money = /(?:[฿€$£¥]\s?\d[\d.,]*|\d[\d.,]*\s?(?:[฿€$£¥]|บาท|THB|EUR|USD|CAD|AUD|GBP|CHF|SEK|NOK|DKK|PLN|JPY)\b)(?:\s?(?:THB|EUR|USD|CAD|AUD|GBP|CHF)\b)?/i
export const priceOf = (text: string) => (text.length <= 60 ? money.exec(text)?.[0] : undefined)

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

const pathOf = (address: string) => {
  try {
    return new URL(address).pathname.replace(/\/+$/, '') || '/'
  } catch {
    return ''
  }
}

/** Links within the old site point to the rebuilt pages; others stay as they are. */
function linkFor(href: string, origin: string, home = ''): string | undefined {
  try {
    const url = new URL(href)
    if (url.protocol === 'mailto:' || url.protocol === 'tel:') return href.slice(0, 500)
    if (url.origin === origin) {
      // The old start page may live at its own address, such as /getdigital on a free Wix site.
      const slug = home && pathOf(url.href) === home ? 'home' : slugFor(url.href)
      const part = /^#[A-Za-z][\w-]{0,39}$/.test(url.hash) ? url.hash.toLowerCase() : ''
      return `${slug === 'home' ? '/' : `/${slug}`}${part}`
    }
    return url.protocol === 'https:' ? url.href.slice(0, 500) : undefined
  } catch {
    return undefined
  }
}

/** Splits the page into parts: each section of the old page, and a new part at each big heading after content. */
function groupsOf(unsorted: FlowItem[]) {
  // Things without a position stay with the one before them; then top to bottom, left to right within a row.
  let lastY = 0
  const flow = unsorted.some((item) => item.y !== undefined)
    ? unsorted.map((item, index) => ({ item, index, y: item.y ?? lastY, x: item.x ?? 0 })).map((one) => { lastY = one.y; return one })
      .sort((a, b) => Math.round(a.y / 24) - Math.round(b.y / 24) || a.x - b.x || a.index - b.index).map((one) => one.item)
    : unsorted
  const groups: Group[] = []
  let current: Group = []
  for (const item of flow) {
    if ((item.section && chrome.has(item.section.kind)) || isBadge(item)) continue
    const newSection = current.length > 0 && (item.section !== current[0].section || item.band !== current[0].band)
    const sameColumn = (earlier: FlowItem) => item.x === undefined || earlier.x === undefined || Math.abs(earlier.x - item.x) < 200
    // A row of cards starts its own part: the first heading that has another heading beside it.
    const inRow = (one: FlowItem) => one.kind === 'heading' && one.y !== undefined && flow.some((other) => other !== one && other.kind === 'heading' && other.y !== undefined && Math.abs(other.y - one.y!) < 30 && Math.abs((other.x ?? 0) - (one.x ?? 0)) > 100)
    const rowStart = inRow(item) && current.some((earlier) => earlier.kind === 'heading' && earlier.level === 1) && !current.some(inRow)
    // A price written as a heading ("$15/mo") belongs to its card, it does not start a part.
    const bigHeading = item.kind === 'heading' && item.level <= 2 && !priceOf(item.text) && !inRow(item) && current.some((earlier) => earlier.kind !== 'heading' && sameColumn(earlier))
    // A short line just above a big heading is its label ("New collection"), so it stays with that heading.
    const column = current.filter(sameColumn)
    const label = bigHeading && !newSection && column.length <= 2 && column.every((earlier) => earlier.kind === 'text' && earlier.text.length <= 80)
    if (rowStart || ((newSection || bigHeading) && !label)) {
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
export function blocksFromReading(reading: PageReading, image: (url: string) => string | undefined, products: FoundProduct[] = [], homeUrl = '') {
  const home = homeUrl ? pathOf(homeUrl) : ''
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
  // A part keeps the kind of background its band had: dark, or set off from the page, or plain.
  const pageBg = reading.design.background ?? '#ffffff'
  const far = (a: string, b: string) => [1, 3, 5].reduce((sum, i) => sum + Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)), 0) > 24
  let groupTone: { tone?: string } = {}
  const tone = () => groupTone
  const groups = groupsOf(reading.flow ?? [])

  groups.forEach((group, index) => {
    const band = group.find((item) => item.band !== undefined)
    groupTone = band?.bgPhoto ? { tone: 'dark' } : band?.bg ? (readableOn(band.bg) === '#ffffff' ? { tone: 'dark' } : far(band.bg, pageBg) ? { tone: 'tint' } : {}) : {}
    const headings = group.filter((item): item is Heading => item.kind === 'heading')
    const top = Math.min(...headings.map((item) => item.level))
    const main = headings.find((item) => item.level === top)
    const heading = main ? cut(main.text, 160) : undefined
    const texts = group.filter((item) => item.kind === 'text').map((item) => (item.kind === 'text' ? item.text : ''))
    const images = group
      .filter((item): item is Image => item.kind === 'image')
      .map((item) => ({ url: image(item.url), alt: cut(item.alt || heading || reading.title || 'Photo', 200) }))
      .filter((item): item is { alt: string; url: string } => Boolean(item.url))
    const link = group.find((item): item is Link => item.kind === 'link' && Boolean(linkFor(item.href, origin, home)))
    const button = link ? { buttonLabel: cut(link.text, 60), buttonHref: linkFor(link.href, origin, home)! } : {}
    const form = group.find((item): item is Form => item.kind === 'form' && item.fields.length > 0)
    const subheadings = headings.filter((item) => item !== main)
    const textChars = texts.join(' ').length
    // A stray word or two on its own (a badge, a counter) is not worth a section.
    const add = (block: Block) => { if (blocks.length < maxBlocks && !(block.type === 'text' && !block.heading && String(block.body ?? '').length < 40)) blocks.push(block) }

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

    const nearTop = index <= 1 && (main?.y === undefined || main.y < 1200)
    if (!heroUsed && heading && (index === 0 || nearTop || (top === 1 && (main?.y === undefined || main.y < 1200)))) {
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
      const second = group.find((item): item is Link => item.kind === 'link' && item !== link && Boolean(linkFor(item.href, origin, home)) && item.text.length <= 60)
      const secondButton = link && second ? { secondLabel: cut(second.text, 60), secondHref: linkFor(second.href, origin, home)! } : {}
      const figures = statWords.length && statWords.length <= 8 ? { figures: stats.slice(0, 4).map((item) => ({ value: cut(item.value, 24), label: cut(item.label, 120) })) } : {}
      add({ type: 'hero', ...(eyebrow ? { eyebrow } : {}), heading, ...(first.length ? { text: first.join(' ') } : {}), ...button, ...secondButton, ...figures, ...(images[0] ? { imageUrl: images[0].url, imageAlt: images[0].alt, layout: 'split' } : { layout: 'centered' }), ...tone() })
      if (statWords.length > 8) add({ type: 'stats', items: stats.slice(0, 6).map((item) => ({ value: cut(item.value, 24), label: cut(item.label, 120) })) })
      const rest = group
        .filter((item) => (item.kind === 'text' && !first.includes(item.text) && item.text !== eyebrow && !statWords.includes(item.text)) || (item.kind === 'heading' && item !== main))
        .map((item) => (item.kind === 'text' || item.kind === 'heading' ? item.text : ''))
      if (rest.length) add({ type: 'text', body: cut(rest.join('\n\n'), 8000), ...tone() })
      if (images.length > 1) add({ type: 'gallery', images: images.slice(1, 25).map((item) => ({ imageUrl: item.url, imageAlt: item.alt })), ...tone() })
      return
    }

    // A row of figures with their labels: "+300" "Expert employees", or all figures above all labels.
    const words = group.filter((item) => item.kind === 'text' || item.kind === 'heading').map((item) => (item.kind === 'text' || item.kind === 'heading' ? item.text : ''))
    const half = words.length / 2
    const paired = words.length >= 4 && words.length % 2 === 0
      ? words.every((word, i) => (i % 2 === 0 ? figure(word) : !figure(word) && word.length <= 40))
        ? words.flatMap((word, i) => (i % 2 === 0 ? [{ value: word, label: words[i + 1] }] : []))
        : words.every((word, i) => (i < half ? figure(word) : !figure(word) && word.length <= 40))
          ? words.slice(0, half).map((value, i) => ({ value, label: words[half + i] }))
          : null
      : null
    if (paired && paired.length <= 6) {
      add({ type: 'stats', items: paired.map((item) => ({ value: cut(item.value, 24), label: cut(item.label, 120) })), ...tone() })
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
      const prices = words.flatMap((word) => { const found = priceOf(word); return found ? [found] : [] })
      if (!prices.length) return []
      const url = photo ? image(photo.url) : undefined
      const card: FoundProduct = { title: cut(item.text, 160), price: prices[0].slice(0, 40), ...(prices[1] ? { comparePrice: prices[1].slice(0, 40) } : {}) }
      const body = words.filter((word) => !priceOf(word) && word.length > 12).join('\n\n')
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

    // Cards side by side (services, projects): on a measured page, things that sit in three to six columns.
    // A main heading that sits in the row of cards is the first card's title, not the title of the part.
    const mainInRow = main?.x !== undefined && main.y !== undefined && group.some((item) => item !== main && (item.kind === 'text' || item.kind === 'heading') && item.y !== undefined && Math.abs(item.y - main.y!) < 30 && Math.abs((item.x ?? 0) - main.x!) > 100)
    const placed = group.filter((item) => (item !== main || mainInRow) && item.x !== undefined && (item.kind === 'text' || item.kind === 'heading' || item.kind === 'image'))
    if (placed.length >= 6) {
      const cardsHeading = mainInRow ? undefined : heading
      const columns: FlowItem[][] = []
      for (const item of [...placed].sort((a, b) => a.x! - b.x!)) {
        const last = columns.at(-1)
        if (last && item.x! - last[0].x! < 60) last.push(item)
        else columns.push([item])
      }
      const cards = columns.filter((col) => col.some((item) => item.kind !== 'image')).map((col) => {
        const inOrder = [...col].sort((a, b) => (a.y ?? 0) - (b.y ?? 0))
        const words = inOrder.filter((item): item is Extract<FlowItem, { kind: 'heading' | 'text' }> => item.kind === 'heading' || item.kind === 'text').map((item) => item.text)
        const photo = inOrder.find((item): item is Image => item.kind === 'image')
        return { title: words[0] ?? '', text: words.slice(1).join('\n\n'), photo }
      })
      const rows = new Set(placed.map((item) => Math.round((item.y ?? 0) / 300)))
      if (cards.length >= 3 && cards.length <= 6 && cards.length === columns.length && rows.size <= 3 && cards.every((card) => card.title && card.title.length <= 120)) {
        const intro = group.filter((item) => item.kind === 'text' && !placed.includes(item)).map((item) => (item.kind === 'text' ? item.text : '')).join(' ')
        const lines = cards.map((card) => [card.title, ...card.text.split('\n\n')].filter(Boolean))
        if (lines.every((list) => list.some((line) => priceOf(line))) && !cards.some((card) => card.photo)) {
          add({ type: 'pricing', ...(cardsHeading ? { heading: cardsHeading } : {}), ...(intro ? { intro: cut(intro, 400) } : {}), plans: lines.map((list) => {
            const cost = list.find((line) => priceOf(line))!
            const name = list.find((line) => line !== cost) ?? cost
            return { name: cut(name, 80), price: cut(cost, 40), features: cut(list.filter((line) => line !== cost && line !== name).join('\n'), 1000) || undefined }
          }), ...tone() })
          return
        }
        const withPhotos = cards.filter((card) => card.photo && image(card.photo.url)).length >= cards.length - 1
        if (withPhotos) add({ type: 'team', ...(cardsHeading ? { heading: cardsHeading } : {}), ...(intro ? { intro: cut(intro, 400) } : {}), members: cards.map((card) => ({ name: cut(card.title, 80), ...(card.text ? { text: cut(card.text, 500) } : {}), ...(card.photo && image(card.photo.url) ? { imageUrl: image(card.photo.url)! } : {}) })), ...tone() })
        else add({ type: 'features', ...(cardsHeading ? { heading: cardsHeading } : {}), ...(intro ? { intro: cut(intro, 400) } : {}), items: cards.map((card) => ({ title: cut(card.title, 120), text: cut(card.text || card.title, 600) })), ...tone() })
        if (link) add({ type: 'cta', heading: cut(link.text, 160), ...button, ...(groupTone.tone ? groupTone : { tone: 'plain' }) })
        return
      }
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

    if (body && link && heading && body.length <= 600) {
      add({ type: 'cta', heading, text: body, ...button, ...(groupTone.tone ? groupTone : { tone: 'plain' }) })
    } else if (body) {
      add({ type: 'text', ...(heading ? { heading } : {}), body: cut(body, 8000), ...tone() })
    } else if (heading && link) {
      add({ type: 'cta', heading, ...button, ...(groupTone.tone ? groupTone : { tone: 'plain' }) })
    } else if (heading && !images.length) {
      add({ type: 'text', body: heading, ...tone() })
    }
    if (images.length && !(images.length === 1 && body)) add({ type: 'gallery', ...(body || !heading ? {} : { heading }), images: images.slice(0, 24).map((item) => ({ imageUrl: item.url, imageAlt: item.alt })), ...tone() })
  })
  const heroAt = blocks.findIndex((block) => block.type === 'hero')
  if (heroAt > 0 && heroAt <= 3) blocks.unshift(...blocks.splice(heroAt, 1))
  // A page that starts with words beside a photo starts with a top banner, as the old one did.
  const first = blocks[0]
  if (first?.type === 'split' && first.heading && !blocks.some((block) => block.type === 'hero')) {
    const lines = String(first.body ?? '').split('\n\n').filter(Boolean)
    const eyebrow = lines.length > 1 && lines[0].length <= 60 ? lines.shift() : undefined
    blocks[0] = { type: 'hero', ...(eyebrow ? { eyebrow } : {}), heading: first.heading, ...(lines.length ? { text: cut(lines.join(' '), 600) } : {}), ...(first.buttonLabel ? { buttonLabel: first.buttonLabel, buttonHref: first.buttonHref } : {}), imageUrl: first.imageUrl, imageAlt: first.imageAlt, layout: 'split', ...(first.tone ? { tone: first.tone } : {}) }
  }
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
export function chromeOf(reading: PageReading, homeUrl = '') {
  const home = homeUrl ? pathOf(homeUrl) : ''
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
      const href = linkFor(item.href, origin, home)
      // The logo links to the start page, and the site's own name already does that.
      if (href && href.startsWith('/') && href !== '/' && href !== '/#top' && !(reading.title && item.text.startsWith(reading.title.split(/\s+[—–|·-]\s+/)[0].trim())) && item.text.length <= 40 && !nav.some((entry) => entry.href === href || entry.label === item.text)) nav.push({ href, label: item.text })
    }
    if (kind === 'footer' && (item.kind === 'text' || item.kind === 'heading' || (item.kind === 'link' && !item.href.startsWith(origin)))) {
      const words = item.kind === 'link' ? item.text : item.text
      if (!footer.includes(words)) footer.push(words)
    }
  }
  // "Araya — Things for every day" names the site in its first part.
  const parts = reading.title.split(/\s+[—–|·-]\s+/).map((part) => part.trim()).filter(Boolean)
  const generic = /^(home|homepage|start|startseite|accueil|inicio|หน้าแรก|หน้าหลัก|welcome|index)$/i
  const name = cut((parts.find((part) => !generic.test(part)) ?? parts[0] ?? '').trim(), 80)
  return { name, nav, footerText: footer.length ? cut(footer.join(' · '), 500) : '' }
}
