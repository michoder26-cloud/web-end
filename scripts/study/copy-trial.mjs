// Moves real pages into a local web-end with their own look, the way the page reader hands them over, and takes
// screenshots of the old page and the moved one side by side, on a computer and on a phone.
//
//   (in cloud/) npx wrangler dev --local --port 8799 --persist-to <fresh folder>
//   [CODE=<owner code of an already set up site>] node scripts/study/copy-trial.mjs <out folder> https://site-one.example https://site-two.example ...
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const puppeteer = require('../../node_modules/puppeteer-core')
const { Client } = require('../../cloud/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js')
const { StreamableHTTPClientTransport } = require('../../cloud/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.js')

const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const base = process.env.BASE_URL || 'http://localhost:8799'
const [out, ...urls] = process.argv.slice(2)
if (!out || !urls.length) throw new Error('Give the folder to write into and the pages to move.')
mkdirSync(out, { recursive: true })

// What the page reader does inside the page before handing it over: real photo addresses, and the CSS rules
// that code added (CSS-in-JS), which are not in the HTML otherwise.
const prepare = () => {
  for (const img of document.images) {
    const src = img.currentSrc || img.src
    if (src && !src.startsWith('data:')) img.setAttribute('src', new URL(src, location.href).href)
    img.removeAttribute('srcset')
    img.removeAttribute('sizes')
    img.removeAttribute('loading')
  }
  const rulesOf = (sheet) => {
    try {
      return [...sheet.cssRules].map((rule) => rule.cssText).join('\n')
    } catch {
      return ''
    }
  }
  for (const sheet of document.styleSheets) {
    const owner = sheet.ownerNode
    if (!owner || owner.tagName !== 'STYLE') continue
    const rules = rulesOf(sheet)
    if (rules && owner.textContent.trim().length < rules.length * 0.5) owner.textContent = rules
  }
  const adopted = (document.adoptedStyleSheets ?? []).map(rulesOf).join('\n')
  if (adopted) {
    const style = document.createElement('style')
    style.textContent = adopted
    document.head.append(style)
  }
  document.querySelectorAll('script:not([type="application/ld+json"])').forEach((node) => node.remove())
  return '<!doctype html>' + document.documentElement.outerHTML
}

async function settle(page) {
  await page.evaluate(async () => {
    for (let step = 0; step < 40; step++) {
      const before = window.scrollY
      window.scrollBy(0, 600)
      await new Promise((resolve) => setTimeout(resolve, 150))
      if (window.scrollY === before) break
    }
    window.scrollTo(0, 0)
  })
  await new Promise((resolve) => setTimeout(resolve, 800))
}

const shoot = async (page, url, name) => {
  await page.setViewport({ width: 1280, height: 800 })
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 45_000 }).catch(() => null)
  await settle(page)
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  await page.screenshot({ path: join(out, `${name}.desktop.jpg`), type: 'jpeg', quality: 50, clip: { x: 0, y: 0, width: 1280, height: Math.min(height, 5000) }, captureBeyondViewport: true })
  await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 1 })
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => null)
  await new Promise((resolve) => setTimeout(resolve, 800))
  await page.screenshot({ path: join(out, `${name}.phone.jpg`), type: 'jpeg', quality: 55 })
}

const claimed = process.env.CODE ? null : await fetch(`${base}/setup`, { method: 'POST', redirect: 'manual' })
const code = process.env.CODE || (await claimed.text()).match(/\/mcp\/([a-z0-9-]{20,60})/)?.[1]
if (!code) throw new Error('This local web-end is already set up. Start it with a fresh --persist-to folder.')
const client = new Client({ name: 'copy-trial', version: '1.0.0' })
await client.connect(new StreamableHTTPClientTransport(new URL(`/mcp/${code}`, base)))
const call = async (name, args) => {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 300_000 })
  const text = result.content[0]?.text ?? ''
  try {
    return { data: JSON.parse(text), isError: result.isError }
  } catch {
    return { data: text, isError: result.isError }
  }
}

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-first-run', '--mute-audio'] })
const results = []
try {
  for (const [index, url] of urls.entries()) {
    const name = new URL(url).host.replace(/^www\./, '').replace(/[^a-z0-9]+/gi, '-')
    const slug = `p${index + 1}`
    const page = await browser.newPage()
    try {
      await page.setViewport({ width: 1280, height: 900 })
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45_000 }).catch(() => null)
      await settle(page)
      const html = await page.evaluate(prepare)
      const started = Date.now()
      const moved = await call('import_page', { url: page.url(), ownerConfirmed: true, html: html.slice(0, 3_000_000), slug, replace: true })
      let waiting = moved.data?.filesWaiting ?? 0
      for (let round = 0; waiting && round < 8; round++) waiting = (await call('copy_page_files', { slug })).data?.filesWaiting ?? 0
      const record = { url, slug, ms: Date.now() - started, error: moved.isError ? String(moved.data).slice(0, 300) : undefined, look: moved.data?.look, report: moved.isError ? undefined : { size: moved.data.size, filesCopied: moved.data.filesCopied, filesNotCopied: moved.data.filesNotCopied, styleSheets: moved.data.styleSheets, styleSheetsNotRead: moved.data.styleSheetsNotRead, waitingAfter: waiting, problems: moved.data.check?.problems } }
      results.push(record)
      console.log(JSON.stringify(record))
      await shoot(page, url, `${name}.old`)
      await shoot(page, `${base}/owner/${code}/preview/${slug}`, `${name}.new`)
    } catch (error) {
      results.push({ url, error: String(error.message ?? error) })
      console.log('failed', url, error.message)
    } finally {
      await page.close().catch(() => {})
    }
  }
} finally {
  await browser.close()
  writeFileSync(join(out, 'results.json'), JSON.stringify({ code, results }, null, 2))
}
