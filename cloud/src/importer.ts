// Turns a reading of an old page into normal web-end blocks, with fixed rules and no AI:
// the words stay exactly as they were, only the layout is chosen from what each part of the page holds.
import type { FlowItem, PageReading } from './moving'
import type { Block } from './types'

type Group = FlowItem[]
type Heading = Extract<FlowItem, { kind: 'heading' }>
type Image = Extract<FlowItem, { kind: 'image' }>
type Link = Extract<FlowItem, { kind: 'link' }>
type Form = Extract<FlowItem, { kind: 'form' }>

// The site's own header, menu and footer come from web-end, so the old ones are not rebuilt as page content.
const chrome = new Set(['header', 'footer', 'nav', 'aside'])
const maxBlocks = 40

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
      return slug === 'home' ? '/' : `/${slug}`
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
    if (item.section && chrome.has(item.section.kind)) continue
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
export function blocksFromReading(reading: PageReading, image: (url: string) => string | undefined) {
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
  let tint = false
  const tone = () => ((tint = !tint) ? {} : { tone: 'tint' })
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
      add({ type: 'hero', ...(eyebrow ? { eyebrow } : {}), heading, ...(first.length ? { text: first.join(' ') } : {}), ...button, ...(images[0] ? { imageUrl: images[0].url, imageAlt: images[0].alt, layout: 'split' } : { layout: 'centered' }) })
      const rest = group
        .filter((item) => (item.kind === 'text' && !first.includes(item.text) && item.text !== eyebrow) || (item.kind === 'heading' && item !== main))
        .map((item) => (item.kind === 'text' || item.kind === 'heading' ? item.text : ''))
      if (rest.length) add({ type: 'text', body: cut(rest.join('\n\n'), 8000), ...tone() })
      if (images.length > 1) add({ type: 'gallery', images: images.slice(1, 25).map((item) => ({ imageUrl: item.url, imageAlt: item.alt })), ...tone() })
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

/** The old page's photos that would show in the rebuilt page, in page order, without the site's header and footer. */
export function photosOf(reading: PageReading) {
  const seen = new Set<string>()
  for (const item of reading.flow ?? []) {
    if (item.kind === 'image' && !(item.section && chrome.has(item.section.kind))) seen.add(item.url)
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
      if (href && href.startsWith('/') && href !== '/' && item.text.length <= 40 && !nav.some((entry) => entry.href === href || entry.label === item.text)) nav.push({ href, label: item.text })
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
