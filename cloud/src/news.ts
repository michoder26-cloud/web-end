// News by email: a list of people who agreed to get it, and campaigns the owner sends them through their own Resend account.
// Nobody is added without agreeing, everyone confirms by email first, and every email can be unsubscribed from in one click.
import { z } from 'zod'

import { sha256, withinLimit } from './auth'
import { canSendEmail, isEmail, later, sendEmail } from './email'
import type { Inline, Message } from './email'
import { escapeHtml, html, privateHeaders } from './http'
import { languagePrefix } from './languages'
import { getSite } from './owner'
import { renderLayout } from './render'
import { words } from './text'
import { isSafeHref } from './theme'
import type { Env, Settings, SiteRow } from './types'
import { liveSite } from './versions'

/** Resend's free plan allows 100 emails a day. 90 leaves room for order and password emails. */
export const defaultDailyLimit = 90
export const maxDailyLimit = 50_000
// One scheduled run sends at most this many, to stay inside the free plan's limits on a single run.
const perRun = 20
// Resend accepts about 2 emails a second.
const pauseMs = 600
export const maxImport = 1000

export const sources = ['signup', 'checkout', 'form', 'import'] as const
export type Source = (typeof sources)[number]
export type SubscriberStatus = 'pending' | 'subscribed' | 'unsubscribed'

export type Subscriber = {
  confirmed_at: null | string
  consented_at: string
  created_at: string
  email: string
  id: number
  name: string
  source: Source
  source_detail: string
  status: SubscriberStatus
  unsubscribed_at: null | string
}

export type Campaign = {
  body: string
  button_href: string
  button_label: string
  created_at: string
  finished_at: null | string
  id: number
  image_alt: string
  image_url: string
  origin: string
  started_at: null | string
  status: 'draft' | 'sending' | 'sent' | 'stopped'
  subject: string
  updated_at: string
}

const iso = (ms: number) => new Date(ms).toISOString()
const dayOf = (ms: number) => iso(ms).slice(0, 10)
const pause = () => new Promise((done) => setTimeout(done, pauseMs))

/** The owner's daily limit for news emails, 90 unless they chose another. */
export const dailyLimit = (settings: Pick<Settings, 'newsDailyLimit'>) => {
  const value = Number(settings.newsDailyLimit)
  return Number.isInteger(value) && value >= 1 && value <= maxDailyLimit ? value : defaultDailyLimit
}

export const emailHash = (siteId: number, email: string) => sha256(`${siteId}:${email.trim().toLowerCase()}`)

// Signing

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
const keys = new Map<string, Promise<CryptoKey>>()

async function secretKey(env: Env, siteId: number) {
  let row = await env.DB.prepare('SELECT news_secret FROM sites WHERE id = ?').bind(siteId).first<{ news_secret: null | string }>()
  if (!row?.news_secret) {
    const fresh = hex(crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer)
    // Only the first one is kept, so two requests at the same moment end up with the same secret.
    await env.DB.prepare('UPDATE sites SET news_secret = ? WHERE id = ? AND news_secret IS NULL').bind(fresh, siteId).run()
    row = await env.DB.prepare('SELECT news_secret FROM sites WHERE id = ?').bind(siteId).first<{ news_secret: null | string }>()
  }
  const secret = row!.news_secret!
  let key = keys.get(secret)
  if (!key) {
    key = crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { hash: 'SHA-256', name: 'HMAC' }, false, ['sign'])
    keys.set(secret, key)
  }
  return key
}

