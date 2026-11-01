import { contrast, isHexColor, isSafeHref, readableOn, siteStyles } from './theme'
import type { Block, FormField, Settings, SiteRow } from './types'

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
  error?: string
  isMainHeading: boolean
  pageSlug: string
  sent?: string
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
  typeof url === 'string' && url.startsWith('https://')
    ? `<img alt="${escapeHtml(alt)}" decoding="async" loading="${eager ? 'eager' : 'lazy'}"${eager ? ' fetchpriority="high"' : ''} referrerpolicy="no-referrer" src="${escapeHtml(url)}">`
    : ''

const head = (heading?: string, intro?: string) =>
  heading || intro
    ? `<div class="section-head">${heading ? `<h2>${escapeHtml(heading)}</h2>` : ''}${intro ? `<p class="intro">${escapeHtml(intro)}</p>` : ''}</div>`
    : ''

const section = (name: string, tone: unknown, inner: string, id?: string) =>
  `<section class="block block--${name} tone-${['tint', 'dark'].includes(tone as string) ? tone : 'plain'}"${id ? ` id="${escapeHtml(id)}"` : ''}>${inner}</section>`

const inputTypes: Record<string, string> = { date: 'date', email: 'email', number: 'number', phone: 'tel', text: 'text', time: 'time' }

const field = (item: FormField) => {
  const required = item.required ? ' required' : ''
  const name = escapeHtml(item.name)
  const label = escapeHtml(item.label)
  if (item.type === 'checkbox') return `<label class="check"><input name="${name}"${required} type="checkbox"> ${label}</label>`
  if (item.type === 'textarea') return `<label>${label}<textarea maxlength="5000" name="${name}"${required} rows="4"></textarea></label>`
  if (item.type === 'select') {
    const options = (item.options ?? []).map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join('')
    return `<label>${label}<select name="${name}"${required}><option value="">—</option>${options}</select></label>`
  }
  return `<label>${label}<input maxlength="500" name="${name}"${required} ${item.type === 'number' ? 'step="any" ' : ''}type="${inputTypes[item.type] ?? 'text'}"></label>`
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
  cta: (block, { base }) =>
    section(
      'cta',
      block.tone || 'dark',
      `<div class="wrap cta"><div><h2>${escapeHtml(block.heading)}</h2>${paragraphs(block.text)}</div>${button(block.buttonLabel, block.buttonHref, base)}</div>`,
    ),
  form(block, { base, error, pageSlug, sent }) {
    const name = String(block.name)
    const status =
      sent === name
        ? `<p role="status">${escapeHtml(block.sentMessage || 'Thank you. We have received this.')}</p>`
        : error === name
          ? `<p role="alert">${escapeHtml(block.errorMessage || 'That did not send. Please check the form and try again.')}</p>`
          : ''
    return section(
      'form',
      block.tone,
      `<div class="wrap info"><div>${block.heading ? `<h2>${escapeHtml(block.heading)}</h2>` : ''}${paragraphs(block.intro)}</div><div>${status}<form action="${escapeHtml(`${base}/form/${pageSlug}/${name}`)}" class="contact-form" method="post">${(block.fields ?? []).map(field).join('')}<label aria-hidden="true" class="trap">Leave this empty<input autocomplete="off" name="website" tabindex="-1"></label><button class="button" type="submit">${escapeHtml(block.buttonLabel || 'Send')}</button></form></div></div>`,
      `form-${name}`,
    )
  },
  // Custom code runs in a sandbox with no access to the page or to other sites.
  html: (block) =>
    section(
      'html',
      block.tone,
      `<div class="wrap"><iframe class="custom-html" height="${Math.min(Math.max(Number(block.height) || 400, 50), 3000)}" sandbox="allow-scripts allow-forms" srcdoc="${escapeHtml(block.code)}" title="${escapeHtml(block.title || 'Custom section')}"></iframe></div>`,
    ),
}

