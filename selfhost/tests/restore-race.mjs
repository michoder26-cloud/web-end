import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from '../host/server.mjs'

const dir = mkdtempSync(join(tmpdir(), 'restore-race-'))
const server = await startServer({ dataDir: dir, port: 0, schedule: false })
try {
  const setup = await fetch(`${server.url}/setup`, { method: 'POST', redirect: 'manual' })
  const code = (await setup.text()).match(/\/mcp\/([a-z0-9-]{20,60})/)[1]
  const owner = `${server.url}/owner/${code}`
  const post = (body, token) => fetch(`${owner}/restore/part`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: server.url, ...(token ? { 'X-Restore-Token': token } : {}) }, body: JSON.stringify(body) })
  const start = async () => (await (await post({ start: true, confirm: true, format: 1 })).json()).token
  await fetch(`${owner}/starters`, { method: 'POST', body: new URLSearchParams({ starter: 'cafe', language: 'en' }), redirect: 'manual' })
  const saved = (await (await fetch(`${owner}/backup/part?table=site`)).json()).site
  const part = await (await fetch(`${owner}/backup/part?table=pages`)).json()
  assert.ok(part.rows.length)
  for (const kind of ['chunk', 'finish']) {
    const old = await start()
    let reached, release
    const hit = new Promise((resolve) => { reached = resolve })
    const gate = new Promise((resolve) => { release = resolve })
    const originalBatch = server.db.batch.bind(server.db)
    const originalPrepare = server.db.prepare.bind(server.db)
    let armed = true
    server.db.batch = async (statements) => {
      if (armed && statements.some((s) => kind === 'chunk' ? /^INSERT.* INTO pages /i.test(s.sql) : /^UPDATE sites SET settings = /i.test(s.sql))) { armed = false; reached(); await gate }
      return originalBatch(statements)
    }
    server.db.prepare = (sql) => {
      const statement = originalPrepare(sql)
      if (armed && kind === 'finish' && /^UPDATE sites SET settings = /i.test(sql)) {
        const bind = statement.bind.bind(statement)
        statement.bind = (...args) => { const bound = bind(...args); const run = bound.run.bind(bound); bound.run = async () => { if (armed) { armed = false; reached(); await gate } return run() }; return bound }
      }
      return statement
    }
    const pending = post(kind === 'chunk' ? { table: 'pages', columns: part.columns, rows: part.rows } : { finish: true, site: saved }, old)
    await hit
    const fresh = await start()
    release()
    const response = await pending
    assert.equal(response.status, 403, `stale ${kind} refused after newer restore starts`)
    const site = server.db.db.prepare('SELECT restore_hash FROM sites').get()
    assert.ok(site.restore_hash, 'new restore remains active')
    assert.equal(server.db.db.prepare('SELECT count(*) n FROM pages').get().n, 0, 'stale rows do not enter new restore')
    assert.equal((await post({ table: 'pages', columns: part.columns, rows: part.rows }, fresh)).status, 200)
    server.db.batch = originalBatch
    server.db.prepare = originalPrepare
  }
  console.log('restore race tests passed')
} finally {
  await server.close()
  rmSync(dir, { recursive: true, force: true })
}
