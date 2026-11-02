import type { Env, Order, OrderLine, Settings, SiteRow } from './types'

const signatureAgeSeconds = 300

/** Opens a card payment on Stripe's own hosted page, so card details never touch this site. */
export async function startCardPayment(env: Env, url: URL, settings: Settings, order: Order, lines: OrderLine[], orderPath: string) {
  const body = new URLSearchParams({
    cancel_url: `${url.origin}${orderPath}`,
    'metadata[order_id]': String(order.id),
    mode: 'payment',
    success_url: `${url.origin}${orderPath}?paid=1`,
  })
  const charges = [...lines.map((line) => ({ amount: line.unit_price, name: line.variant ? `${line.title} · ${line.variant}` : line.title, quantity: line.quantity })), ...(order.shipping ? [{ amount: order.shipping, name: 'Delivery', quantity: 1 }] : [])]
  charges.forEach((charge, index) => {
    body.set(`line_items[${index}][quantity]`, String(charge.quantity))
    body.set(`line_items[${index}][price_data][currency]`, settings.currency!)
    body.set(`line_items[${index}][price_data][unit_amount]`, String(charge.amount))
    body.set(`line_items[${index}][price_data][product_data][name]`, charge.name)
  })
  try {
    const response = await fetch(`${env.STRIPE_API_BASE ?? 'https://api.stripe.com'}/v1/checkout/sessions`, {
      body,
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    })
    if (!response.ok) {
      console.error('Stripe refused the payment', response.status)
      return null
    }
    return ((await response.json()) as { url?: string }).url ?? null
  } catch (error) {
    console.error(error)
    return null
  }
}

async function validSignature(secret: string, header: string, payload: string) {
  const parts = header.split(',').map((part) => part.split('='))
  const timestamp = parts.find(([key]) => key === 't')?.[1]
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value)
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > signatureAgeSeconds) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { hash: 'SHA-256', name: 'HMAC' }, false, ['sign'])
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`))
  const expected = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return signatures.some((signature) => {
    if (signature.length !== expected.length) return false
    let difference = 0
    for (let index = 0; index < expected.length; index++) difference |= signature.charCodeAt(index) ^ expected.charCodeAt(index)
    return difference === 0
  })
}

/** Stripe calls this after a payment. Only a correctly signed message with the exact amount marks an order paid. */
export async function stripeWebhook(request: Request, env: Env, site: SiteRow) {
  const settings = JSON.parse(site.settings) as Settings
  if (!env.STRIPE_WEBHOOK_SECRET) return new Response('Not set up', { status: 404 })
  const payload = await request.text()
  if (payload.length > 200_000 || !(await validSignature(env.STRIPE_WEBHOOK_SECRET, request.headers.get('stripe-signature') ?? '', payload))) return new Response('Bad signature', { status: 400 })
  const event = JSON.parse(payload) as { data?: { object?: { amount_total?: number; currency?: string; metadata?: { order_id?: string }; payment_status?: string } }; type?: string }
  const session = event.data?.object
  if (!event.type?.startsWith('checkout.session.') || session?.payment_status !== 'paid') return new Response('Ignored')
  await env.DB.prepare("UPDATE orders SET status = 'paid', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND site_id = ? AND status = 'pending' AND payment = 'card' AND total = ? AND ? = ?")
    .bind(Number(session.metadata?.order_id), site.id, session.amount_total ?? -1, session.currency ?? '', settings.currency ?? '')
    .run()
  return new Response('OK')
}
