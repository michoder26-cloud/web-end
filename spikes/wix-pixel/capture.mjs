// SPIKE (not product code): freeze one public Wix template demo at one screen width.
// Opens the page in a real Chrome, waits for Wix's JavaScript, scrolls so lazy images load,
// then keeps the rendered DOM + the live CSSOM + every stylesheet/font/image the browser fetched.
// Scripts are removed. Output stays on this computer only (gitignored):
//   cloud/public/_frozen/<site>/w<width>.html   frozen page (served through the Worker spike route)
//   cloud/public/_frozen/<site>/a/<hash>.<ext>   captured files (served as static assets)
//   spikes/wix-pixel/out/<site>/w<width>-original[-2].png, w<width>-meta.json, w<width>-regions.json
//
// Usage: node capture.mjs <site-key> <demo-url> <width> [--baseline]
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHROME, mobileUA, preparePage, settle } from './common.mjs'
import puppeteer from 'puppeteer-core'

const here = dirname(fileURLToPath(import.meta.url))
const [site, demoUrl, widthArg] = process.argv.slice(2)
const baseline = process.argv.includes('--baseline')
const width = Number(widthArg)
if (!/^[a-z0-9-]+$/.test(site ?? '') || !demoUrl?.startsWith('https://www.wix.com/') || !width) {
  console.error('usage: node capture.mjs <site-key> <https://www.wix.com/...demo> <width> [--baseline]')
  process.exit(2)
}
const outDir = join(here, 'out', site)
const frozenDir = join(here, '..', '..', 'cloud', 'public', '_frozen', site)
const assetDir = join(frozenDir, 'a')
mkdirSync(outDir, { recursive: true })
mkdirSync(assetDir, { recursive: true })

const extFor = (mime, url) => {
  const m = (mime || '').split(';')[0].trim()
  const known = { 'text/css': 'css', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'font/woff2': 'woff2', 'font/woff': 'woff', 'font/ttf': 'ttf', 'application/font-woff': 'woff', 'application/font-woff2': 'woff2', 'application/x-font-woff': 'woff', 'video/mp4': 'mp4' }
  if (known[m]) return known[m]
  const fromUrl = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(new URL(url).pathname)?.[1]
  return fromUrl ? fromUrl.toLowerCase() : 'bin'
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] })
const page = await browser.newPage()
await preparePage(page, width)

const captured = new Map() // absolute url -> { file, bytes, kind }
const pending = []
const kinds = new Set(['stylesheet', 'image', 'font', 'media'])
page.on('response', (response) => {
  const req = response.request()
  const kind = req.resourceType()
  const url = response.url()
  if (!kinds.has(kind) || !url.startsWith('http') || response.status() !== 200) return
  pending.push(
    response
      .buffer()
      .then((buf) => {
        const ext = extFor(response.headers()['content-type'], url)
        const file = `${createHash('sha1').update(url).digest('hex').slice(0, 16)}.${ext}`
        captured.set(url, { buf, file, bytes: buf.length, kind, ext })
      })
      .catch(() => {}),
  )
})

await page.goto(demoUrl, { waitUntil: 'networkidle2', timeout: 120000 })
await settle(page)
const shot = join(outDir, `w${width}-original${baseline ? '-2' : ''}.png`)
await page.screenshot({ path: shot, fullPage: true })
console.log('screenshot', shot)
if (baseline) {
  await browser.close()
  process.exit(0)
}

