import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from '../host/server.mjs'

for (const kind of ['limit', 'replacement'].filter(kind => !process.env.CASE || process.env.CASE === kind)) {
  const dir = mkdtempSync(join(tmpdir(), 'starter-interleave-'))
  const server = await startServer({ dataDir: dir, port: 0, schedule: false })
  try {
    const setup = await fetch(`${server.url}/setup`, { method: 'POST' })
    const code = (await setup.text()).match(/\/mcp\/([a-z0-9-]{20,60})/)[1]
    const prepare = server.db.prepare.bind(server.db)
    if (kind === 'limit') for (let i = 0; i < 49; i++) await prepare("INSERT INTO data_tables (site_id,name,label,fields,read_access,write_access) VALUES (1,?,?,'[]','owner','owner')").bind(`t${i}`, `t${i}`).run()
    let reached, release
    const hit = new Promise(resolve => { reached = resolve })
    const gate = new Promise(resolve => { release = resolve })
    let armed = true, seen = 0
    const batch = server.db.batch.bind(server.db)
    server.db.batch = async statements => {
      const result = await batch(statements)
      if (kind === 'replacement' && armed && statements.some(stmt => stmt.sql.startsWith('INSERT INTO data_tables'))) {
        armed = false; reached(); await gate
      }
      return result
    }
    server.db.prepare = sql => {
      const stmt = prepare(sql)
      const match = kind === 'limit' && sql.startsWith('SELECT COUNT(*) AS total FROM data_tables')
      if (match) {
        const bind = stmt.bind.bind(stmt)
        stmt.bind = (...args) => {
          const bound = bind(...args), first = bound.first.bind(bound)
          bound.first = async (...params) => {
            if (armed && (kind === 'limit' || (++seen === 3))) { armed = false; reached(); await gate }
            return first(...params)
          }
          return bound
        }
      }
      return stmt
    }
    const pending = fetch(`${server.url}/owner/${code}/starters`, { method: 'POST', body: new URLSearchParams({ starter: kind === 'limit' ? 'trades' : 'classes', language: 'en', confirm: 'on' }), redirect: 'manual' })
    await hit
    const name = kind === 'limit' ? 'work_requests' : 'classes'
    const previous = kind === 'replacement' ? await prepare('SELECT id FROM data_tables WHERE site_id = 1 AND name = ?').bind(name).first() : null
    if (kind === 'replacement') await prepare('DELETE FROM data_tables WHERE site_id = 1 AND name = ?').bind(name).run()
    await prepare("INSERT INTO data_tables (site_id,name,label,fields,read_access,write_access) VALUES (1,?,'Owner private',?,'owner','owner')").bind(name, JSON.stringify([{ name: 'title', label: 'Title', type: 'text' }])).run()
    const owner = await prepare('SELECT id FROM data_tables WHERE site_id = 1 AND name = ?').bind(name).first()
    release()
    const response = await pending
    const rows = await prepare('SELECT COUNT(*) AS n FROM data_records WHERE table_id = ?').bind(owner.id).first()
    const pages = await prepare('SELECT COUNT(*) AS n FROM pages WHERE site_id = 1').first()
    console.log(kind, { status: response.status, oldId: previous?.id, replacementId: owner.id, ownerRecords: rows.n, pages: pages.n })
    if (kind === 'limit') assert.equal(response.status, 303, 'same-name table at limit should be skipped, not fail after pages committed')
    else {
      assert.equal(rows.n, 0, 'replacement table must not receive starter records')
      assert.equal(response.status, 409, 'incompatible replacement must report partial application')
      assert.match(await response.text(), /pages and design were applied/i)
      assert.equal(previous.id, owner.id, 'repro exercises SQLite id reuse')
    }
  } finally { await server.close(); rmSync(dir, { recursive: true, force: true }) }
}
