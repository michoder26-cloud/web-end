import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from '../host/server.mjs'

const server = await startServer({ dataDir: mkdtempSync(join(tmpdir(), 'web-end-plan-')), port: 0, schedule: false })
const base = server.url
try {
  const setup = await (await fetch(base + '/setup', { method: 'POST' })).text()
  const code = setup.match(/\/mcp\/([a-z0-9-]{20,60})/)[1]
  const login = await fetch(base + '/studio/sign-in', { method: 'POST', body: new URLSearchParams({ link: code }), redirect: 'manual' })
  const cookie = login.headers.get('set-cookie').split(';')[0]
  const post = async (path, body, origin = base, auth = cookie) => fetch(base + '/studio/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: auth, ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) })
  const plan = { site_name: 'Sample', summary: 'A sample site', pages: [{ name: 'Welcome', purpose: 'Introduce the site' }], features: ['Contact'] }
  assert.equal((await post('plans', { plan }, base, '')).status, 401)
  assert.equal((await post('plans', { plan }, 'https://evil.test')).status, 403)
  assert.equal((await post('plans', { plan }, null)).status, 403)
  assert.equal((await post('plans', { plan: { ...plan, extra: true } })).status, 400)
  const proposed = await post('plans', { plan })
  assert.equal(proposed.status, 200)
  const proposal = await proposed.json()
  assert.equal(proposal.pages.length, 1)
  assert.equal((await fetch(base + '/' + proposal.pages[0].slug)).status, 404)
  assert.equal((await post('plans/' + proposal.id + '/approve', { approved: false })).status, 400)
  const approved = await post('plans/' + proposal.id + '/approve', { approved: true })
  assert.equal(approved.status, 200, await approved.clone().text())
  assert.equal((await post('plans/' + proposal.id + '/approve', { approved: true })).status, 409)
  const preview = await fetch(base + '/studio/preview/' + proposal.pages[0].slug, { headers: { Cookie: cookie } })
  assert.equal(preview.status, 200)
  assert.match(await preview.text(), /Introduce the site/)
  const office = await fetch(base + '/studio/office/pages', { headers: { Cookie: cookie }, redirect: 'manual' })
  const editor = await fetch(base + office.headers.get('location'))
  assert.match(await editor.text(), /Welcome/)
  assert.equal((await fetch(base + '/' + proposal.pages[0].slug)).status, 404)
  console.log('plan: passed')
} finally { await server.close() }
