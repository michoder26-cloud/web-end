import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from '../host/server.mjs'

for (const kind of ['settings', 'confirmed-settings', 'pages'].filter(kind => !process.argv[2] || process.argv[2] === kind)) {
  const dir = mkdtempSync(join(tmpdir(), 'starter-data-race-'))
  const server = await startServer({ dataDir: dir, port: 0, schedule: false })
  try {
    const setup = await fetch(`${server.url}/setup`, { method: 'POST' })
    const code = (await setup.text()).match(/\/mcp\/([a-z0-9-]{20,60})/)?.[1]
    assert.ok(code)
    const post = (confirmed = false) => fetch(`${server.url}/owner/${code}/starters`, { method: 'POST', body: new URLSearchParams({ starter: 'cafe', language: 'en', ...(confirmed ? { confirm: 'on' } : {}) }), redirect: 'manual' })
    if (kind === 'pages') await server.db.prepare("INSERT INTO pages (site_id, slug, title, description, published, blocks) VALUES (1, 'home', 'Old page', '', 1, '[]')").run()
    const original = server.db.batch.bind(server.db)
    let release, reached
    const wait = new Promise(resolve => { release = resolve })
    const barrier = new Promise(resolve => { reached = resolve })
    let paused = false
    server.db.batch = async statements => {
      if (!paused && statements.some(s => s.sql.includes('starter_privacy'))) {
        paused = true; reached(); await wait
      }
      return original(statements)
    }
    const request = post(kind !== 'settings')
    await barrier
    if (kind !== 'pages') await server.db.prepare("UPDATE sites SET settings = json_set(settings, '$.name', 'Concurrent owner name') WHERE id = 1").run()
    else {
      await server.db.prepare("UPDATE pages SET title = 'Concurrent edit' WHERE site_id = 1 AND slug = 'home'").run()
      await server.db.prepare("INSERT INTO pages (site_id, slug, title, description, published, blocks) VALUES (1, 'new', 'Concurrent page', '', 1, '[]')").run()
    }
    const snapshot = async () => Promise.all(['sites', 'pages', 'items', 'data_tables', 'starter_privacy', 'starter_guard', 'page_revisions'].map(async table => (await server.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results))
    const before = await snapshot()
    release()
    const response = await request
    if (kind !== 'pages') {
      assert.equal(response.status, 409, 'stale settings must reject the whole apply')
      assert.deepEqual(await snapshot(), before, 'settings conflict makes no writes')
      assert.equal((await post(true)).status, 303, 'owner can retry')
      const row = await server.db.prepare('SELECT settings FROM sites WHERE id = 1').first()
      assert.equal(JSON.parse(row.settings).name, 'Concurrent owner name')
    } else {
      assert.equal(response.status, 303)
      const revisions = (await server.db.prepare('SELECT slug, title FROM page_revisions WHERE site_id = 1').all()).results
      assert.ok(revisions.some(row => row.slug === 'home' && row.title === 'Concurrent edit'), 'latest edit recoverable')
      assert.ok(revisions.some(row => row.slug === 'new' && row.title === 'Concurrent page'), 'new page recoverable')
    }
    console.log(`${kind}: concurrent owner data protected`)
  } finally {
    await server.close()
    rmSync(dir, { recursive: true, force: true })
  }
}
