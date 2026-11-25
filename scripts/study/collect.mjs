// Opens each studied site's home page in Chrome, marks what a visitor sees (mark.js, the same as the page reader),
// runs the mover's reader and block maker on it (worker.ts) and saves what came out, with screenshots.
// One site at a time, one page per site, and only where robots.txt allows it.
//
//   npx wrangler dev --config scripts/study/wrangler.jsonc --local --port 8797     (in one terminal)
//   node scripts/study/collect.mjs <out folder> [--only host,host] [--again]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { sites } from './sites.mjs'

const puppeteer = createRequire(import.meta.url)('../../node_modules/puppeteer-core')
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const study = process.env.STUDY_WORKER || 'http://127.0.0.1:8797'
const out = process.argv[2]
if (!out) throw new Error('Give the folder to write into.')
const only = (process.argv.find((arg) => arg.startsWith('--only='))?.slice(7) ?? '').split(',').filter(Boolean)
const again = process.argv.includes('--again')
mkdirSync(out, { recursive: true })
const mark = readFileSync(new URL('./mark.js', import.meta.url), 'utf8').split('\n').filter((line) => !line.startsWith('//')).join('\n')
const maxHtml = 3_000_000

const nameOf = (url) => new URL(url).host.replace(/^www\./, '') + new URL(url).pathname.replace(/\/(index\.html)?$/, '').replace(/[^a-z0-9]+/gi, '-')

/** True when robots.txt lets any robot read this path. A missing or unreadable file allows it. */
async function allowed(url) {
  const target = new URL(url)
  const text = await fetch(new URL('/robots.txt', target), { signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.text() : '')).catch(() => '')
  let applies = false
  let inGroup = false
  const rules = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    const [key, ...rest] = line.split(':')
    const value = rest.join(':').trim()
    if (/^user-agent$/i.test(key)) {
      if (!inGroup) applies = false
      inGroup = true
      if (value === '*') applies = true
    } else if (key) {
      inGroup = false
      if (applies && /^(dis)?allow$/i.test(key) && value) rules.push({ allow: /^allow$/i.test(key), path: value })
    }
  }
  const path = target.pathname
  const matches = rules.filter((rule) => new RegExp('^' + rule.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')).test(path))
  if (!matches.length) return true
  const longest = matches.sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow))[0]
  return longest.allow
}

async function scrollThrough(page) {
  await page.evaluate(async () => {
    for (let step = 0; step < 40; step++) {
      const before = window.scrollY
      window.scrollBy(0, window.innerHeight * 0.8)
      await new Promise((resolve) => setTimeout(resolve, 180))
      if (window.scrollY === before) break
    }
    window.scrollTo(0, 0)
  })
}

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-first-run', '--mute-audio'] })
const summary = []
try {
  for (const { group, url } of sites) {
    const name = nameOf(url)
    if (only.length && !only.some((host) => name.includes(host))) continue
    const file = join(out, `${name}.json`)
    if (!again && existsSync(file)) {
      summary.push(JSON.parse(readFileSync(file, 'utf8')).status)
      continue
    }
    const record = { group, name, url, status: 'ok' }
    const started = Date.now()
    try {
      if (!(await allowed(url))) throw Object.assign(new Error('robots.txt asks robots not to read this page'), { skip: 'robots' })
      const page = await browser.newPage()
      try {
        await page.setViewport({ width: 1280, height: 800 })
        const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 45_000 }).catch(async (error) => {
          // Pages that never go quiet (live chat, video) are read as they are after the wait.
          if (/timeout/i.test(String(error))) return null
          throw error
        })
        record.httpStatus = response?.status() ?? null
        record.finalUrl = page.url()
        if (record.httpStatus && record.httpStatus >= 400) throw Object.assign(new Error(`answered ${record.httpStatus}`), { skip: 'blocked' })
        await new Promise((resolve) => setTimeout(resolve, 1500))
        await page.screenshot({ path: join(out, `${name}.desktop.jpg`), type: 'jpeg', quality: 60 })
        await scrollThrough(page)
        const height = await page.evaluate(() => document.documentElement.scrollHeight)
        record.pageHeight = height
        await page.screenshot({ path: join(out, `${name}.full.jpg`), type: 'jpeg', quality: 45, clip: { x: 0, y: 0, width: 1280, height: Math.min(height, 6000) }, captureBeyondViewport: true })
        record.design = await page.evaluate(`(${mark})()`)
        let html = await page.evaluate(() => '<!doctype html>' + document.documentElement.outerHTML)
        if (html.length > maxHtml) html = html.replace(/(<(?:div|span)\b[^>]*?)\s+data-we-[yxwh]="\d+"/g, '$1').replace(/(<(?:div|span)\b[^>]*?)\s+data-we-[yxwh]="\d+"/g, '$1')
        record.htmlBytes = html.length
        writeFileSync(join(out, `${name}.html`), html)
        if (html.length > maxHtml) throw new Error(`page html is ${html.length} bytes, over the reader's 3 MB`)
        const read = await fetch(study, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: record.finalUrl || url, html }) })
        record.result = await read.json()
        if (record.result.error) record.status = 'reader-error'
        // Phone view of the first screen.
        await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 1 })
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => null)
        await new Promise((resolve) => setTimeout(resolve, 1000))
        await page.screenshot({ path: join(out, `${name}.phone.jpg`), type: 'jpeg', quality: 60 })
      } finally {
        await page.close().catch(() => {})
      }
    } catch (error) {
      record.status = error.skip ?? 'failed'
      record.error = String(error.message ?? error).slice(0, 300)
    }
    record.ms = Date.now() - started
    writeFileSync(file, JSON.stringify(record, null, 2))
    summary.push(record.status)
    const cover = record.result?.coverage
    console.log(`${record.status.padEnd(12)} ${name.padEnd(40)} ${cover ? `text ${cover.text.kept}/${cover.text.total} blocks ${record.result.blocks.length}` : record.error ?? ''}`)
    // A pause between sites, so no site gets a burst of visits.
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
} finally {
  await browser.close()
}
const counts = summary.reduce((all, status) => ({ ...all, [status]: (all[status] ?? 0) + 1 }), {})
console.log('done', JSON.stringify(counts))
