import { canChange, canCreate, showRecord } from './data'
import type { DataField, PageRecords } from './data'
import { contrast, fontVars, isHexColor, isSafeHref, readableOn, siteStyles } from './theme'
import { isAvailable } from './items'
import { alternates, languageName, languagePrefix } from './languages'
import { parsePrice } from './money'
import { words } from './text'
import type { Block, Customer, FormField, Item, Settings, SiteRow } from './types'

const defaults = { accent: '#1f4d3a', background: '#fbfaf6', text: '#16201b' }
const repository = 'https://github.com/michoder26-cloud/web-end'

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const paragraphs = (text?: string) =>
  text
    ? text
        .split(/\n\s*\n/)
        .filter(Boolean)
        .map((part) => `<p>${escapeHtml(part)}</p>`)
        .join('')
    : ''

type Context = {
  base: string
  blockIndex: number
  cart: boolean
  customer: Customer | null
  error?: string
  isMainHeading: boolean
  items: Map<string, Item[]>
  language?: string
  pageSlug: string
  query?: URLSearchParams
  records?: Map<number, PageRecords>
  sent?: string
}

const recordValue = (field: DataField, value: unknown, loaded: PageRecords, language?: string) => {
  if (field.type === 'image') return picture(value, field.label)
  if (field.type === 'date' && typeof value === 'string') {
    try {
      return escapeHtml(new Intl.DateTimeFormat(language || 'en', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)))
    } catch {
      return escapeHtml(value)
    }
  }
  if (field.type === 'boolean') return value ? '✓' : '—'
  if (field.type === 'reference') return escapeHtml(loaded.labels.get(`${field.name}:${value}`) ?? `#${value}`)
  if (field.type === 'url' && isSafeHref(value)) return `<a href="${escapeHtml(value)}" rel="noopener noreferrer">${escapeHtml(value)}</a>`
  return escapeHtml(value)
}

const recordInput = (field: DataField, loaded: PageRecords, fullLabel: string) => {
  const name = escapeHtml(field.name)
  const label = escapeHtml(field.label)
  const required = field.required ? ' required' : ''
  const start = field.default === undefined ? '' : escapeHtml(field.default)
  if (field.type === 'boolean') return `<label class="check"><input${field.default === true ? ' checked' : ''} name="${name}" type="checkbox"> ${label}</label>`
  if (field.type === 'textarea') return `<label>${label}<textarea maxlength="10000" name="${name}"${required} rows="4">${start}</textarea></label>`
  const choices = field.type === 'select' ? (field.options ?? []).map((option) => ({ label: option, value: option })) : field.type === 'reference' ? (loaded.options.get(field.name)?.map((option) => ({ full: option.full, label: option.label, value: String(option.id) })) ?? null) : null
  if (choices) return `<label>${label}<select name="${name}"${required}><option value="">—</option>${choices.map((choice: { full?: boolean; label: string; value: string }) => `<option${choice.full ? ' disabled' : ''}${choice.value === start ? ' selected' : ''} value="${escapeHtml(choice.value)}">${escapeHtml(choice.label)}${choice.full ? ` (${fullLabel})` : ''}</option>`).join('')}</select></label>`
  const types: Record<string, string> = { date: 'date', email: 'email', number: 'number', phone: 'tel', reference: 'number', time: 'time', url: 'url' }
  return `<label>${label}<input maxlength="500" name="${name}"${required}${field.type === 'number' ? ' step="any"' : ''} type="${types[field.type] ?? 'text'}" value="${start}"></label>`
}

const link = (href: unknown, base: string) => {
  if (!isSafeHref(href)) return null
  return href
}

const button = (label: unknown, href: unknown, base: string) => {
  const target = link(href, base)
  return label && target ? `<a class="button" href="${escapeHtml(target)}">${escapeHtml(label)}</a>` : ''
}

