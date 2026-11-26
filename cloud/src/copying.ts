// Moving a page with its own look: the page as a browser drew it, with its style sheets, fonts and photos copied
// into this site. Nothing of the old site's code comes along, and the page is served with scripts switched off,
// so a copied page can never run anything on the owner's site.
import { absoluteUrls, attributesIn, dropUnusedFaces, filesOf, keepUsed, parseCss, ruleText, writeCss, type CssNode, type Used } from './css'
import { escapeHtml } from './http'
import { saveCopiedFile } from './items'
import { smallerCopies } from './moving'
import type { Block, Env, Settings, SiteRow } from './types'
import { safeWebUrl } from './webhooks'

// Cloudflare's free plan allows 50 outside requests per call; the rest of the files are copied by the next call.
const maxFetches = 40
const maxFileBytes = 8_000_000
// A page row holds at most about 2 MB.
export const maxCopyBytes = 1_900_000
const maxPending = 600

export type CopyBlock = Block & {
  type: 'copy'
  html: string
  css: string
  source: string
  htmlAttrs?: Record<string, string>
  bodyAttrs?: Record<string, string>
  menu?: { href: string; label: string }[]
  pending?: string[]
}

const removedTags = new Set(['script', 'noscript', 'iframe', 'object', 'embed', 'applet', 'base', 'frame', 'frameset', 'template', 'portal', 'meta', 'title', 'source', 'track', 'audio', 'param'])
// Cookie notices, chat bubbles and pop-ups that need the old site's code: without it they only cover the page.
const widget = /(^|[\s_-])(onetrust|optanon|cookiebot|cybotcookiebot|cookie-?(banner|consent|notice|bar|law|popup|modal)|cookieconsent|cc-window|cc-banner|osano|truste|didomi|usercentrics|qc-cmp|intercom|drift-|hubspot-messages|crisp-client|tidio|zsiq|fb-root|gdpr|wix-cookie|termly)/i
const urlAttributes = new Set(['href', 'src', 'xlink:href', 'poster', 'action', 'background', 'cite', 'data'])
const keptRootAttributes = /^(class|style|dir|lang|id|data-[\w:.-]+)$/i

const namedEntities: Record<string, string> = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' }
export const decodeEntities = (value: string) =>
  value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const number = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
      return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : match
    }
    return namedEntities[code.toLowerCase()] ?? match
  })

const sameSite = (a: string, b: string) => a.replace(/^www\./, '') === b.replace(/^www\./, '')

/** The largest picture listed in a srcset. */
function largest(srcset: string) {
  let best = ''
  let size = -1
  for (const part of srcset.split(/,\s+(?=\S)/)) {
    const [url, descriptor = '1x'] = part.trim().split(/\s+/)
    const value = parseFloat(descriptor) * (descriptor.endsWith('w') ? 1 : 1000)
    if (url && value > size) { best = url; size = value }
  }
  return best
}

type Sheet = { href?: string; media?: string; text: string }

