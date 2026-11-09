// Runs the web-end engine on Node: an HTTP server, static files, a D1-shaped SQLite database and the
// 15-minute schedule Cloudflare would otherwise start. Nothing here calls home. Outbound connections are
// the ones the owner sets up (email, payments, webhooks, AI provider) plus the engine's release check on
// GitHub, which WEB_END_UPDATE_CHECK=off blocks; outbound.mjs lists every host contacted.
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { D1Database, migrate } from './d1.mjs'
import { HTMLRewriter } from './html-rewriter.mjs'
import { loadConfig } from './config.mjs'
import { watchOutbound } from './outbound.mjs'
import { acquireLock } from './bundle.mjs'
import { createStudio } from '../builder/studio.mjs'

globalThis.HTMLRewriter ??= HTMLRewriter

const systemRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const publicDir = join(systemRoot, '..', 'cloud', 'public')
const types = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' }

async function loadEngine() {
  const file = join(systemRoot, 'dist', 'engine.mjs')
  if (!existsSync(file)) throw new Error('The engine is not built yet. Run "npm run build" first.')
  return (await import(new URL(`file://${file.replace(/\\/g, '/')}`).href)).default
}

/** Files in cloud/public are answered before the engine, the way Cloudflare's assets binding does. */
function staticFile(pathname) {
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  const file = normalize(join(publicDir, decoded))
  if (!file.startsWith(publicDir + sep)) return null
  try {
    const info = statSync(file)
    return info.isFile() ? { file, size: info.size } : null
  } catch {
    return null
  }
}

function toRequest(incoming, config) {
  const proxied = config.trustProxy
  const proto = (proxied && String(incoming.headers['x-forwarded-proto'] ?? '').split(',')[0].trim()) || (incoming.socket.encrypted ? 'https' : 'http')
  const host = (proxied && String(incoming.headers['x-forwarded-host'] ?? '').split(',')[0].trim()) || incoming.headers.host || `localhost:${config.port}`
  const origin = config.publicUrl ? new URL(config.publicUrl).origin : `${proto}://${host}`
  const url = new URL(incoming.url ?? '/', origin)
  const headers = new Headers()
  for (const [name, value] of Object.entries(incoming.headers)) {
    // Like Cloudflare, the platform sets cf-connecting-ip itself; a visitor can't choose it.
    if ((name === 'cf-connecting-ip' && !config.testClientAddress) || name.startsWith(':')) continue
    if (Array.isArray(value)) value.forEach((each) => headers.append(name, each))
    else if (value !== undefined) headers.set(name, value)
  }
  const forwarded = proxied ? String(incoming.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : ''
  if (!(config.testClientAddress && headers.has('cf-connecting-ip'))) headers.set('cf-connecting-ip', forwarded || incoming.socket.remoteAddress || 'local')
  const method = incoming.method ?? 'GET'
  const init = { headers, method }
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = Readable.toWeb(incoming)
    init.duplex = 'half'
  }
  return new Request(url, init)
}

async function send(outgoing, response, method) {
  const headers = {}
  response.headers.forEach((value, name) => {
    if (name === 'set-cookie') return
    headers[name] = value
  })
  const cookies = response.headers.getSetCookie?.() ?? []
  if (cookies.length) headers['set-cookie'] = cookies
  outgoing.writeHead(response.status, response.statusText || undefined, headers)
  if (method === 'HEAD' || !response.body) return void outgoing.end()
  for await (const chunk of response.body) outgoing.write(chunk)
  outgoing.end()
}

export async function startServer(options = {}) {
  const config = loadConfig(options)
  const outbound = watchOutbound({ updateCheck: config.updateCheck })
  const lock = acquireLock(config.dataDir)
  try {
    return await serve(options, config, outbound, lock)
  } catch (error) {
    lock.release()
    throw error
  }
}

