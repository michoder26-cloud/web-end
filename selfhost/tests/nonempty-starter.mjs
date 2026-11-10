import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from '../host/server.mjs'

for (const kind of ['item', 'table']) {
  const dir = mkdtempSync(join(tmpdir(), 'web-end-nonempty-'))
  const server = await startServer({ dataDir: dir, port: 0, schedule: false })
  try {
    const setup = await fetch(`${server.url}/setup`, { method: 'POST' })
    const code = (await setup.text()).match(/\/mcp\/([a-z0-9-]{20,60})/)?.[1]
    assert.ok(code)
    const owner = `${server.url}/owner/${code}`
    if (kind === 'item') await server.db.prepare("INSERT INTO items (site_id, collection, title) VALUES (1, 'products', 'Owner item')").run()
    else await server.db.prepare("INSERT INTO data_tables (site_id, name, label, fields) VALUES (1, 'owner_data', 'Owner data', '[]')").run()
    const post = (base, confirm) => fetch(`${base}/starters`, { method: 'POST', body: new URLSearchParams({ starter: 'cafe', language: 'en', ...(confirm ? { confirm: 'on' } : {}) }), redirect: 'manual' })
    assert.equal((await post(owner, false)).status, 409, 'replacement must be confirmed')
    assert.equal((await post(`${server.url}/owner/not-the-owner`, true)).status, 404)
    const [result, ...reads] = await Promise.all([post(owner, true), ...Array.from({ length: 40 }, () => fetch(server.url).then(r => r.text()))])
    assert.equal(result.status, 303)
    for (const body of reads) assert.doesNotMatch(body, /This is a sample site/)
    assert.equal((await fetch(server.url)).status, 404, `${kind}: starter remains private`)
    assert.match(await (await fetch(`${owner}/preview`)).text(), /This is a sample site/)
    assert.ok(await server.db.prepare(kind === 'item' ? "SELECT id FROM items WHERE title = 'Owner item'" : "SELECT id FROM data_tables WHERE name = 'owner_data'").first())
    assert.notEqual((await fetch(`${server.url}/owner/not-the-owner/publish`, { method: 'POST', redirect: 'manual' })).status, 303)
    assert.equal((await fetch(server.url)).status, 404)
    assert.equal((await fetch(`${owner}/publish`, { method: 'POST', body: new URLSearchParams({ note: 'First publish' }), redirect: 'manual' })).status, 303)
    assert.match(await (await fetch(server.url)).text(), /This is a sample site/)
    // Legacy installations can have a published version and no privacy row.
    await server.db.prepare('DELETE FROM starter_privacy WHERE site_id = 1').run()
    assert.equal((await post(owner, true)).status, 303)
    assert.equal(await server.db.prepare('SELECT site_id FROM starter_privacy WHERE site_id = 1').first(), null)
    const live = await fetch(server.url)
    assert.equal(live.status, 200, 'applying to a legacy live site must not cloak it')
    assert.match(await live.text(), /This is a sample site/)
    console.log(`${kind}: confirmation, privacy, preservation and publish passed`)
  } finally {
    await server.close()
    rmSync(dir, { recursive: true, force: true })
  }
}
