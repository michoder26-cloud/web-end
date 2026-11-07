// SPIKE: does the frozen copy still *work*? Clicks the same control on the original and on the frozen copy
// and reports whether the screen changed. A frozen page has no Wix JavaScript, so this measures behavior loss.
// Usage: node interact.mjs <site-key> <width> <demo-url> <css-selector> [base]
import puppeteer from 'puppeteer-core'
import { appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHROME, preparePage, settle } from './common.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const [site, widthArg, demoUrl, selector, base = 'http://localhost:8805'] = process.argv.slice(2)
const width = Number(widthArg)
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] })

async function tryClick(url, offline) {
  const page = await browser.newPage()
  await preparePage(page, width)
  if (offline) {
    await page.setRequestInterception(true)
    page.on('request', (r) => (r.url().startsWith(base) || r.url().startsWith('data:') ? r.continue() : r.abort()))
  }
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 })
  await settle(page)
  const el = await page.$(selector)
  if (!el) return { found: false }
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }))
  await new Promise((r) => setTimeout(r, 500))
  const before = await page.screenshot({ encoding: 'base64' })
  await el.click().catch(() => {})
  await new Promise((r) => setTimeout(r, 1500))
  const after = await page.screenshot({ encoding: 'base64' })
  await page.close()
  return { found: true, screenChanged: before !== after }
}

const result = { site, width, selector, original: await tryClick(demoUrl, false), frozen: await tryClick(`${base}/frozen/${site}/${width}`, true) }
await browser.close()
appendFileSync(join(here, 'out', 'interact.jsonl'), JSON.stringify(result) + '\n')
console.log(JSON.stringify(result))
