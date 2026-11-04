import { z } from 'zod'

import { withinLimit } from './auth'
import { createRecord, getRecord, getTable, listTables, ownerActor, readInput, showRecord, writeGuards } from './data'
import type { DataRow, DataTable } from './data'
import { canSendEmail, isEmail, later, sendEmail } from './email'
import { formatMoney } from './money'
import { safeWebUrl } from './moving'
import type { OfficeWords } from './office-words'
import { orderLines, orderNumber, orderStatuses } from './shop'
import type { Block, Customer, Env, FormField, Order, Settings, SiteRow } from './types'
import { liveSite } from './versions'
import { fireEvent, isChatUrl, onEvent, sign, validWebhookUrl } from './webhooks'

// Automations are the owner's "when this happens, do that" rules. A rule is checked JSON, never code:
// one trigger, conditions that must all hold, and a short list of steps from a fixed menu.

export const maxAutomationsPerSite = 50
/** Writes made by automations start further automations at most this many rounds deep, so two rules can't feed each other for ever. */
export const maxDepth = 3
/** One visitor's request can start at most this many runs in total, however the rules fan out. */
export const maxRunsPerRequest = 25
export const maxRunsPerHour = 500
export const maxRunsPerRulePerHour = 100
export const maxEmailsPerHour = 100
const keptRuns = 20

// Only zod and this file's own values are used while it loads, apart from onEvent from webhooks.ts, which imports nothing.
const namePattern = /^[a-z][a-z0-9_]{0,39}$/
const pathPattern = /^[a-z][a-z0-9_]{0,39}(\.[a-z][a-z0-9_]{0,39})?$/
const tokenPattern = /\{\{\s*([a-z][a-z0-9_]{0,39}(?:\.[a-z][a-z0-9_]{0,39})?)\s*\}\}/g
const wholeToken = /^\{\{\s*([a-z][a-z0-9_]{0,39}(?:\.[a-z][a-z0-9_]{0,39})?)\s*\}\}$/

