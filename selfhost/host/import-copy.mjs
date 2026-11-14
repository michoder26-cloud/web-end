// Loads a site made by tools/site-copier into a web-end site, so it runs on the
// normal back office: its forms send to Messages, the owner edits its words and
// pictures, and Publish, versions and page history work as for any page.
//   web-end import-copy COPY_DIR [--data DIR | --site NAME] [--replace]
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { extname, join, relative, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const maxPages = 40 // the engine's limit per site
const maxAssetBytes = 20 * 1024 * 1024
const reserved = new Set(['account', 'admin', 'api', 'cart', 'data', 'checkout', 'copied', 'form', 'frame', 'order', 'product', 'stripe', 'login', 'logout', 'signup', 'reset', 'owner', 'staff', 'mcp', 'media', 'newsletter', 'setup', 'm'])
const types = { '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm' }
const hash = (text, length = 10) => createHash('sha1').update(text).digest('hex').slice(0, length)
const escapeAttr = (text) => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const decode = (text) => String(text).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
const attr = (tag, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(tag); return m ? decode(m[1]) : null }

/** The copier's page paths, such as index or service-page/hay-rides, as web-end page slugs. */
export function slugFor(path, taken) {
  if (path === 'index') return 'home'
  let slug = path.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 56) || 'page'
  if (reserved.has(slug)) slug = `page-${slug}`
  let unique = slug
  for (let n = 2; taken.has(unique); n++) unique = `${slug}-${n}`
  taken.add(unique)
  return unique
}

/** Marks every element that holds only words, so the owner can change them. Same keys on desktop and phone. */
export function markEditable(html) {
  const start = html.search(/<body\b/i)
  if (start < 0) return html
  const keep = []
  let body = html.slice(start).replace(/<(script|style|svg|noscript|textarea|select|template|title)\b[\s\S]*?<\/\1>/gi, (block) => { keep.push(block); return `\u0000${keep.length - 1}\u0000` })
  const seen = new Map()
  body = body.replace(/<(h[1-6]|p|span|a|li|button|label|strong|em|b|i|small|td|th|dt|dd|figcaption|blockquote|div)(\s[^<>]*)?>([^<]*?[^\s<][^<]*)<\/\1>/gi, (match, tag, attrs = '', text) => {
    if (/\sdata-we=/.test(attrs) || !decode(text).replace(/[​\s]/g, '')) return match
    const key = hash(text.replace(/\s+/g, ' ').trim())
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    return `<${tag}${attrs} data-we="t${key}-${n}">${text}</${tag}>`
  })
  body = body.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[Number(i)])
  return html.slice(0, start) + body
}

const fieldType = (tag, type) => {
  if (tag === 'textarea') return 'textarea'
  if (tag === 'select') return 'select'
  return { email: 'email', tel: 'phone', phone: 'phone', number: 'number', date: 'date', time: 'time', checkbox: 'checkbox' }[type] ?? 'text'
}

/** Names each form and its fields the same way on desktop and phone, and lists their fields for the inbox. */
export function nameForms(html) {
  const forms = []
  const used = new Set()
  let index = 0
  const out = html.replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, (block) => {
    index++
    const given = (attr(/^<form\b[^>]*>/i.exec(block)[0], 'aria-label') || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30)
    let name = given || `form-${index}`
    if (used.has(name)) name = `${name}-${index}`
    used.add(name)
    const fields = []
    const labels = new Map([...block.matchAll(/<label\b[^>]*\sfor="([^"]+)"[^>]*>([\s\S]*?)<\/label>/gi)].map(([, id, text]) => [id, decode(text.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()]))
    const radios = new Map()
    let n = 0
    const labelOf = (tag) => (attr(tag, 'aria-label') || labels.get(attr(tag, 'id') ?? '') || attr(tag, 'placeholder') || attr(tag, 'name') || '').replace(/\.\s.*$/, '').replace(/\s*\*$/, '').trim().slice(0, 80)
    let changed = block.replace(/<(input|textarea|select)\b([^>]*)>(?:([\s\S]*?)<\/\1>)?/gi, (whole, rawTag, rest) => {
      const tag = rawTag.toLowerCase()
      const open = `<${rawTag}${rest}>`
      const type = (attr(open, 'type') || 'text').toLowerCase()
      if (tag === 'input' && ['submit', 'button', 'hidden', 'file', 'password', 'reset', 'image', 'search'].includes(type)) return whole
      if (type === 'radio') {
        const group = attr(open, 'name') || 'choice'
        let field = radios.get(group)
        if (!field) { field = { label: labelOf(open) || group, name: `f${++n}`, options: [], type: 'select' }; radios.set(group, field); fields.push(field) }
        const value = attr(open, 'value') || `${field.options.length + 1}`
        field.options.push(value.slice(0, 80))
        return whole.replace(open, open.replace(/\sname="[^"]*"/i, '').replace(/^<input/i, `<input name="${field.name}"`))
      }
      const field = { label: labelOf(open) || `Field ${n + 1}`, name: `f${++n}`, type: fieldType(tag, type) }
      if (/\srequired(=|\s|>|$)/i.test(rest)) field.required = true
      if (tag === 'select') field.options = [...whole.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)].map(([, a, text]) => attr(`<o${a}>`, 'value') ?? decode(text).trim()).filter(Boolean).slice(0, 50)
      fields.push(field)
      const named = open.replace(/\sname="[^"]*"/i, '').replace(new RegExp(`^<${rawTag}`), `<${rawTag} name="${field.name}"`).replace(/\stype="phone"/i, ' type="tel"')
      return whole.replace(open, named)
    })
    changed = changed.replace(/^<form\b/i, `<form data-we-form="${name}"`)
    if (fields.length) forms.push({ name, fields })
    return changed
  })
  return { html: out, forms }
}