export function renderPage(
  site: SiteRow,
  page: { blocks: Block[]; description: string; slug: string; title: string },
  options: { canonical: string; error?: string; sent?: string },
) {
  const settings = JSON.parse(site.settings) as Settings
  const base = ''
  const accent = isHexColor(settings.accent) ? settings.accent : defaults.accent
  const background = isHexColor(settings.background) ? settings.background : defaults.background
  const text = isHexColor(settings.text) ? settings.text : defaults.text
  const accentOnDark = contrast(accent, text) >= 3 ? accent : background
  const style = siteStyles.includes(settings.style as never) ? settings.style : 'studio'
  const lang = /^[a-zA-Z-]{2,12}$/.test(settings.language ?? '') ? settings.language : 'en'
  const vars = `--accent:${accent};--accent-dark:${accentOnDark};--accent-text:${contrast(accent, background) >= 5 ? accent : text};--accent-text-dark:${contrast(accent, text) >= 5 ? accent : background};--base-bg:${background};--base-ink:${text};--on-accent:${readableOn(accent)};--on-accent-dark:${readableOn(accentOnDark)}`

  const firstHero = page.blocks.findIndex((block) => block.type === 'hero')
  const main = page.blocks
    .map((block, index) =>
      renderers[block.type]?.(block, { base, error: options.error, isMainHeading: index === firstHero, pageSlug: page.slug, sent: options.sent }) ?? '',
    )
    .join('')
  const title = firstHero === -1 ? `<section class="block block--title tone-plain"><div class="wrap"><h1>${escapeHtml(page.title)}</h1></div></section>` : ''

  const nav = (settings.nav ?? [])
    .map((item) => {
      const target = link(item.href, base)
      return target ? `<a href="${escapeHtml(target)}">${escapeHtml(item.label)}</a>` : ''
    })
    .join('')
  const headerButton = settings.headerButtonLabel ? button(settings.headerButtonLabel, settings.headerButtonHref, base).replace('class="button"', 'class="button button--small"') : ''
  const pageTitle = page.slug === 'home' ? page.title : `${page.title} | ${settings.name}`
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    description: page.description,
    isPartOf: { '@type': 'WebSite', name: settings.name },
    name: page.title,
    url: options.canonical,
  }).replace(/</g, '\\u003c')
  // CSS never needs a raw "<", and removing it means the text cannot close the style tag.
  const customCss = settings.customCss ? `<style>${settings.customCss.replaceAll('<', '\\3C ')}</style>` : ''

  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="${escapeHtml(page.description)}">
<link rel="canonical" href="${escapeHtml(options.canonical)}">
<meta property="og:title" content="${escapeHtml(page.title)}">
<meta property="og:description" content="${escapeHtml(page.description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escapeHtml(settings.name)}">
<link rel="stylesheet" href="/fonts/fonts.css">
<link rel="stylesheet" href="/site.css">
${customCss}
<script type="application/ld+json">${jsonLd}</script>
</head>
<body data-style="${style}" style="${vars}">
<header class="site-header"><div class="wrap site-header__inner"><a class="site-name" href="/">${escapeHtml(settings.name)}</a>${nav ? `<nav aria-label="Main">${nav}</nav>` : ''}${headerButton}</div></header>
<main>${title}${main}</main>
<footer class="site-footer"><div class="wrap"><div class="site-footer__grid"><div><p class="site-footer__name">${escapeHtml(settings.name)}</p>${settings.tagline ? `<p>${escapeHtml(settings.tagline)}</p>` : ''}${settings.footerText ? `<p class="pre-line">${escapeHtml(settings.footerText)}</p>` : ''}</div>${nav ? `<nav aria-label="Footer">${nav}</nav>` : ''}${settings.email || settings.phone || settings.address ? `<address>${settings.address ? `<p class="pre-line">${escapeHtml(settings.address)}</p>` : ''}${settings.phone ? `<a href="tel:${escapeHtml(settings.phone.replace(/[^\d+]/g, ''))}">${escapeHtml(settings.phone)}</a>` : ''}${settings.email ? `<a href="mailto:${escapeHtml(settings.email)}">${escapeHtml(settings.email)}</a>` : ''}</address>` : ''}</div><p class="site-credit">Made with <a href="${repository}">web-end</a>, free and open source.</p></div></footer>
</body>
</html>`
}

