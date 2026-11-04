import { allowAttempt, newToken, sha256 } from './auth'
import { isEmail } from './email'
import type { Env, Settings } from './types'
import { fireEvent } from './webhooks'

// "Log in with Google" for customers, through the owner's own Google OAuth client.
// It uses the authorization code flow with PKCE, a state value tied to the browser, and a nonce.
// The ID token is checked against Google's published keys before anything in it is trusted.

const google = {
  auth: 'https://accounts.google.com/o/oauth2/v2/auth',
  certs: 'https://www.googleapis.com/oauth2/v3/certs',
  token: 'https://oauth2.googleapis.com/token',
}
const issuers = ['https://accounts.google.com', 'accounts.google.com']
const stateSeconds = 600
const stateCookie = 'google_state'
const clockSkew = 60

// Tests point these at a local stand-in. The test-only switch must be on too, so a stray setting on a live site can never send the secret elsewhere.
const endpoints = (env: Env) => {
  const base = env.WEBHOOK_ALLOW_HTTP === '1' && env.GOOGLE_API_BASE ? env.GOOGLE_API_BASE.replace(/\/+$/, '') : ''
  return base ? { auth: `${base}/o/oauth2/v2/auth`, certs: `${base}/oauth2/v3/certs`, token: `${base}/token` } : google
}

// Pasted secrets often carry a stray space or line break.
const clientId = (env: Env) => env.GOOGLE_CLIENT_ID?.trim() ?? ''
const clientSecret = (env: Env) => env.GOOGLE_CLIENT_SECRET?.trim() ?? ''

/** Google login works once the owner has added both secrets in Cloudflare. Customer accounts must be on too, which the account pages check. */
export const canUseGoogle = (env: Env) => Boolean(clientId(env) && clientSecret(env))

/** The address the owner pastes into Google Cloud Console. Each domain the site uses needs its own. */
export const googleRedirect = (origin: string) => `${origin}/login/google/callback`

/** What is set up, for the System page and get_status. It says whether the secrets are set, never what they are. */
export function googleStatus(env: Env, settings: Settings, origin: string) {
  return {
    clientIdSet: Boolean(clientId(env)),
    clientSecretSet: Boolean(clientSecret(env)),
    on: canUseGoogle(env) && Boolean(settings.accounts),
    redirectAddress: googleRedirect(origin),
  }
}

/** Half-finished Google setups, in plain words. check_site and publishing list them. */
export function googleProblems(env: Env, settings: Settings) {
  const problems: string[] = []
  if (clientId(env) && !clientSecret(env)) problems.push('The GOOGLE_CLIENT_ID secret is set in Cloudflare, but GOOGLE_CLIENT_SECRET is missing, so customers can\'t log in with Google. The owner adds it in the Worker settings.')
  if (clientSecret(env) && !clientId(env)) problems.push('The GOOGLE_CLIENT_SECRET secret is set in Cloudflare, but GOOGLE_CLIENT_ID is missing, so customers can\'t log in with Google. The owner adds it in the Worker settings.')
  if (canUseGoogle(env) && !settings.accounts) problems.push('Log in with Google is set up in Cloudflare, but customer accounts are off, so nobody sees it. Turn accounts on with update_site if customers should log in.')
  return problems
}

const base64url = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromBase64url = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0))
const readJson = (value: string) => JSON.parse(new TextDecoder().decode(fromBase64url(value))) as Record<string, unknown>

const cookie = (url: URL, value: string, seconds: number) => `${stateCookie}=${value}; Path=/login/google; HttpOnly; SameSite=Lax; Max-Age=${seconds}${url.protocol === 'https:' ? '; Secure' : ''}`

/** Clears the state cookie, whatever happened. */
export const endGoogleCookie = (url: URL) => cookie(url, '', 0)

const stateFrom = (request: Request) => {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [name, value] = part.trim().split('=')
    if (name === stateCookie && /^[0-9a-f]{64}$/.test(value ?? '')) return value
  }
  return null
}