/** Takes the old page apart: its body without code, its style sheets in order, and what the page uses. */
export async function cleanPage(html: string, pageUrl: string, homeUrl = '') {
  const page = new URL(pageUrl)
  let home: URL | null = null
  try { home = homeUrl ? new URL(homeUrl) : null } catch { home = null }
  const sheets: Sheet[] = []
  const images: string[] = []
  const used: Used = { attributes: new Set(), classes: new Set(), ids: new Set() }
  const htmlAttrs: Record<string, string> = {}
  const bodyAttrs: Record<string, string> = {}
  const menu: { href: string; label: string }[] = []
  const inlineStyles: string[] = []
  let title = ''

  const absolute = (value: string) => {
    try {
      const target = new URL(value.trim(), page)
      return /^https?:$/.test(target.protocol) ? target : null
    } catch {
      return null
    }
  }
  // Links to the old site's own pages become this site's addresses; its start page becomes the home page.
  const linkTo = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed || trimmed.startsWith('#')) return trimmed
    if (/^(mailto|tel|sms):/i.test(trimmed)) return trimmed
    const target = absolute(trimmed)
    if (!target) return '#'
    if (!sameSite(target.hostname, page.hostname)) return target.href
    const path = target.pathname.replace(/\/+$/, '') || '/'
    const homePath = home && sameSite(home.hostname, page.hostname) ? home.pathname.replace(/\/+$/, '') || '/' : '/'
    if (path === homePath) return `/${target.hash}`
    if (target.pathname === page.pathname && target.hash) return target.hash
    return `${path}${target.search}${target.hash}`
  }
  const styleUrls = (value: string) => {
    const fixed = absoluteUrls(value, page.href)
    for (const match of fixed.matchAll(/url\("([^"]+)"\)/g)) if (/^https?:/.test(match[1])) images.push(match[1])
    inlineStyles.push(fixed)
    return fixed
  }
  const rootAttributes = (element: Element, into: Record<string, string>) => {
    for (const [name, value] of element.attributes) if (keptRootAttributes.test(name)) into[name.toLowerCase()] = name === 'style' ? styleUrls(value) : value
    for (const name of (into.class ?? '').split(/\s+/)) if (name) used.classes.add(name)
  }

  const rewriter = new HTMLRewriter()
    .on('*', {
      element(element) {
        const tag = element.tagName.toLowerCase()
        if (tag === 'link') {
          const rel = (element.getAttribute('rel') ?? '').toLowerCase()
          const href = element.getAttribute('href')
          const target = href ? absolute(href) : null
          if (rel.split(/\s+/).includes('stylesheet') && target) sheets.push({ href: target.href, media: element.getAttribute('media') ?? undefined, text: '' })
          element.remove()
          return
        }
        if (removedTags.has(tag)) { element.remove(); return }
        const marks = `${element.getAttribute('id') ?? ''} ${element.getAttribute('class') ?? ''}`
        if (tag !== 'html' && tag !== 'body' && widget.test(marks)) { element.remove(); return }
        if (tag === 'style') {
          element.setAttribute('data-we-cut', '')
          sheets.push({ media: element.getAttribute('media') ?? undefined, text: '' })
          return
        }
        if (tag === 'video') {
          // A film needs code to play here; its still picture takes its place.
          const poster = element.getAttribute('poster')
          const target = poster ? absolute(poster) : null
          if (target) images.push(target.href)
          const kept = ['class', 'style', 'width', 'height'].map((name) => [name, element.getAttribute(name)] as const).filter(([, value]) => value)
          element.replace(target ? `<img alt=""${kept.map(([name, value]) => ` ${name}="${escapeHtml(name === 'style' ? styleUrls(value!) : value)}"`).join('')} src="${escapeHtml(target.href)}" style="object-fit:cover">` : '', { html: true })
          return
        }
        for (const [rawName, value] of [...element.attributes]) {
          const name = rawName.toLowerCase()
          if (name.startsWith('on') || ['srcdoc', 'formaction', 'nonce', 'integrity', 'ping', 'srcset', 'sizes', 'imagesrcset'].includes(name) || name.startsWith('data-we-')) {
            element.removeAttribute(rawName)
            continue
          }
          if (name === 'style') element.setAttribute(rawName, styleUrls(value))
          else if (urlAttributes.has(name) && tag !== 'img') {
            if (/^\s*(javascript|vbscript|data):/i.test(value) && !(tag === 'image' && /^\s*data:image\//i.test(value))) element.setAttribute(rawName, '#')
            else if (name === 'href' || name === 'xlink:href') {
              const fixed = tag === 'a' || tag === 'area' ? linkTo(value) : value.trim().startsWith('#') ? value : absolute(value)?.href ?? '#'
              element.setAttribute(rawName, fixed)
              if (tag === 'image' && /^https?:/.test(fixed)) images.push(fixed)
            }
            else if (name === 'action') element.setAttribute(rawName, '#')
            else {
              const target = absolute(value)
              element.setAttribute(rawName, target?.href ?? '')
              if (target && (tag === 'image' || name === 'background')) images.push(target.href)
            }
          }
        }
        if (tag === 'img') {
          let src = element.getAttribute('src') ?? ''
          const lazy = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy'].map((name) => element.getAttribute(name)).find(Boolean)
          if ((!src || /^data:image\/(gif|svg)/i.test(src)) && lazy) src = lazy
          const set = element.getAttribute('data-srcset')
          if (!src && set) src = largest(set)
          if (/^\s*data:image\//i.test(src)) return
          const target = src ? absolute(src) : null
          if (target) {
            element.setAttribute('src', target.href)
            images.push(target.href)
          } else element.removeAttribute('src')
          element.removeAttribute('loading')
        }
        if (tag === 'form') { element.setAttribute('action', '#'); element.setAttribute('method', 'get') }
        if (tag === 'html') { rootAttributes(element, htmlAttrs); return }
        if (tag === 'body') { rootAttributes(element, bodyAttrs); return }
        for (const name of (element.getAttribute('class') ?? '').split(/\s+/)) if (name) used.classes.add(name)
        const id = element.getAttribute('id')
        if (id) used.ids.add(id)
      },
    })
    .on('style', {
      text(chunk) {
        const last = sheets.at(-1)
        if (last && !last.href) last.text += chunk.text
      },
    })
    .on('title', {
      text(chunk) {
        title += chunk.text
      },
    })
  for (const selector of ['header a', 'nav a']) {
    rewriter.on(selector, {
      element(element) {
        menu.push({ href: element.getAttribute('href') ?? '', label: '' })
      },
      text(chunk) {
        const last = menu.at(-1)
        if (last) last.label += chunk.text
      },
    })
  }
  const out = await rewriter.transform(new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })).text()
  const withoutStyles = out.replace(/<style\b[^>]*\bdata-we-cut\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
  const opened = /<body\b[^>]*>/i.exec(withoutStyles)
  let body = opened ? withoutStyles.slice(opened.index + opened[0].length) : withoutStyles.replace(/^[\s\S]*?<\/head\s*>/i, '')
  body = body.replace(/<\/body\s*>[\s\S]*$/i, '').replace(/<!--[\s\S]*?-->/g, '')
  if (!/<(pre|textarea)\b/i.test(body)) body = body.replace(/>\s+</g, '> <').trim()
  const seen = new Set<string>()
  const links = menu
    .map((item) => ({ href: item.href, label: decodeEntities(item.label).replace(/\s+/g, ' ').trim() }))
    .filter((item) => item.label && item.label.length <= 40 && item.href && item.href !== '#' && !seen.has(item.href) && seen.add(item.href))
    .slice(0, 12)
  return { body: withoutConsentBoxes(body), bodyAttrs, htmlAttrs, images: [...new Set(images)], inlineStyles: inlineStyles.join(' '), menu: links, sheets, title: decodeEntities(title).trim(), used }
}

const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'param'])
const consentWords = /cookie|คุกกี้|consent|gdpr/i
const consentButtons = /<(button|a)\b[^>]*>(?:(?!<\/\1>)[\s\S]){0,300}?(\b(accept|allow|agree|reject|decline|got it|deny)\b|ยอมรับ|ปฏิเสธ)/i

