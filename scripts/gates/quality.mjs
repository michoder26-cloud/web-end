// Crawls a running site for broken links and basic SEO, then runs Lighthouse on key pages.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const base = process.env.BASE_URL
const siteDir = process.env.SITE_DIR
const thresholds = { accessibility: 90, 'best-practices': 80, performance: 60, seo: 90 }

const problems = []
const warnings = []
const seen = new Set(['/'])
const queue = ['/']
const pages = []

while (queue.length && seen.size <= 60) {
  const pathname = queue.shift()
  const response = await fetch(base + pathname, { redirect: 'follow' })
  if (!response.ok) {
    problems.push(`${pathname} returned ${response.status}`)
    continue
  }
  if (!(response.headers.get('content-type') || '').includes('text/html')) continue
  pages.push(pathname)
  const html = await response.text()

  if (!/<html[^>]*\slang="[^"]+"/i.test(html)) problems.push(`${pathname} has no page language`)
  if (!/<title>[^<]+<\/title>/i.test(html)) problems.push(`${pathname} has no title`)
  if (!/<meta[^>]+name="description"[^>]+content="[^"]+"/i.test(html)) problems.push(`${pathname} has no description`)
  const headings = (html.match(/<h1[\s>]/gi) || []).length
  if (headings !== 1) problems.push(`${pathname} has ${headings} main headings, expected 1`)
  for (const image of html.match(/<img\b[^>]*>/gi) || []) {
    if (!/\salt=/i.test(image)) problems.push(`${pathname} has an image without a description`)
  }
  for (const [, data] of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>(.*?)<\/script>/gis)) {
    try {
      JSON.parse(data)
    } catch {
      problems.push(`${pathname} has broken structured data`)
    }
  }
  if (!/<link[^>]+rel="canonical"/i.test(html)) warnings.push(`${pathname} has no canonical link`)
  if (!/<meta[^>]+property="og:title"/i.test(html)) warnings.push(`${pathname} has no social sharing title`)

  for (const [, href] of html.matchAll(/<a\b[^>]*\shref="([^"#]+)/gi)) {
    if (!href.startsWith('/') || href.startsWith('//')) continue
    const link = href.split('?')[0]
    if (link.startsWith('/admin') || link.startsWith('/api') || seen.has(link)) continue
    seen.add(link)
    queue.push(link)
  }
}

console.log(`Crawled ${pages.length} pages.`)

const chromePath = execFileSync(
  process.execPath,
  ['-e', "import('@playwright/test').then(({chromium})=>process.stdout.write(chromium.executablePath()))"],
  { cwd: siteDir, encoding: 'utf8' },
)
const output = path.join(siteDir, '.gates-db', 'lighthouse')
rmSync(output, { force: true, recursive: true })
mkdirSync(output, { recursive: true })

for (const [index, pathname] of pages.slice(0, 3).entries()) {
  const reportFile = path.join(output, `page-${index}.json`)
  // Chrome's temp folder can fail to clean up on Windows after a good run, so the report decides.
  spawnSync(
    process.execPath,
    [
      path.join(root, 'node_modules/lighthouse/cli/index.js'),
      base + pathname,
      '--quiet',
      '--output=json',
      `--output-path=${reportFile}`,
      '--only-categories=performance,accessibility,best-practices,seo',
      '--chrome-flags=--headless=new --no-sandbox',
    ],
    { env: { ...process.env, CHROME_PATH: chromePath }, stdio: 'ignore' },
  )
  let report
  try {
    report = JSON.parse(readFileSync(reportFile, 'utf8'))
  } catch {
    problems.push(`Lighthouse could not test ${pathname}`)
    continue
  }
  const scores = Object.entries(thresholds).map(([category, minimum]) => {
    const score = Math.round((report.categories[category]?.score ?? 0) * 100)
    if (score < minimum) problems.push(`${pathname}: ${category} scored ${score}, needs ${minimum}`)
    return `${category} ${score}`
  })
  console.log(`${pathname}: ${scores.join(', ')}`)
}

for (const warning of warnings) console.log(`Note: ${warning}`)
if (problems.length) {
  for (const problem of problems) console.error(`- ${problem}`)
  process.exit(1)
}
