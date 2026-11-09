// web-end Studio: the built-in builder at /studio. The owner signs in once with their private owner link;
// after that a short-lived HttpOnly cookie is used, so the secret never sits in an address bar or a log.
import { createHash, randomBytes } from 'node:crypto'
import { connectTools, runTurn } from './agent.mjs'
import { makeProvider, probeProvider, providerKinds } from './providers.mjs'
import { openStore } from './store.mjs'
import { studioPage, signInPage } from './ui.mjs'

const cookieName = 'studio_session'
const json = (data, status = 200) => new Response(JSON.stringify(data), { headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' }, status })
const securityHeaders = (nonce) => ({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
  'Content-Type': 'text/html; charset=utf-8',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex',
})
const languageOf = (request) => {
  const chosen = new URL(request.url).searchParams.get('lang')
  if (chosen === 'th' || chosen === 'en') return chosen
  return /^th\b/i.test(request.headers.get('accept-language') ?? '') || /(^|,)\s*th/i.test(request.headers.get('accept-language') ?? '') ? 'th' : 'en'
}
const readCookie = (request, name) => (request.headers.get('cookie') ?? '').split(/;\s*/).map((part) => part.split('=')).find(([key]) => key === name)?.[1] ?? ''

/** The owner link (…/owner/<code> or …/mcp/<code>) or the bare code. */
export const codeFrom = (text) => /(?:\/(?:owner|mcp)\/)?([a-z0-9]{8}(?:-[a-z0-9]{8}){3})\b/.exec(String(text ?? '').trim().toLowerCase())?.[1] ?? ''

export function createStudio({ config, engineFetch, verifyOwner }) {
  const store = openStore(config)
  const active = new Map() // run id → { run, controller }

  const providerFromSettings = (settings) =>
    makeProvider({ apiKey: store.secret(`provider:${settings.provider}`), baseUrl: settings.baseUrl, kind: settings.provider, model: settings.model })

  const startRun = (code, conversation, settings, existing, approve) => {
    const run = existing ?? { budget: { tokens: 0, toolCalls: 0 }, conversation, id: randomBytes(9).toString('base64url'), pending: null, startedAt: Date.now(), status: 'running', steps: [] }
    run.status = 'running'
    store.saveRun(run)
    const controller = new AbortController()
    active.set(run.id, { controller, run })
    let provider
    try {
      provider = providerFromSettings(settings)
    } catch (error) {
      run.status = 'failed'
      run.stopReason = error.message
      run.finishedAt = Date.now()
      store.saveRun(run)
      return run
    }
    runTurn({ approve, connect: () => connectTools(engineFetch, code), provider, run, settings, signal: controller.signal, store })
      .catch((error) => {
        run.status = 'failed'
        run.stopReason = error.message
        store.saveRun(run)
      })
      .finally(() => {
        if (run.status !== 'waiting') active.delete(run.id)
      })
    return run
  }

  const view = (run) => (run ? { id: run.id, pending: run.pending ? { risk: run.pending.risk, tool: run.pending.calls[0]?.name, arguments: run.pending.calls[0]?.arguments } : null, reply: run.reply, status: run.status, steps: run.steps, stopReason: run.stopReason } : null)

  const settingsView = () => {
    const settings = store.settings()
    return { hints: store.secretHints(), kinds: providerKinds, settings }
  }

  async function handle(request) {
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean).slice(1)
    const lang = languageOf(request)
    const token = readCookie(request, cookieName)
    const code = store.sessionCode(token)

    // Changes must come from this site's own pages (the cookie is SameSite=Strict too).
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const origin = request.headers.get('origin')
      if (origin && origin !== url.origin) return json({ error: 'This request came from another site.' }, 403)
    }

    if (parts[0] === 'claim' && request.method === 'POST') {
      if (request.headers.get('origin') !== url.origin) return json({ error: 'Same-origin setup required.' }, 403)
      const answer = await engineFetch(new Request(`${url.origin}/setup`, { method: 'POST', headers: { 'accept-language': request.headers.get('accept-language') ?? '' } }))
      if (answer.status !== 200) return json({ error: 'This site is already set up.' }, 409)
      const html = await answer.text()
      const claimed = /\/owner\/([a-z0-9]{8}(?:-[a-z0-9]{8}){3})/.exec(html)?.[1]
      if (!claimed || !(await verifyOwner(claimed))) return json({ error: 'Setup could not be completed.' }, 500)
      const session = store.createSession(claimed)
      const headers = new Headers(answer.headers)
      headers.set('Set-Cookie', `${cookieName}=${session}; Path=/studio; HttpOnly; SameSite=Strict; Max-Age=43200${url.protocol === 'https:' ? '; Secure' : ''}`)
      headers.set('Cache-Control', 'no-store')
      headers.delete('content-length')
      const notice = '<section class="launch"><h2>Save your access before continuing</h2><p>Save the private owner link below or create an owner account now. This page is shown only once and your Studio session expires in 12 hours. The owner link is required to sign back into Studio.</p><p><a href="/studio">Continue to Studio</a></p></section>'
      return new Response(html.replace('<main>', '<main>' + notice), { headers, status: 200 })
    }
    if (parts[0] === 'sign-in' && request.method === 'POST') {
      const form = await request.formData()
      const given = codeFrom(form.get('link'))
      if (!given || !(await verifyOwner(given))) {
        const nonce = randomBytes(16).toString('hex')
        return new Response(signInPage({ error: true, lang, nonce }), { headers: securityHeaders(nonce), status: 401 })
      }
      const session = store.createSession(given)
      return new Response(null, { headers: { 'Cache-Control': 'no-store', Location: `/studio?lang=${lang}`, 'Set-Cookie': `${cookieName}=${session}; Path=/studio; HttpOnly; SameSite=Strict; Max-Age=43200${url.protocol === 'https:' ? '; Secure' : ''}` }, status: 303 })
    }
    if (!code || !(await verifyOwner(code))) {
      if (parts[0] === 'api') return json({ error: 'Sign in again.' }, 401)
      const nonce = randomBytes(16).toString('hex')
      return new Response(signInPage({ lang, nonce }), { headers: securityHeaders(nonce) })
    }
    const conversation = `c_${createHash('sha256').update(code).digest('hex').slice(0, 16)}`

    if (parts.length === 0) {
      const nonce = randomBytes(16).toString('hex')
      return new Response(studioPage({ lang, nonce }), { headers: securityHeaders(nonce) })
    }
    if (parts[0] === 'sign-out' && request.method === 'POST') {
      store.endSession(token)
      return new Response(null, { headers: { Location: '/studio', 'Set-Cookie': `${cookieName}=; Path=/studio; HttpOnly; SameSite=Strict; Max-Age=0` }, status: 303 })
    }
    // The back office opens from here, so the owner link stays out of the Studio page.
    if (parts[0] === 'office' && request.method === 'GET') {
      const destination = parts[1] ?? ''
      if (parts.length > 2 || !['', 'pages', 'data', 'products', 'orders', 'publish', 'system'].includes(destination)) return json({ error: 'Not found' }, 404)
      return new Response(null, { headers: { 'Cache-Control': 'no-store', Location: `/owner/${code}${destination ? `/${destination}` : ''}`, 'Referrer-Policy': 'no-referrer' }, status: 303 })
    }
    // The working copy's preview, passed through so it can sit in the Studio's frame. Its links are
    // rewritten to stay in the frame, and the owner link is taken out of the page.
    if (parts[0] === 'preview' && request.method === 'GET') {
      const rest = parts.slice(1).map(encodeURIComponent).join('/')
      const answer = await engineFetch(new Request(`${url.origin}/owner/${code}/preview${rest ? `/${rest}` : ''}${url.search}`, { headers: request.headers }))
      const headers = new Headers(answer.headers)
      headers.set('Cache-Control', 'no-store')
      const location = headers.get('location')
      if (location) headers.set('location', location.replaceAll(`/owner/${code}/preview`, '/studio/preview').replaceAll(`/owner/${code}`, '/studio/office'))
      if (!(headers.get('content-type') ?? '').includes('text/html')) return new Response(answer.body, { headers, status: answer.status })
      headers.set('Content-Security-Policy', (headers.get('content-security-policy') ?? "default-src 'self'").replace(/frame-ancestors [^;]+/, "frame-ancestors 'self'"))
      headers.delete('content-length')
      const html = (await answer.text()).replaceAll(`/owner/${code}/preview`, '/studio/preview').replaceAll(`/owner/${code}`, '/studio/office').replaceAll(code, '')
      return new Response(html, { headers, status: answer.status })
    }
    if (parts[0] !== 'api') return json({ error: 'Not found' }, 404)

    const route = `${request.method} ${parts.slice(1).join('/')}`
    if (route === 'GET state') {
      const messages = store.messages(conversation).filter((message) => message.role === 'user' || (message.role === 'assistant' && message.text)).slice(-80).map((message) => ({ role: message.role, text: message.text }))
      const last = [...active.values()].map((entry) => entry.run).find((run) => run.conversation === conversation)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return json({ messages, run: view(last), ...settingsView(), tokensToday: store.tokensSince(today.getTime()), usage: store.usage(20) })
    }
    if (route === 'GET activity') return json({ actions: store.actions(100), usage: store.usage(100) })
    if (route === 'POST settings') {
      const body = await request.json()
      const settings = store.settings()
      const next = {}
      if (body.provider && providerKinds[body.provider]) next.provider = body.provider
      if (typeof body.model === 'string') next.model = body.model.trim().slice(0, 200)
      if (typeof body.baseUrl === 'string') {
        const base = body.baseUrl.trim()
        if (base && !/^https?:\/\/[^\s]+$/i.test(base)) return json({ error: 'The address must start with http:// or https://' }, 400)
        next.baseUrl = base
      }
      if (['risky', 'all', 'none'].includes(body.approval)) next.approval = body.approval
      for (const [name, low, high] of [['maxStepsPerTurn', 1, 200], ['maxTokensPerTurn', 1000, 5_000_000], ['maxTokensPerDay', 1000, 100_000_000], ['maxSecondsPerTurn', 10, 3600]]) {
        if (body[name] === undefined || body[name] === '') continue
        const value = Math.round(Number(body[name]))
        if (!Number.isFinite(value) || value < low || value > high) return json({ error: `${name} must be between ${low} and ${high}.` }, 400)
        next[name] = value
      }
      store.saveSettings(next)
      if (typeof body.apiKey === 'string' && body.apiKey.trim()) store.setSecret(`provider:${next.provider ?? settings.provider}`, body.apiKey.trim())
      if (body.clearKey === true) store.setSecret(`provider:${next.provider ?? settings.provider}`, '')
      return json(settingsView())
    }
    if (route === 'POST test') {
      try {
        return json({ ok: true, ...(await probeProvider(providerFromSettings(store.settings()))) })
      } catch (error) {
        return json({ error: error.message, ok: false })
      }
    }
    if (route === 'POST chat') {
      const body = await request.json()
      const text = String(body.text ?? '').trim().slice(0, 20_000)
      if (!text) return json({ error: 'Write a message first.' }, 400)
      if ([...active.values()].some((entry) => entry.run.conversation === conversation && entry.run.status === 'running')) return json({ error: 'The Studio is still working on the last message.' }, 409)
      try { providerFromSettings(store.settings()) } catch (error) { return json({ error: error.message }, 400) }
      // A message sent while an approval waits answers "no" to it, so the conversation stays whole.
      for (const [id, entry] of active) {
        if (entry.run.conversation !== conversation || entry.run.status !== 'waiting') continue
        for (const call of entry.run.pending?.calls ?? []) store.addMessage(conversation, { isError: true, name: call.name, role: 'tool', text: 'The owner did not approve this; they sent a new message instead.', toolCallId: call.id })
        entry.run.pending = null
        entry.run.status = 'stopped'
        entry.run.stopReason = 'Replaced by a new message.'
        entry.run.finishedAt = Date.now()
        store.saveRun(entry.run)
        active.delete(id)
      }
      store.addMessage(conversation, { role: 'user', text })
      return json({ run: view(startRun(code, conversation, store.settings())) })
    }
    if (parts[1] === 'runs' && parts[2]) {
      const entry = active.get(parts[2])
      const run = entry?.run ?? store.run(parts[2])
      if (!run || run.conversation !== conversation) return json({ error: 'Not found' }, 404)
      if (request.method === 'GET' && parts.length === 3) return json({ run: view(run) })
      if (request.method === 'POST' && parts[3] === 'stop') {
        entry?.controller.abort()
        return json({ run: view(run) })
      }
      if (request.method === 'POST' && (parts[3] === 'approve' || parts[3] === 'decline')) {
        if (run.status !== 'waiting' || !run.pending) return json({ error: 'Nothing is waiting for approval.' }, 409)
        run.budget ??= { tokens: 0, toolCalls: run.steps.filter((step) => step.kind === 'tool').length }
        const decision = parts[3] === 'approve'
        return json({ run: view(startRun(code, conversation, store.settings(), run, () => decision)) })
      }
    }
    return json({ error: 'Not found' }, 404)
  }

  return {
    close() {
      for (const entry of active.values()) entry.controller.abort()
      store.close()
    },
    handle,
    store,
  }
}