/** A signature for one person and one purpose. It names their address, so it stops working if the row ever held someone else. */
async function sign(env: Env, siteId: number, purpose: 'confirm' | 'unsubscribe', id: number, email: string) {
  const key = await secretKey(env, siteId)
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${purpose}:${id}:${email}`))).slice(0, 32)
}

const sameText = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return difference === 0
}

export const newsLink = async (env: Env, siteId: number, origin: string, purpose: 'confirm' | 'unsubscribe', person: { email: string; id: number }) =>
  `${origin}/newsletter/${purpose}/${person.id}/${await sign(env, siteId, purpose, person.id, person.email)}`

// The daily limit. A place is taken before each email and given back if it was not sent, so overlapping runs can't pass it.

async function takePlace(env: Env, siteId: number, limit: number, now: number) {
  const row = await env.DB.prepare('INSERT INTO news_daily (site_id, day, sent) VALUES (?, ?, 1) ON CONFLICT (site_id, day) DO UPDATE SET sent = sent + 1 WHERE sent < ? RETURNING sent')
    .bind(siteId, dayOf(now), limit)
    .first<{ sent: number }>()
  return Boolean(row)
}

const givePlaceBack = (env: Env, siteId: number, now: number) => env.DB.prepare('UPDATE news_daily SET sent = sent - 1 WHERE site_id = ? AND day = ? AND sent > 0').bind(siteId, dayOf(now)).run()

export async function sentToday(env: Env, siteId: number, now = Date.now()) {
  const row = await env.DB.prepare('SELECT sent FROM news_daily WHERE site_id = ? AND day = ?').bind(siteId, dayOf(now)).first<{ sent: number }>()
  return row?.sent ?? 0
}

// Subscribers

/** Sends the email that asks someone to confirm. At most once a day per person, and never past the daily limit. */
async function sendConfirmation(env: Env, siteId: number, settings: Settings, person: { email: string; id: number; origin: string }, now: number): Promise<'failed' | 'full' | 'sent' | 'skipped'> {
  if (!canSendEmail(env, settings) || !person.origin) return 'skipped'
  const claimed = await env.DB.prepare("UPDATE subscribers SET confirm_sent_at = ? WHERE id = ? AND status = 'pending' AND (confirm_sent_at IS NULL OR confirm_sent_at < ?) RETURNING id").bind(iso(now), person.id, iso(now - 86_400_000)).first()
  if (!claimed) return 'skipped'
  const unclaim = () => env.DB.prepare('UPDATE subscribers SET confirm_sent_at = NULL WHERE id = ?').bind(person.id).run()
  if (!(await takePlace(env, siteId, dailyLimit(settings), now))) {
    await unclaim()
    return 'full'
  }
  const t = words(settings.language)
  const site = settings.name
  const result = await sendEmail(env, settings, person.email, {
    after: [t.newsConfirmIgnore],
    heading: t.newsConfirmTitle,
    lines: [t.newsConfirmBody.replace('{site}', site)],
    // Someone who signed up on an extra language's page confirms on a page in that language.
    link: { href: await newsLink(env, siteId, `${person.origin}${languagePrefix(settings)}`, 'confirm', person), label: t.newsConfirmButton },
    replyTo: settings.email,
    subject: t.newsConfirmSubject.replace('{site}', site),
  })
  if (result.ok) return 'sent'
  // Resend said wait, so nothing went out: try again at a later run.
  if (result.status === 429) {
    await givePlaceBack(env, siteId, now)
    await unclaim()
    return 'full'
  }
  return 'failed'
}

export type NewSubscriber = { customerId?: null | number; detail?: string; email: string; name?: string; source: Exclude<Source, 'import'> }

/**
 * Adds someone who just agreed: they ticked the box, or sent a newsletter form. They wait for their confirmation email.
 * Someone who unsubscribed before and agrees again starts over. Someone already on the list stays as they are.
 */
export async function addSubscriber(env: Env, site: SiteRow, origin: string, input: NewSubscriber) {
  const email = input.email.trim().toLowerCase()
  // Nobody joins the real news list from a test.
  if (!isEmail(email) || env.test) return null
  const now = Date.now()
  const name = (input.name ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 120)
  const detail = (input.detail ?? '').slice(0, 200)
  const inserted = await env.DB.prepare(
    `INSERT INTO subscribers (site_id, email, email_hash, name, customer_id, status, source, source_detail, consented_at, origin) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
ON CONFLICT (site_id, email) DO UPDATE SET status = 'pending', source = excluded.source, source_detail = excluded.source_detail, consented_at = excluded.consented_at, confirmed_at = NULL, confirm_sent_at = NULL, unsubscribed_at = NULL, origin = excluded.origin,
name = CASE WHEN excluded.name != '' THEN excluded.name ELSE subscribers.name END, customer_id = COALESCE(excluded.customer_id, subscribers.customer_id) WHERE subscribers.status = 'unsubscribed'
RETURNING id, status`,
  )
    .bind(site.id, email, await emailHash(site.id, email), name, input.customerId ?? null, input.source, detail, iso(now), origin)
    .first<{ id: number; status: SubscriberStatus }>()
  const person = inserted ?? (await env.DB.prepare('SELECT id, status FROM subscribers WHERE site_id = ? AND email = ?').bind(site.id, email).first<{ id: number; status: SubscriberStatus }>())
  if (!person) return null
  if (person.status === 'pending') {
    const settings = JSON.parse(site.settings) as Settings
    // A flood of sign-ups can't use up the owner's emails. Whoever waits gets their email at a later scheduled run.
    if (canSendEmail(env, settings)) await later(env, (async () => (await withinLimit(env, 'news-confirm', 30, 3600)) && sendConfirmation(env, site.id, settings, { email, id: person.id, origin }, Date.now()))())
  }
  return person.status
}

/** Reads pasted lines: an address, or an address and a name separated by a comma, or Name <address>. */
export function readImport(text: string) {
  const people: { email: string; name: string }[] = []
  const bad: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const angle = /^(.*)<([^>]+)>\s*$/.exec(line)
    const [email, name] = angle ? [angle[2], angle[1]] : (() => {
      const [first, ...rest] = line.split(/[,;\t]/)
      return [first, rest.join(' ')]
    })()
    const clean = email.trim().toLowerCase()
    if (isEmail(clean)) people.push({ email: clean, name: name.replace(/["']/g, '').trim().slice(0, 120) })
    else bad.push(line.slice(0, 80))
  }
  return { bad, people }
}

/**
 * Adds people the owner says agreed to get news, such as a paper sign-up list. The owner's note on how they agreed is kept.
 * Nobody who unsubscribed or is still waiting to confirm is changed: leaving always wins.
 */
export async function importSubscribers(env: Env, siteId: number, people: { email: string; name: string }[], note: string) {
  const now = iso(Date.now())
  let added = 0
  const skipped: string[] = []
  for (const person of people.slice(0, maxImport)) {
    const row = await env.DB.prepare("INSERT INTO subscribers (site_id, email, email_hash, name, status, source, source_detail, consented_at, confirmed_at) VALUES (?, ?, ?, ?, 'subscribed', 'import', ?, ?, ?) ON CONFLICT (site_id, email) DO NOTHING RETURNING id")
      .bind(siteId, person.email, await emailHash(siteId, person.email), person.name, note.slice(0, 300), now, now)
      .first()
    if (row) added++
    else skipped.push(person.email)
  }
  return { added, skipped, tooMany: Math.max(0, people.length - maxImport) }
}

export async function subscriberCounts(env: Env, siteId: number) {
  const { results } = await env.DB.prepare('SELECT status, source, COUNT(*) AS total FROM subscribers WHERE site_id = ? GROUP BY status, source').bind(siteId).all<{ source: Source; status: SubscriberStatus; total: number }>()
  const counts = { pending: 0, subscribed: 0, unsubscribed: 0, bySource: { checkout: 0, form: 0, import: 0, signup: 0 } as Record<Source, number> }
  for (const row of results) {
    counts[row.status] += row.total
    if (row.status === 'subscribed') counts.bySource[row.source] += row.total
  }
  return counts
}

const subscriberColumns = 'id, email, name, status, source, source_detail, consented_at, confirmed_at, unsubscribed_at, created_at'

export const listSubscribers = async (env: Env, siteId: number, limit: number) =>
  (await env.DB.prepare(`SELECT ${subscriberColumns} FROM subscribers WHERE site_id = ? ORDER BY id DESC LIMIT ?`).bind(siteId, limit).all<Subscriber>()).results

/** Spreadsheets run a cell that starts with these characters as a formula, so they get a leading quote. */
const csvCell = (value: unknown) => {
  const text = value === undefined || value === null ? '' : String(value)
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

export async function subscribersCsv(env: Env, siteId: number) {
  const rows = await listSubscribers(env, siteId, 50_000)
  const names = ['email', 'name', 'status', 'source', 'source_detail', 'consented_at', 'confirmed_at', 'unsubscribed_at'] as const
  return `﻿${names.join(',')}\n${rows.map((row) => names.map((name) => csvCell(row[name])).join(',')).join('\n')}`
}

/** Removes a person completely, with every trace of their address. */
export const removeSubscriber = async (env: Env, siteId: number, id: number) => (await env.DB.prepare('DELETE FROM subscribers WHERE id = ? AND site_id = ?').bind(id, siteId).run()).meta.changes > 0

// Campaigns

const oneLine = (limit: number) => z.string().trim().min(1).max(limit).refine((value) => !/[\r\n]/.test(value), 'Use one line.')
const linkTarget = z.string().trim().max(1000).refine((value) => isSafeHref(value) && !/^[#?]/.test(value), 'Use a full https: or mailto: link, or a page of this site such as /menu.')

export const campaignFields = z.object({
    subject: oneLine(150).describe('The subject line, in the language of the site'),
    body: z.string().trim().min(1).max(20_000).describe('Plain text. A blank line starts a new paragraph. Links: [words](https://example.com) or [words](/page), or a bare https:// address.'),
    imageUrl: z.union([z.string().trim().regex(/^\/media\/\d{1,12}$/, 'Use an image uploaded to this site, such as /media/3.'), z.literal('')]).optional().describe('One optional image from the site\'s own uploads, such as /media/3'),
    imageAlt: z.string().trim().max(200).optional().describe('What the image shows, for people who cannot see it'),
    buttonLabel: z.string().trim().max(60).optional(),
    buttonHref: z.union([linkTarget, z.literal('')]).optional().describe('Where the one button goes: a page of this site such as /shop, or a full https link'),
  })

export const campaignSchema = campaignFields
  .refine((value) => !value.imageUrl || value.imageAlt, { message: 'Describe the image in imageAlt.', path: ['imageAlt'] })
  .refine((value) => Boolean(value.buttonLabel) === Boolean(value.buttonHref), { message: 'A button needs both buttonLabel and buttonHref.', path: ['buttonLabel'] })

export type CampaignInput = z.infer<typeof campaignSchema>

const campaignColumns = 'id, subject, body, image_url, image_alt, button_label, button_href, status, origin, started_at, finished_at, created_at, updated_at'

export const getCampaign = (env: Env, siteId: number, id: number) => env.DB.prepare(`SELECT ${campaignColumns} FROM campaigns WHERE id = ? AND site_id = ?`).bind(id, siteId).first<Campaign>()

export const listCampaigns = async (env: Env, siteId: number) => (await env.DB.prepare(`SELECT ${campaignColumns} FROM campaigns WHERE site_id = ? ORDER BY id DESC LIMIT 100`).bind(siteId).all<Campaign>()).results

/** Saves a new draft, or changes a draft. Campaigns that started sending can't change. Returns an error in plain words. */
export async function saveCampaign(env: Env, siteId: number, input: CampaignInput, id?: number): Promise<{ error: string } | { id: number }> {
  if (input.imageUrl) {
    const image = await env.DB.prepare('SELECT id FROM media WHERE id = ? AND site_id = ?').bind(Number(input.imageUrl.slice(7)), siteId).first()
    if (!image) return { error: `There is no uploaded image ${input.imageUrl}. Upload it on the Images page first.` }
  }
  const values = [input.subject, input.body, input.imageUrl ?? '', input.imageUrl ? (input.imageAlt ?? '') : '', input.buttonLabel ?? '', input.buttonHref ?? '']
  if (id) {
    const row = await env.DB.prepare("UPDATE campaigns SET subject = ?, body = ?, image_url = ?, image_alt = ?, button_label = ?, button_href = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND site_id = ? AND status = 'draft' RETURNING id")
      .bind(...values, id, siteId)
      .first<{ id: number }>()
    return row ? { id: row.id } : { error: 'Only drafts can change. This campaign does not exist or has already been sent.' }
  }
  const { total } = (await env.DB.prepare('SELECT COUNT(*) AS total FROM campaigns WHERE site_id = ?').bind(siteId).first<{ total: number }>()) ?? { total: 0 }
  if (total >= 500) return { error: 'This site has 500 campaigns. Delete old drafts first.' }
  const row = await env.DB.prepare('INSERT INTO campaigns (site_id, subject, body, image_url, image_alt, button_label, button_href) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id').bind(siteId, ...values).first<{ id: number }>()
  return { id: row!.id }
}

export const deleteDraft = async (env: Env, siteId: number, id: number) => (await env.DB.prepare("DELETE FROM campaigns WHERE id = ? AND site_id = ? AND status = 'draft'").bind(id, siteId).run()).meta.changes > 0

/** Starts sending. From the next scheduled run, about every 15 minutes, it goes to everyone confirmed by now, a batch at a time. */
export const startCampaign = async (env: Env, siteId: number, id: number, origin: string) =>
  Boolean(
    await env.DB.prepare("UPDATE campaigns SET status = 'sending', origin = ?, started_at = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND site_id = ? AND status = 'draft' RETURNING id")
      .bind(origin, iso(Date.now()), id, siteId)
      .first(),
  )

/** Stops a campaign. Whoever already got it keeps it; nobody else gets it. */
export const stopCampaign = async (env: Env, siteId: number, id: number) =>
  Boolean(await env.DB.prepare("UPDATE campaigns SET status = 'stopped', finished_at = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND site_id = ? AND status = 'sending' RETURNING id").bind(iso(Date.now()), id, siteId).first())

const absolute = (href: string, origin: string) => (href.startsWith('/') ? `${origin}${href}` : href)

// [words](link) or a bare https:// address. Anything else stays text.
const linkPattern = /\[([^\]\n]{1,200})\]\(([^)\s]{1,1000})\)|(https?:\/\/[^\s<>()[\]]*[^\s<>()[\].,;:!?'"])/g

/** Turns the owner's plain text into paragraphs with links. Unsafe links stay as text. */
export function readBody(body: string, origin: string): Inline[][] {
  return body
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const parts: Inline[] = []
      let at = 0
      for (const match of block.matchAll(linkPattern)) {
        const [whole, label, target, bare] = match
        const href = bare ?? target
        const safe = bare ? /^https?:\/\//.test(href) : isSafeHref(href) && !/^[#?]/.test(href)
        if (!safe) continue
        if (match.index > at) parts.push(block.slice(at, match.index))
        parts.push({ href: absolute(href, origin), label: bare ? bare : label })
        at = match.index + whole.length
      }
      if (at < block.length) parts.push(block.slice(at))
      return parts
    })
}

/** The email for one campaign. Unsubscribe links are added for each person. */
export function campaignMessage(settings: Settings, campaign: Pick<Campaign, 'body' | 'button_href' | 'button_label' | 'image_alt' | 'image_url' | 'subject'>, origin: string): Message {
  const t = words(settings.language)
  return {
    ...(campaign.button_label && campaign.button_href ? { button: { href: absolute(campaign.button_href, origin), label: campaign.button_label } } : {}),
    footer: [t.newsWhy.replace('{site}', settings.name)],
    heading: campaign.subject,
    ...(campaign.image_url ? { image: { alt: campaign.image_alt, src: `${origin}${campaign.image_url}` } } : {}),
    paragraphs: readBody(campaign.body, origin),
    replyTo: settings.email,
    subject: campaign.subject,
  }
}

/** Adds this person's own one-click unsubscribe link, and the headers mail apps use for their own unsubscribe button. */
export async function forPerson(env: Env, siteId: number, settings: Settings, message: Message, origin: string, person: { email: string; id: number }): Promise<Message> {
  const link = await newsLink(env, siteId, origin, 'unsubscribe', person)
  return { ...message, footerLink: { href: link, label: words(settings.language).newsUnsubscribe }, headers: { 'List-Unsubscribe': `<${link}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }
}

