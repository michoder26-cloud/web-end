import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFile } from 'node:fs/promises'
import { beginGoogle, finishGoogle, currentUser, logout, deleteAccount, sameOrigin, hash } from '../lib/auth.js'

const origin = 'https://tktfdesign.com'

async function database() {
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
  return { sqlite, DB }
}

const b64url = (bytes) => Buffer.from(bytes).toString('base64url')

test('Google sign-in creates an account, a session, and can sign out and delete', async () => {
  const { sqlite, DB } = await database()
  const env = { DB, GOOGLE_CLIENT_ID: 'client.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'test-secret' }

  const start = await beginGoogle(new Request(`${origin}/auth/google`), env)
  assert.equal(start.status, 303)
  const google = new URL(start.headers.get('location'))
  assert.equal(google.origin, 'https://accounts.google.com')
  assert.equal(google.searchParams.get('redirect_uri'), `${origin}/auth/google/callback`)
  assert.equal(google.searchParams.get('code_challenge_method'), 'S256')
  const state = google.searchParams.get('state')
  const nonce = google.searchParams.get('nonce')
  assert.match(start.headers.get('set-cookie'), new RegExp(`we_state=${state}`))

  // A fake Google: signs an ID token with a test key.
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1', alg: 'RS256' }
  const now = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ alg: 'RS256', kid: 'k1' }))
  const body = b64url(JSON.stringify({ iss: 'https://accounts.google.com', aud: env.GOOGLE_CLIENT_ID, exp: now + 300, iat: now, nonce, email_verified: true, sub: 'g-1', email: 'Person@Example.com', name: 'Person' }))
  const sig = b64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${head}.${body}`))))
  const sent = []
  const fakeFetch = async (url, options) => {
    sent.push({ url: String(url), body: options?.body?.toString() })
    if (String(url).includes('/token')) return Response.json({ id_token: `${head}.${body}.${sig}` })
    return Response.json({ keys: [jwk] })
  }

  // Wrong state is refused.
  const forged = await finishGoogle(new Request(`${origin}/auth/google/callback?state=x&code=c`, { headers: { cookie: `we_state=${state}` } }), env, fakeFetch)
  assert.match(forged.headers.get('location'), /error=expired/)

  const done = await finishGoogle(new Request(`${origin}/auth/google/callback?state=${state}&code=abc`, { headers: { cookie: `we_state=${state}` } }), env, fakeFetch)
  assert.equal(done.status, 303)
  assert.equal(done.headers.get('location'), '/account/')
  assert.match(sent[0].body, /code_verifier=/)
  const session = /we_session=([0-9a-f]{64})/.exec(done.headers.get('set-cookie'))[1]
  const cookie = { cookie: `we_session=${session}` }

  const user = await currentUser(new Request(`${origin}/api/me`, { headers: cookie }), env)
  assert.equal(user.email, 'person@example.com')

  // The state cannot be used twice.
  const replay = await finishGoogle(new Request(`${origin}/auth/google/callback?state=${state}&code=abc`, { headers: { cookie: `we_state=${state}` } }), env, fakeFetch)
  assert.match(replay.headers.get('location'), /error=expired/)

  assert.equal(sameOrigin(new Request(`${origin}/api/logout`, { method: 'POST', headers: { origin: 'https://evil.example' } })), false)
  await logout(new Request(`${origin}/api/logout`, { method: 'POST', headers: cookie }), env)
  assert.equal(await currentUser(new Request(`${origin}/api/me`, { headers: cookie }), env), null)
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM users').get().n, 1)

  // Sign in again, then delete the account.
  sqlite.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) SELECT ?, id, ? FROM users').run(await hash(session), Date.now() + 60000)
  const removed = await deleteAccount(new Request(`${origin}/api/account/delete`, { method: 'POST', headers: cookie }), env)
  assert.equal(removed.status, 200)
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM users').get().n, 0)
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM sessions').get().n, 0)
  sqlite.close()
})

test('without the Google client, sign-in explains instead of failing', async () => {
  const { DB } = await database()
  const response = await beginGoogle(new Request(`${origin}/auth/google`), { DB })
  assert.equal(response.headers.get('location'), '/login/?error=not-configured')
})

test('a cancelled Google screen returns to log in', async () => {
  const { DB } = await database()
  const response = await finishGoogle(new Request(`${origin}/auth/google/callback?error=access_denied`), { DB })
  assert.equal(response.headers.get('location'), '/login/?error=cancelled')
})