/** Turns one copied page into what web-end stores: links and files under /copied/, scripts as files, words editable. */
export function convertPage(html, { assets, slugs, scripts }) {
  let out = html
    // The copier's own phone/desktop switch. web-end chooses the version itself.
    .replace(/<script>\(function\(\)\{var m=Math\.min[\s\S]*?<\/script>/g, '')
    .replace(/(["'(=]|&quot;)\/assets\//g, '$1/copied/assets/')
  // Internal links: /about/ and /m/about/ become /about.
  out = out.replace(/href="\/(?:m\/)?([^"?#]*?)\/?((?:[?#][^"]*)?)"/g, (match, path, rest) => {
    if (path.startsWith('copied/') || path.startsWith('media/')) return match
    const key = path.replace(/\/$/, '') || 'index'
    const slug = slugs.get(key)
    if (!slug) return match
    return `href="/${slug === 'home' ? '' : slug}${rest}"`
  })
  // Inline scripts become files, so pages run with a strict content policy.
  out = out.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs, code) => {
    if (/\ssrc=/i.test(attrs)) return match
    if (/type="application\/(ld\+)?json"/i.test(attrs)) return match
    if (!code.trim()) return ''
    const path = `inline/${hash(code, 16)}.js`
    scripts.set(path, code)
    return `<script src="/copied/${path}"${/\sdefer/i.test(attrs) ? ' defer' : ''}></script>`
  })
  out = out.replace(/\son[a-z]+="[^"]*"/gi, '')
  for (const [, file] of out.matchAll(/\/copied\/(assets\/[\w.-]+)/g)) assets.add(file)
  return markEditable(out)
}

function pagesIn(dir) {
  const report = join(dir, 'copy-report.json')
  if (existsSync(report)) {
    const pages = JSON.parse(readFileSync(report, 'utf8')).pages
    if (Array.isArray(pages)) return pages.filter((page) => typeof page === 'string' && existsSync(join(dir, page === 'index' ? '' : page, 'index.html')))
  }
  const found = []
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (!entry.isDirectory() || ['assets', 'm', '_shots', 'data', 'uploads', 'admin', 'node_modules'].includes(entry.name) && folder === dir) continue
      const inner = join(folder, entry.name)
      if (existsSync(join(inner, 'index.html'))) found.push(relative(dir, inner).split(sep).join('/'))
      walk(inner)
    }
  }
  if (existsSync(join(dir, 'index.html'))) found.push('index')
  walk(dir)
  return found
}

/** Unpacks a ZIP, such as the download from the copy service, into a new private folder. */
export function unzipCopy(file) {
  const data = readFileSync(file)
  let end = data.length - 22
  while (end >= 0 && data.readUInt32LE(end) !== 0x06054b50) end--
  if (end < 0) throw new Error('This file is not a ZIP.')
  const count = data.readUInt16LE(end + 10)
  let at = data.readUInt32LE(end + 16)
  if (count > 5000) throw new Error('The ZIP has too many files.')
  const folder = mkdtempSync(join(tmpdir(), 'web-end-import-'))
  let total = 0
  for (let n = 0; n < count; n++) {
    if (data.readUInt32LE(at) !== 0x02014b50) throw new Error('The ZIP is damaged.')
    const method = data.readUInt16LE(at + 10), packed = data.readUInt32LE(at + 20), size = data.readUInt32LE(at + 24)
    const nameLength = data.readUInt16LE(at + 28), extra = data.readUInt16LE(at + 30), comment = data.readUInt16LE(at + 32), offset = data.readUInt32LE(at + 42)
    const name = data.subarray(at + 46, at + 46 + nameLength).toString('utf8')
    at += 46 + nameLength + extra + comment
    if (name.endsWith('/')) continue
    const parts = name.split('/')
    if (name.startsWith('/') || name.includes('\\') || parts.some((part) => !part || part === '.' || part === '..')) throw new Error(`The ZIP has an unsafe file name: ${name}`)
    total += size
    if (size > maxAssetBytes * 2 || total > 500 * 1024 * 1024) throw new Error('The ZIP is too large.')
    const start = offset + 30 + data.readUInt16LE(offset + 26) + data.readUInt16LE(offset + 28)
    const raw = data.subarray(start, start + packed)
    const body = method === 0 ? raw : method === 8 ? inflateRawSync(raw, { maxOutputLength: size }) : null
    if (!body || body.length !== size) throw new Error(`The ZIP uses a packing this importer cannot read: ${name}`)
    const target = join(folder, ...parts)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, body)
  }
  return folder
}