/** Sends a campaign to the owner's own address, marked as a test. It counts towards the daily limit, like every email. */
export async function sendTest(env: Env, site: SiteRow, campaign: Campaign, origin: string) {
  const settings = JSON.parse(liveSite(site).settings) as Settings
  if (!canSendEmail(env, settings)) return { problem: 'Email is not set up yet.' }
  if (!isEmail(settings.notifyEmail)) return { problem: "There is no owner address to send a test to. Set notifyEmail with update_site, or Your email for notices in Settings." }
  if (!(await withinLimit(env, 'news-test', 20, 3600))) return { problem: 'That is many tests this hour. Please wait a little.' }
  if (!(await takePlace(env, site.id, dailyLimit(settings), Date.now()))) return { problem: "Today's limit for news emails is used up. Try again tomorrow." }
  const message = campaignMessage(settings, campaign, origin)
  const result = await sendEmail(env, settings, settings.notifyEmail, { ...message, footerLink: { href: `${origin}/newsletter/unsubscribe/0/test`, label: words(settings.language).newsUnsubscribe }, subject: `[Test] ${campaign.subject}` })
  return result.ok ? { sentTo: settings.notifyEmail } : { problem: result.problem ?? 'The test did not send.' }
}

const eligible = `FROM subscribers s WHERE s.site_id = ? AND s.status = 'subscribed' AND s.confirmed_at <= ? AND NOT EXISTS (SELECT 1 FROM campaign_recipients r WHERE r.campaign_id = ? AND r.email_hash = s.email_hash)`