/**
 * Cookie notices that the old site's code would have closed, found by what they say: a small box about cookies
 * with buttons to accept or refuse. Without that code they would cover the page for good. The largest such box
 * is taken, so its frame goes too.
 */
export function withoutConsentBoxes(html: string) {
  if (!consentWords.test(html)) return html
  const cut: [number, number][] = []
  const open: { name: string; start: number }[] = []
  for (const match of html.matchAll(/<(\/?)([a-zA-Z][\w:-]*)\b[^>]*?(\/?)>/g)) {
    const [tag, closing, raw, selfClosing] = match
    const name = raw.toLowerCase()
    if (!closing) {
      if (!voidTags.has(name) && !selfClosing) open.push({ name, start: match.index })
      continue
    }
    let at = open.length - 1
    while (at >= 0 && open[at].name !== name) at--
    if (at < 0) continue
    const { start } = open[at]
    open.length = at
    if (!['div', 'section', 'aside', 'dialog'].includes(name)) continue
    const end = match.index + tag.length
    if (end - start > 40_000) continue
    const inner = html.slice(start, end)
    const words = decodeEntities(inner.replace(/<(style|svg)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
    if (words.length > 1200 || !consentWords.test(words) || !consentButtons.test(inner)) continue
    // A bigger box around one already found replaces it.
    while (cut.length && cut.at(-1)![0] >= start) cut.pop()
    cut.push([start, end])
  }
  let out = html
  for (const [start, end] of cut.reverse()) out = out.slice(0, start) + out.slice(end)
  return out
}

/** A copied page's body as the owner arranged it in the editor, cleaned again: nothing in it may run. */
export async function cleanEditedBody(html: string) {
  const out = await new HTMLRewriter()
    .on('*', {
      element(element) {
        const tag = element.tagName.toLowerCase()
        if (['script', 'noscript', 'iframe', 'object', 'embed', 'applet', 'base', 'frame', 'frameset', 'template', 'portal', 'meta', 'link', 'style', 'title'].includes(tag)) { element.remove(); return }
        const id = element.getAttribute('id') ?? ''
        if (id === 'we-edit-bar' || id === 'we-tools' || id === 'copy-edit-data' || /(^|\s)we-copy-menu(\s|$)/.test(element.getAttribute('class') ?? '')) { element.remove(); return }
        for (const [rawName, value] of [...element.attributes]) {
          const name = rawName.toLowerCase()
          if (name.startsWith('on') || name.startsWith('data-we-') || ['contenteditable', 'srcdoc', 'formaction', 'nonce', 'spellcheck'].includes(name)) element.removeAttribute(rawName)
          else if (['href', 'src', 'xlink:href', 'action', 'poster', 'background'].includes(name) && /^\s*(javascript|vbscript|data:text)/i.test(value)) element.setAttribute(rawName, '#')
        }
      },
    })
    .transform(new Response(`<body>${html}</body>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
    .text()
  return out.replace(/^[\s\S]*?<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, '').trim()
}

/** A worker that copies files until its share of outside requests is used up. */
function copier(env: Env, siteId: number) {
  let left = maxFetches
  const copies = new Map<string, string>()
  const failed = new Set<string>()
  const fetchText = async (url: string) => {
    if (left <= 0) return null
    const target = safeWebUrl(env, url)
    if (!target) return ''
    left--
    const answer = await fetch(target, { headers: { Accept: 'text/css,*/*;q=0.1', 'User-Agent': "web-end-site-mover/1.0 (moving an owner's own site)" }, signal: AbortSignal.timeout(10_000) }).catch((): null => null)
    if (!answer?.ok || Number(answer.headers.get('content-length') || 0) > 3_000_000) return ''
    return (await answer.text()).slice(0, 3_000_000)
  }
  /** Copies one file. False when no requests are left for it in this call. */
  const copy = async (url: string) => {
    if (copies.has(url) || failed.has(url)) return true
    const held = await env.DB.prepare('SELECT id FROM media WHERE site_id = ? AND source = ?').bind(siteId, url).first<{ id: number }>()
    if (held) { copies.set(url, `/media/${held.id}`); return true }
    const target = safeWebUrl(env, url)
    if (!target) { failed.add(url); return true }
    if (left <= 0) return false
    // The file the page showed, as it was; a smaller copy only when that one is over the 1 MB limit.
    for (const attempt of [target.href, ...smallerCopies(target).slice(0, 1)]) {
      if (left <= 0) return false
      left--
      const answer = await fetch(attempt, { headers: { Accept: 'image/*,font/*,*/*;q=0.5', 'User-Agent': "web-end-site-mover/1.0 (moving an owner's own site)" }, signal: AbortSignal.timeout(10_000) }).catch((): null => null)
      if (!answer?.ok || Number(answer.headers.get('content-length') || 0) > maxFileBytes) continue
      const bytes = new Uint8Array(await answer.arrayBuffer())
      if (bytes.length > 1_000_000) continue
      const stored = await saveCopiedFile(env, siteId, bytes, decodeURIComponent(target.pathname.split('/').pop() || 'file'), url)
      if (stored.url) { copies.set(url, stored.url); return true }
    }
    failed.add(url)
    return true
  }
  return { copies, copy, failed, fetchText, left: () => left }
}

/** Puts this site's copies in place of the old addresses, wherever they appear. */
export function useCopies(text: string, copies: Map<string, string>) {
  let out = text
  for (const [from, to] of [...copies].sort((a, b) => b[0].length - a[0].length)) {
    for (const written of new Set([from, from.replaceAll('&', '&amp;')])) {
      const pattern = new RegExp(`${written.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=["')\\s<>,]|&quot;|&#39;|$)`, 'g')
      out = out.replace(pattern, to)
    }
  }
  return out
}

// A style sheet that didn't fit in this call keeps its place in the CSS as this mark, until copy_page_files reads it.
const waitMark = (href: string, media = '') => `/*we-wait ${encodeURIComponent(href)} ${encodeURIComponent(media)}*/`
const waitMarks = /\/\*we-wait (\S+) (\S*)\*\//g

/** Reads one style sheet with the sheets it imports, all addresses made absolute. */
async function readSheet(work: ReturnType<typeof copier>, text: string, base: string, media = '') {
  const imports: string[] = []
  const own = text.replace(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?\s*([^;]*);/gi, (_, address: string, wanted: string) => {
    try {
      imports.push(`${new URL(address, base).href}\u0000${wanted.trim()}`)
    } catch {
      // Not an address.
    }
    return ''
  })
  const parts: string[] = []
  for (const entry of imports) {
    const [address, wanted] = entry.split('\u0000')
    const fetched = await work.fetchText(address)
    if (fetched) parts.push(wanted ? `@media ${wanted}{${absoluteUrls(fetched, address)}}` : absoluteUrls(fetched, address))
  }
  parts.push(absoluteUrls(own, base))
  const joined = parts.join('\n')
  return media && !/^\s*(all|screen)\s*$/i.test(media) ? `@media ${media}{${joined}}` : joined
}

/** The classes and ids a copied page has, read back from its stored HTML. */
function usedIn(block: Pick<CopyBlock, 'bodyAttrs' | 'html' | 'htmlAttrs'>): Used {
  const used: Used = { attributes: new Set(), classes: new Set(), ids: new Set() }
  const classes = [...block.html.matchAll(/\sclass="([^"]*)"/g)].map((match) => match[1])
  for (const list of [...classes, block.htmlAttrs?.class ?? '', block.bodyAttrs?.class ?? '']) for (const name of decodeEntities(list).split(/\s+/)) if (name) used.classes.add(name)
  for (const match of block.html.matchAll(/\sid="([^"]*)"/g)) used.ids.add(decodeEntities(match[1]))
  return used
}

/** Copies a page with its look. Files and style sheets that don't fit in this call wait for copy_page_files. */
export async function copyPage(env: Env, siteId: number, html: string, pageUrl: string, homeUrl = '') {
  const cleaned = await cleanPage(html, pageUrl, homeUrl)
  const work = copier(env, siteId)
  // Style sheets in the page's own order, with the ones they import.
  const parts: (CssNode[] | string)[] = []
  let sheetsWaiting = 0
  let sheetsMissing = 0
  for (const sheet of cleaned.sheets) {
    if (sheet.media && /^\s*print\s*$/i.test(sheet.media)) continue
    let text = sheet.text
    if (sheet.href) {
      const fetched = await work.fetchText(sheet.href)
      if (fetched === null) { parts.push(waitMark(sheet.href, sheet.media)); sheetsWaiting++; continue }
      if (!fetched) { sheetsMissing++; continue }
      text = fetched
    }
    parts.push(keepUsed(parseCss(await readSheet(work, text, sheet.href ?? pageUrl, sheet.media)), cleaned.used))
  }
  const lists = parts.filter((part): part is CssNode[] => typeof part !== 'string')
  const everyRule = `${lists.map(ruleText).join(' ')} ${cleaned.inlineStyles} ${cleaned.body.match(/font-family:[^;"]+/gi)?.join(' ') ?? ''}`
  const kept = parts.map((part) => (typeof part === 'string' ? part : dropUnusedFaces(part, everyRule)))
  const nodes = kept.flatMap((part) => (typeof part === 'string' ? [] : part))
  const files = filesOf(nodes)
  // Fonts first (they carry the look), then the photos from the top of the page down.
  const wanted = [...files.fonts.slice(0, 12), ...cleaned.images, ...files.images]
  const pending: string[] = []
  for (const url of [...new Set(wanted)]) if (!(await work.copy(url))) pending.push(url)
  const keptAttributes = attributesIn(nodes)
  let body = useCopies(cleaned.body, work.copies)
  // Data the old code read is not needed any more, unless the style sheets look at it. Sheets still waiting might.
  if (!sheetsWaiting) body = body.replace(/<[a-zA-Z][^<>]*>/g, (tag) => tag.replace(/\s(data-[\w:.-]+)(?:="[^"]*")?/g, (match, name: string) => (keptAttributes.has(name.toLowerCase()) ? match : '')))
  const css = useCopies(kept.map((part) => (typeof part === 'string' ? part : writeCss(part))).join(''), work.copies)
  const fix = (attrs: Record<string, string>) => Object.fromEntries(Object.entries(attrs).map(([name, value]) => [name, useCopies(value, work.copies)]))
  const block: CopyBlock = {
    type: 'copy',
    html: body,
    css,
    source: pageUrl,
    htmlAttrs: fix(cleaned.htmlAttrs),
    bodyAttrs: fix(cleaned.bodyAttrs),
    ...(cleaned.menu.length ? { menu: cleaned.menu } : {}),
    ...(pending.length ? { pending: pending.slice(0, maxPending) } : {}),
  }
  return {
    block,
    title: cleaned.title,
    report: { styleSheets: cleaned.sheets.filter((sheet) => sheet.href).length - sheetsMissing - sheetsWaiting, styleSheetsNotRead: sheetsMissing, filesCopied: work.copies.size, filesNotCopied: work.failed.size, filesWaiting: pending.length + sheetsWaiting, size: JSON.stringify(block).length },
  }
}

/** How many style sheets and files a copied page still loads from the old site. */
export const copyWaiting = (block: CopyBlock) => (block.pending?.length ?? 0) + [...String(block.css).matchAll(waitMarks)].length

/** Reads the style sheets and copies the files a copied page still waits for, as many as fit in this call. */
export async function copyMoreFiles(env: Env, siteId: number, block: CopyBlock) {
  const work = copier(env, siteId)
  let css = block.css
  const found: string[] = []
  const used = usedIn(block)
  for (const match of [...block.css.matchAll(waitMarks)]) {
    const href = decodeURIComponent(match[1])
    const media = decodeURIComponent(match[2])
    const fetched = await work.fetchText(href)
    if (fetched === null) break
    let written = ''
    if (fetched) {
      const nodes = keepUsed(parseCss(await readSheet(work, fetched, href, media)), used)
      const others = parseCss(css.replace(match[0], ''))
      const faces = dropUnusedFaces(nodes, `${ruleText(nodes)} ${ruleText(others)} ${block.html.match(/font-family:[^;"]+/gi)?.join(' ') ?? ''}`)
      const files = filesOf(faces)
      found.push(...files.fonts, ...files.images)
      written = writeCss(faces)
    }
    css = css.replace(match[0], () => written)
  }
  const pending: string[] = []
  for (const url of [...new Set([...found, ...(block.pending ?? [])])]) if (!(await work.copy(url))) pending.push(url)
  const fix = (attrs?: Record<string, string>) => attrs && Object.fromEntries(Object.entries(attrs).map(([name, value]) => [name, useCopies(value, work.copies)]))
  const next: CopyBlock = { ...block, html: useCopies(block.html, work.copies), css: useCopies(css, work.copies), htmlAttrs: fix(block.htmlAttrs), bodyAttrs: fix(block.bodyAttrs) }
  if (pending.length) next.pending = pending.slice(0, maxPending)
  else delete next.pending
  return { block: next, copied: work.copies.size, notCopied: work.failed.size, waiting: copyWaiting(next) }
}

const segments = (html: string) => html.split(/(<[^>]*>)/)
const encode = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The words of a copied page, one entry per piece of text, for the AI to see what it can change. */
export function copyTexts(html: string) {
  return segments(html)
    .filter((part, index) => index % 2 === 0)
    .map((part) => decodeEntities(part).replace(/\s+/g, ' ').trim())
    .filter((part) => part && /[\p{L}\p{N}]/u.test(part))
}

// nth picks one of several pieces of text that read exactly the same (0 is the first); without it, the first piece containing `from` changes.
export type CopyEdits = { images?: { from: string; to: string }[]; links?: { from: string; to: string }[]; texts?: { from: string; nth?: number; to: string }[] }

/** Changes words, photos and links of a copied page. Returns the new page and what couldn't be found. */
export function editCopy(block: CopyBlock, edits: CopyEdits) {
  const parts = segments(block.html)
  // Counted places (nth) are found on the page as it was before any of these changes, so one change can't shift another.
  const before = [...parts]
  const notFound: string[] = []
  for (const { from, nth, to } of edits.texts ?? []) {
    const wanted = from.replace(/\s+/g, ' ').trim()
    let done = false
    let seen = 0
    for (let index = 0; index < parts.length && !done; index += 2) {
      const plain = decodeEntities(nth === undefined ? parts[index] : before[index])
      const flat = plain.replace(/\s+/g, ' ')
      if (!wanted) break
      if (nth === undefined ? !flat.includes(wanted) : flat.trim() !== wanted || seen++ !== nth) continue
      const lead = /^\s*/.exec(plain)![0]
      const trail = /\s*$/.exec(plain)![0]
      parts[index] = encode(`${lead}${flat.trim().replace(wanted, to)}${trail}`)
      done = true
    }
    if (!done) notFound.push(`text "${from.slice(0, 80)}"`)
  }
  let html = parts.join('')
  const swap = (attribute: string, list: { from: string; to: string }[] | undefined, kind: string) => {
    for (const { from, to } of list ?? []) {
      const variants = [from, from.replaceAll('&', '&amp;')]
      const before = html
      for (const written of variants) html = html.split(`${attribute}="${written}"`).join(`${attribute}="${escapeHtml(to)}"`)
      if (html === before) notFound.push(`${kind} "${from.slice(0, 120)}"`)
    }
  }
  swap('src', edits.images, 'photo')
  swap('href', edits.links, 'link')
  return { block: { ...block, html }, notFound }
}

const attributes = (attrs: Record<string, string> | undefined) =>
  Object.entries(attrs ?? {})
    .filter(([name]) => keptRootAttributes.test(name) && name !== 'lang')
    .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
    .join('')

/** The menu a phone visitor can open: the old menu usually needs the old site's code to open. */
const phoneMenu = (menu: CopyBlock['menu'], language?: string) =>
  menu?.length
    ? `<details class="we-copy-menu"><summary>${language === 'th' ? 'เมนู' : 'Menu'}</summary><nav>${menu.map((item) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`).join('')}</nav></details>`
    : ''

const menuCss = '.we-copy-menu{position:fixed;right:14px;bottom:14px;z-index:2147483647;font:600 15px/1.3 system-ui,sans-serif}.we-copy-menu summary{list-style:none;cursor:pointer;background:#111;color:#fff;border-radius:999px;padding:12px 18px;box-shadow:0 4px 16px rgba(0,0,0,.25)}.we-copy-menu summary::-webkit-details-marker{display:none}.we-copy-menu nav{position:absolute;right:0;bottom:52px;display:flex;flex-direction:column;min-width:200px;max-height:70vh;overflow:auto;background:#fff;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.25);padding:6px}.we-copy-menu a{color:#111;text-decoration:none;padding:11px 14px;border-radius:10px}.we-copy-menu a:hover{background:#f1f1f1}@media (min-width:900px){.we-copy-menu{display:none}}@media (min-width:768px){.we-hide-desktop{display:none!important}}@media (max-width:767px){.we-hide-phone{display:none!important}}'

/** A copied page, with the old site's look and none of its code. */
export function renderCopy(site: SiteRow, page: { description: string; slug: string; title: string }, block: CopyBlock, canonical: string) {
  const settings = JSON.parse(site.settings) as Settings
  const lang = /^[a-zA-Z-]{2,12}$/.test(block.htmlAttrs?.lang ?? '') ? block.htmlAttrs!.lang : /^[a-zA-Z-]{2,12}$/.test(settings.language ?? '') ? settings.language! : 'en'
  const title = page.slug === 'home' || page.title.includes(settings.name) ? page.title : `${page.title} | ${settings.name}`
  // CSS never needs a raw "<", and removing it means the text cannot close the style tag.
  const css = String(block.css ?? '').replaceAll('<', '\\3C ')
  // Copied pages are cleaned when they are made; this catches anything added since. Scripts are also switched off for the whole page.
  const body = String(block.html ?? '')
    .replace(/<(script|iframe|object|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?(script|iframe|object|embed|base|meta|link|frame|frameset|noscript|template)\b[^>]*>/gi, '')
  return `<!doctype html>
<html lang="${escapeHtml(lang)}"${attributes(block.htmlAttrs)}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(page.description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(page.description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escapeHtml(settings.name)}">
<style>${css}</style>
<style>${menuCss}</style>
</head>
<body${attributes(block.bodyAttrs)}>
${body}
${phoneMenu(block.menu, settings.language)}
</body>
</html>`
}

export const isCopyPage = (blocks: Block[]): blocks is [CopyBlock] => blocks[0]?.type === 'copy'