async function serve(options, config, outbound, lock) {
  const engine = options.engine ?? (await loadEngine())
  const db = new D1Database(config.databaseFile)
  const migrations = migrate(db, join(systemRoot, '..', 'cloud', 'migrations'))
  const pending = new Set()
  const context = () => ({
    passThroughOnException() {},
    waitUntil(work) {
      const tracked = Promise.resolve(work).catch((error) => console.error('Background work failed:', error)).finally(() => pending.delete(tracked))
      pending.add(tracked)
    },
  })
  const env = { ...config.engineEnv, ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) }, DB: db }
  const engineFetch = (request) => engine.fetch(request, env, context())
  // The same check the engine makes for /owner/<code>: the code's SHA-256 must match the site's.
  const verifyOwner = async (code) => {
    if (!/^[a-z0-9-]{20,60}$/.test(code)) return false
    const hash = createHash('sha256').update(code).digest('hex')
    return Boolean(await db.prepare('SELECT id FROM sites WHERE edit_hash = ?').bind(hash).first())
  }
  const studio = config.studio ? createStudio({ config, engineFetch, outbound, verifyOwner }) : null

  const runScheduled = async (cron = '*/15 * * * *') => {
    const ctx = context()
    await engine.scheduled({ cron, noRetry() {}, scheduledTime: Date.now() }, env, ctx)
    await Promise.allSettled([...pending])
  }

  const server = createServer(async (incoming, outgoing) => {
    try {
      const path = (incoming.url ?? '/').split('?')[0]
      if ((incoming.method === 'GET' || incoming.method === 'HEAD') && path !== '/') {
        const found = staticFile(path)
        if (found) {
          outgoing.writeHead(200, { 'Cache-Control': path.startsWith('/fonts/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600', 'Content-Length': found.size, 'Content-Type': types[extname(found.file)] ?? 'application/octet-stream' })
          if (incoming.method === 'HEAD') return void outgoing.end()
          return void createReadStream(found.file).pipe(outgoing)
        }
      }
      if (path === '/__health') {
        outgoing.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        return void outgoing.end(JSON.stringify({ database: 'ok', migrations: migrations.total, ok: true }))
      }
      // `wrangler dev --test-scheduled` offers this; here it is only on when the owner turns tests on.
      if (path === '/__scheduled' && config.testScheduled) {
        const cron = new URL(incoming.url, 'http://local').searchParams.get('cron') ?? '*/15 * * * *'
        await runScheduled(cron)
        outgoing.writeHead(200, { 'Content-Type': 'text/plain' })
        return void outgoing.end('Ran scheduled event')
      }
      const request = toRequest(incoming, config)
      if (studio && path === '/' && request.method === 'GET' && !(await db.prepare('SELECT id FROM sites LIMIT 1').first())) {
        const nonce = crypto.randomUUID().replaceAll('-', '')
        const th = /(?:^|,)\s*th\b/i.test(request.headers.get('accept-language') ?? '')
        const title = th ? 'อยากสร้างอะไร?' : 'What do you want to build?'
        const button = th ? 'เริ่มสร้างฟรี' : 'Start building free'
        const html = `<!doctype html><html lang="${th ? 'th' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Start building</title></head><body><main><h1>${title}</h1><p>Describe your idea. Do not include passwords or other secrets.</p><form action="/studio/claim" method="post"><textarea id="first-prompt" rows="8" cols="60" maxlength="20000" placeholder="Describe your idea"></textarea><p><button>${button} — set up my site</button></p></form><p>Setup creates the owner of this site. Keep your recovery link or create an owner account before the session expires.</p></main><script nonce="${nonce}">const input=document.getElementById('first-prompt'); try { input.value=sessionStorage.getItem('first-prompt') || ''; input.addEventListener('input',()=>sessionStorage.setItem('first-prompt',input.value)); } catch {}</script></body></html>`
        return void (await send(outgoing, new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`, 'Referrer-Policy': 'no-referrer' } }), request.method))
      }
      if (path === '/setup' && request.method === 'POST' && request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return void (await send(outgoing, new Response('Forbidden', { status: 403 }), request.method))
      if (studio && (path === '/studio' || path.startsWith('/studio/'))) return void (await send(outgoing, await studio.handle(request), request.method))
      await send(outgoing, await engineFetch(request), request.method)
    } catch (error) {
      console.error('Request failed:', error)
      if (!outgoing.headersSent) outgoing.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      outgoing.end('Something went wrong on this server. The details are in its log.')
    }
  })
  server.requestTimeout = 120_000

  await new Promise((done, fail) => {
    server.once('error', fail)
    server.listen(config.port, config.host, done)
  })
  const address = server.address()
  const url = `http://${config.host === '0.0.0.0' || config.host === '::' ? 'localhost' : config.host}:${address.port}`

  // Cloudflare starts a scheduled run every 15 minutes; this does the same on the quarter hour.
  let timer = null
  let running = false
  if (config.schedule) {
    const tick = async () => {
      if (running) return
      running = true
      try {
        await runScheduled()
      } catch (error) {
        console.error('Scheduled run failed:', error)
      } finally {
        running = false
      }
    }
    const nextQuarter = () => 15 * 60_000 - (Date.now() % (15 * 60_000))
    const plan = () => {
      timer = setTimeout(async () => {
        await tick()
        plan()
      }, nextQuarter())
      timer.unref?.()
    }
    plan()
  }

  return {
    config,
    db,
    migrations,
    outbound,
    runScheduled,
    url,
    async close() {
      if (timer) clearTimeout(timer)
      await new Promise((done) => server.close(done))
      server.closeAllConnections?.()
      await Promise.allSettled([...pending])
      studio?.close()
      db.close()
      lock.release()
    },
  }
}
