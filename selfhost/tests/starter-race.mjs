import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from '../host/server.mjs'

for (const kind of ['page', 'item', 'table', 'starter']) {
  const dir = mkdtempSync(join(tmpdir(), 'starter-race-'))
  const server = await startServer({ dataDir: dir, port: 0, schedule: false })
  try {
    const setup = await fetch(`${server.url}/setup`, { method: 'POST' })
    const code = (await setup.text()).match(/\/mcp\/([a-z0-9-]{20,60})/)?.[1]
    assert.ok(code)
    const post = () => fetch(`${server.url}/owner/${code}/starters`, { method: 'POST', body: new URLSearchParams({ starter: 'cafe', language: 'en' }), redirect: 'manual' })
    const original = server.db.batch.bind(server.db)
    let release, reached
    const wait = new Promise(resolve => { release = resolve })
    const barrier = new Promise(resolve => { reached = resolve })
    let paused = false
    server.db.batch = async (statements) => {
      if (!paused && statements.some(s => s.sql.includes('starter_privacy'))) {
        paused = true
        reached()
        await wait
      }
      return original(statements)
    }
    const request = post()
    await barrier
    if (kind === 'page') await server.db.prepare("INSERT INTO pages (site_id, slug, title, description, published, blocks) VALUES (1, 'home', 'Owner page', '', 1, '[]')").run()
    if (kind === 'item') await server.db.prepare("INSERT INTO items (site_id, collection, title) VALUES (1, 'products', 'Owner item')").run()
    if (kind === 'table') await server.db.prepare("INSERT INTO data_tables (site_id, name, label, fields) VALUES (1, 'owner_data', 'Owner data', '[]')").run()
    if (kind === 'starter') assert.equal((await post()).status, 303)
    const snapshot = async () => Promise.all(['sites', 'pages', 'items', 'data_tables', 'starter_privacy', 'starter_guard'].map(async table => (await server.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results))
    const before = await snapshot()
    release()
    assert.equal((await request).status, 409, `${kind}: concurrent content requires confirmation`)
    assert.deepEqual(await snapshot(), before, `${kind}: rejected starter made no writes`)
    if (kind === 'page') assert.equal((await server.db.prepare("SELECT title FROM pages WHERE site_id = 1 AND slug = 'home'").first()).title, 'Owner page')
    if (kind === 'item') assert.ok(await server.db.prepare("SELECT id FROM items WHERE title = 'Owner item'").first())
    if (kind === 'table') assert.ok(await server.db.prepare("SELECT id FROM data_tables WHERE name = 'owner_data'").first())
    if (kind !== 'starter') assert.equal(await server.db.prepare('SELECT site_id FROM starter_privacy WHERE site_id = 1').first(), null)
    console.log(`${kind}: concurrent starter protected`)
  } finally {
    await server.close()
    rmSync(dir, { recursive: true, force: true })
  }
}
