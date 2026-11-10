import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from '../host/server.mjs'

const dir = mkdtempSync(join(tmpdir(), 'starter-table-history-'))
const server = await startServer({ dataDir: dir, port: 0, schedule: false })
try {
  const setup = await fetch(`${server.url}/setup`, { method: 'POST' })
  const code = (await setup.text()).match(/\/mcp\/([a-z0-9-]{20,60})/)[1]
  const owner = `${server.url}/owner/${code}`
  const originalPrepare = server.db.prepare.bind(server.db)
  let reached, release
  const hit = new Promise(resolve => { reached = resolve })
  const gate = new Promise(resolve => { release = resolve })
  let armed = true
  server.db.prepare = sql => {
    const statement = originalPrepare(sql)
    if (armed && /^INSERT INTO data_tables /i.test(sql)) {
      const bind = statement.bind.bind(statement)
      statement.bind = (...args) => {
        const bound = bind(...args)
        const first = bound.first.bind(bound)
        bound.first = async (...params) => { if (armed) { armed = false; reached(); await gate } return first(...params) }
        return bound
      }
    }
    return statement
  }
  const pending = fetch(`${owner}/starters`, { method: 'POST', body: new URLSearchParams({ starter: 'classes', language: 'en' }), redirect: 'manual' })
  await hit
  await originalPrepare("INSERT INTO data_tables (site_id, name, label, fields, read_access, write_access) VALUES (1, 'classes', 'Owner private', ?, 'owner', 'owner')").bind(JSON.stringify([{ name: 'seats', label: 'Owner seats', type: 'number' }])).run()
  const before = await originalPrepare("SELECT * FROM data_tables WHERE site_id = 1 AND name = 'classes'").first()
  release()
  assert.equal((await pending).status, 303)
  server.db.prepare = originalPrepare
  assert.deepEqual(await originalPrepare("SELECT * FROM data_tables WHERE site_id = 1 AND name = 'classes'").first(), before, 'concurrent table and permissions must remain untouched')
  assert.equal((await originalPrepare('SELECT count(*) AS n FROM data_records WHERE table_id = ?').bind(before.id).first()).n, 0, 'no starter records in owner table')
  console.log('starter table race passed')

  assert.equal((await fetch(`${owner}/publish`, { method: 'POST', body: new URLSearchParams({ note: 'test' }), redirect: 'manual' })).status, 303)
  const version = await originalPrepare('SELECT id FROM versions WHERE site_id = 1 ORDER BY id DESC LIMIT 1').first()
  assert.ok(version)
  for (let i = 0; i < 22; i++) {
    for (const slug of ['gone', 'home']) await originalPrepare("INSERT INTO page_revisions (site_id, slug, title, description, published, blocks) VALUES (1, ?, ?, '', 1, '[]')").bind(slug, `revision ${i}`).run()
  }
  const gone = (await originalPrepare("SELECT * FROM page_revisions WHERE site_id = 1 AND slug = 'gone' ORDER BY id").all()).results
  assert.equal((await fetch(`${owner}/publish/${version.id}/restore`, { method: 'POST', body: new URLSearchParams({ confirm: 'on' }), redirect: 'manual' })).status, 303)
  assert.deepEqual((await originalPrepare("SELECT * FROM page_revisions WHERE site_id = 1 AND slug = 'gone' ORDER BY id").all()).results, gone, 'unrelated history must not be pruned')
  assert.equal((await originalPrepare("SELECT count(*) AS n FROM page_revisions WHERE site_id = 1 AND slug = 'home'").first()).n, 20)
  assert.ok((await originalPrepare("SELECT title FROM page_revisions WHERE site_id = 1 AND slug = 'home' ORDER BY id DESC LIMIT 1").first()).title !== 'revision 21', 'current page snapshotted before pruning')
  console.log('restore history passed')
} finally {
  await server.close()
  rmSync(dir, { recursive: true, force: true })
}
