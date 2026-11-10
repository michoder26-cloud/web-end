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
  const started = await fetch(`${owner}/starters`, { method: 'POST', body: new URLSearchParams({ starter: 'cafe', language: 'en' }), redirect: 'manual' })
  assert.equal(started.status, 303)
  const preview = await fetch(`${owner}/preview`)
  assert.match(await preview.text(), /This is a sample site/)
  const before = await (await fetch(server.url)).text()
  assert.doesNotMatch(before, /This is a sample site/, 'starter must not be public before explicit publish')
  const published = await fetch(`${owner}/publish`, { method: 'POST', body: new URLSearchParams({ note: 'First release' }), redirect: 'manual' })
  assert.equal(published.status, 303)
  const after = await (await fetch(server.url)).text()
  assert.match(after, /This is a sample site/, 'explicit publish makes the starter public')
  console.log('draft starter preview and explicit publish passed')
} finally {
  await server.close()
  rmSync(dataDir, { recursive: true, force: true })
}