/** Sends the visitor to Google. Returns null when this visitor has tried too often. */
export async function startGoogle(request: Request, env: Env, url: URL, next: string) {
  if (!(await allowAttempt(request, env, 'google', 20, 900))) return null
  // The state goes in an HttpOnly cookie and, hashed, in the database, so only this browser can finish this login, and only once.
  // The PKCE verifier and nonce never leave the server.
  const state = newToken()
  const verifier = newToken()
  const nonce = newToken()
  const now = new Date()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM google_logins WHERE expires_at < ?').bind(now.toISOString()),
    env.DB.prepare('INSERT INTO google_logins (state_hash, verifier, nonce, next, expires_at) VALUES (?, ?, ?, ?, ?)').bind(await sha256(state), verifier, nonce, next, new Date(now.getTime() + stateSeconds * 1000).toISOString()),
  ])
  const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  const target = new URL(endpoints(env).auth)
  target.search = new URLSearchParams({
    client_id: clientId(env),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    nonce,
    prompt: 'select_account',
    redirect_uri: googleRedirect(url.origin),
    response_type: 'code',
    scope: 'openid email profile',
    state,
  }).toString()
  return new Response(null, { headers: { 'Cache-Control': 'no-store', Location: target.toString(), 'Referrer-Policy': 'no-referrer', 'Set-Cookie': cookie(url, state, stateSeconds) }, status: 303 })
}

type Keys = { expires: number; fetched: number; keys: Map<string, CryptoKey>; source: string }
// Google's keys change every few weeks, so each copy of the Worker keeps them for as long as Google says.
let cachedKeys: Keys | null = null

async function loadKeys(env: Env): Promise<Keys | null> {
  const source = endpoints(env).certs
  try {
    const response = await fetch(source, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) {
      console.error('Google keys could not be loaded', response.status)
      return null
    }
    const body = (await response.json()) as { keys?: { alg?: string; e?: string; kid?: string; kty?: string; n?: string }[] }
    const keys = new Map<string, CryptoKey>()
    for (const key of body.keys ?? []) {
      if (key.kty !== 'RSA' || (key.alg && key.alg !== 'RS256') || !key.kid || !key.n || !key.e) continue
      keys.set(key.kid, await crypto.subtle.importKey('jwk', { alg: 'RS256', e: key.e, ext: true, kty: 'RSA', n: key.n }, { hash: 'SHA-256', name: 'RSASSA-PKCS1-v1_5' }, false, ['verify']))
    }
    const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1] ?? 3600)
    const now = Date.now()
    return { expires: now + Math.min(Math.max(maxAge, 60), 86_400) * 1000, fetched: now, keys, source }
  } catch (error) {
    console.error('Google keys could not be loaded', error instanceof Error ? error.message : 'unknown')
    return null
  }
}

async function googleKey(env: Env, kid: string) {
  const source = endpoints(env).certs
  const fresh = cachedKeys && cachedKeys.source === source && cachedKeys.expires > Date.now() ? cachedKeys : null
  if (fresh?.keys.has(kid)) return fresh.keys.get(kid)!
  // A key id we don't know may be a key Google just added. Fetch again, but at most every ten seconds.
  if (fresh && Date.now() - fresh.fetched < 10_000) return null
  const loaded = await loadKeys(env)
  if (loaded) cachedKeys = loaded
  return loaded?.keys.get(kid) ?? null
}

export type GoogleClaims = { email: string; email_verified: boolean; name: string; sub: string }