export type Progress = { failed: number; inFlight: number; left: number; sent: number; total: number }

/** How far a campaign got. A draft counts everyone who would get it now. */
export async function campaignProgress(env: Env, siteId: number, campaign: Campaign): Promise<Progress> {
  if (campaign.status === 'draft') {
    const row = await env.DB.prepare("SELECT COUNT(*) AS total FROM subscribers WHERE site_id = ? AND status = 'subscribed'").bind(siteId).first<{ total: number }>()
    return { failed: 0, inFlight: 0, left: row?.total ?? 0, sent: 0, total: row?.total ?? 0 }
  }
  const { results } = await env.DB.prepare('SELECT status, COUNT(*) AS total FROM campaign_recipients WHERE campaign_id = ? GROUP BY status').bind(campaign.id).all<{ status: string; total: number }>()
  const count = (status: string) => results.find((row) => row.status === status)?.total ?? 0
  const left = campaign.status === 'sending' ? ((await env.DB.prepare(`SELECT COUNT(*) AS total ${eligible}`).bind(siteId, campaign.started_at, campaign.id).first<{ total: number }>())?.total ?? 0) : 0
  const [sent, failed, inFlight] = [count('sent'), count('failed'), count('sending')]
  return { failed, inFlight, left, sent, total: sent + failed + inFlight + left }
}

