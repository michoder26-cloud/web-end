import type { Customer, Env } from './types'

// Workers allow at most 100,000 PBKDF2 rounds. Each row keeps its count, so it can rise later.
const passwordRounds = 100_000
const sessionSeconds = 30 * 24 * 3600
const cookieName = 'session'

const hex = (bytes: ArrayBuffer | Uint8Array) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
const unhex = (value: string) => Uint8Array.from(value.match(/../g) ?? [], (pair) => parseInt(pair, 16))

export const sha256 = async (value: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))

export const newToken = () => hex(crypto.getRandomValues(new Uint8Array(32)))

async function derive(password: string, salt: string, rounds: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  return hex(await crypto.subtle.deriveBits({ hash: 'SHA-256', iterations: rounds, name: 'PBKDF2', salt: unhex(salt) }, key, 256))
}

export async function hashPassword(password: string) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)))
  return { iterations: passwordRounds, password_hash: await derive(password, salt, passwordRounds), salt }
}

const sameText = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return difference === 0
}

/** Unknown emails take as long as known ones, so a login can't reveal who has an account. */
export async function checkPassword(password: string, row: { iterations: number; password_hash: string; salt: string } | null) {
  const hash = await derive(password, row?.salt ?? '00'.repeat(16), row?.iterations ?? passwordRounds)
  return row ? sameText(hash, row.password_hash) : false
}

export async function startSession(env: Env, url: URL, customerId: number) {
  const token = newToken()
  const expires = new Date(Date.now() + sessionSeconds * 1000).toISOString()
  await env.DB.prepare('INSERT INTO sessions (token_hash, customer_id, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), customerId, expires).run()
  await env.DB.prepare('DELETE FROM sessions WHERE customer_id = ? AND expires_at < ?').bind(customerId, new Date().toISOString()).run()
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionSeconds}${url.protocol === 'https:' ? '; Secure' : ''}`
}

export const endCookie = (url: URL) => `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${url.protocol === 'https:' ? '; Secure' : ''}`

const sessionToken = (request: Request) => {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [name, value] = part.trim().split('=')
    if (name === cookieName && /^[0-9a-f]{64}$/.test(value ?? '')) return value
  }
  return null
}

export async function getCustomer(request: Request, env: Env, siteId: number) {
  const token = sessionToken(request)
  if (!token) return null
  return env.DB.prepare('SELECT customers.id, customers.email, customers.name FROM sessions JOIN customers ON customers.id = sessions.customer_id WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND customers.site_id = ?')
    .bind(await sha256(token), new Date().toISOString(), siteId)
    .first<Customer>()
}

export async function endSession(request: Request, env: Env) {
  const token = sessionToken(request)
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run()
}

/** Counts attempts per visitor. Returns false once the limit for this time window is used up. */
export async function allowAttempt(request: Request, env: Env, action: string, limit: number, seconds: number) {
  const visitor = await sha256(request.headers.get('cf-connecting-ip') ?? 'local')
  const now = Date.now()
  const key = `${action}:${visitor.slice(0, 32)}:${Math.floor(now / (seconds * 1000))}`
  const row = await env.DB.prepare('INSERT INTO throttle (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT (key) DO UPDATE SET count = count + 1 RETURNING count')
    .bind(key, now + seconds * 1000)
    .first<{ count: number }>()
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM throttle WHERE expires_at < ?').bind(now).run()
  return (row?.count ?? 0) <= limit
}