/** Checks Google's signature and every claim that matters. Returns null if anything is off. */
export async function verifyIdToken(env: Env, token: string, nonce: string): Promise<GoogleClaims | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3 || token.length > 8192) return null
    const header = readJson(parts[0])
    // Only RS256: a token that names another algorithm, such as "none", is refused before its claims are read.
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null
    const key = await googleKey(env, header.kid)
    if (!key) return null
    if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromBase64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`)))) return null
    const claims = readJson(parts[1])
    const now = Date.now() / 1000
    const id = clientId(env)
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
    if (!issuers.includes(claims.iss as string)) return null
    // A token made for another app must not log anyone in here.
    if (!audience.includes(id) || (audience.length > 1 && claims.azp !== id)) return null
    if (typeof claims.exp !== 'number' || claims.exp < now - clockSkew) return null
    if (typeof claims.iat === 'number' && claims.iat > now + clockSkew) return null
    if (claims.nonce !== nonce) return null
    if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255 || typeof claims.email !== 'string') return null
    return { email: claims.email, email_verified: claims.email_verified === true, name: typeof claims.name === 'string' ? claims.name : '', sub: claims.sub }
  } catch {
    return null
  }
}

export type GoogleResult = { customerId: number; next: string } | { problem: 'busy' | 'cancelled' | 'failed' | 'taken' | 'unverified' }

/** Finds the customer for a verified Google account, linking or creating one as needed. */
async function customerFor(request: Request, env: Env, siteId: number, claims: GoogleClaims): Promise<{ id: number } | { problem: 'busy' | 'failed' | 'taken' }> {
  const bySub = () => env.DB.prepare('SELECT id FROM customers WHERE site_id = ? AND google_sub = ?').bind(siteId, claims.sub).first<{ id: number }>()
  // The Google account id comes first, so a customer who changes their Gmail address keeps their account.
  const known = await bySub()
  if (known) return { id: known.id }
  const email = claims.email.trim().toLowerCase()
  if (!isEmail(email)) return { problem: 'failed' }
  const existing = await env.DB.prepare('SELECT id, google_sub FROM customers WHERE site_id = ? AND email = ?').bind(siteId, email).first<{ google_sub: null | string; id: number }>()
  if (existing) {
    // Google has confirmed this person owns the email, so they may use the account that has it. One that is already linked to another Google account stays as it is.
    if (existing.google_sub) return { problem: 'taken' }
    const linked = await env.DB.prepare('UPDATE customers SET google_sub = ? WHERE id = ? AND google_sub IS NULL').bind(claims.sub, existing.id).run()
    return linked.meta.changes ? { id: existing.id } : { problem: 'failed' }
  }
  // A new account counts like signing up with a password, so the same limit applies.
  if (!(await allowAttempt(request, env, 'signup', 10, 3600))) return { problem: 'busy' }
  const name = (claims.name.trim() || email.split('@')[0]).slice(0, 120)
  // No password yet: an empty hash never matches, and the customer can choose one later with a reset link.
  const salt = [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const created = await env.DB.prepare("INSERT INTO customers (site_id, email, name, password_hash, salt, iterations, google_sub) VALUES (?, ?, ?, '', ?, 100000, ?) ON CONFLICT DO NOTHING RETURNING id")
    .bind(siteId, email, name, salt, claims.sub)
    .first<{ id: number }>()
  if (!created) {
    // Two tabs finishing at once: the other one made the account.
    const raced = await bySub()
    return raced ? { id: raced.id } : { problem: 'failed' }
  }
  await fireEvent(env, siteId, 'customer.created', { email, id: created.id, name })
  return { id: created.id }
}

/** Finishes a Google login when Google sends the visitor back. */
export async function finishGoogle(request: Request, env: Env, url: URL, siteId: number): Promise<GoogleResult> {
  if (!(await allowAttempt(request, env, 'google', 20, 900))) return { problem: 'busy' }
  const state = url.searchParams.get('state') ?? ''
  const browserState = stateFrom(request)
  // The state in the address must match this browser's cookie, so nobody can log a visitor into someone else's account.
  if (!browserState || state !== browserState) return { problem: 'failed' }
  const started = await env.DB.prepare('DELETE FROM google_logins WHERE state_hash = ? RETURNING verifier, nonce, next, expires_at').bind(await sha256(state)).first<{ expires_at: string; next: string; nonce: string; verifier: string }>()
  if (!started || started.expires_at < new Date().toISOString()) return { problem: 'failed' }
  if (url.searchParams.has('error')) return { problem: 'cancelled' }
  const code = url.searchParams.get('code') ?? ''
  if (!code || code.length > 2048) return { problem: 'failed' }

  let idToken = ''
  try {
    const response = await fetch(endpoints(env).token, {
      body: new URLSearchParams({ client_id: clientId(env), client_secret: clientSecret(env), code, code_verifier: started.verifier, grant_type: 'authorization_code', redirect_uri: googleRedirect(url.origin) }),
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    })
    const body = (await response.json().catch((): null => null)) as { id_token?: unknown } | null
    if (!response.ok || typeof body?.id_token !== 'string') {
      // Only the status. The answer can hold codes or tokens, which must never reach the logs.
      console.error('Google refused a login', response.status)
      return { problem: 'failed' }
    }
    idToken = body.id_token
  } catch {
    console.error('Google could not be reached')
    return { problem: 'failed' }
  }

  const claims = await verifyIdToken(env, idToken, started.nonce)
  if (!claims) return { problem: 'failed' }
  if (!claims.email_verified) return { problem: 'unverified' }
  const customer = await customerFor(request, env, siteId, claims)
  return 'id' in customer ? { customerId: customer.id, next: started.next } : customer
}
