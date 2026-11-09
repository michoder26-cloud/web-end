import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from '../host/server.mjs'

const server = await startServer({ dataDir: mkdtempSync(join(tmpdir(), 'web-end-first-')), port: 0, schedule: false, updateCheck: false })
const base = server.url
try {
  const page = await (await fetch(base)).text()
  assert.match(page, /id="first-prompt"/)
  assert.match(page, /sessionStorage/)
  assert.equal((await fetch(base + '/studio/claim', { method: 'POST' })).status, 403)
  assert.equal((await fetch(base + '/setup', { method: 'POST', headers: { Origin: 'https://evil.test' } })).status, 403)
  const foreign = await fetch(base + '/studio/claim', { method: 'POST', headers: { Origin: 'https://evil.test' } })
  assert.equal(foreign.status, 403)
  assert.equal((await fetch(base + '/studio/api/state')).status, 401)
  const claim = await fetch(base + '/studio/claim', { method: 'POST', headers: { Origin: base }, redirect: 'manual' })
  assert.equal(claim.status, 200)
  const recovery = await claim.text()
  assert.match(recovery, /save|keep/i)
  assert.match(recovery, /\/owner\/[a-z0-9-]{35}/)
  assert.match(recovery, /href="\/studio"/)
  const cookie = claim.headers.get('set-cookie')
  assert.match(cookie, /HttpOnly/)
  assert.doesNotMatch(cookie, /[a-z0-9]{8}(?:-[a-z0-9]{8}){3}/)
  assert.equal((await fetch(base + '/studio/claim', { method: 'POST', headers: { Origin: base }, redirect: 'manual' })).status, 409)
  const studio = await (await fetch(base + '/studio', { headers: { Cookie: cookie } })).text()
  assert.match(studio, /sessionStorage/)
  assert.match(studio, /provider/i)
  const unavailable = await fetch(base + '/studio/api/chat', { method: 'POST', headers: { Origin: base, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'draft' }) })
  assert.equal(unavailable.status, 400)
  assert.match((await unavailable.json()).error, /Settings/i)
  assert.equal((await fetch(base + '/studio/api/chat', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'unauthorized' }) })).status, 401)
  console.log('first-run: all checks passed')
} finally { await server.close() }