export function importCopy({ copyDir, dataDir, replace = false }) {
  if (/\.zip$/i.test(copyDir) && existsSync(copyDir) && statSync(copyDir).isFile()) {
    const folder = unzipCopy(copyDir)
    try { return importCopy({ copyDir: folder, dataDir, replace }) } finally { rmSync(folder, { recursive: true, force: true }) }
  }
  const dir = resolve(copyDir)
  if (!existsSync(join(dir, 'index.html'))) throw new Error(`No copied site in ${dir}. Make one with: node tools/site-copier/run.cjs <URL> <folder>`)
  const file = join(resolve(dataDir), 'site.sqlite')
  if (!existsSync(file)) throw new Error(`No web-end site in ${resolve(dataDir)}. Create the site and finish its setup page first.`)
  const db = new DatabaseSync(file)
  try {
    const site = db.prepare('SELECT id FROM sites ORDER BY id LIMIT 1').get()
    if (!site) throw new Error('This site has not been set up yet. Open it in the browser and finish the setup page first.')
    if (!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'copied_assets'").get()) throw new Error('Start this site once with the new version, so its database is updated, then import again.')
    const existing = db.prepare('SELECT COUNT(*) AS n FROM pages WHERE site_id = ?').get(site.id).n
    if (existing && !replace) throw new Error(`This site already has ${existing} page(s). Add --replace to replace all pages with the copied site. Earlier versions stay under Versions.`)

    const paths = pagesIn(dir)
    const skipped = paths.slice(maxPages)
    const taken = new Set()
    const slugs = new Map(paths.slice(0, maxPages).map((path) => [path, slugFor(path, taken)]))
    const assets = new Set()
    const scripts = new Map()
    const pages = []
    for (const [path, slug] of slugs) {
      const folder = path === 'index' ? '' : path
      const desktopRaw = readFileSync(join(dir, folder, 'index.html'), 'utf8')
      const phoneFile = join(dir, 'm', folder, 'index.html')
      const phoneRaw = existsSync(phoneFile) ? readFileSync(phoneFile, 'utf8') : null
      const desktop = nameForms(convertPage(desktopRaw, { assets, slugs, scripts }))
      const phone = phoneRaw ? nameForms(convertPage(phoneRaw, { assets, slugs, scripts })) : null
      const forms = [...desktop.forms]
      for (const form of phone?.forms ?? []) if (!forms.some((one) => one.name === form.name)) forms.push(form)
      const title = decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(desktopRaw)?.[1] ?? '').trim().slice(0, 120) || slug
      const description = (attr(/<meta\s[^>]*name="description"[^>]*>/i.exec(desktopRaw)?.[0] ?? '', 'content') ?? '').trim().slice(0, 300) || title
      const block = { type: 'copied', desktop: desktop.html, ...(phone ? { phone: phone.html } : {}), forms }
      pages.push({ slug, title, description, blocks: JSON.stringify([block]) })
    }
    // Everything under assets/ is kept: styles refer to fonts and pictures by file name.
    const assetDir = join(dir, 'assets')
    const files = existsSync(assetDir) ? readdirSync(assetDir).filter((name) => statSync(join(assetDir, name)).isFile()) : []
    let assetBytes = 0
    const tooLarge = []
    db.exec('BEGIN')
    try {
      if (replace) {
        db.prepare('DELETE FROM pages WHERE site_id = ?').run(site.id)
        db.prepare('DELETE FROM copied_assets WHERE site_id = ?').run(site.id)
      }
      const putAsset = db.prepare('INSERT OR REPLACE INTO copied_assets (site_id, path, type, bytes) VALUES (?, ?, ?, ?)')
      for (const name of files) {
        let bytes = readFileSync(join(assetDir, name))
        // Styles and scripts that name other files by their old address.
        if (/\.(css|js|json)$/i.test(name)) bytes = Buffer.from(bytes.toString('utf8').replace(/(["'(=]|&quot;)\/assets\//g, '$1/copied/assets/'))
        if (bytes.length > maxAssetBytes) { tooLarge.push(name); continue }
        putAsset.run(site.id, `assets/${name}`, types[extname(name).toLowerCase()] ?? 'application/octet-stream', bytes)
        assetBytes += bytes.length
      }
      for (const [path, code] of scripts) putAsset.run(site.id, path, types['.js'], Buffer.from(code))
      const putPage = db.prepare("INSERT INTO pages (site_id, slug, title, description, published, blocks, translations) VALUES (?, ?, ?, ?, 1, ?, '{}')")
      for (const page of pages) putPage.run(site.id, page.slug, page.title, page.description, page.blocks)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return {
      pages: pages.map(({ slug, title }) => ({ slug, title })),
      forms: pages.reduce((total, page) => total + JSON.parse(page.blocks)[0].forms.length, 0),
      assets: files.length - tooLarge.length,
      assetBytes,
      missingAssets: [...assets].filter((path) => !files.includes(path.slice('assets/'.length))),
      skipped,
      tooLarge,
    }
  } finally {
    db.close()
  }
}