const picture = (url: unknown, alt: unknown, eager = false) =>
  typeof url === 'string' && (url.startsWith('https://') || /^\/media\/\d+$/.test(url))
    ? `<img alt="${escapeHtml(alt)}" decoding="async" loading="${eager ? 'eager' : 'lazy'}"${eager ? ' fetchpriority="high"' : ''} referrerpolicy="no-referrer" src="${escapeHtml(url)}">`
    : ''

export const pageImage = (url: unknown, alt: unknown, eager = false) => picture(url, alt, eager)

const head = (heading?: string, intro?: string) =>
  heading || intro
    ? `<div class="section-head">${heading ? `<h2>${escapeHtml(heading)}</h2>` : ''}${intro ? `<p class="intro">${escapeHtml(intro)}</p>` : ''}</div>`
    : ''

const section = (name: string, tone: unknown, inner: string, id?: string) =>
  `<section class="block block--${name} tone-${['tint', 'dark'].includes(tone as string) ? tone : 'plain'}"${id ? ` id="${escapeHtml(id)}"` : ''}>${inner}</section>`

const inputTypes: Record<string, string> = { date: 'date', email: 'email', number: 'number', phone: 'tel', text: 'text', time: 'time' }

const field = (item: FormField, query?: URLSearchParams) => {
  const required = item.required ? ' required' : ''
  const name = escapeHtml(item.name)
  const label = escapeHtml(item.label)
  if (item.type === 'checkbox') return `<label class="check"><input name="${name}"${required} type="checkbox"> ${label}</label>`
  if (item.type === 'textarea') return `<label>${label}<textarea maxlength="5000" name="${name}"${required} rows="4"></textarea></label>`
  if (item.type === 'select') {
    const options = (item.options ?? []).map((option) => `<option value="${escapeHtml(option)}"${query?.get(item.name) === option ? ' selected' : ''}>${escapeHtml(option)}</option>`).join('')
    return `<label>${label}<select name="${name}"${required}><option value="">—</option>${options}</select></label>`
  }
  return `<label>${label}<input maxlength="500" name="${name}"${required} ${item.type === 'number' ? 'step="any" ' : ''}type="${inputTypes[item.type] ?? 'text'}"></label>`
}

/** A newsletter form says what sending it means. A form with the box asks, unticked, so only people who tick it get news. */
const newsletterOption = (block: Block, language?: string) => {
  const t = words(language)
  if (block.newsletter === 'checkbox') return `<label class="check"><input name="_newsletter" type="checkbox"> ${escapeHtml(t.newsAskShort)}</label>`
  if (block.newsletter === 'signup') return `<p class="form-note">${escapeHtml(t.newsFormNote)}</p>`
  return ''
}