/** How many days the rest needs, given what is left today. 0 means it all goes out today. */
export const daysToFinish = (left: number, leftToday: number, limit: number) => (left <= leftToday ? 0 : Math.ceil((left - leftToday) / limit))

/** A plain English sentence for Claude, such as "120 of 340 sent, the rest go out tomorrow." */
export function progressSentence(campaign: Campaign, progress: Progress, leftToday: number, limit: number) {
  if (campaign.status === 'draft') return `A draft. It would go to ${progress.total} confirmed subscribers.`
  const failed = progress.failed ? ` ${progress.failed} could not be sent.` : ''
  if (campaign.status === 'stopped') return `Stopped after ${progress.sent} of ${progress.total} were sent.${failed}`
  if (campaign.status === 'sent') return `Sent to ${progress.sent} people.${failed}`
  const days = daysToFinish(progress.left, leftToday, limit)
  const rest = !progress.left ? 'finishing now' : days === 0 ? 'the rest go out within the next hour or so' : days === 1 ? 'the rest go out tomorrow' : `the rest go out over the next ${days} days`
  return `${progress.sent} of ${progress.total} sent, ${rest}.${failed}`
}

// The scheduled run

/** Sends the next emails of one campaign. Each person is claimed first, so overlapping runs never send to anyone twice. */
async function sendBatch(env: Env, siteId: number, settings: Settings, campaign: Campaign, now: number, budget: { left: number }): Promise<'busy' | 'done' | 'full' | 'more'> {
  const { results } = await env.DB.prepare(`SELECT s.id, s.email, s.email_hash ${eligible} ORDER BY s.id LIMIT ?`).bind(siteId, campaign.started_at, campaign.id, budget.left).all<{ email: string; email_hash: string; id: number }>()
  if (!results.length) {
    await env.DB.prepare("UPDATE campaigns SET status = 'sent', finished_at = ?, updated_at = ? WHERE id = ? AND status = 'sending'").bind(iso(now), iso(now), campaign.id).run()
    return 'done'
  }
  const message = campaignMessage(settings, campaign, campaign.origin)
  const limit = dailyLimit(settings)
  for (const person of results) {
    if (budget.left <= 0) return 'more'
    if (!(await takePlace(env, siteId, limit, now))) return 'full'
    // Only while the campaign is still sending and the person still subscribed: stopping and unsubscribing work at once.
    const claimed = await env.DB.prepare(
      "INSERT INTO campaign_recipients (campaign_id, email_hash, subscriber_id, status, at) SELECT ?, email_hash, id, 'sending', ? FROM subscribers WHERE id = ? AND site_id = ? AND status = 'subscribed' AND EXISTS (SELECT 1 FROM campaigns WHERE id = ? AND status = 'sending') ON CONFLICT DO NOTHING RETURNING subscriber_id",
    )
      .bind(campaign.id, iso(now), person.id, siteId, campaign.id)
      .first()
    if (!claimed) {
      await givePlaceBack(env, siteId, now)
      continue
    }
    budget.left--
    const result = await sendEmail(env, settings, person.email, await forPerson(env, siteId, settings, message, campaign.origin, person))
    if (result.ok) {
      await env.DB.prepare("UPDATE campaign_recipients SET status = 'sent', at = ? WHERE campaign_id = ? AND email_hash = ?").bind(iso(now), campaign.id, person.email_hash).run()
    } else if (result.status === 429) {
      // Resend said wait, so this one did not go: free it for a later run.
      await env.DB.prepare('DELETE FROM campaign_recipients WHERE campaign_id = ? AND email_hash = ?').bind(campaign.id, person.email_hash).run()
      await givePlaceBack(env, siteId, now)
      return 'busy'
    } else {
      // It may or may not have gone, so it is never tried again: a missed email is better than a doubled one.
      await env.DB.prepare("UPDATE campaign_recipients SET status = 'failed', error = ?, at = ? WHERE campaign_id = ? AND email_hash = ?").bind((result.problem ?? 'Not sent.').slice(0, 300), iso(now), campaign.id, person.email_hash).run()
    }
    await pause()
  }
  return 'more'
}

