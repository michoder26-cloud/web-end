import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFile } from 'node:fs/promises'
import { hash } from '../lib/auth.js'
import { handleApps, cleanUrl } from '../lib/apps.js'

const origin = 'https://tktfdesign.com'
const tokenA = 'a'.repeat(64)
const tokenB = 'b'.repeat(64)

async function setup() {
  const sqlite = new DatabaseSync(':memory:')
  for (const name of ['0001_init.sql', '0002_apps.sql']) sqlite.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'))
  const bound = (query, args) => ({
    all: async () => ({ results: query.all(...args) }),
    first: async () => query.get(...args) || null,
    run: async () => ({ meta: { changes: Number(query.run(...args).changes) } }),
  })
  const DB = {
    prepare(sql) { const query = sqlite.prepare(sql); return { ...bound(query, []), bind: (...args) => bound(query, args) } },
    batch: async (statements) => { for (const s of statements) await s.run() },
  }
  for (const [id, token] of [['ua', tokenA], ['ub', tokenB]]) {
    sqlite.prepare('INSERT INTO users (id, google_sub, email, name, created_at) VALUES (?, ?, ?, ?, 1)').run(id, `g-${id}`, `${id}@example.com`, id)
    sqlite.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(await hash(token), id, Date.now() + 60000)
  }
  return { sqlite, env: { DB } }
}

const site = async (url) => {
  if (String(url).includes('down')) return new Response('no', { status: 502 })
  return new Response('<html><head><title>Shop &amp; Co</title><meta property="og:image" content="/og.png"></head><body></body></html>', { headers: { 'content-type': 'text/html' } })
}
const req = (token, path, method = 'GET', body, from = origin) =>
  new Request(`${origin}${path}`, { method, body: body && JSON.stringify(body), headers: { cookie: `we_session=${token}`, origin: from, 'content-type': 'application/json' } })

test('only public https addresses are accepted', () => {
  assert.equal(cleanUrl('https://My-App.someone.workers.dev/admin?x=1'), 'https://my-app.someone.workers.dev')
  for (const bad of ['http://a.example', 'https://localhost', 'https://127.0.0.1', 'https://a.example:8443', 'https://u:p@a.example', 'javascript:alert(1)', 'nothing']) assert.equal(cleanUrl(bad), null, bad)
})

test('owners add, list, rename, check and remove their own apps only', async () => {
  const { sqlite, env } = await setup()
  const added = await handleApps(req(tokenA, '/api/apps', 'POST', { url: 'https://shop.a.workers.dev' }), env, {}, site)
  assert.equal(added.status, 201)
  const { app } = await added.json()
  assert.equal(app.name, 'Shop & Co')
  assert.equal(app.status, 'live')
  assert.equal(app.imageUrl, 'https://shop.a.workers.dev/og.png')

  assert.equal((await handleApps(req(tokenA, '/api/apps', 'POST', { url: 'https://shop.a.workers.dev/' }), env, {}, site)).status, 409)
  const down = await (await handleApps(req(tokenA, '/api/apps', 'POST', { url: 'https://down.a.workers.dev', name: 'Later' }), env, {}, site)).json()
  assert.equal(down.app.status, 'down')

  const mine = await (await handleApps(req(tokenA, '/api/apps'), env)).json()
  assert.equal(mine.apps.length, 2)
  const theirs = await (await handleApps(req(tokenB, '/api/apps'), env)).json()
  assert.equal(theirs.apps.length, 0)

  // Another owner can't touch it.
  assert.equal((await handleApps(req(tokenB, `/api/apps/${app.id}`, 'DELETE'), env, { id: app.id })).status, 404)
  assert.equal((await handleApps(req(tokenB, `/api/apps/${app.id}`, 'PATCH', { name: 'x' }), env, { id: app.id })).status, 404)
  // Another site can't make the browser do it.
  assert.equal((await handleApps(req(tokenA, `/api/apps/${app.id}`, 'DELETE', null, 'https://evil.example'), env, { id: app.id })).status, 403)

  const renamed = await (await handleApps(req(tokenA, `/api/apps/${app.id}`, 'PATCH', { name: '  My   shop ' }), env, { id: app.id })).json()
  assert.equal(renamed.app.name, 'My shop')
  const checked = await (await handleApps(req(tokenA, `/api/apps/${down.app.id}/check`, 'POST'), env, { id: down.app.id, action: 'check' }, site)).json()
  assert.equal(checked.app.status, 'down')

  assert.equal((await handleApps(req(tokenA, `/api/apps/${app.id}`, 'DELETE'), env, { id: app.id })).status, 200)
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM apps').get().n, 1)
  assert.equal((await handleApps(new Request(`${origin}/api/apps`), env)).status, 401)
  sqlite.close()
})