const renderers: Record<string, (block: Block, context: Context) => string> = {
  hero(block, { base, isMainHeading }) {
    const tag = isMainHeading ? 'h1' : 'h2'
    const layout = block.imageUrl ? block.layout || 'split' : block.layout === 'centered' ? 'centered' : 'plain'
    const copy = `<div class="hero__copy">${block.eyebrow ? `<p class="eyebrow">${escapeHtml(block.eyebrow)}</p>` : ''}<${tag}>${escapeHtml(block.heading)}</${tag}>${block.text ? `<p class="lead">${escapeHtml(block.text)}</p>` : ''}${button(block.buttonLabel, block.buttonHref, base)}</div>`
    const image = picture(block.imageUrl, block.imageAlt, isMainHeading)
    const media = layout === 'cover' ? `<div class="hero__media">${image}</div>` : ''
    const side = layout !== 'cover' && image ? `<div class="hero__image">${image}</div>` : ''
    return `<section class="block block--hero hero--${layout} tone-${block.tone || 'plain'}">${media}<div class="wrap hero">${copy}${side}</div></section>`
  },
  text: (block) =>
    section('text', block.tone, `<div class="wrap prose">${block.heading ? `<h2>${escapeHtml(block.heading)}</h2>` : ''}${paragraphs(block.body)}</div>`),
  split: (block, { base }) =>
    section(
      'split',
      block.tone,
      `<div class="wrap split split--image-${block.imageSide === 'left' ? 'left' : 'right'}"><div class="split__copy">${block.heading ? `<h2>${escapeHtml(block.heading)}</h2>` : ''}${paragraphs(block.body)}${button(block.buttonLabel, block.buttonHref, base)}</div><div class="split__image">${picture(block.imageUrl, block.imageAlt)}</div></div>`,
    ),
  features: (block) =>
    section(
      'features',
      block.tone,
      `<div class="wrap">${head(block.heading, block.intro)}<div class="grid features">${(block.items ?? []).map((item: any) => `<article class="card"><h3>${escapeHtml(item.title)}</h3>${paragraphs(item.text)}</article>`).join('')}</div></div>`,
    ),
  steps: (block) =>
    section(
      'steps',
      block.tone,
      `<div class="wrap">${head(block.heading, block.intro)}<ol class="steps">${(block.items ?? []).map((item: any) => `<li><h3>${escapeHtml(item.title)}</h3>${paragraphs(item.text)}</li>`).join('')}</ol></div>`,
    ),
  stats: (block) =>
    section(
      'stats',
      block.tone,
      `<div class="wrap">${head(block.heading)}<dl class="stats">${(block.items ?? []).map((item: any) => `<div><dd>${escapeHtml(item.value)}</dd><dt>${escapeHtml(item.label)}</dt></div>`).join('')}</dl></div>`,
    ),
  pricing: (block, { base }) =>
    section(
      'pricing',
      block.tone,
      `<div class="wrap">${head(block.heading, block.intro)}<div class="grid pricing">${(block.plans ?? [])
        .map((plan: any) => {
          const features = String(plan.features ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
          return `<article class="card plan${plan.highlighted ? ' plan--highlighted' : ''}"><h3>${escapeHtml(plan.name)}</h3><p class="plan__price">${escapeHtml(plan.price)}</p>${plan.note ? `<p class="plan__note">${escapeHtml(plan.note)}</p>` : ''}${features.length ? `<ul>${features.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>` : ''}${button(plan.buttonLabel, plan.buttonHref, base)}</article>`
        })
        .join('')}</div></div>`,
    ),
  testimonials: (block) =>
    section(
      'testimonials',
      block.tone,
      `<div class="wrap">${head(block.heading)}<div class="grid testimonials">${(block.items ?? []).map((item: any) => `<figure class="card quote"><blockquote>${escapeHtml(item.quote)}</blockquote><figcaption><strong>${escapeHtml(item.name)}</strong>${item.role ? `<span>${escapeHtml(item.role)}</span>` : ''}</figcaption></figure>`).join('')}</div></div>`,
    ),
  team: (block) =>
    section(
      'team',
      block.tone,
      `<div class="wrap">${head(block.heading, block.intro)}<div class="grid team">${(block.members ?? []).map((member: any) => `<article><div class="team__photo">${picture(member.imageUrl, member.name)}</div><h3>${escapeHtml(member.name)}</h3>${member.role ? `<p class="team__role">${escapeHtml(member.role)}</p>` : ''}${paragraphs(member.text)}</article>`).join('')}</div></div>`,
    ),
  gallery: (block) =>
    section(
      'gallery',
      block.tone,
      `<div class="wrap">${head(block.heading)}<div class="gallery">${(block.images ?? []).map((item: any) => `<figure>${picture(item.imageUrl, item.imageAlt)}${item.caption ? `<figcaption>${escapeHtml(item.caption)}</figcaption>` : ''}</figure>`).join('')}</div></div>`,
    ),
  info: (block, { base }) =>
    section(
      'info',
      block.tone,
      `<div class="wrap info">${block.heading ? `<h2>${escapeHtml(block.heading)}</h2>` : ''}<div><dl>${(block.items ?? []).map((item: any) => `<div><dt>${escapeHtml(item.label)}</dt><dd class="pre-line">${escapeHtml(item.value)}</dd></div>`).join('')}</dl>${button(block.buttonLabel, block.buttonHref, base)}</div></div>`,
      block.id,
    ),
  faq: (block) =>
    section(
      'faq',
      block.tone,
      `<div class="wrap info">${block.heading ? `<h2>${escapeHtml(block.heading)}</h2>` : ''}<div>${(block.items ?? []).map((item: any) => `<details><summary>${escapeHtml(item.question)}</summary>${paragraphs(item.answer)}</details>`).join('')}</div></div>`,
    ),
  links(block, { base }) {
    const items = ((block.items ?? []) as { href?: string; label?: string; text?: string }[]).filter((item) => item.label && link(item.href, base))
    const cards = items.some((item) => item.text)
    const list = cards
      ? `<div class="grid">${items.map((item) => `<a class="card link-card" href="${escapeHtml(item.href)}"><h3>${escapeHtml(item.label)}</h3>${paragraphs(item.text)}</a>`).join('')}</div>`
      : `<ul class="link-row">${items.map((item) => `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a></li>`).join('')}</ul>`
    return section('links', block.tone, `<div class="wrap">${head(block.heading, block.intro)}${list}</div>`)
  },
  cta: (block, { base }) =>
    section(
      'cta',
      block.tone || 'dark',
      `<div class="wrap cta"><div><h2>${escapeHtml(block.heading)}</h2>${paragraphs(block.text)}</div>${button(block.buttonLabel, block.buttonHref, base)}</div>`,
    ),
  collection(block, { base, cart, items, language, query }) {
    const t = words(language)
    const all = items.get(block.collection) ?? []
    const anchor = block.id ? `#${block.id}` : ''
    const categories = [...new Set(all.map((item) => item.category).filter(Boolean))]
    const chosen = block.filters && categories.includes(query?.get('category') ?? '') ? query?.get('category') : null
    const list = all.filter((item) => !chosen || item.category === chosen).slice(0, Number(block.limit) || undefined)
    if (!list.length) return ''
    const pills = block.filters && categories.length > 1
      ? `<nav aria-label="${t.products}" class="filter-pills"><a${chosen ? '' : ' aria-current="true"'} href="/${anchor}">${t.allCategories}</a>${categories.map((category) => `<a${category === chosen ? ' aria-current="true"' : ''} href="?category=${encodeURIComponent(category)}${anchor}">${escapeHtml(category)}</a>`).join('')}</nav>`
      : ''
    const cards = list
      .map((item) => {
        const target = item.link_href || (block.orderField && String(block.buttonHref).startsWith('#') ? `?${encodeURIComponent(block.orderField)}=${encodeURIComponent(item.title)}${block.buttonHref}` : block.buttonHref)
        const photo = picture(item.image_url, item.image_alt || item.title)
        const detail = `/product/${item.id}`
        const available = isAvailable(item)
        const options = item.variants ?? []
        const firstPrice = options.find((option) => option.price)?.price || item.price
        const buyable = cart && !target && parsePrice(firstPrice)
        const action = buyable
          ? !available
            ? `<p class="product__sold-out">${t.soldOut}</p>`
            : options.length
              ? `<a class="button button--ghost" href="${detail}">${t.chooseOption}</a>`
              : `<form action="/cart/add" class="product__buy" method="post"><input name="item" type="hidden" value="${item.id}"><button class="button" type="submit">${escapeHtml(item.link_label || block.buttonLabel || t.addToCart)}</button></form>`
          : button(item.link_label || block.buttonLabel, target, base)
        const badge = !available ? t.soldOut : item.compare_price ? t.sale : ''
        return `<article class="product"><a class="product__link" href="${detail}">${photo ? `<div class="product__image">${photo}${badge ? `<span class="product__badge">${badge}</span>` : ''}</div>` : badge ? `<span class="product__badge product__badge--inline">${badge}</span>` : ''}<h3>${escapeHtml(item.title)}</h3></a><p class="product-price">${item.price ? `<strong>${escapeHtml(item.price)}</strong>` : ''}${item.compare_price ? `<s>${escapeHtml(item.compare_price)}</s>` : ''}</p>${item.body ? `<p class="product__text">${escapeHtml(item.body)}</p>` : ''}${action}</article>`
      })
      .join('')
    return section('collection', block.tone, `<div class="wrap">${head(block.heading, block.intro)}${pills}<div class="products">${cards}</div></div>`, block.id)
  },
  form(block, { base, customer, error, language, pageSlug, query, sent }) {
    const name = String(block.name)
    if (block.membersOnly && !customer) {
      const path = `/${pageSlug === 'home' ? '' : pageSlug}`
      const t = words(language)
      return section('form', block.tone, `<div class="wrap info"><div>${block.heading ? `<h2>${escapeHtml(block.heading)}</h2>` : ''}${paragraphs(block.intro)}</div><div><p>${t.loginToUse}</p><a class="button" href="/login?next=${encodeURIComponent(path)}">${t.logIn}</a></div></div>`, `form-${name}`)
    }
    const status =
      sent === name
        ? `<p role="status">${escapeHtml(block.sentMessage || 'Thank you. We have received this.')}</p>`
        : error === name
          ? `<p role="alert">${escapeHtml(block.errorMessage || 'That did not send. Please check the form and try again.')}</p>`
          : ''
    return section(
      'form',
      block.tone,
      `<div class="wrap info"><div>${block.heading ? `<h2>${escapeHtml(block.heading)}</h2>` : ''}${paragraphs(block.intro)}</div><div>${status}<form action="${escapeHtml(`${base}/form/${pageSlug}/${name}`)}" class="contact-form" method="post">${(block.fields ?? []).map((item: FormField) => field(item, query)).join('')}${newsletterOption(block, language)}<label aria-hidden="true" class="trap">Leave this empty<input autocomplete="off" name="website" tabindex="-1"></label><button class="button" type="submit">${escapeHtml(block.buttonLabel || 'Send')}</button></form></div></div>`,
      `form-${name}`,
    )
  },
  records(block, { blockIndex, customer, language, pageSlug, records }) {
    const t = words(language)
    const loaded = records?.get(blockIndex)
    if (!loaded) return ''
    const path = `/${pageSlug === 'home' ? '' : pageSlug}`
    const anchor = block.id || `record-${loaded.table.name}`
    if (!loaded.scope) {
      if (customer || ['owner', 'staff'].includes(loaded.table.read_access)) return ''
      return section('records', block.tone, `<div class="wrap">${head(block.heading, block.intro)}<p>${t.loginToSee}</p><a class="button" href="/login?next=${encodeURIComponent(path)}">${t.logIn}</a></div>`, anchor)
    }
    const actor = { admin: false, customer }
    const chosen = block.fields as string[] | undefined
    const fields = loaded.table.fields.filter((field) => !chosen || chosen.includes(field.name))
    const cards = loaded.rows
      .map((row) => {
        const shown = showRecord(loaded.table, row, actor) as Record<string, unknown>
        const present = fields.filter((field) => shown[field.name] !== undefined)
        const images = present.filter((field) => field.type === 'image').map((field) => recordValue(field, shown[field.name], loaded, language)).join('')
        const left = loaded.left.get(row.id)
        const rows = present.filter((field) => field.type !== 'image').map((field) => `<div><dt>${escapeHtml(field.label)}</dt><dd class="pre-line">${recordValue(field, shown[field.name], loaded, language)}</dd></div>`).join('') + (left === undefined ? '' : `<div><dt>${t.spotsLeft}</dt><dd>${left || t.full}</dd></div>`)
        const remove = block.allowDelete && canChange(loaded.table, actor, row) ? `<form action="/data/${escapeHtml(loaded.table.name)}/${row.id}/delete" method="post"><input name="next" type="hidden" value="${escapeHtml(path)}"><button class="link-button" type="submit">${t.remove}</button></form>` : ''
        return `<article class="card account__record">${images}<dl>${rows}</dl>${remove}</article>`
      })
      .join('')
    return section('records', block.tone, `<div class="wrap">${head(block.heading, block.intro)}${cards ? `<div class="records">${cards}</div>` : `<p>${t.recordsEmpty}</p>`}</div>`, anchor)
  },
  'record-form'(block, { blockIndex, customer, error, language, pageSlug, query, records, sent }) {
    const t = words(language)
    const loaded = records?.get(blockIndex)
    if (!loaded) return ''
    const path = `/${pageSlug === 'home' ? '' : pageSlug}`
    const anchor = `record-${loaded.table.name}`
    const copy = `<div>${block.heading ? `<h2>${escapeHtml(block.heading)}</h2>` : ''}${paragraphs(block.intro)}</div>`
    if (!canCreate(loaded.table, { admin: false, customer })) {
      if (customer || ['owner', 'staff'].includes(loaded.table.write_access)) return ''
      return section('form', block.tone, `<div class="wrap info">${copy}<div><p>${t.loginToUse}</p><a class="button" href="/login?next=${encodeURIComponent(path)}">${t.logIn}</a></div></div>`, anchor)
    }
    const chosen = block.fields as string[] | undefined
    const inputs = loaded.table.fields.filter((field) => !field.staffOnly && !field.readOnly && (!chosen || chosen.includes(field.name))).map((field) => recordInput(field, loaded, t.full)).join('')
    const why = query?.get('why')
    const status = sent === anchor ? `<p role="status">${escapeHtml(block.sentMessage || t.recordSent)}</p>` : error === anchor ? `<p role="alert">${why === 'full' ? t.recordFull : why === 'duplicate' ? t.recordDuplicate : escapeHtml(block.errorMessage || t.recordFailed)}</p>` : ''
    return section('form', block.tone, `<div class="wrap info">${copy}<div>${status}<form action="/data/${escapeHtml(loaded.table.name)}" class="contact-form" method="post"><input name="next" type="hidden" value="${escapeHtml(path)}">${inputs}<label aria-hidden="true" class="trap">Leave this empty<input autocomplete="off" name="website" tabindex="-1"></label><button class="button" type="submit">${escapeHtml(block.buttonLabel || t.recordSend)}</button></form></div></div>`, anchor)
  },
  // Custom code loads from its own address, because a srcdoc frame would inherit this page's ban on scripts.
  html: (block, { blockIndex, pageSlug }) =>
    section(
      'html',
      block.tone,
      `<div class="wrap"><iframe class="custom-html" height="${Math.min(Math.max(Number(block.height) || 400, 50), 3000)}" sandbox="allow-scripts allow-forms" src="/frame/${escapeHtml(pageSlug)}/${blockIndex}" title="${escapeHtml(block.title || 'Custom section')}"></iframe></div>`,
    ),
}

