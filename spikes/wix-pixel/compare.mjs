// SPIKE: shoot the frozen copy served by the local web-end Worker, then pixel-diff it against the original.
// Every request that is not localhost is blocked, so nothing can be "fixed" by quietly loading from Wix.
// Usage: node compare.mjs <site-key> <width> [base=http://localhost:8805]
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
import { CHROME, preparePage, settle } from './common.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const [site, widthArg, base = 'http://localhost:8805'] = process.argv.slice(2)
const width = Number(widthArg)
const outDir = join(here, 'out', site)
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] })

const page = await browser.newPage()
await preparePage(page, width)
await page.setRequestInterception(true)
const blocked = new Set()
page.on('request', (req) => {
  const u = req.url()
  if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) return req.continue()
  blocked.add(new URL(u).host)
  req.abort()
})
const res = await page.goto(`${base}/frozen/${site}/${width}`, { waitUntil: 'networkidle0', timeout: 60000 })
if (!res.ok()) throw new Error(`frozen page answered ${res.status()}`)
await settle(page)
const frozenPng = join(outDir, `w${width}-frozen.png`)
await page.screenshot({ path: frozenPng, fullPage: true })
await page.close()

/** Changed-pixel share over the union of both images; area outside the shorter image counts as changed. */
async function diff(aPath, bPath, diffPath) {
  const p = await browser.newPage()
  const toUrl = (f) => 'data:image/png;base64,' + readFileSync(f).toString('base64')
  const out = await p.evaluate(
    async (a, b, fold) => {
      const load = (src) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src })
      const [ia, ib] = await Promise.all([load(a), load(b)])
      const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height)
      const px = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#ff00ff'; x.fillRect(0, 0, w, h); x.clearRect(0, 0, img.width, img.height); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data }
      const da = px(ia), db = px(ib)
      const c = document.createElement('canvas'); c.width = w; c.height = h
      const ctx = c.getContext('2d'); const vis = ctx.createImageData(w, h)
      let any = 0, loose = 0, foldLoose = 0
      for (let i = 0, n = 0; i < da.length; i += 4, n++) {
        const inA = n % w < ia.width && Math.floor(n / w) < ia.height, inB = n % w < ib.width && Math.floor(n / w) < ib.height
        const d = inA && inB ? Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])) : 255
        if (d > 0) any++
        if (d > 32) { loose++; if (Math.floor(n / w) < fold) foldLoose++ }
        const g = (da[i] + da[i + 1] + da[i + 2]) / 3 * 0.35 + 160
        vis.data[i] = d > 32 ? 255 : g; vis.data[i + 1] = d > 32 ? 0 : g; vis.data[i + 2] = d > 32 ? 0 : g; vis.data[i + 3] = 255
      }
      ctx.putImageData(vis, 0, 0)
      const total = w * h
      return { w, h, aH: ia.height, bH: ib.height, anyPct: (100 * any) / total, loosePct: (100 * loose) / total, foldPct: (100 * foldLoose) / (w * Math.min(fold, h)), png: c.toDataURL('image/png').split(',')[1] }
    },
    toUrl(aPath), toUrl(bPath), width < 600 ? 844 : 800,
  )
  writeFileSync(diffPath, Buffer.from(out.png, 'base64'))
  await p.close()
  delete out.png
  for (const k of ['anyPct', 'loosePct', 'foldPct']) out[k] = Math.round(out[k] * 100) / 100
  return out
}

const original = join(outDir, `w${width}-original.png`)
const result = { site, width, blockedHosts: [...blocked], frozen: await diff(original, frozenPng, join(outDir, `w${width}-diff.png`)) }
const second = join(outDir, `w${width}-original-2.png`)
if (existsSync(second)) result.wixVsWix = await diff(original, second, join(outDir, `w${width}-diff-baseline.png`))
await browser.close()
appendFileSync(join(here, 'out', 'results.jsonl'), JSON.stringify(result) + '\n')
console.log(JSON.stringify(result))