const fieldName = z.string().regex(namePattern)
const plain = z.union([z.string().max(2000), z.number(), z.boolean()])
const computed = z.object({ field: fieldName.describe('A number field'), add: z.number().describe('What to add, such as 1, or -1 to take one away') }).strict()
const value = z.union([plain, computed]).describe('A fixed value; text with {{field}} placeholders and {{today}} or {{now}}; or {"field": "seats", "add": -1} for a number field plus or minus a constant')
const values = z.record(fieldName, value).refine((all) => Object.keys(all).length >= 1 && Object.keys(all).length <= 40, 'Give between 1 and 40 fields.')
const condition = z
  .object({
    field: z.string().regex(pathPattern).describe('A field of what started the automation, or reference.field for a field of the record a reference field points to'),
    is: z.enum(['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'empty', 'not_empty']),
    value: plain.optional().describe('What to compare with. Not needed for empty and not_empty. Text can use {{today}} or {{field}}.'),
  })
  .strict()
const conditions = z.array(condition).max(10)
const when = conditions.optional().describe('Only do this step when all of these hold, checked when the step is reached')

export const triggerSchema = z.discriminatedUnion('on', [
  z.object({ on: z.literal('record_added'), table: fieldName }).strict(),
  z.object({ on: z.literal('record_changed'), table: fieldName, field: fieldName.optional().describe('Only when this field changes'), to: plain.optional().describe('Only when the field changes to this value') }).strict(),
  z.object({ on: z.literal('form_sent'), form: z.string().regex(/^[a-z0-9-]{1,40}$/).describe("The form block's name") }).strict(),
  z.object({ on: z.literal('order_placed') }).strict(),
  z.object({ on: z.literal('order_status'), status: z.string().describe('pending, paid, shipped, done or cancelled') }).strict(),
  z.object({ on: z.literal('customer_signed_up') }).strict(),
])

export const actionSchema = z.discriminatedUnion('do', [
  z.object({ do: z.literal('set_fields'), values, when }).strict().describe('Changes fields of the record that started it'),
  z.object({ do: z.literal('add_record'), table: fieldName, values, when }).strict().describe('Adds a record to a table, filling its fields from templates'),
  z.object({ do: z.literal('change_linked'), through: fieldName.describe('A reference field of the record that started it'), values, when }).strict().describe('Changes the record a reference field points to, such as taking one seat away from a class'),
  z
    .object({
      do: z.literal('email'),
      to: z.enum(['owner', 'customer', 'field']).describe("owner: the owner's notifyEmail. customer: the logged-in customer, or the order's email. field: the email field named in field"),
      field: z.string().regex(pathPattern).optional(),
      subject: z.string().trim().min(1).max(200),
      message: z.string().trim().min(1).max(5000).describe('Plain text. Separate paragraphs with a blank line. {{field}} puts in a value, always as plain text.'),
      when,
    })
    .strict()
    .describe("Sends an email through the owner's own Resend account"),
  z.object({ do: z.literal('webhook'), url: z.string().url().max(500), when }).strict().describe('Sends the details, signed, to a public https address'),
  z.object({ do: z.literal('stop'), when }).strict().describe('Does no further steps. Useful with when.'),
])

export const automationSchema = z.object({
  name: z.string().trim().min(1).max(80).describe('A short name the owner recognises, in their language'),
  enabled: z.boolean().optional().describe('False saves it switched off. On by default.'),
  trigger: triggerSchema,
  conditions: conditions.optional().describe('All of these must hold for it to run'),
  actions: z.array(actionSchema).min(1).max(10).describe('Done in order'),
})

export type Automation = z.infer<typeof automationSchema>
type Trigger = Automation['trigger']
type Action = Automation['actions'][number]
type Condition = z.infer<typeof condition>
type Value = z.infer<typeof value>
type Facts = Record<string, unknown>
export type Stored = { enabled: number; id: number; last_run_at: null | string; name: string; rule: Automation; runs: number; secret: string }
export type NoteKey = keyof OfficeWords['automations']['note']
/** A line of the run log, kept as a key and its values, so the back office can show it in the owner's language. */
export type Note = [NoteKey, ...string[]]
export type Run = { at: string; error: Note | null; notes: Note[]; outcome: string }

class Problem extends Error {
  note: Note
  constructor(...note: Note) {
    super(note.join(' '))
    this.note = note
  }
}

const noteOf = (error: unknown): Note => (error instanceof Problem ? error.note : ['crashed'])

const builtIns = ['now', 'today', 'number', 'customer_name', 'customer_email'] as const

// Reading values

const own = (facts: Facts, key: string) => (Object.hasOwn(facts, key) ? facts[key] : undefined)
const isBlank = (item: unknown) => item === undefined || item === null || (typeof item === 'string' && !item.trim())
export const asText = (item: unknown) => (item === undefined || item === null ? '' : typeof item === 'boolean' ? (item ? 'yes' : 'no') : typeof item === 'object' ? JSON.stringify(item) : String(item))
const asNumber = (item: unknown) => (typeof item === 'number' && Number.isFinite(item) ? item : typeof item === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(item) ? Number(item) : null)
const asBool = (item: unknown) => (item === true || item === 1 || (typeof item === 'string' && ['true', 'yes', 'on', '1'].includes(item.trim().toLowerCase())))

function same(a: unknown, b: unknown) {
  const [x, y] = [asNumber(a), asNumber(b)]
  if (x !== null && y !== null) return x === y
  if (typeof a === 'boolean' || typeof b === 'boolean') return asBool(a) === asBool(b)
  return asText(a).trim().toLowerCase() === asText(b).trim().toLowerCase()
}

/** Numbers compare as numbers, and dates and times in their usual written form compare in time order. Anything else never compares. */
function compare(a: unknown, b: unknown) {
  const [x, y] = [asNumber(a), asNumber(b)]
  if (x !== null && y !== null) return x - y
  const [p, q] = [asText(a).trim(), asText(b).trim()]
  const dated = (text: string) => /^\d{4}-\d{2}-\d{2}/.test(text)
  const timed = (text: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(text)
  if ((dated(p) && dated(q)) || (timed(p) && timed(q))) return p < q ? -1 : p > q ? 1 : 0
  return null
}

/**
 * Puts values into a template. A template that is only one {{field}} keeps the value's type, so numbers stay numbers.
 * It is one pass: a value someone typed, even one containing {{ }}, goes in as plain text and is never read as a template.
 */
export function fill(template: string, facts: Facts): unknown {
  const whole = wholeToken.exec(template)
  if (whole) return own(facts, whole[1]) ?? ''
  return template.replace(tokenPattern, (_match, key: string) => asText(own(facts, key)))
}

export function holds(test: Condition, facts: Facts) {
  const actual = own(facts, test.field)
  const expected = typeof test.value === 'string' ? fill(test.value, facts) : test.value
  switch (test.is) {
    case 'empty':
      return isBlank(actual)
    case 'not_empty':
      return !isBlank(actual)
    case 'equals':
      return same(actual, expected)
    case 'not_equals':
      return !same(actual, expected)
    case 'contains':
      return asText(expected) !== '' && asText(actual).toLowerCase().includes(asText(expected).toLowerCase())
    case 'greater_than':
      return (compare(actual, expected) ?? 0) > 0
    case 'less_than':
      return (compare(actual, expected) ?? 0) < 0
  }
}

const allHold = (tests: Condition[] | undefined, facts: Facts) => (tests ?? []).every((test) => holds(test, facts))

const isComputed = (item: Value): item is { add: number; field: string } => typeof item === 'object' && item !== null

/** Every {{name}} and field a rule reads, so linked records are loaded only when a rule needs them. */
function rulePaths(rule: Automation) {
  const paths = new Set<string>()
  const scan = (text: unknown) => {
    if (typeof text === 'string') for (const match of text.matchAll(tokenPattern)) paths.add(match[1])
  }
  const scanTests = (tests?: Condition[]) => tests?.forEach((test) => (paths.add(test.field), scan(test.value)))
  scanTests(rule.conditions)
  for (const action of rule.actions) {
    scanTests(action.when)
    // A number worked out by adding reads the record being changed, except when adding a record, where it reads what started it.
    if ('values' in action) for (const item of Object.values(action.values)) (isComputed(item) ? action.do === 'add_record' && paths.add(item.field) : scan(item))
    if (action.do === 'email') {
      scan(action.subject)
      scan(action.message)
      if (action.field) paths.add(action.field)
    }
  }
  return [...paths]
}

// What happened

type Happened = {
  customer: Customer | null
  facts: Facts
  record?: { id: number; table: string }
}

const watched = new Set(['record.created', 'record.updated', 'order.created', 'order.updated', 'customer.created', 'entry.created'])

function matches(trigger: Trigger, event: string, data: unknown, before?: Record<string, unknown>) {
  const item = (data ?? {}) as Record<string, any>
  switch (trigger.on) {
    case 'record_added':
      return event === 'record.created' && item.table === trigger.table
    case 'record_changed': {
      if (event !== 'record.updated' || item.table !== trigger.table) return false
      if (!trigger.field) return true
      const now = item.record?.[trigger.field]
      if (before && same(before[trigger.field], now)) return false
      return trigger.to === undefined || same(now, trigger.to)
    }
    case 'form_sent':
      return event === 'entry.created' && item.form === trigger.form
    case 'order_placed':
      return event === 'order.created'
    case 'order_status':
      return event === 'order.updated' && item.status === trigger.status
    case 'customer_signed_up':
      return event === 'customer.created'
  }
}

const findCustomer = (env: Env, siteId: number, id: null | number | undefined) =>
  id ? env.DB.prepare('SELECT id, email, name, role FROM customers WHERE id = ? AND site_id = ?').bind(id, siteId).first<Customer>() : Promise.resolve(null)

async function orderFacts(env: Env, siteId: number, id: number) {
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ? AND site_id = ?').bind(id, siteId).first<Order>()
  if (!order) return null
  const lines = (await orderLines(env, [order.id])).get(order.id) ?? []
  const money = (amount: number) => formatMoney(amount, order.money_prefix, order.money_suffix)
  return {
    order,
    facts: {
      id: order.id,
      number: orderNumber(order.id),
      name: order.name,
      email: order.email,
      phone: order.phone,
      address: order.address,
      note: order.note,
      payment: order.payment,
      status: order.status,
      // Amounts are kept in cents. Rules read them as people write them, such as 390 or 12.5.
      total: order.total / 100,
      subtotal: order.subtotal / 100,
      shipping: order.shipping / 100,
      total_text: money(order.total),
      items: lines.map((line) => `${line.title}${line.variant ? ` · ${line.variant}` : ''} × ${line.quantity}`).join('\n'),
      created_at: order.created_at,
    } as Facts,
  }
}

/** Turns an event into the values rules read, with a few values every rule can use. */
async function whatHappened(env: Env, siteId: number, event: string, data: unknown): Promise<Happened | null> {
  const item = (data ?? {}) as Record<string, any>
  let facts: Facts
  let customerId: null | number = null
  let orderEmail = ''
  let record: Happened['record']
  if (event === 'record.created' || event === 'record.updated') {
    const { customer_id: customer, ...shown } = (item.record ?? {}) as Record<string, unknown>
    customerId = typeof customer === 'number' ? customer : null
    facts = shown
    record = { id: Number(shown.id), table: String(item.table) }
  } else if (event === 'entry.created') {
    facts = { ...(item.data as Facts), id: item.id, created_at: item.created_at }
    customerId = item.customer_id ?? null
  } else if (event === 'order.created' || event === 'order.updated') {
    const found = await orderFacts(env, siteId, Number(item.id))
    if (!found) return null
    facts = found.facts
    customerId = found.order.customer_id
    orderEmail = found.order.email
  } else if (event === 'customer.created') {
    facts = { id: item.id, name: item.name, email: item.email }
    customerId = item.id
  } else return null
  const customer = await findCustomer(env, siteId, customerId)
  const now = new Date().toISOString()
  return {
    customer,
    facts: { now, today: now.slice(0, 10), number: String(facts.id ?? '').padStart(4, '0'), customer_name: customer?.name ?? '', customer_email: orderEmail || customer?.email || '', ...facts },
    record,
  }
}

/** Adds reference.field values for the references a rule reads, such as class.title for a booking's class. */
async function addLinked(env: Env, siteId: number, happened: Happened, facts: Facts, paths: string[]) {
  if (!happened.record) return
  const prefixes = new Set(paths.filter((path) => path.includes('.')).map((path) => path.split('.')[0]))
  if (!prefixes.size) return
  const table = await getTable(env, siteId, happened.record.table)
  for (const prefix of prefixes) {
    const field = table?.fields.find((item) => item.name === prefix && item.type === 'reference')
    const target = field ? await getTable(env, siteId, field.table!) : null
    const id = Number(own(facts, prefix))
    const row = target && Number.isInteger(id) && id > 0 ? await getRecord(env, target, id) : null
    if (!row) continue
    const data = JSON.parse(row.data) as Facts
    facts[`${prefix}.id`] = row.id
    for (const [key, item] of Object.entries(data)) facts[`${prefix}.${key}`] = item
  }
}

// Steps

type Context = { dry: boolean; env: Env; happened: Happened; item: Pick<Stored, 'id' | 'name' | 'rule' | 'secret'>; siteId: number }
type Step = { later?: () => Promise<Note>; note?: Note; preview?: Record<string, unknown> }

const liveSettings = async (env: Env, siteId: number) => {
  const site = await env.DB.prepare('SELECT sites.id, sites.slug, sites.settings, sites.live_version, versions.settings AS live_settings FROM sites LEFT JOIN versions ON versions.id = sites.live_version WHERE sites.id = ?').bind(siteId).first<SiteRow>()
  return site ? (JSON.parse(liveSite(site).settings) as Settings) : null
}

const fieldLabels = (table: DataTable, names: string[]) => names.map((name) => table.fields.find((field) => field.name === name)?.label ?? name).join(', ')

/**
 * Changes some fields of one record in a single database step. Additions such as "seats minus 1" are worked out by the
 * database itself, so two bookings at the same moment both count. The table's limits are checked in the same step.
 */
async function patch(context: Context, table: DataTable, id: number, changes: Record<string, Value>, facts: Facts, fallback?: Facts) {
  const { env, siteId } = context
  const row = await getRecord(env, table, id)
  if (!row && !(context.dry && fallback)) throw new Problem('missingRecord', table.label, String(id))
  // A dry run of the record that started it uses the sample values given for it.
  const sampled = context.dry && fallback ? Object.fromEntries(table.fields.filter((field) => Object.hasOwn(fallback, field.name)).map((field) => [field.name, fallback[field.name]])) : {}
  const before: Facts = { ...(row ? (JSON.parse(row.data) as Facts) : {}), ...sampled }
  const given: Record<string, unknown> = {}
  const adds: [string, string, number][] = []
  for (const [name, item] of Object.entries(changes)) {
    if (!table.fields.some((field) => field.name === name)) continue
    if (isComputed(item)) {
      if (namePattern.test(item.field)) adds.push([name, item.field, item.add])
    } else given[name] = typeof item === 'string' ? fill(item, facts) : item
  }
  const read = await readInput(env, siteId, table, given, ownerActor, before)
  if (!read.data) throw new Problem('raw', read.error ?? 'That is not valid.')
  const predicted: Facts = { ...read.data }
  for (const [name, from, add] of adds) predicted[name] = (asNumber(before[from]) ?? 0) + add
  const shown = Object.fromEntries([...Object.keys(given), ...adds.map(([name]) => name)].map((name) => [name, predicted[name] ?? null]))
  if (context.dry || !row) return { data: predicted, shown }
  const sets = Object.keys(given).filter((name) => read.data[name] !== undefined)
  const removes = Object.keys(given).filter((name) => read.data[name] === undefined)
  const pairs = [...sets.map((name) => `'$.${name}', json(?)`), ...adds.map(([name, from]) => `'$.${name}', COALESCE(json_extract(data, '$.${from}'), 0) + ?`)]
  let expression = pairs.length ? `json_set(data, ${pairs.join(', ')})` : 'data'
  if (removes.length) expression = `json_remove(${expression}, ${removes.map((name) => `'$.${name}'`).join(', ')})`
  const guards = writeGuards(table, predicted, row.customer_id, row)
  // Field names were checked against the table's own names, which allow only letters, digits and _.
  const updated = await env.DB.prepare(`UPDATE data_records SET data = ${expression}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND table_id = ?${guards.map((guard) => ` AND ${guard.sql}`).join('')} RETURNING id, customer_id, data, created_at, updated_at`)
    .bind(...sets.map((name) => JSON.stringify(read.data[name])), ...adds.map(([, , add]) => add), row.id, table.id, ...guards.flatMap((guard) => guard.values))
    .first<DataRow>()
  if (!updated) throw new Problem('limitHit', table.label, String(id))
  await fireEvent(env, siteId, 'record.updated', { table: table.name, record: showRecord(table, updated, ownerActor) }, before)
  return { data: JSON.parse(updated.data) as Facts, shown }
}

async function triggerTable(context: Context) {
  if (!context.happened.record) throw new Problem('needsRecord')
  const table = await getTable(context.env, context.siteId, context.happened.record.table)
  if (!table) throw new Problem('missingTable', context.happened.record.table)
  return table
}

async function doStep(context: Context, action: Action, facts: Facts): Promise<Step> {
  const { env, happened, item, siteId } = context
  switch (action.do) {
    case 'stop':
      return { note: ['stopped'] }

    case 'set_fields': {
      const table = await triggerTable(context)
      const id = happened.record!.id
      const result = await patch(context, table, id, action.values, facts, facts)
      for (const name of Object.keys(result.shown)) facts[name] = result.data[name]
      return { note: ['set', table.label, String(id), fieldLabels(table, Object.keys(result.shown))], preview: { table: table.name, id, changes: result.shown } }
    }

    case 'change_linked': {
      const table = await triggerTable(context)
      const through = table.fields.find((field) => field.name === action.through && field.type === 'reference')
      if (!through) throw new Problem('missingField', action.through)
      const target = await getTable(env, siteId, through.table!)
      if (!target) throw new Problem('missingTable', through.table!)
      const id = asNumber(own(facts, action.through))
      if (!id || !Number.isInteger(id) || id < 1) return { note: ['nothingLinked', through.label], preview: { nothingLinked: action.through } }
      const result = await patch(context, target, id, action.values, facts)
      for (const name of Object.keys(result.shown)) facts[`${action.through}.${name}`] = result.data[name]
      return { note: ['linked', target.label, String(id), fieldLabels(target, Object.keys(result.shown))], preview: { table: target.name, id, changes: result.shown } }
    }

    case 'add_record': {
      const table = await getTable(env, siteId, action.table)
      if (!table) throw new Problem('missingTable', action.table)
      const input: Record<string, unknown> = {}
      for (const [name, item] of Object.entries(action.values)) input[name] = isComputed(item) ? (asNumber(own(facts, item.field)) ?? 0) + item.add : typeof item === 'string' ? fill(item, facts) : item
      if (context.dry) {
        const read = await readInput(env, siteId, table, input, ownerActor)
        if (!read.data) throw new Problem('raw', read.error ?? 'That is not valid.')
        return { note: ['added', table.label, '?'], preview: { table: table.name, values: read.data } }
      }
      // The new record belongs to the same customer, so they can see it where a table shows customers their own records.
      const saved = await createRecord(env, siteId, table, input, { admin: true, customer: happened.customer, quiet: true })
      if (!saved.row) throw new Problem('raw', saved.error ?? 'That could not be saved.')
      return { note: ['added', table.label, String(saved.row.id)] }
    }

    case 'email': {
      const subject = asText(fill(action.subject, facts)).replace(/\s+/g, ' ').trim().slice(0, 200)
      const message = asText(fill(action.message, facts)).slice(0, 10_000)
      const address = action.to === 'customer' ? own(facts, 'customer_email') : action.to === 'field' ? own(facts, action.field ?? '') : null
      const replyTo = [own(facts, 'email'), own(facts, 'customer_email')].find(isEmail)
      if (context.dry) {
        const settings = await liveSettings(env, siteId)
        return { preview: { to: action.to === 'owner' ? (settings?.notifyEmail ?? null) : (address ?? null), subject, text: message, emailIsSetUp: Boolean(settings && canSendEmail(env, settings)) } }
      }
      return {
        later: async () => {
          const settings = await liveSettings(env, siteId)
          if (!settings || !canSendEmail(env, settings)) throw new Problem('emailOff')
          const to = action.to === 'owner' ? settings.notifyEmail : address
          if (!isEmail(to)) throw new Problem('noAddress')
          if (!(await withinLimit(env, `automation-email:${siteId}`, maxEmailsPerHour, 3600))) throw new Problem('emailBusy', String(maxEmailsPerHour))
          const sent = await sendEmail(env, settings, to, { heading: subject, lines: message.split(/\n\s*\n/), replyTo: action.to === 'owner' ? replyTo : settings.email, subject })
          if (!sent.ok) throw new Problem('emailFailed', sent.problem ?? '')
          return ['emailed', to]
        },
      }
    }

    case 'webhook': {
      const body = JSON.stringify({ at: new Date().toISOString(), automation: { id: item.id, name: item.name }, event: item.rule.trigger.on, data: facts })
      if (context.dry) return { preview: { url: action.url, body: JSON.parse(body) as unknown } }
      return {
        later: async () => {
          const target = safeWebUrl(env, action.url)
          if (!target || !validWebhookUrl(env, action.url) || isChatUrl(action.url)) throw new Problem('badAddress')
          const time = Math.floor(Date.now() / 1000)
          let status = 0
          try {
            const response = await fetch(target, {
              body,
              headers: { 'Content-Type': 'application/json', 'X-Web-End-Event': 'automation', 'X-Web-End-Signature': `t=${time},v1=${await sign(item.secret, `${time}.${body}`)}` },
              method: 'POST',
              // A redirect could lead to a private address, so it counts as a failure.
              redirect: 'manual',
              signal: AbortSignal.timeout(5000),
            })
            status = response.status
          } catch {
            throw new Problem('unreachable', target.host)
          }
          if (status < 200 || status > 299) throw new Problem('webhookFailed', target.host, String(status))
          return ['called', target.host, String(status)]
        },
      }
    }
  }
}

type Outcome = { error: Note | null; later: (() => Promise<Note>)[]; notes: Note[]; previews: Record<string, unknown>[] }

/** Does a rule's steps in order. Data changes happen now; emails and webhooks are handed back to go after the visitor has their answer. */
async function runSteps(context: Context, facts: Facts): Promise<Outcome> {
  const outcome: Outcome = { error: null, later: [], notes: [], previews: [] }
  for (const [index, action] of context.item.rule.actions.entries()) {
    const step = String(index + 1)
    if (action.when?.length && !allHold(action.when, facts)) {
      outcome.notes.push(['skippedStep', step])
      outcome.previews.push({ step: index + 1, do: action.do, result: 'skipped, because its conditions do not hold' })
      continue
    }
    try {
      const done = await doStep(context, action, facts)
      if (done.later) outcome.later.push(done.later)
      if (done.note) outcome.notes.push(done.note)
      outcome.previews.push({ step: index + 1, do: action.do, result: action.do === 'stop' ? 'stops here' : 'would run', ...done.preview })
      if (action.do === 'stop') break
    } catch (error) {
      if (!(error instanceof Problem)) console.error('An automation step failed', error)
      outcome.error = noteOf(error)
      outcome.previews.push({ step: index + 1, do: action.do, result: 'would fail', problem: outcome.error })
      break
    }
  }
  return outcome
}

async function logRun(env: Env, id: number, outcome: string, notes: Note[], error: Note | null) {
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO automation_runs (automation_id, outcome, notes, error) VALUES (?, ?, ?, ?)').bind(id, outcome, JSON.stringify(notes), error ? JSON.stringify(error) : null),
      env.DB.prepare('DELETE FROM automation_runs WHERE automation_id = ? AND id NOT IN (SELECT id FROM automation_runs WHERE automation_id = ? ORDER BY id DESC LIMIT ?)').bind(id, id, keptRuns),
      env.DB.prepare("UPDATE automations SET runs = runs + 1, last_run_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(id),
    ])
  } catch (problem) {
    // The automation may have been deleted while it ran.
    console.error('A run could not be logged', problem)
  }
}

async function runOne(env: Env, siteId: number, item: Stored, happened: Happened, depth: number, budget: { left: number }) {
  const facts = { ...happened.facts }
  await addLinked(env, siteId, happened, facts, rulePaths(item.rule))
  if (!allHold(item.rule.conditions, facts)) return
  if (depth >= maxDepth) return logRun(env, item.id, 'stopped', [], ['tooDeep', String(maxDepth)])
  if (budget.left <= 0) return logRun(env, item.id, 'stopped', [], ['tooMany', String(maxRunsPerRequest)])
  budget.left--
  if (!(await withinLimit(env, `automations:${siteId}`, maxRunsPerHour, 3600))) return logRun(env, item.id, 'skipped', [], ['busySite', String(maxRunsPerHour)])
  if (!(await withinLimit(env, `automation:${item.id}`, maxRunsPerRulePerHour, 3600))) return logRun(env, item.id, 'skipped', [], ['busyRule', String(maxRunsPerRulePerHour)])
  const outcome = await runSteps({ dry: false, env, happened, item, siteId }, facts)
  const finish = async () => {
    for (const task of outcome.later) {
      try {
        outcome.notes.push(await task())
      } catch (error) {
        if (!(error instanceof Problem)) console.error('An automation step failed', error)
        outcome.error ??= noteOf(error)
      }
    }
    await logRun(env, item.id, outcome.error ? 'failed' : 'done', outcome.notes, outcome.error)
  }
  if (outcome.later.length) await later(env, finish())
  else await finish()
}

const parse = (row: Omit<Stored, 'rule'> & { rule: string }): Stored => ({ ...row, rule: JSON.parse(row.rule) as Automation })

/**
 * Starts the owner's automations for something that just happened. Called after the write succeeded, from fireEvent and
 * from form entries. It never throws, so a broken rule can't break what the visitor was doing.
 */
export async function runAutomations(env: Env, siteId: number, event: string, data: unknown, before?: Record<string, unknown>) {
  if (!watched.has(event)) return
  try {
    const { results } = await env.DB.prepare('SELECT id, name, rule, enabled, secret, runs, last_run_at FROM automations WHERE site_id = ? AND enabled = 1 ORDER BY id').bind(siteId).all<Omit<Stored, 'rule'> & { rule: string }>()
    const due = results.map(parse).filter((item) => matches(item.rule.trigger, event, data, before))
    if (!due.length) return
    const happened = await whatHappened(env, siteId, event, data)
    if (!happened) return
    const depth = env.automationDepth ?? 0
    const budget = env.automationBudget ?? { left: maxRunsPerRequest }
    // Writes made by these runs carry the next depth, so the rules they start know how deep they are.
    const deeper: Env = { ...env, automationBudget: budget, automationDepth: depth + 1 }
    for (const item of due) {
      try {
        await runOne(deeper, siteId, item, happened, depth, budget)
      } catch (error) {
        console.error('An automation failed', error)
        await logRun(env, item.id, 'failed', [], ['crashed'])
      }
    }
  } catch (error) {
    console.error('Automations could not run', error)
  }
}

// Every event other systems hear about also reaches automations. index.ts imports this file, so this runs at startup.
onEvent(runAutomations)

// Reading and saving rules

export async function listAutomations(env: Env, siteId: number) {
  const { results } = await env.DB.prepare('SELECT id, name, rule, enabled, secret, runs, last_run_at FROM automations WHERE site_id = ? ORDER BY id').bind(siteId).all<Omit<Stored, 'rule'> & { rule: string }>()
  return results.map(parse)
}

export async function getAutomation(env: Env, siteId: number, id: number) {
  const row = await env.DB.prepare('SELECT id, name, rule, enabled, secret, runs, last_run_at FROM automations WHERE site_id = ? AND id = ?').bind(siteId, id).first<Omit<Stored, 'rule'> & { rule: string }>()
  return row ? parse(row) : null
}

export async function recentRuns(env: Env, id: number, limit = keptRuns): Promise<Run[]> {
  const { results } = await env.DB.prepare('SELECT outcome, notes, error, at FROM automation_runs WHERE automation_id = ? ORDER BY id DESC LIMIT ?').bind(id, limit).all<{ at: string; error: null | string; notes: string; outcome: string }>()
  return results.map((row) => ({ at: row.at, error: row.error ? (JSON.parse(row.error) as Note) : null, notes: JSON.parse(row.notes) as Note[], outcome: row.outcome }))
}

// Checking rules against the site

type Known = { label: string; type: string }
type Shape = { fields: Map<string, Known>; linked: Map<string, DataTable>; table?: DataTable }

const formFieldType: Record<string, string> = { checkbox: 'boolean', textarea: 'text' }

/** The forms on the site's pages, working copy and published copy, by name. */
export async function siteForms(env: Env, site: Pick<SiteRow, 'id' | 'live_version'>) {
  const { results } = await env.DB.prepare('SELECT blocks FROM pages WHERE site_id = ? UNION ALL SELECT blocks FROM version_pages WHERE version_id = ?').bind(site.id, site.live_version ?? -1).all<{ blocks: string }>()
  const forms = new Map<string, { fields: Map<string, FormField>; heading: string }>()
  for (const page of results) {
    for (const block of JSON.parse(page.blocks) as Block[]) {
      if (block.type !== 'form') continue
      const form = forms.get(block.name) ?? { fields: new Map<string, FormField>(), heading: block.heading || block.name }
      for (const field of block.fields as FormField[]) form.fields.set(field.name, field)
      forms.set(block.name, form)
    }
  }
  return forms
}

const orderShape: [string, string][] = [['id', 'number'], ['number', 'text'], ['name', 'text'], ['email', 'email'], ['phone', 'phone'], ['address', 'text'], ['note', 'text'], ['payment', 'text'], ['status', 'text'], ['total', 'number'], ['subtotal', 'number'], ['shipping', 'number'], ['total_text', 'text'], ['items', 'text'], ['created_at', 'date']]

/** What a trigger gives rules to read. Returns a problem instead when the trigger points at something that doesn't exist. */
async function shapeOf(env: Env, site: Pick<SiteRow, 'id' | 'live_version'>, trigger: Trigger, tables: Map<string, DataTable>): Promise<Shape | string> {
  const fields = new Map<string, Known>([['now', { label: 'now', type: 'date' }], ['today', { label: 'today', type: 'date' }], ['number', { label: 'number', type: 'text' }], ['customer_name', { label: 'customer_name', type: 'text' }], ['customer_email', { label: 'customer_email', type: 'email' }]])
  const linked = new Map<string, DataTable>()
  if (trigger.on === 'record_added' || trigger.on === 'record_changed') {
    const table = tables.get(trigger.table)
    if (!table) return `There is no table called "${trigger.table}". Create it with save_table first.`
    fields.set('id', { label: 'id', type: 'number' })
    fields.set('created_at', { label: 'created_at', type: 'date' })
    fields.set('updated_at', { label: 'updated_at', type: 'date' })
    for (const field of table.fields) {
      fields.set(field.name, { label: field.label, type: field.type })
      const target = field.type === 'reference' ? tables.get(field.table!) : undefined
      if (target) linked.set(field.name, target)
    }
    return { fields, linked, table }
  }
  if (trigger.on === 'form_sent') {
    const form = (await siteForms(env, site)).get(trigger.form)
    if (!form) return `There is no form called "${trigger.form}" on any page. Add the form block first, or check its name.`
    fields.set('id', { label: 'id', type: 'number' })
    fields.set('created_at', { label: 'created_at', type: 'date' })
    for (const field of form.fields.values()) fields.set(field.name, { label: field.label, type: formFieldType[field.type] ?? field.type })
    return { fields, linked }
  }
  if (trigger.on === 'order_placed' || trigger.on === 'order_status') {
    if (trigger.on === 'order_status' && !orderStatuses.includes(trigger.status)) return `"${trigger.status}" is not an order status. Use one of: ${orderStatuses.join(', ')}.`
    for (const [name, type] of orderShape) fields.set(name, { label: name, type })
    return { fields, linked }
  }
  for (const [name, type] of [['id', 'number'], ['name', 'text'], ['email', 'email']]) fields.set(name, { label: name, type })
  return { fields, linked }
}

const knows = (shape: Shape, path: string) => {
  if (shape.fields.has(path)) return true
  const [prefix, rest] = path.split('.')
  const target = rest ? shape.linked.get(prefix) : undefined
  return Boolean(target && (rest === 'id' || target.fields.some((field) => field.name === rest)))
}

function checkValues(problems: string[], where: string, table: DataTable, given: Record<string, Value>, readable: (path: string) => boolean, ownFields: boolean) {
  for (const [name, item] of Object.entries(given)) {
    const field = table.fields.find((one) => one.name === name)
    if (!field) {
      problems.push(`${where}: the table "${table.name}" has no field "${name}". Its fields are: ${table.fields.map((one) => one.name).join(', ')}.`)
      continue
    }
    if (isComputed(item)) {
      if (field.type !== 'number') problems.push(`${where}: "${name}" is not a number field, so it can't be worked out by adding.`)
      const from = ownFields ? table.fields.find((one) => one.name === item.field) : null
      if (ownFields ? from?.type !== 'number' : !readable(item.field)) problems.push(`${where}: "${item.field}" is not a number field it can add to.`)
      continue
    }
    if (typeof item === 'string' && !item.includes('{{') && field.type === 'select' && item !== '' && !field.options?.includes(item)) problems.push(`${where}: "${item}" is not one of the choices of "${name}": ${field.options?.join(', ')}.`)
    if (typeof item === 'string' && !item.includes('{{') && field.type === 'number' && item !== '' && asNumber(item) === null) problems.push(`${where}: "${name}" is a number field, so "${item}" won't fit.`)
  }
}

/** Checks a rule against the site's tables, forms and statuses, and lists every problem in plain words. */
export async function automationProblems(env: Env, site: Pick<SiteRow, 'id' | 'live_version'>, rule: Automation, known?: Map<string, DataTable>) {
  const tables = known ?? new Map((await listTables(env, site.id)).map((table) => [table.name, table]))
  const problems: string[] = []
  const shape = await shapeOf(env, site, rule.trigger, tables)
  if (typeof shape === 'string') return [shape]
  const readable = (path: string) => knows(shape, path)
  const unknown = (path: string) => `"${path}" is not something this automation can read. It can read: ${[...shape.fields.keys()].join(', ')}${shape.linked.size ? `, and fields of linked records such as ${[...shape.linked.keys()][0]}.${shape.linked.values().next().value!.fields[0]?.name ?? 'id'}` : ''}.`
  for (const path of rulePaths(rule)) if (!readable(path)) problems.push(unknown(path))
  const checkTests = (where: string, tests?: Condition[]) => {
    for (const test of tests ?? []) if (!['empty', 'not_empty'].includes(test.is) && test.value === undefined) problems.push(`${where}: the condition on "${test.field}" needs a value to compare with.`)
  }
  checkTests('Conditions', rule.conditions)
  if (rule.trigger.on === 'record_changed' && rule.trigger.field) {
    const field = shape.table?.fields.find((one) => one.name === (rule.trigger as { field: string }).field)
    if (!field) problems.push(`The trigger watches "${rule.trigger.field}", which the table "${rule.trigger.table}" doesn't have.`)
    else if (field.type === 'select' && typeof rule.trigger.to === 'string' && !field.options?.includes(rule.trigger.to)) problems.push(`The trigger waits for "${rule.trigger.to}", which is not one of the choices of "${field.name}": ${field.options?.join(', ')}.`)
  }
  for (const [index, action] of rule.actions.entries()) {
    const where = `Step ${index + 1} (${action.do})`
    checkTests(where, action.when)
    if (action.do === 'stop' && !action.when?.length && index < rule.actions.length - 1) problems.push(`${where}: it always stops, so the steps after it never run. Give it a when, or remove the later steps.`)
    if ((action.do === 'set_fields' || action.do === 'change_linked') && !shape.table) problems.push(`${where}: this step changes the record that started the automation, so it only works when a record is added or changed.`)
    if (action.do === 'set_fields' && shape.table) checkValues(problems, where, shape.table, action.values, readable, true)
    if (action.do === 'change_linked' && shape.table) {
      const through = shape.table.fields.find((field) => field.name === action.through)
      const target = shape.linked.get(action.through)
      if (!through || through.type !== 'reference') problems.push(`${where}: "${action.through}" is not a reference field of the table "${shape.table.name}".`)
      else if (!target) problems.push(`${where}: "${action.through}" points to the table "${through.table}", which doesn't exist.`)
      else checkValues(problems, where, target, action.values, readable, true)
    }
    if (action.do === 'add_record') {
      const table = tables.get(action.table)
      if (!table) problems.push(`${where}: there is no table called "${action.table}".`)
      else {
        checkValues(problems, where, table, action.values, readable, false)
        const missing = table.fields.filter((field) => field.required && field.default === undefined && !(field.name in action.values))
        if (missing.length) problems.push(`${where}: the table "${table.name}" needs ${missing.map((field) => `"${field.name}"`).join(', ')}, so give a value for each.`)
      }
    }
    if (action.do === 'email') {
      if (action.to === 'field' && !action.field) problems.push(`${where}: say which field holds the email address.`)
      if (action.to === 'field' && action.field && readable(action.field)) {
        const type = shape.fields.get(action.field)?.type
        if (type && type !== 'email') problems.push(`${where}: "${action.field}" is not an email field.`)
      }
      if (action.to !== 'field' && action.field) problems.push(`${where}: field is only used when to is "field".`)
    }
    if (action.do === 'webhook') {
      if (!validWebhookUrl(env, action.url) || !safeWebUrl(env, action.url)) problems.push(`${where}: use a public https address.`)
      else if (isChatUrl(action.url)) problems.push(`${where}: a chat address holds a secret, so the owner adds it on the Connect page of the back office, as a webhook. Don't ask them to paste it here.`)
    }
  }
  return problems
}

/** Things worth telling the owner that don't stop a rule from being saved. */
export function automationWarnings(env: Env, settings: Settings, rule: Automation) {
  const warnings: string[] = []
  const emails = rule.actions.filter((action) => action.do === 'email')
  if (emails.length && !canSendEmail(env, settings)) warnings.push('Email is not set up yet, so its email steps will fail until the owner sets it up. Read the limits guide.')
  if (emails.some((action) => action.do === 'email' && action.to === 'owner') && !isEmail(settings.notifyEmail)) warnings.push("There is no notifyEmail yet, so emails to the owner have nowhere to go. Set it with update_site.")
  const startsOn = 'table' in rule.trigger ? rule.trigger.table : null
  const loops = rule.actions.some((action) => (action.do === 'set_fields' && rule.trigger.on === 'record_changed' && !rule.trigger.field) || (action.do === 'add_record' && action.table === startsOn))
  if (loops) warnings.push(`This automation changes the table that starts it, so it starts itself again. It stops after ${maxDepth} rounds, but a field and value on the trigger, or a condition, usually stops it at once.`)
  return warnings
}

/** Problems with the saved automations, for check_site and publishing. */
export async function storedAutomationProblems(env: Env, site: SiteRow) {
  const all = await listAutomations(env, site.id)
  if (!all.length) return []
  const tables = new Map((await listTables(env, site.id)).map((table) => [table.name, table]))
  const settings = JSON.parse(liveSite(site).settings) as Settings
  const problems: string[] = []
  for (const item of all.filter((one) => one.enabled)) {
    for (const problem of await automationProblems(env, site, item.rule, tables)) problems.push(`The automation "${item.name}" (${item.id}): ${problem}`)
    if (item.rule.actions.some((action) => action.do === 'email') && !canSendEmail(env, settings)) problems.push(`The automation "${item.name}" (${item.id}) sends email, but email is not set up, so those emails fail.`)
  }
  return problems
}

// Trying a rule without changing anything

/** The newest real thing of the trigger's kind, with sample values on top, for a dry run. */
async function sampleHappening(env: Env, site: SiteRow, trigger: Trigger, sample: Facts = {}): Promise<Happened | null> {
  const id = asNumber(sample.id)
  let happened: Happened | null = null
  if (trigger.on === 'record_added' || trigger.on === 'record_changed') {
    const table = await getTable(env, site.id, trigger.table)
    if (!table) return null
    const row = id ? await getRecord(env, table, id) : await env.DB.prepare('SELECT id, customer_id, data, created_at, updated_at FROM data_records WHERE table_id = ? ORDER BY id DESC LIMIT 1').bind(table.id).first<DataRow>()
    happened = row ? await whatHappened(env, site.id, 'record.created', { table: table.name, record: showRecord(table, row, ownerActor) }) : { customer: null, facts: {}, record: { id: id ?? 0, table: table.name } }
  } else if (trigger.on === 'form_sent') {
    const entry = await env.DB.prepare('SELECT id, data, customer_id, created_at FROM entries WHERE site_id = ? AND form = ? ORDER BY id DESC LIMIT 1').bind(site.id, trigger.form).first<{ created_at: string; customer_id: null | number; data: string; id: number }>()
    happened = entry ? await whatHappened(env, site.id, 'entry.created', { ...entry, data: JSON.parse(entry.data) }) : null
  } else if (trigger.on === 'order_placed' || trigger.on === 'order_status') {
    const order = id ?? (await env.DB.prepare('SELECT id FROM orders WHERE site_id = ? ORDER BY id DESC LIMIT 1').bind(site.id).first<{ id: number }>())?.id
    happened = order ? await whatHappened(env, site.id, 'order.created', { id: order }) : null
  } else {
    const customer = await env.DB.prepare('SELECT id, name, email FROM customers WHERE site_id = ? AND (? IS NULL OR id = ?) ORDER BY id DESC LIMIT 1').bind(site.id, id, id).first<{ email: string; id: number; name: string }>()
    happened = customer ? await whatHappened(env, site.id, 'customer.created', customer) : null
  }
  if (!happened && !Object.keys(sample).length) return null
  const now = new Date().toISOString()
  happened ??= { customer: null, facts: { now, today: now.slice(0, 10), customer_name: '', customer_email: '' } }
  return { ...happened, facts: { ...happened.facts, ...sample } }
}

/** Shows what a rule would do with sample or recent data. Nothing is written, sent or called. */
export async function dryRun(env: Env, site: SiteRow, item: Pick<Stored, 'id' | 'name' | 'rule' | 'secret'>, sample?: Facts, before?: Facts) {
  const happened = await sampleHappening(env, site, item.rule.trigger, sample)
  if (!happened) return null
  const facts = { ...happened.facts }
  await addLinked(env, site.id, happened, facts, rulePaths(item.rule))
  const trigger = item.rule.trigger
  const starts = trigger.on !== 'record_changed' || !trigger.field || matches(trigger, 'record.updated', { record: facts, table: trigger.table }, before ?? (sample && trigger.field in sample ? {} : undefined))
  const conditionResults = (item.rule.conditions ?? []).map((test) => ({ ...test, holds: holds(test, facts) }))
  const wouldRun = starts && conditionResults.every((test) => test.holds)
  const outcome = wouldRun ? await runSteps({ dry: true, env, happened, item, siteId: site.id }, facts) : null
  return { usedData: facts, triggerWouldStart: starts, conditions: conditionResults, wouldRun, steps: outcome?.previews ?? [], nothingWasChanged: true }
}

// Plain sentences for the owner and Claude

type Names = { field: (path: string) => string; form: (name: string) => string; table: (name: string) => string }

export async function namesFor(env: Env, site: Pick<SiteRow, 'id' | 'live_version'>, rule?: Automation): Promise<Names> {
  const tables = new Map((await listTables(env, site.id)).map((table) => [table.name, table]))
  const forms = rule && rule.trigger.on !== 'form_sent' ? new Map() : await siteForms(env, site)
  const startTable = rule && 'table' in rule.trigger ? tables.get(rule.trigger.table) : undefined
  const startForm = rule?.trigger.on === 'form_sent' ? forms.get(rule.trigger.form) : undefined
  const label = (path: string): string => {
    const [prefix, rest] = path.split('.')
    const field = startTable?.fields.find((one) => one.name === prefix)
    if (rest) {
      const target = field?.table ? tables.get(field.table) : undefined
      return `${field?.label ?? prefix} › ${target?.fields.find((one) => one.name === rest)?.label ?? rest}`
    }
    return field?.label ?? startForm?.fields.get(prefix)?.label ?? prefix
  }
  return { field: label, form: (name) => forms.get(name)?.heading ?? name, table: (name) => tables.get(name)?.label ?? name }
}

/** One plain sentence for a rule, such as "When a record is added to Bookings and Seats is less than 1 → email the owner". */
export function sentence(rule: Automation, names: Names, t: OfficeWords) {
  const words = t.automations
  const shown = (item: unknown) => (typeof item === 'boolean' ? (item ? words.yes : words.no) : typeof item === 'number' ? String(item) : `“${asText(item)}”`)
  const test = (one: Condition) => words.is[one.is](names.field(one.field), shown(one.value))
  const trigger = rule.trigger
  const start =
    trigger.on === 'record_added'
      ? words.when.record_added(names.table(trigger.table))
      : trigger.on === 'record_changed'
        ? words.when.record_changed(names.table(trigger.table), trigger.field ? names.field(trigger.field) : '', trigger.to === undefined ? '' : shown(trigger.to))
        : trigger.on === 'form_sent'
          ? words.when.form_sent(names.form(trigger.form))
          : trigger.on === 'order_status'
            ? words.when.order_status(t.orderState(trigger.status))
            : words.when[trigger.on]()
  // A linked record's fields are named without the reference in front, because the step already says which record.
  const changes = (given: Record<string, Value>, through = '') => {
    const label = (name: string) => (through ? names.field(`${through}.${name}`).split(' › ').pop()! : names.field(name))
    return Object.entries(given)
      .map(([name, item]) => words.setTo(label(name), isComputed(item) ? `${label(item.field)} ${item.add < 0 ? '−' : '+'} ${Math.abs(item.add)}` : shown(item)))
      .join(', ')
  }
  const step = (action: Action) => {
    const what =
      action.do === 'set_fields'
        ? words.step.set_fields(changes(action.values))
        : action.do === 'add_record'
          ? words.step.add_record(names.table(action.table))
          : action.do === 'change_linked'
            ? words.step.change_linked(names.field(action.through), changes(action.values, action.through))
            : action.do === 'email'
              ? action.to === 'field'
                ? words.step.email_field(names.field(action.field ?? ''))
                : words.step[action.to === 'owner' ? 'email_owner' : 'email_customer']
              : action.do === 'webhook'
                ? words.step.webhook(new URL(action.url).host)
                : words.step.stop
    return action.when?.length ? `${what} ${words.onlyIf(action.when.map(test).join(words.and))}` : what
  }
  return `${start}${rule.conditions?.length ? `${words.and}${rule.conditions.map(test).join(words.and)}` : ''}${words.arrow}${rule.actions.map(step).join(words.then)}`
}

export const noteText = (note: Note, t: OfficeWords) => {
  const [key, ...args] = note
  const say = t.automations.note[key] as (...values: string[]) => string
  return key === 'raw' ? t.problem(args[0] ?? '') : say(...args)
}