const svg = (path: string) => `<svg aria-hidden="true" fill="none" height="22" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24" width="22">${path}</svg>`
const icons = {
  bag: svg('<path d="M6 8h12l1 12H5L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
  grid: svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
  home: svg('<path d="m4 11 8-7 8 7v9h-5v-6H9v6H4v-9Z"/>'),
  person: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 4-7 8-7s7 2 8 7"/>'),
}

type LayoutOptions = {
  canonical: string
  cartCount?: number
  customer: Customer | null
  description: string
  head?: string
  isHome?: boolean
  main: string
  robots?: string
  title: string
}

/** The shared frame of every public page: colours, header, navigation and footer. */
export function renderLayout(site: SiteRow, options: LayoutOptions) {
  const settings = JSON.parse(site.settings) as Settings
  const base = ''
  const accent = isHexColor(settings.accent) ? settings.accent : defaults.accent
  const background = isHexColor(settings.background) ? settings.background : defaults.background
  const text = isHexColor(settings.text) ? settings.text : defaults.text
  const accentOnDark = contrast(accent, text) >= 3 ? accent : background
  const style = siteStyles.includes(settings.style as never) ? settings.style : 'studio'
  const lang = /^[a-zA-Z-]{2,12}$/.test(settings.language ?? '') ? settings.language : 'en'
  const vars = `--accent:${accent};--accent-dark:${accentOnDark};--accent-text:${contrast(accent, background) >= 5 ? accent : text};--accent-text-dark:${contrast(accent, text) >= 5 ? accent : background};--base-bg:${background};--base-ink:${text};--on-accent:${readableOn(accent)};--on-accent-dark:${readableOn(accentOnDark)}`
  const t = words(settings.language)
  // Pages are made with their address in the main language. Visitors of an extra language get it under its prefix, with links to the others.
  const where = (() => {
    try {
      return new URL(options.canonical)
    } catch {
      return null
    }
  })()
  const canonical = where ? `${where.origin}${languagePrefix(settings)}${where.pathname}${where.search}` : options.canonical
  const others = where ? alternates(settings, where.origin, where.pathname) : []
  const hreflang = others.length && !options.robots ? [...others.map((one) => `<link rel="alternate" hreflang="${escapeHtml(one.code)}" href="${escapeHtml(one.href)}">`), `<link rel="alternate" hreflang="x-default" href="${escapeHtml(others[0].href)}">`].join('\n') : ''
  const switcher = others.filter((one) => one.code !== settings.language).map((one) => `<a class="site-lang" href="${escapeHtml(one.href)}" hreflang="${escapeHtml(one.code)}" lang="${escapeHtml(one.code)}">${escapeHtml(languageName(one.code))}</a>`).join('')

  // Menu links such as #products point at the home page, so they need its address everywhere else.
  const fromMenu = (href: unknown) => (typeof href === 'string' && href.startsWith('#') && !options.isHome ? `/${href}` : href)
  const links = (settings.nav ?? [])
    .map((item) => {
      const target = link(fromMenu(item.href), base)
      return target ? `<a href="${escapeHtml(target)}">${escapeHtml(item.label)}</a>` : ''
    })
    .join('')
  const accountLink = settings.accounts ? `<a class="site-account" href="${options.customer ? '/account' : '/login'}">${options.customer ? t.account : t.logIn}</a>` : ''
  const cartLink = settings.cart ? `<a class="site-account" href="/cart">${t.cart}${options.cartCount ? ` (${options.cartCount})` : ''}</a>` : ''
  const nav = links + cartLink + accountLink
  const productsLink = (settings.nav ?? []).find((item) => /product|shop|สินค้า/i.test(`${item.href} ${item.label}`))?.href
  const tabs = settings.cart
    ? `<nav aria-label="${t.home}" class="tab-bar"><a href="/">${icons.home}<span>${t.home}</span></a><a href="${escapeHtml(link(fromMenu(productsLink ?? '/'), base) ?? '/')}">${icons.grid}<span>${t.products}</span></a><a href="/cart">${icons.bag}<span>${t.cart}${options.cartCount ? ` (${options.cartCount})` : ''}</span></a>${settings.accounts ? `<a href="${options.customer ? '/account' : '/login'}">${icons.person}<span>${options.customer ? t.account : t.logIn}</span></a>` : ''}</nav>`
    : ''
  const headerButton = settings.headerButtonLabel ? button(settings.headerButtonLabel, fromMenu(settings.headerButtonHref), base).replace('class="button"', 'class="button button--small"') : ''
  // CSS never needs a raw "<", and removing it means the text cannot close the style tag.
  const customCss = settings.customCss ? `<style>${settings.customCss.replaceAll('<', '\\3C ')}</style>` : ''

  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.title)}</title>
