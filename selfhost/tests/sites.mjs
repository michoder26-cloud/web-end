import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSite, sitePort } from '../host/sites.mjs'
import { startServer } from '../host/server.mjs'

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
