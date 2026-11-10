import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from '../host/server.mjs'

const dir = mkdtempSync(join(tmpdir(), 'starter-effects-'))
const server = await startServer({ dataDir: dir, port: 0, schedule: false })
try {
  const setup = await fetch(`${server.url}/setup`, { method: 'POST' })
  const code = (await setup.text()).match(/\/mcp\/([a-z0-9-]{20,60})/)[1]
  await server.db.prepare("INSERT INTO webhooks (site_id,url,events,secret) VALUES (1,'http://127.0.0.1/blocked',?, 'test')").bind(JSON.stringify(['record.created'])).run()
  const apply = () => fetch(`${server.url}/owner/${code}/starters`, { method: 'POST', body: new URLSearchParams({ starter: 'classes', language: 'en', confirm: 'on' }), redirect: 'manual' })
  assert.equal((await apply()).status, 303)
  const tables = (await server.db.prepare('SELECT id,name,record_count,indexed FROM data_tables WHERE site_id = 1').all()).results
  const classes = tables.find(t => t.name === 'classes')
  const bookings = tables.find(t => t.name === 'bookings')
  assert.equal(classes.record_count, 3)
  const rows = (await server.db.prepare('SELECT id,data FROM data_records WHERE table_id = ? ORDER BY id').bind(classes.id).all()).results
  const deliveries = (await server.db.prepare("SELECT event,data FROM webhook_deliveries WHERE event = 'record.created' ORDER BY id").all()).results
  assert.equal(deliveries.length, 3, 'each committed sample generates one creation event')
  assert.deepEqual(deliveries.map(d => JSON.parse(d.data).record.id), rows.map(r => r.id))
  assert.ok(bookings.indexed, 'reference index metadata is populated')
  const indexes = (await server.db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name GLOB ?").bind(`data_field_${bookings.id}_*`).all()).results
  assert.ok(indexes.length, 'reference index is created')
  assert.equal((await apply()).status, 303)
  assert.equal((await server.db.prepare("SELECT COUNT(*) AS n FROM webhook_deliveries WHERE event = 'record.created'").first()).n, 3, 'existing tables do not emit duplicate events')
  console.log('starter events, indexes, count and repeat apply verified')
} finally { await server.close(); rmSync(dir, { recursive: true, force: true }) }

for (const mode of ['conflict', 'rollback']) {
  const dir = mkdtempSync(join(tmpdir(), 'starter-effects-race-'))
  const server = await startServer({ dataDir: dir, port: 0, schedule: false })
  try {
    const setup = await fetch(`${server.url}/setup`, { method: 'POST' })
    const code = (await setup.text()).match(/\/mcp\/([a-z0-9-]{20,60})/)[1]
    await server.db.prepare("INSERT INTO webhooks (site_id,url,events,secret) VALUES (1,'http://127.0.0.1/blocked',?, 'test')").bind(JSON.stringify(['record.created'])).run()
    const batch = server.db.batch.bind(server.db)
    let injected = false
    server.db.batch = async statements => {
      if (!injected && statements.some(s => s.sql.startsWith('INSERT INTO data_tables'))) {
        injected = true
        if (mode === 'conflict') await server.db.prepare("INSERT INTO data_tables (site_id,name,label,fields) VALUES (1,'classes','Owner','[]')").run()
        else statements.push(server.db.prepare('INSERT INTO no_such_table VALUES (1)'))
      }
      return batch(statements)
    }
    await fetch(`${server.url}/owner/${code}/starters`, { method: 'POST', body: new URLSearchParams({ starter: 'classes', language: 'en', confirm: 'on' }), redirect: 'manual' })
    assert.ok(injected)
    assert.equal((await server.db.prepare("SELECT COUNT(*) AS n FROM webhook_deliveries WHERE event = 'record.created'").first()).n, 0, `${mode} must not emit events`)
    assert.equal((await server.db.prepare('SELECT COUNT(*) AS n FROM data_records').first()).n, 0, `${mode} must not seed records`)
    console.log(`${mode}: no false creation events`)
  } finally { await server.close(); rmSync(dir, { recursive: true, force: true }) }
}
