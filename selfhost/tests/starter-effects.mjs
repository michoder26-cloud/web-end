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
  assert.equal(bookings.indexed, null, 'starter defers index creation until a record write')
  await fetch(`${server.url}/mcp/${code}`, { method: 'POST', headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'save_record', arguments: { table: 'bookings', values: {} } } }) })
  assert.ok((await server.db.prepare('SELECT indexed FROM data_tables WHERE id = ?').bind(bookings.id).first()).indexed, 'first record write builds reference index metadata')
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

// Replace after the identity read and before index operations.
{
  const dir = mkdtempSync(join(tmpdir(), 'starter-index-reuse-'))
  const server = await startServer({ dataDir: dir, port: 0, schedule: false })
  try {
    const setup = await fetch(`${server.url}/setup`, { method: 'POST' })
    const code = (await setup.text()).match(/\/mcp\/([a-z0-9-]{20,60})/)[1]
    const prepare = server.db.prepare.bind(server.db)
    let inserted = false, replaced = false
    const batch = server.db.batch.bind(server.db)
    server.db.batch = async statements => {
      const result = await batch(statements)
      if (statements.some(s => s.sql.startsWith('INSERT INTO data_tables'))) inserted = true
      return result
    }
    server.db.prepare = sql => {
      const stmt = prepare(sql)
      if (sql.includes('SELECT name FROM sqlite_master') || sql.startsWith('SELECT collection, title FROM items')) {
        const bind = stmt.bind.bind(stmt)
        stmt.bind = (...args) => {
          const bound = bind(...args), all = bound.all.bind(bound)
          bound.all = async (...params) => {
            if (inserted && !replaced) {
              replaced = true
              const old = await prepare("SELECT id FROM data_tables WHERE name = 'classes'").first()
              await prepare('DELETE FROM data_tables WHERE id = ?').bind(old.id).run()
              await prepare("INSERT INTO data_tables (id,site_id,name,label,fields,indexed) VALUES (?,1,'classes','Replacement','[]','owner_field')").bind(old.id).run()
              await prepare(`CREATE INDEX data_field_${old.id}_owner_field ON data_records (json_extract(data, '$.owner_field')) WHERE table_id = ${old.id}`).run()
            }
            return all(...params)
          }
          return bound
        }
      }
      return stmt
    }
    await fetch(`${server.url}/owner/${code}/starters`, { method: 'POST', body: new URLSearchParams({ starter: 'classes', language: 'en', confirm: 'on' }), redirect: 'manual' })
    assert.ok(replaced, 'replacement injected at the index boundary')
    const replacement = await prepare("SELECT id,indexed FROM data_tables WHERE name = 'classes'").first()
    const indexes = (await prepare("SELECT name FROM sqlite_master WHERE type='index' AND name GLOB ?").bind(`data_field_${replacement.id}_*`).all()).results.map(row => row.name)
    assert.deepEqual(indexes, [`data_field_${replacement.id}_owner_field`], 'replacement indexes remain untouched')
    assert.equal(replacement.indexed, 'owner_field', 'replacement index metadata remains untouched')
  } finally { await server.close(); rmSync(dir, { recursive: true, force: true }) }
}