// Freeze in the page: write the live CSSOM back into <style>, drop scripts, list what cannot survive.
const frozen = await page.evaluate(() => {
  const lost = { iframes: [], canvases: 0, videos: 0, scripts: 0, adoptedSheets: 0, unreadableSheets: [] }
  for (const sheet of [...document.styleSheets]) {
    const owner = sheet.ownerNode
    if (!owner || owner.tagName !== 'STYLE') continue
    try {
      owner.textContent = [...sheet.cssRules].map((r) => r.cssText).join('\n')
    } catch {
      lost.unreadableSheets.push('inline style')
    }
  }
  for (const sheet of document.adoptedStyleSheets || []) {
    const style = document.createElement('style')
    style.textContent = [...sheet.cssRules].map((r) => r.cssText).join('\n')
    document.head.append(style)
    lost.adoptedSheets++
  }
  for (const s of document.querySelectorAll('script')) {
    lost.scripts++
    s.remove()
  }
  for (const l of document.querySelectorAll('link[rel="preload"],link[rel="modulepreload"],link[rel="prefetch"],link[rel="dns-prefetch"],link[rel="preconnect"]')) l.remove()
  for (const f of document.querySelectorAll('iframe')) lost.iframes.push(f.src || f.getAttribute('data-src') || '(no src)')
  lost.canvases = document.querySelectorAll('canvas').length
  lost.videos = document.querySelectorAll('video').length
  const fonts = [...document.fonts].map((f) => ({ family: f.family.replace(/"/g, ''), status: f.status, weight: f.weight }))
  // Candidate editable regions: Wix rich-text and image components keep their generated comp-* ids.
  const regions = []
  // A text region targets the single inner block (h1/p) so Wix's styling on it survives a replace.
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  for (const el of document.querySelectorAll('[id^="comp-"][data-testid="richTextElement"]')) {
    if (!visible(el) || !el.innerText.trim()) continue
    const one = el.children.length === 1 ? el.children[0].tagName.toLowerCase() : null
    regions.push({ selector: one ? `#${el.id} > ${one}` : `#${el.id}`, kind: 'text', keepsStyle: Boolean(one), value: el.innerText.trim().slice(0, 200) })
  }
  for (const img of document.querySelectorAll('img')) {
    const host = img.closest('[id^="comp-"],[id^="bgLayers_"]')
    if (!host || !visible(img)) continue
    regions.push({ selector: `#${host.id} img`, kind: 'image', value: img.currentSrc || img.src })
  }
  return { html: '<!DOCTYPE html>\n' + document.documentElement.outerHTML, base: location.href, lost, fonts, regions, height: document.documentElement.scrollHeight }
})
await Promise.allSettled(pending)
await browser.close()

// Rewrite every URL the browser actually fetched to the local copy. Anything left points at the internet
// and is blocked during the replay screenshot, so the diff measures true offline fidelity.
const localPath = (abs) => {
  const hit = captured.get(abs)
  return hit ? `/_frozen/${site}/a/${hit.file}` : null
}
const resolve = (raw, base) => {
  try {
    return new URL(raw.trim().replace(/^['"]|['"]$/g, '').replace(/&amp;/g, '&'), base).href
  } catch {
    return null
  }
}
let missingCssRefs = 0
const rewriteCss = (css, base) =>
  css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (whole, _q, raw) => {
    if (raw.startsWith('data:') || raw.startsWith('#')) return whole
    const abs = resolve(raw, base)
    const local = abs && localPath(abs)
    if (!local && abs) missingCssRefs++
    return local ? `url("${local}")` : abs ? `url("${abs}")` : whole
  })

for (const [url, hit] of captured) {
  const body = hit.ext === 'css' ? Buffer.from(rewriteCss(hit.buf.toString('utf8'), url)) : hit.buf
  hit.bytes = body.length
  writeFileSync(join(assetDir, hit.file), body)
}

let html = rewriteCss(frozen.html, frozen.base)
const attrUrl = (raw) => {
  const abs = resolve(raw, frozen.base)
  return (abs && localPath(abs)) || raw
}
html = html.replace(/\s(src|href|poster|data-src)="([^"]*)"/g, (whole, attr, raw) => (raw && !raw.startsWith('data:') && !raw.startsWith('#') && !raw.startsWith('mailto:') ? ` ${attr}="${attrUrl(raw)}"` : whole))
html = html.replace(/\s(srcset|imagesrcset)="([^"]*)"/g, (_w, attr, raw) => ` ${attr}="${raw.split(/,\s+/).map((part) => { const [u, ...d] = part.trim().split(/\s+/); return [attrUrl(u), ...d].join(' ') }).join(', ')}"`)
html = html.replace(/<meta[^>]+http-equiv="Content-Security-Policy"[^>]*>/gi, '')
writeFileSync(join(frozenDir, `w${width}.html`), html)

const sum = (k) => [...captured.values()].filter((h) => (k === 'css' ? h.ext === 'css' : h.kind === k)).reduce((a, h) => a + h.bytes, 0)
const meta = {
  site,
  demoUrl,
  width,
  capturedAt: new Date().toISOString(),
  pageHeight: frozen.height,
  files: captured.size,
  bytes: { html: Buffer.byteLength(html), css: sum('css'), font: sum('font'), image: sum('image'), media: sum('media') },
  largestFile: Math.max(0, ...[...captured.values()].map((h) => h.bytes)),
  fontFamilies: [...new Set(frozen.fonts.filter((f) => f.status === 'loaded').map((f) => f.family))],
  fontFiles: [...captured.entries()].filter(([, h]) => h.kind === 'font').map(([u]) => new URL(u).host + new URL(u).pathname),
  missingCssRefs,
  lost: frozen.lost,
  regions: frozen.regions.length,
}
writeFileSync(join(outDir, `w${width}-meta.json`), JSON.stringify(meta, null, 2))
writeFileSync(join(outDir, `w${width}-regions.json`), JSON.stringify(frozen.regions, null, 2))
console.log(JSON.stringify({ site, width, files: meta.files, bytes: meta.bytes, regions: meta.regions, iframes: meta.lost.iframes.length }))
