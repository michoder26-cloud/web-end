import type { Env } from './types'

export const eventNames = ['record.created', 'record.updated', 'record.deleted', 'order.created', 'order.updated', 'customer.created'] as const

const isIpAddress = (host: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || host.startsWith('[')

/** Only public https addresses, so nobody can point this at a private service. The local tests are the one exception. */
export function safeWebUrl(env: Env, value: string) {
  try {
    const target = new URL(value)
    if (env.WEBHOOK_ALLOW_HTTP === '1' && (target.protocol === 'http:' || target.protocol === 'https:')) return target
    // A trailing dot is a valid fully-qualified hostname. Normalize it before
    // checking reserved names, or `localhost.` would bypass the allowlist.
    const hostname = target.hostname.replace(/\.$/, '')
    if (target.protocol !== 'https:' || target.username || target.password || isIpAddress(hostname) || !hostname.includes('.') || /(^|\.)(localhost|local|internal)$/.test(hostname)) return null
    return target
  } catch {
    return null
  }
}

/** The same rule everywhere: a webhook address must be one `safeWebUrl` accepts, so it can never point at a private service. */
export const validWebhookUrl = (env: Env, value: string) => Boolean(safeWebUrl(env, value))

const chatHosts: Record<string, (text: string) => Record<string, string>> = {
  'api.telegram.org': (text) => ({ text }),
  'discord.com': (text) => ({ content: text }),
  'hooks.slack.com': (text) => ({ text }),
}

const chatFormat = (value: string) => {
  try {
    return chatHosts[new URL(value).hostname] ?? null
  } catch {
    return null
  }
}

/** Chat addresses hold their own secret, so they are added in the back office and never pass through a conversation. */
export const isChatUrl = (value: string) => Boolean(chatFormat(value))

export const hiddenUrl = (value: string) => (isChatUrl(value) ? `${new URL(value).origin}/…` : value)

const eventNames_: Record<string, string> = { 'customer.created': 'New customer', 'order.created': 'New order', 'order.updated': 'Order changed', 'record.created': 'New record', 'record.deleted': 'Record deleted', 'record.updated': 'Record changed' }

/** A short message for a person reading it in a chat app. */
export function chatMessage(event: string, data: unknown) {
  const item = data as { id?: unknown; name?: unknown; record?: Record<string, unknown>; status?: unknown; table?: unknown; total?: unknown }
  const facts = item.record
    ? Object.entries(item.record).filter(([key]) => !['created_at', 'customer_id', 'updated_at'].includes(key)).map(([key, value]) => `${key}: ${String(value)}`)
    : Object.entries(item).filter(([key]) => !['lines', 'money_prefix', 'money_suffix', 'note', 'address', 'phone', 'email', 'created_at', 'updated_at', 'customer_id'].includes(key)).map(([key, value]) => `${key}: ${String(value)}`)
  return `${eventNames_[event] ?? event}${item.table ? ` (${String(item.table)})` : ''}\n${facts.slice(0, 10).join('\n')}`.slice(0, 1500)
}

export const sign = async (secret: string, text: string) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { hash: 'SHA-256', name: 'HMAC' }, false, ['sign'])
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

type Delivery = { attempts: number; data: string; event: string; id: number; secret: string; url: string; webhook_id: number }

const nowIso = () => new Date().toISOString()

const retryAt = (attempt: number) => new Date(Date.now() + Math.min(1_800_000, 30_000 * 2 ** Math.max(0, attempt - 1))).toISOString()

async function enqueue(env: Env, siteId: number, event: string, data: unknown) {
  try {
    const { results } = await env.DB.prepare('SELECT id, events FROM webhooks WHERE site_id = ?').bind(siteId).all<{ events: string; id: number }>()
    const wanted = results.filter((hook) => (JSON.parse(hook.events) as string[]).includes(event))
    const body = JSON.stringify(data) ?? 'null'
    await Promise.all(wanted.map((hook) => env.DB.prepare('INSERT INTO webhook_deliveries (webhook_id, event, data) VALUES (?, ?, ?)').bind(hook.id, event, body).run()))
  } catch (error) {
    console.error('A webhook could not be queued', error)
  }
}

