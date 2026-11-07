// SPIKE: prove the frozen page is still editable from the CMS. Writes two regions into the owner's
// "frozen_regions" data table in the local spike database, then checks the Worker streamed them in.
// Run with the spike Worker up: wrangler dev --local --port 8805 --persist-to .spike-db --var FROZEN_SPIKE:1
// Usage: node cms-demo.mjs <image-path-under-/_frozen/>
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
import { CHROME, preparePage, settle } from './common.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const cloud = join(here, '..', '..', 'cloud')
const image = process.argv[2]
const base = 'http://localhost:8805'
const regions = [
  { page: 'melina', selector: '#comp-kimx4x1k > h1', kind: 'text', value: 'Sawasdee from the CMS <b>not bold</b>' },
  { page: 'melina', selector: '#bgLayers_pageBackground_c1dmp img', kind: 'image', value: image },
]
const q = (s) => `'${s.replace(/'/g, "''")}'`
const sql = [
  "INSERT OR IGNORE INTO sites (id, slug, edit_hash, settings) VALUES (1, 'spike', 'spike-hash', '{}');",
  "DELETE FROM data_tables WHERE name = 'frozen_regions';",
  "INSERT INTO data_tables (site_id, name, label, fields) VALUES (1, 'frozen_regions', 'Frozen page regions', '[]');",
  ...regions.map((r) => `INSERT INTO data_records (table_id, data) SELECT id, ${q(JSON.stringify(r))} FROM data_tables WHERE name = 'frozen_regions';`),
].join('\n')
const sqlFile = join(here, 'out', 'cms-demo.sql')
writeFileSync(sqlFile, sql)
execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', '.spike-db', '--file', sqlFile], { cwd: cloud, stdio: 'ignore', shell: true })

const res = await fetch(`${base}/frozen/melina/1280`)
const html = await res.text()
const checks = {
  status: res.status,
  regionsHeader: res.headers.get('x-frozen-regions'),
  textReplaced: html.includes('>Sawasdee from the CMS &lt;b&gt;not bold&lt;/b&gt;</h1>'),
  htmlEscaped: !html.includes('<b>not bold</b>'),
  oldTextGone: !html.includes('>Welcome</h1>'),
  imageReplaced: html.includes(`src="${image}"`),
}
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] })
const page = await browser.newPage()
await preparePage(page, 1280)
await page.goto(`${base}/frozen/melina/1280`, { waitUntil: 'networkidle0' })
await settle(page)
await page.screenshot({ path: join(here, 'out', 'melina', 'w1280-cms-patched.png'), fullPage: true })
await browser.close()
console.log(JSON.stringify(checks))