/** Called by the scheduled handler about every 15 minutes: confirmation emails that are waiting, then the next batch of each campaign. */
export async function runNews(env: Env, now = Date.now()) {
  try {
    const working = await getSite(env)
    if (!working) return
    const settings = JSON.parse(liveSite(working).settings) as Settings
    if (!canSendEmail(env, settings)) return
    const budget = { left: perRun }
    // People who agreed while email was off, or when the day's limit was used up, get their confirmation now.
    const { results: waiting } = await env.DB.prepare("SELECT id, email, origin FROM subscribers WHERE site_id = ? AND status = 'pending' AND confirm_sent_at IS NULL AND origin != '' ORDER BY id LIMIT 10").bind(working.id).all<{ email: string; id: number; origin: string }>()
    for (const person of waiting) {
      if (budget.left <= 0) break
      const sent = await sendConfirmation(env, working.id, settings, person, now)
      if (sent === 'full') return
      if (sent !== 'skipped') {
        budget.left--
        await pause()
      }
    }
    const { results: active } = await env.DB.prepare(`SELECT ${campaignColumns} FROM campaigns WHERE site_id = ? AND status = 'sending' ORDER BY started_at, id LIMIT 3`).bind(working.id).all<Campaign>()
    for (const campaign of active) {
      if (budget.left <= 0) break
      const outcome = await sendBatch(env, working.id, settings, campaign, now, budget)
      if (outcome === 'full' || outcome === 'busy') break
    }
    if (Math.random() < 0.05) await env.DB.prepare('DELETE FROM news_daily WHERE day < ?').bind(dayOf(now - 60 * 86_400_000)).run()
  } catch (error) {
    console.error('News could not be sent', error)
  }
}

