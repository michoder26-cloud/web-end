import { withinLimit } from './auth'
import type { DataRow, DataTable } from './data'
import { escapeHtml } from './http'
import { getSite } from './owner'
import { words } from './text'
import type { Env, FormField, Settings } from './types'
import { liveSite } from './versions'

const resendApi = 'https://api.resend.com'
const ownerEmailsPerHour = 60
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const isEmail = (value: unknown): value is string => typeof value === 'string' && value.length <= 254 && emailPattern.test(value)

/** Email works once the owner has added their own Resend key in Cloudflare and chosen a sender address on their verified domain. */
export const canSendEmail = (env: Env, settings: Settings) => Boolean(env.RESEND_API_KEY && isEmail(settings.emailFrom))

/** What is set up, for the System page and get_status. It says whether the key is set, never what it is. */
export function emailStatus(env: Env, settings: Settings) {
  const sending = canSendEmail(env, settings)
  return {
    resendKeySet: Boolean(env.RESEND_API_KEY),
    senderAddress: settings.emailFrom ?? null,
    ownerAddress: settings.notifyEmail ?? null,
    sending,
    ownerNotices: sending && isEmail(settings.notifyEmail),
  }
}

/** Half-finished email setups, in plain words. check_site and publishing list them. */
export function emailProblems(env: Env, settings: Settings) {
  const problems: string[] = []
  if (env.RESEND_API_KEY && !settings.emailFrom) problems.push('The RESEND_API_KEY secret is set in Cloudflare, but there is no sender address, so no emails are sent. Set emailFrom with update_site to an address on the domain the owner verified in Resend.')
  if (settings.emailFrom && !env.RESEND_API_KEY) problems.push('A sender address for emails is set, but the RESEND_API_KEY secret is missing in Cloudflare, so no emails are sent. The owner adds it in the Worker settings.')
  if (settings.notifyEmail && !settings.emailFrom && !env.RESEND_API_KEY) problems.push('An address for new order and message emails is set, but email is not set up, so nothing is sent. The owner needs a Resend account, the RESEND_API_KEY secret in Cloudflare, and a sender address.')
  return problems
}

export type Message = {
  after?: string[]
  facts?: [string, string][]
  heading: string
  lines?: string[]
  link?: { href: string; label: string }
  replyTo?: string
  subject: string
}

const oneLine = (value: string, limit: number) => value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, limit)

