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

const sign = async (secret: string, text: string) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { hash: 'SHA-256', name: 'HMAC' }, false, ['sign'])
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function deliver(env: Env, siteId: number, event: string, data: unknown) {
  try {
    const { results } = await env.DB.prepare('SELECT id, url, events, secret FROM webhooks WHERE site_id = ?').bind(siteId).all<{ events: string; id: number; secret: string; url: string }>()
    const wanted = results.filter((hook) => (JSON.parse(hook.events) as string[]).includes(event))
    await Promise.all(
      wanted.map(async (hook) => {
        const body = JSON.stringify({ at: new Date().toISOString(), data, event })
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

/** Tells the owner's other systems what happened, once and after the visitor has their answer. */
export async function fireEvent(env: Env, siteId: number, event: (typeof eventNames)[number], data: unknown) {
  const work = deliver(env, siteId, event, data)
  if (env.defer) env.defer(work)
  else await work
}