// The pages people reach from their emails. No login: the signed link is enough, and leaving works at once.

const newsPage = (site: SiteRow, url: URL, title: string, body: string, status = 200) =>
  html(
    renderLayout(site, { canonical: `${url.origin}/`, customer: null, description: title, main: `<section class="block tone-plain"><div class="wrap account">${body}</div></section>`, robots: 'noindex', title }),
    status,
    privateHeaders,
  )

/** /newsletter/confirm/<id>/<signature> and /newsletter/unsubscribe/<id>/<signature>. */
export async function handleNewsLink(request: Request, env: Env, url: URL, site: SiteRow, parts: string[]) {
  const settings = JSON.parse(site.settings) as Settings
  const t = words(settings.language)
  const [, purpose, id, signature] = parts
  const bad = () => newsPage(site, url, t.newsUnsubscribeTitle, `<h1>${escapeHtml(purpose === 'confirm' ? t.newsConfirmTitle : t.newsUnsubscribeTitle)}</h1><p role="alert">${escapeHtml(t.newsBadLink)}</p>`, 404)
  if ((purpose !== 'confirm' && purpose !== 'unsubscribe') || !/^\d{1,12}$/.test(id) || !/^[0-9a-f]{32}$/.test(signature ?? '')) return bad()
  const person = await env.DB.prepare('SELECT id, email, status FROM subscribers WHERE id = ? AND site_id = ?').bind(Number(id), site.id).first<{ email: string; id: number; status: SubscriberStatus }>()
  if (!person || !sameText(await sign(env, site.id, purpose, person.id, person.email), signature)) return bad()
  const fill = (text: string) => escapeHtml(text.replace('{site}', settings.name).replace('{email}', person.email))
  const now = iso(Date.now())
  if (purpose === 'unsubscribe') {
    // Mail apps send a POST with List-Unsubscribe=One-Click, and people open the link. Both work at once, with nothing more to press.
    await env.DB.prepare("UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = ? WHERE id = ? AND status != 'unsubscribed'").bind(now, person.id).run()
    return newsPage(site, url, t.newsUnsubscribeTitle, `<h1>${escapeHtml(t.newsUnsubscribeTitle)}</h1><p role="status">${fill(t.newsUnsubscribed)}</p>`)
  }
  // Someone who left is not brought back by an old confirmation email.
  if (person.status === 'unsubscribed') return bad()
  if (person.status === 'pending' && request.method === 'POST') {
    await env.DB.prepare("UPDATE subscribers SET status = 'subscribed', confirmed_at = ? WHERE id = ? AND status = 'pending'").bind(now, person.id).run()
    person.status = 'subscribed'
  }
  if (person.status === 'subscribed') return newsPage(site, url, t.newsConfirmTitle, `<h1>${escapeHtml(t.newsConfirmTitle)}</h1><p role="status">${fill(t.newsConfirmed)}</p>`)
  // A button, not the link alone, because mail filters open links by themselves, and only a person may confirm.
  return newsPage(site, url, t.newsConfirmTitle, `<h1>${escapeHtml(t.newsConfirmTitle)}</h1><p>${fill(t.newsConfirmPage)}</p><form action="/newsletter/confirm/${person.id}/${signature}" class="contact-form" method="post"><button class="button" type="submit">${escapeHtml(t.newsConfirmButton)}</button></form>`)
}
