import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSite, sitePort } from '../host/sites.mjs'
import { startServer } from '../host/server.mjs'
import { startLauncher } from '../host/launcher.mjs'

const sitesDir = mkdtempSync(join(tmpdir(), 'web-end-sites-'))
let passed = 0
const check = (ok, message) => {
  if (!ok) throw new Error(message)
  passed++
  console.log(`ok    ${message}`)
}
const first = await createSite('baan-coffee', sitesDir)
const second = await createSite('my-shop', sitesDir)
check(first.dataDir !== second.dataDir && first.port !== second.port, 'each new site gets its own folder and port')
check(sitePort('baan-coffee', sitesDir) === first.port && sitePort('my-shop', sitesDir) === second.port, 'each site keeps its address for reopening')
let duplicate = false
try { await createSite('baan-coffee', sitesDir) } catch { duplicate = true }
check(duplicate, 'an existing site cannot be replaced by a new one')
let invalid = false
try { await createSite('../other', sitesDir) } catch { invalid = true }
check(invalid, 'site names cannot escape the private sites folder')

const a = await startServer({ dataDir: first.dataDir, port: first.port, schedule: false, updateCheck: false })
const b = await startServer({ dataDir: second.dataDir, port: second.port, schedule: false, updateCheck: false })
try {
  const claimed = await fetch(`${a.url}/setup`, { method: 'POST', redirect: 'manual' })
  const privateLink = await claimed.text()
  check(claimed.status === 200 && /\/owner\/[a-z0-9-]{20,60}/.test(privateLink), 'the first site creates its own owner Dashboard')
  const other = await fetch(b.url)
  check(other.status === 200 && (await other.text()).includes('/setup'), 'the second site still starts fresh')
  check(a.db.file !== b.db.file, 'each running site has its own SQLite database')
} finally {
  await Promise.all([a.close(), b.close()])
}
console.log(`Sites: ${passed} passed, 0 failed`)

const launcher = await startLauncher({ port: 0, sitesDir, updateCheck: false })
try {
  const home = await (await fetch(launcher.url)).text()
  const token = /name="token" type="hidden" value="([a-f0-9]+)"/.exec(home)?.[1]
  check(Boolean(token) && home.includes('สร้างเว็บใหม่') && home.includes('baan-coffee'), 'the browser page shows a create button and existing sites')
  const post = (path, name, headers = {}) => fetch(`${launcher.url}${path}`, { method: 'POST', body: new URLSearchParams({ name, token }), headers, redirect: 'manual' })
  const foreign = await post('/new', 'evil-site', { Origin: 'https://another.test' })
  check(foreign.status === 403, 'another website cannot create a local site')
  const made = await post('/new', 'third-site')
  check(made.status === 303 && made.headers.get('location')?.endsWith('/setup'), 'creating a site in the browser opens its own setup')
  const siteUrl = made.headers.get('location').replace(/\/setup$/, '')
  const claimed = await fetch(`${siteUrl}/setup`, { method: 'POST', redirect: 'manual' })
  check(claimed.status === 200, 'the new site can be claimed independently')
  const reopened = await post('/open', 'third-site')
  check(reopened.status === 303 && reopened.headers.get('location') === `${siteUrl}/admin`, 'opening an existing site goes to its Dashboard')
  const repeated = await post('/new', 'third-site')
  check(repeated.status === 400 && (await repeated.text()).includes('already exists'), 'the browser cannot replace an existing site')
} finally {
  await launcher.close()
}
console.log(`Browser launcher: ${passed} passed, 0 failed`)
