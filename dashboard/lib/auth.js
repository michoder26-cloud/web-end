// Google sign-in (OpenID Connect with PKCE, state and nonce) and sessions in D1.
const enc = new TextEncoder()
const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)))
export const hash = async (value) => hex(await crypto.subtle.digest('SHA-256', enc.encode(value)))
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (value) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
const SESSION_DAYS = 7
const stateCookie = (value, age) => `we_state=${value}; Path=/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`
const sessionCookie = (value, age) => `we_session=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`
const readCookie = (request, name) =>
  request.headers.get('cookie')?.split(';').map((x) => x.trim()).find((x) => x.startsWith(name + '='))?.slice(name.length + 1) ?? ''
const callbackUrl = (origin) => `${origin}/auth/google/callback`

export function redirect(location, ...cookies) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
  for (const c of cookies) headers.append('Set-Cookie', c)
  return new Response(null, { status: 303, headers })
}
export const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } })
const fail = (code) => redirect(`/login/?error=${code}`, stateCookie('', 0))

export async function beginGoogle(request, env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return fail('not-configured')
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM oauth_states WHERE expires_at < ?').bind(now),
    env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(now),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
  ])
  const ip = request.headers.get('cf-connecting-ip') || 'local'
  const hour = Math.floor(now / 3600000)
  const limited = await env.DB.prepare(
    'INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count',
  ).bind(`google:${await hash(ip)}:${hour}`, (hour + 1) * 3600000).first()
  if (limited.count > 20) return fail('busy')
  const state = random(), verifier = random(), nonce = random()
  await env.DB.prepare('INSERT INTO oauth_states (state_hash, verifier, nonce, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await hash(state), verifier, nonce, now + 600000).run()
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: callbackUrl(new URL(request.url).origin),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: b64url(await crypto.subtle.digest('SHA-256', enc.encode(verifier))),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  })
  return redirect(url.href, stateCookie(state, 600))
}

let keys
export async function verifyIdToken(token, env, nonce, fetcher = fetch) {
  const parts = token.split('.')
  if (parts.length !== 3 || token.length > 8192) return null
  let header, claims
  try {
    header = JSON.parse(new TextDecoder().decode(unb64(parts[0])))
    claims = JSON.parse(new TextDecoder().decode(unb64(parts[1])))
  } catch { return null }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null
  if (!keys || keys.expires < Date.now() || !keys.values.some((x) => x.kid === header.kid)) {
    const response = await fetcher('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(10000) })
    if (!response.ok) return null
    const age = Number(/max-age=(\d+)/.exec(response.headers.get('cache-control') || '')?.[1] || 3600)
    keys = { values: (await response.json()).keys, expires: Date.now() + Math.min(3600, age) * 1000 }
  }
  const jwk = keys.values.find((x) => x.kid === header.kid && x.kty === 'RSA' && (!x.alg || x.alg === 'RS256'))
  if (!jwk) return null
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  let signature
  try { signature = unb64(parts[2]) } catch { return null }
  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, enc.encode(parts[0] + '.' + parts[1])))) return null
  const now = Math.floor(Date.now() / 1000)
  if (
    !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) ||
    claims.aud !== env.GOOGLE_CLIENT_ID ||
    typeof claims.exp !== 'number' || claims.exp < now - 60 ||
    (typeof claims.iat === 'number' && claims.iat > now + 60) ||
    claims.nonce !== nonce || claims.email_verified !== true ||
    typeof claims.sub !== 'string' || !claims.sub || typeof claims.email !== 'string' || !claims.email
  ) return null
  return {
    sub: claims.sub.slice(0, 255),
    email: claims.email.toLowerCase().slice(0, 254),
    name: String(claims.name || claims.email).slice(0, 120),
  }
}

export async function finishGoogle(request, env, fetcher = fetch) {
  const url = new URL(request.url)
  if (url.searchParams.get('error')) return fail('cancelled')
  const state = url.searchParams.get('state') || ''
  if (!state || state !== readCookie(request, 'we_state')) return fail('expired')
  const row = await env.DB.prepare('DELETE FROM oauth_states WHERE state_hash = ? RETURNING verifier, nonce, expires_at').bind(await hash(state)).first()
  if (!row || row.expires_at < Date.now() || !url.searchParams.get('code')) return fail('expired')
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return fail('not-configured')
  const response = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code: url.searchParams.get('code'),
      code_verifier: row.verifier,
      grant_type: 'authorization_code',
      redirect_uri: callbackUrl(url.origin),
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) return fail('failed')
  const { id_token } = await response.json()
  const claims = typeof id_token === 'string' ? await verifyIdToken(id_token, env, row.nonce, fetcher) : null
  if (!claims) return fail('failed')
  await env.DB.prepare(
    'INSERT INTO users (id, google_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(google_sub) DO UPDATE SET email = excluded.email, name = excluded.name',
  ).bind(crypto.randomUUID(), claims.sub, claims.email, claims.name, Date.now()).run()
  const user = await env.DB.prepare('SELECT id FROM users WHERE google_sub = ?').bind(claims.sub).first()
  const token = random()
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await hash(token), user.id, Date.now() + SESSION_DAYS * 86400000).run()
  return redirect('/account/', sessionCookie(token, SESSION_DAYS * 86400), stateCookie('', 0))
}

export async function currentUser(request, env) {
  const token = readCookie(request, 'we_session')
  if (!/^[0-9a-f]{64}$/.test(token)) return null
  return env.DB.prepare(
    'SELECT users.id, users.email, users.name FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?',
  ).bind(await hash(token), Date.now()).first()
}

// POSTs must come from this site's own pages.
export const sameOrigin = (request) => request.headers.get('origin') === new URL(request.url).origin

export async function logout(request, env) {
  const token = readCookie(request, 'we_session')
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hash(token)).run()
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) })
}

export async function deleteAccount(request, env) {
  const user = await currentUser(request, env)
  if (!user) return json({ error: 'not signed in' }, 401)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM apps WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ])
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) })
}