<meta name="description" content="${escapeHtml(options.description)}">
${options.robots ? `<meta name="robots" content="${escapeHtml(options.robots)}">` : ''}
<link rel="canonical" href="${escapeHtml(canonical)}">
${hreflang}
<meta property="og:title" content="${escapeHtml(options.title)}">
<meta property="og:description" content="${escapeHtml(options.description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escapeHtml(settings.name)}">
<link rel="stylesheet" href="/fonts/fonts.css">
<link rel="stylesheet" href="/site.css">
${customCss}
${options.head ?? ''}
</head>
<body class="${tabs ? 'has-tabs' : ''}" data-style="${style}" style="${vars}${fontVars(settings.headingFont, settings.bodyFont).replaceAll("'", '&#39;')}">
<header class="site-header"><div class="wrap site-header__inner"><a class="site-name" href="/">${escapeHtml(settings.name)}</a>${nav ? `<nav aria-label="Main">${nav}</nav>` : ''}${switcher}${headerButton}</div></header>
<main>${options.main}</main>
<footer class="site-footer"><div class="wrap"><div class="site-footer__grid"><div><p class="site-footer__name">${escapeHtml(settings.name)}</p>${settings.tagline ? `<p>${escapeHtml(settings.tagline)}</p>` : ''}${settings.footerText ? `<p class="pre-line">${escapeHtml(settings.footerText)}</p>` : ''}</div>${links ? `<nav aria-label="Footer">${links}</nav>` : ''}${settings.email || settings.phone || settings.address ? `<address>${settings.address ? `<p class="pre-line">${escapeHtml(settings.address)}</p>` : ''}${settings.phone ? `<a href="tel:${escapeHtml(settings.phone.replace(/[^\d+]/g, ''))}">${escapeHtml(settings.phone)}</a>` : ''}${settings.email ? `<a href="mailto:${escapeHtml(settings.email)}">${escapeHtml(settings.email)}</a>` : ''}</address>` : ''}</div><p class="site-credit">Made with <a href="${repository}">web-end</a>, free and open source.</p></div></footer>
${tabs}
</body>
</html>`
}

export function renderPage(
  site: SiteRow,
  page: { blocks: Block[]; description: string; slug: string; title: string },
  options: { canonical: string; cartCount?: number; customer: Customer | null; error?: string; items: Map<string, Item[]>; query?: URLSearchParams; records?: Map<number, PageRecords>; sent?: string; untranslated?: { blocks: Set<number>; label: string } },
) {
  const settings = JSON.parse(site.settings) as Settings
  const firstHero = page.blocks.findIndex((block) => block.type === 'hero')
  const blocks = page.blocks
    .map((block, index) => {
      const shown = renderers[block.type]?.(block, { base: '', blockIndex: index, cart: Boolean(settings.cart), customer: options.customer, error: options.error, isMainHeading: index === firstHero, items: options.items, language: settings.language, pageSlug: page.slug, query: options.query, records: options.records, sent: options.sent }) ?? ''
      // Only the owner's preview passes these, to mark sections still in the main language.
      return options.untranslated?.blocks.has(index) ? shown.replace('<section ', `<section data-untranslated="${escapeHtml(options.untranslated.label)}" `) : shown
    })
    .join('')
  const title = firstHero === -1 ? `<section class="block block--title tone-plain"><div class="wrap"><h1>${escapeHtml(page.title)}</h1></div></section>` : ''
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    description: page.description,
    isPartOf: { '@type': 'WebSite', name: settings.name },
    name: page.title,
    ...(settings.viewLanguage ? { inLanguage: settings.viewLanguage } : {}),
    url: (() => {
      try {
        const where = new URL(options.canonical)
        return `${where.origin}${languagePrefix(settings)}${where.pathname}`
      } catch {
        return options.canonical
      }
    })(),
  }).replace(/</g, '\\u003c')
  return renderLayout(site, {
    canonical: options.canonical,
    cartCount: options.cartCount,
    customer: options.customer,
    description: page.description,
    head: `<script type="application/ld+json">${jsonLd}</script>`,
    isHome: page.slug === 'home',
    main: `${title}${blocks}`,
    title: page.slug === 'home' || page.title.includes(settings.name) ? page.title : `${page.title} | ${settings.name}`,
  })
}