/** Delivers a small bounded batch. Scheduled runs also reclaim work left in progress by an interrupted Worker. */
export async function runWebhookOutbox(env: Env, now = Date.now()) {
  const clock = new Date(now).toISOString()
  try {
    await env.DB.prepare("UPDATE webhook_deliveries SET status = 'pending', locked_at = NULL, updated_at = ? WHERE status = 'sending' AND locked_at < ?")
      .bind(clock, new Date(now - 300_000).toISOString())
      .run()
    const { results } = await env.DB.prepare("SELECT d.id, d.webhook_id, d.event, d.data, d.attempts, h.url, h.secret FROM webhook_deliveries d JOIN webhooks h ON h.id = d.webhook_id WHERE d.status = 'pending' AND d.next_at <= ? ORDER BY d.id LIMIT 20")
      .bind(clock)
      .all<Delivery>()
    await Promise.all(results.map(async (delivery) => {
      const claim = await env.DB.prepare("UPDATE webhook_deliveries SET status = 'sending', attempts = attempts + 1, locked_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'")
        .bind(clock, clock, delivery.id)
        .run()
      if (!claim.meta.changes) return
      const attempt = delivery.attempts + 1
      const chat = chatFormat(delivery.url)
      const data = JSON.parse(delivery.data) as unknown
      const body = JSON.stringify(chat ? chat(chatMessage(delivery.event, data)) : { at: clock, data, event: delivery.event })
      const time = Math.floor(now / 1000)
      let status = 0
      let failure = ''
      // The stored address is checked again, so a row saved before this rule existed cannot reach a private service.
      const target = safeWebUrl(env, delivery.url)
      if (!target) failure = 'Use a public https address.'
      else {
        try {
          const response = await fetch(target, {
            body,
            headers: { 'Content-Type': 'application/json', 'X-Web-End-Event': delivery.event, 'X-Web-End-Signature': `t=${time},v1=${await sign(delivery.secret, `${time}.${body}`)}` },
            method: 'POST',
            // A redirect could lead to a private address, so it counts as a failure.
            redirect: 'manual',
            signal: AbortSignal.timeout(5000),
          })
          status = response.status
          if (status >= 200 && status <= 299) {
            await env.DB.batch([
              env.DB.prepare("UPDATE webhook_deliveries SET status = 'sent', last_status = ?, error = NULL, locked_at = NULL, updated_at = ? WHERE id = ?").bind(status, nowIso(), delivery.id),
              env.DB.prepare("UPDATE webhooks SET last_status = ?, last_at = ? WHERE id = ?").bind(status, nowIso(), delivery.webhook_id),
            ])
            return
          }
          failure = status >= 300 && status <= 399 ? `The address answered ${status} and sent the message elsewhere, so it was not delivered.` : `The address answered ${status}.`
        } catch (error) {
          failure = error instanceof Error ? error.message.slice(0, 500) : 'The address could not be reached.'
        }
      }
      const retryable = Boolean(target) && (status === 0 || status === 429 || status >= 500)
      const exhausted = attempt >= 5 || !retryable
      await env.DB.batch([
        env.DB.prepare("UPDATE webhook_deliveries SET status = ?, next_at = ?, last_status = ?, error = ?, locked_at = NULL, updated_at = ? WHERE id = ?")
          .bind(exhausted ? 'failed' : 'pending', exhausted ? clock : retryAt(attempt), status, failure, nowIso(), delivery.id),
        env.DB.prepare("UPDATE webhooks SET last_status = ?, last_at = ? WHERE id = ?").bind(status, nowIso(), delivery.webhook_id),
      ])
    }))
  } catch (error) {
    console.error('Webhook outbox could not run', error)
  }
}

/**
 * Deliveries hold the event's data, which can include a customer's name, phone and address, so they are kept only
 * as long as they help: a week once delivered, a month once given up on, so the owner can still see what failed.
 */
export async function cleanWebhookOutbox(env: Env, now = Date.now()) {
  const day = 86_400_000
  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM webhook_deliveries WHERE status = 'sent' AND updated_at < ?").bind(new Date(now - 7 * day).toISOString()),
      env.DB.prepare("DELETE FROM webhook_deliveries WHERE status = 'failed' AND updated_at < ?").bind(new Date(now - 30 * day).toISOString()),
    ])
  } catch (error) {
    console.error('Old webhook deliveries could not be cleaned up', error)
  }
}

type EventHook = (env: Env, siteId: number, event: string, data: unknown, before?: Record<string, unknown>) => Promise<void>
const afterEvent: EventHook[] = []

/** automations.ts and approvals.ts register themselves here. Importing them directly would make the modules load in a circle. */
export const onEvent = (hook: EventHook) => {
  afterEvent.push(hook)
}

/** Tells the owner's other systems what happened, once and after the visitor has their answer. `before` is a changed record's old values. */
export async function fireEvent(env: Env, siteId: number, event: (typeof eventNames)[number], data: unknown, before?: Record<string, unknown>) {
  // Every write that other systems hear about can also start the owner's automations. They never throw.
  for (const hook of afterEvent) await hook(env, siteId, event, data, before)
  await enqueue(env, siteId, event, data)
  const work = runWebhookOutbox(env)
  if (env.defer) env.defer(work)
  else await work
}
