import type { Env } from './types'

export const eventNames = ['record.created', 'record.updated', 'record.deleted', 'order.created', 'order.updated', 'customer.created'] as const

export const validWebhookUrl = (env: Env, value: string) => {
  try {
    const target = new URL(value)
    return target.protocol === 'https:' || (env.WEBHOOK_ALLOW_HTTP === '1' && target.protocol === 'http:')
  } catch {
    return false
  }
}

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

async function deliver(env: Env, siteId: number, event: string, data: unknown) {
  try {
    const { results } = await env.DB.prepare('SELECT id, url, events, secret FROM webhooks WHERE site_id = ?').bind(siteId).all<{ events: string; id: number; secret: string; url: string }>()
    const wanted = results.filter((hook) => (JSON.parse(hook.events) as string[]).includes(event))
    await Promise.all(
      wanted.map(async (hook) => {
        const chat = chatFormat(hook.url)
        const body = JSON.stringify(chat ? chat(chatMessage(event, data)) : { at: new Date().toISOString(), data, event })
        const time = Math.floor(Date.now() / 1000)
        let status = 0
        try {
          const response = await fetch(hook.url, {
            body,
            headers: { 'Content-Type': 'application/json', 'X-Web-End-Event': event, 'X-Web-End-Signature': `t=${time},v1=${await sign(hook.secret, `${time}.${body}`)}` },
            method: 'POST',
            signal: AbortSignal.timeout(5000),
          })
          status = response.status
        } catch (error) {
          console.error('A webhook could not be delivered', error)
        }
        await env.DB.prepare("UPDATE webhooks SET last_status = ?, last_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(status, hook.id).run()
      }),
    )
  } catch (error) {
    console.error(error)
  }
}

type EventHook = (env: Env, siteId: number, event: string, data: unknown, before?: Record<string, unknown>) => Promise<void>
let afterEvent: EventHook | null = null

/** automations.ts registers itself here. Importing it directly would make the modules load in a circle. */
export const onEvent = (hook: EventHook) => {
  afterEvent = hook
}

/** Tells the owner's other systems what happened, once and after the visitor has their answer. `before` is a changed record's old values. */
export async function fireEvent(env: Env, siteId: number, event: (typeof eventNames)[number], data: unknown, before?: Record<string, unknown>) {
  // Every write that other systems hear about can also start the owner's automations. They never throw.
  if (afterEvent) await afterEvent(env, siteId, event, data, before)
  const work = deliver(env, siteId, event, data)
  if (env.defer) env.defer(work)
  else await work
}
