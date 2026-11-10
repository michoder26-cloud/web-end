// End-to-end regression for the shared engine on a fresh local site.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from '../host/server.mjs'

const dataDir = mkdtempSync(join(tmpdir(), 'web-end-draft-'))
const server = await startServer({ dataDir, port: 0, schedule: false })
try {
  const setup = await fetch(`${server.url}/setup`, { method: 'POST', redirect: 'manual' })
  const code = (await setup.text()).match(/\/mcp\/([a-z0-9-]{20,60})/)?.[1]
  assert.ok(code)
  const owner = `${server.url}/owner/${code}`
  const [started, ...concurrent] = await Promise.all([
    fetch(`${owner}/starters`, { method: 'POST', body: new URLSearchParams({ starter: 'cafe', language: 'en' }), redirect: 'manual' }),
    ...Array.from({ length: 40 }, () => fetch(server.url).then((response) => response.text())),
  ])
  for (const body of concurrent) assert.doesNotMatch(body, /This is a sample site/, 'concurrent public reads must not expose starter')
  assert.equal(started.status, 303)
  server.db.prepare("UPDATE sites SET settings = json_remove(settings, '$.draftStarter')").run()
  for (const path of ['/', '/sitemap.xml', '/api/products', '/product/test', '/media/1']) {
    assert.equal((await fetch(`${server.url}${path}`)).status, 404, `${path} remains private after settings undo`)
  }
  assert.equal((await fetch(`${server.url}/admin/login`)).status, 200, 'owner login remains available')
  const preview = await fetch(`${owner}/preview`)
  assert.match(await preview.text(), /This is a sample site/)
  const head = await (await fetch(`${owner}/backup/part?table=site`)).json()
  assert.equal(head.site.starter_privacy, 1, 'backup records private starter state')
  const parts = {}
  for (const table of head.tables) parts[table] = await (await fetch(`${owner}/backup/part?table=${table}`)).json()
  const restore = async (saved, target = server, targetOwner = owner) => {
    const post = (body, token) => fetch(`${targetOwner}/restore/part`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: target.url, ...(token ? { 'X-Restore-Token': token } : {}) }, body: JSON.stringify(body) })
    const start = await post({ start: true, confirm: true, format: head.format })
    assert.equal(start.status, 200)
    const { token } = await start.json()
    for (const table of head.tables) {
      const part = parts[table]
      assert.equal((await post({ table, columns: part.columns, rows: part.rows }, token)).status, 200, `restore ${table}`)
      if (table === 'pages' && target === server) {
        await fetch(`${targetOwner}/publish`, { method: 'POST', body: new URLSearchParams({ note: 'Concurrent restore' }), redirect: 'manual' })
        assert.equal((await fetch(target.url)).status, 404, 'publishing during an incomplete restore must not expose its draft')
      }
    }
    assert.equal((await post({ finish: true, site: saved }, token)).status, 200)
    assert.equal((await fetch(target.url)).status, 404, 'restored unpublished starter remains private')
    assert.match(await (await fetch(`${targetOwner}/preview`)).text(), /This is a sample site/)
  }
  const freshDir = mkdtempSync(join(tmpdir(), 'web-end-restore-'))
  const fresh = await startServer({ dataDir: freshDir, port: 0, schedule: false })
  try {
    const claim = await fetch(`${fresh.url}/setup`, { method: 'POST', redirect: 'manual' })
    const freshCode = (await claim.text()).match(/\/mcp\/([a-z0-9-]{20,60})/)?.[1]
    assert.ok(freshCode)
    await restore(head.site, fresh, `${fresh.url}/owner/${freshCode}`)
  } finally {
    await fresh.close()
    rmSync(freshDir, { recursive: true, force: true })
  }
  await restore(head.site)
  const before = await (await fetch(server.url)).text()
  assert.doesNotMatch(before, /This is a sample site/, 'starter must not be public before explicit publish')
  const published = await fetch(`${owner}/publish`, { method: 'POST', body: new URLSearchParams({ note: 'First release' }), redirect: 'manual' })
  assert.equal(published.status, 303)
  const after = await (await fetch(server.url)).text()
  assert.match(after, /This is a sample site/, 'explicit publish makes the starter public')
  await restore({ ...head.site, starter_privacy: 0, live_version: null })
  let entered, release
  const reached = new Promise(resolve => { entered = resolve })
  const resume = new Promise(resolve => { release = resolve })
  const originalBatch = server.db.batch.bind(server.db)
  let paused = false
  server.db.batch = async (statements) => {
    if (!paused && statements.some(statement => statement.sql.includes('INSERT INTO versions (site_id, note, settings'))) {
      paused = true
      entered()
      await resume
    }
    return originalBatch(statements)
  }
  const pending = fetch(`${owner}/publish`, { method: 'POST', body: new URLSearchParams({ note: 'stale publish' }), redirect: 'manual' })
  await reached
  assert.equal(await server.db.prepare("SELECT id FROM versions WHERE note = 'stale publish'").first(), null, 'version allocation must be inside the publication batch')
  await restore(head.site)
  release()
  const stale = await pending
  assert.equal(stale.status, 200)
  assert.match(await stale.text(), /restore is in progress|site changed/i)
  assert.equal(await server.db.prepare("SELECT id FROM versions WHERE note = 'stale publish'").first(), null, 'stale publish must not create a version')
  const leaked = await (await fetch(server.url)).text()
  assert.doesNotMatch(leaked, /This is a sample site/, 'stale publish must not expose restored draft')
  console.log('draft starter preview and explicit publish passed')
} finally {
  await server.close()
  rmSync(dataDir, { recursive: true, force: true })
}