// The sender name is the site's name. Quotes and angle brackets would break the address, so they go.
const sender = (settings: Settings) => {
  const name = oneLine(settings.name ?? '', 80).replace(/["<>\\]/g, '')
  return name ? `"${name}" <${settings.emailFrom}>` : settings.emailFrom!
}

/** One message as plain text and simple HTML. Everything people typed is escaped in the HTML version. */
export function renderMessage(settings: Settings, message: Message) {
  const facts = (message.facts ?? []).filter(([, value]) => value !== '')
  const text = [
    message.heading,
    ...(message.lines ?? []),
    facts.map(([label, value]) => `${label}: ${value}`).join('\n'),
    message.link ? `${message.link.label}:\n${message.link.href}` : '',
    ...(message.after ?? []),
    `— ${settings.name}`,
  ]
    .filter(Boolean)
    .join('\n\n')
  const paragraph = (value: string) => `<p style="margin:0 0 16px">${escapeHtml(value).replaceAll('\n', '<br>')}</p>`
  const html = `<!doctype html><html lang="${escapeHtml(settings.language ?? 'en')}"><head><meta charset="utf-8"><title>${escapeHtml(message.subject)}</title></head><body style="margin:0;padding:24px 16px;background:#f6f6f4;color:#1b1b1b;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:16px;line-height:1.5"><div style="max-width:560px;margin:0 auto;background:#ffffff;padding:24px;border-radius:8px">
<p style="margin:0 0 8px;color:#555555;font-size:14px">${escapeHtml(settings.name)}</p><h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${escapeHtml(message.heading)}</h1>
${(message.lines ?? []).map(paragraph).join('')}${facts.length ? `<table style="border-collapse:collapse;margin:0 0 16px">${facts.map(([label, value]) => `<tr><td style="padding:4px 16px 4px 0;color:#555555;vertical-align:top">${escapeHtml(label)}</td><td style="padding:4px 0;vertical-align:top">${escapeHtml(value).replaceAll('\n', '<br>')}</td></tr>`).join('')}</table>` : ''}${message.link ? `<p style="margin:0 0 16px"><a href="${escapeHtml(message.link.href)}" style="color:#1a56db;font-weight:600">${escapeHtml(message.link.label)}</a></p><p style="margin:0 0 16px;color:#555555;font-size:13px;word-break:break-all">${escapeHtml(message.link.href)}</p>` : ''}${(message.after ?? []).map(paragraph).join('')}
</div></body></html>`
  return { html, text }
}

// Tests point this at a local stand-in. The test-only switch must be on too, so a stray setting on a live site can never send the key elsewhere.
const apiBase = (env: Env) => (env.WEBHOOK_ALLOW_HTTP === '1' && env.RESEND_API_BASE ? env.RESEND_API_BASE : resendApi)

/** Sends one email through the owner's own Resend account. Never throws, so a failed email can't break an order or a form. */
export async function sendEmail(env: Env, settings: Settings, to: string, message: Message): Promise<{ ok: boolean; problem?: string }> {
  if (!canSendEmail(env, settings)) return { ok: false, problem: 'Email is not set up yet.' }
  if (!isEmail(to)) return { ok: false, problem: 'That is not an email address.' }
  const { html, text } = renderMessage(settings, message)
  try {
    const response = await fetch(`${apiBase(env)}/emails`, {
      body: JSON.stringify({ from: sender(settings), html, subject: oneLine(message.subject, 200), text, to: [to], ...(isEmail(message.replyTo) ? { reply_to: message.replyTo } : {}) }),
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    })
    if (response.ok) return { ok: true }
    const answer = (await response.json().catch((): null => null)) as { message?: unknown } | null
    const reason = typeof answer?.message === 'string' ? answer.message.slice(0, 300) : ''
    console.error('Resend refused an email', response.status, reason)
    return { ok: false, problem: `Resend answered ${response.status}${reason ? `: ${reason}` : ''}` }
  } catch (error) {
    console.error('An email could not be sent', error)
    return { ok: false, problem: 'Resend could not be reached.' }
  }
}

/** Runs email work after the visitor has their answer, the same way webhooks go out. */
export async function later(env: Env, work: Promise<unknown>) {
  const safe = work.catch((error: unknown) => console.error(error))
  if (env.defer) env.defer(safe)
  else await safe
}

/** Emails the owner about something a visitor did. A flood of spam can't use up the owner's whole email allowance. */
export async function tellOwner(env: Env, build: (settings: Settings, t: ReturnType<typeof words>) => Message | null) {
  // Without a key there is nothing to send, so skip even reading the settings.
  if (!env.RESEND_API_KEY) return
  await later(
    env,
    (async () => {
      const site = await getSite(env)
      if (!site) return
      const settings = JSON.parse(liveSite(site).settings) as Settings
      if (!canSendEmail(env, settings) || !isEmail(settings.notifyEmail)) return
      const message = build(settings, words(settings.language))
      if (!message || !(await withinLimit(env, 'email-owner', ownerEmailsPerHour, 3600))) return
      await sendEmail(env, settings, settings.notifyEmail, message)
    })(),
  )
}

const shown = (value: unknown) => (value === true ? '✓' : value === false ? '—' : value === undefined || value === null ? '' : String(value))

const firstEmail = (fields: { name: string; type: string }[], data: Record<string, unknown>) => fields.filter((field) => field.type === 'email').map((field) => data[field.name]).find(isEmail)

/** A form entry, with the form's own labels. Replying goes to the email the visitor gave, if any. */
export const tellOwnerAboutEntry = (env: Env, form: { fields: FormField[]; heading?: string; name: string }, data: Record<string, unknown>) =>
  tellOwner(env, (_settings, t) => ({
    after: [t.ownerEmailMore],
    facts: form.fields.filter((field) => data[field.name] !== undefined).map((field) => [field.label, shown(data[field.name])]),
    heading: t.newEntry.replace('{form}', form.heading || form.name),
    replyTo: firstEmail(form.fields, data),
    subject: t.newEntry.replace('{form}', form.heading || form.name),
  }))

/** A record a visitor added to a table, with every field, because this email goes only to the owner. */
export const tellOwnerAboutRecord = (env: Env, table: DataTable, row: DataRow) => {
  const data = JSON.parse(row.data) as Record<string, unknown>
  return tellOwner(env, (_settings, t) => ({
    after: [t.ownerEmailMore],
    facts: [['#', String(row.id)], ...table.fields.filter((field) => data[field.name] !== undefined).map((field): [string, string] => [field.label, shown(data[field.name])])],
    heading: t.newRecord.replace('{table}', table.label),
    replyTo: firstEmail(table.fields, data),
    subject: t.newRecord.replace('{table}', table.label),
  }))
}
