import { z } from 'zod'

import { withinLimit } from './auth'
import { getRecord, getTable, ownerActor, readScope, showRecord } from './data'
import type { Actor, DataRow, DataTable } from './data'
import { canSendEmail, isEmail, later, sendEmail } from './email'
import { getSite } from './owner'
import type { Customer, Env, Settings, SiteRow } from './types'
import { liveSite } from './versions'
import { fireEvent, onEvent } from './webhooks'

/*
 * Approvals: records of a table that one or more people must approve, such as an expense claim.
 *
 * A record with no request is a draft. Sending it works out its steps from the flow (who approves, and which steps the
 * amount needs) and freezes them in the request, so a later change to the flow never moves a request that is waiting.
 * While it waits, nobody can change the record (data.ts checks this inside the same UPDATE). Approved, only the owner can.
 * Rejected or returned, the person who sent it can change it and send it again.
 *
 * Every change to a request is one database batch whose statements only apply if the request still has the version
 * that was read. Two clicks, or two approvers at once, therefore make one decision, never skip a step.
 * The decision history only grows: triggers in 0025_approvals.sql refuse every UPDATE and DELETE on it.
 *
 * Roles today are the owner, staff and members. A step names who approves: any staff member, the owner, a person in a
 * field of the record (an email field, or a reference to a record with an email, such as the employee's manager), or a
 * fixed email. Org roles (P4) plug in as new kinds of approver, resolved in `resolveStep` and checked in `mayDecide`.
 */

export const approvalStatuses = ['pending', 'approved', 'rejected', 'returned'] as const
export type ApprovalStatus = (typeof approvalStatuses)[number]
export type Decision = 'approved' | 'rejected' | 'returned'
export const maxFlowSteps = 5

const fieldName = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/)
const email = z.string().trim().max(254).refine(isEmail, 'Use an email address.')
const word = z.string().trim().min(1).max(80)

export const approverSchema = z.discriminatedUnion('by', [
  z.object({ by: z.literal('staff') }).strict().describe('Any staff member who can read the table'),
  z.object({ by: z.literal('owner') }).strict().describe('The owner, through the back office or Claude'),
  z.object({ by: z.literal('field'), field: fieldName.describe('An email field of the record, or a reference field whose record has an email field, such as the manager') }).strict().describe('The staff member whose email is in this field of the record'),
  z.object({ by: z.literal('email'), email: email.describe('The email of a staff member') }).strict().describe('One named staff member'),
])

export const stepSchema = z
  .object({
    label: word.describe('What this step is, in the language of the site, such as Manager or Finance'),
    approver: approverSchema,
    above: z.number().min(0).optional().describe('Only when the amount is more than this, such as 5000'),
    atMost: z.number().min(0).optional().describe('Only when the amount is this or less'),
  })
  .strict()

export const flowSchema = z
  .object({
    table: fieldName.describe('The table whose records need approval'),
    steps: z.array(stepSchema).min(1).max(maxFlowSteps).describe('In order. Steps whose amount rule does not match are skipped. A record that needs no step is approved at once.'),
    amountField: fieldName.optional().describe('The number field the above and atMost rules read, such as amount'),
    statusField: fieldName.optional().describe('A read only or staff only text or select field this keeps up to date, so the status shows on pages and automations can react to it'),
    statusWords: z.object({ pending: word, approved: word, rejected: word, returned: word }).partial().strict().optional().describe('The words written to statusField, such as {"pending": "รออนุมัติ"}. English status names by default.'),
    submit: z.enum(['on_save', 'manual']).optional().describe('on_save (default): a record a customer or staff member adds is sent at once, and sent again when they change it after it was returned or rejected. manual: it waits as a draft until someone sends it.'),
    enabled: z.boolean().optional().describe('False keeps the flow but sends nothing new. Requests already waiting carry on.'),
  })
  .strict()

export type Flow = z.infer<typeof flowSchema>
export type FlowRow = { enabled: number; id: number; rule: Flow; table_id: number }
/** A step as it was worked out when the record was sent. */
export type PlanStep = { by: 'owner' | 'person' | 'staff'; label: string; person?: { email: string; id: number; name: string } }
export type RequestRow = { flow_id: number; id: number; plan: string; record_id: number; requester_id: null | number; round: number; status: ApprovalStatus; step: number; submitted_at: string; table_id: number; updated_at: string; version: number }
export type DecisionRow = { action: string; actor_id: null | number; actor_name: string; actor_role: string; comment: string; created_at: string; id: number; round: number; step: number; step_label: string }

/** What an approval change answers. `status` is the HTTP status an API would use. */
export type Outcome = { code?: string; error?: string; request?: RequestRow; rowsWritten?: number; status: number }

const newVersion = () => Math.floor(Math.random() * 2 ** 48) + 1
const fail = (status: number, code: string, error: string): Outcome => ({ code, error, status })

// Flows

const flowFrom = (row: { enabled: number; id: number; rule: string; table_id: number }): FlowRow => ({ ...row, rule: JSON.parse(row.rule) as Flow })

export async function getFlow(env: Env, tableId: number) {
  const row = await env.DB.prepare('SELECT id, table_id, rule, enabled FROM approval_flows WHERE table_id = ?').bind(tableId).first<{ enabled: number; id: number; rule: string; table_id: number }>()
  return row ? flowFrom(row) : null
}

export async function listFlows(env: Env, siteId: number) {
  const { results } = await env.DB.prepare('SELECT approval_flows.id, approval_flows.table_id, approval_flows.rule, approval_flows.enabled, data_tables.name AS table_name, data_tables.label AS table_label, (SELECT COUNT(*) FROM approval_requests WHERE approval_requests.flow_id = approval_flows.id AND status = ?) AS waiting FROM approval_flows JOIN data_tables ON data_tables.id = approval_flows.table_id WHERE approval_flows.site_id = ? ORDER BY data_tables.name')
    .bind('pending', siteId)
    .all<{ enabled: number; id: number; rule: string; table_id: number; table_label: string; table_name: string; waiting: number }>()
  return results.map((row) => ({ ...flowFrom(row), tableLabel: row.table_label, tableName: row.table_name, waiting: row.waiting }))
}

/** Checks a flow against its table. Returns what is wrong in plain words, or null. */
export async function flowProblems(env: Env, siteId: number, table: DataTable, flow: Flow) {
  const field = (name: string) => table.fields.find((one) => one.name === name)
  if (flow.amountField && field(flow.amountField)?.type !== 'number') return `amountField "${flow.amountField}" must be a number field of the table ${table.name}.`
  for (const [index, step] of flow.steps.entries()) {
    const where = `Step ${index + 1} (${step.label})`
    if ((step.above !== undefined || step.atMost !== undefined) && !flow.amountField) return `${where} has an amount rule, so the flow needs amountField.`
    if (step.above !== undefined && step.atMost !== undefined && step.atMost <= step.above) return `${where} can never apply: atMost must be more than above.`
    if (step.approver.by !== 'field') continue
    const named = field(step.approver.field)
    if (!named || (named.type !== 'email' && named.type !== 'reference')) return `${where} takes its approver from "${step.approver.field}", which must be an email or reference field of ${table.name}.`
    if (named.type === 'reference') {
      const target = await getTable(env, siteId, named.table!)
      if (!target?.fields.some((one) => one.type === 'email')) return `${where} takes its approver from "${named.name}", which points to ${named.table}. That table needs an email field.`
    }
  }
  if (flow.statusField) {
    const status = field(flow.statusField)
    if (!status || (status.type !== 'text' && status.type !== 'select')) return `statusField "${flow.statusField}" must be a text or select field of ${table.name}.`
    // Otherwise a customer could write "approved" into it themselves.
    if (!status.readOnly && !status.staffOnly) return `statusField "${flow.statusField}" must be readOnly or staffOnly, so customers can't set the status themselves.`
    const missing = approvalStatuses.map((one) => statusWord(flow, one)).filter((one) => status.type === 'select' && !status.options?.includes(one))
    if (missing.length) return `statusField "${flow.statusField}" is a select, so its options need ${missing.map((one) => `"${one}"`).join(', ')}. Add them with save_table, or set statusWords.`
  }
  return null
}

export async function saveFlow(env: Env, siteId: number, flow: Flow) {
  const table = await getTable(env, siteId, flow.table)
  if (!table) return { error: `There is no table called "${flow.table}".` }
  const problem = await flowProblems(env, siteId, table, flow)
  if (problem) return { error: problem }
  await env.DB.prepare(`INSERT INTO approval_flows (site_id, table_id, rule, enabled) VALUES (?, ?, ?, ?)
    ON CONFLICT (table_id) DO UPDATE SET rule = excluded.rule, enabled = excluded.enabled, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`)
    .bind(siteId, table.id, JSON.stringify(flow), flow.enabled === false ? 0 : 1)
    .run()
  return { table }
}

/** Deletes a flow. Requests still waiting are removed with it, which unlocks their records. The history stays. */
export async function deleteFlow(env: Env, siteId: number, tableName: string) {
  const result = await env.DB.prepare('DELETE FROM approval_flows WHERE site_id = ? AND table_id = (SELECT id FROM data_tables WHERE site_id = ? AND name = ?)').bind(siteId, siteId, tableName).run()
  return result.meta.changes > 0
}

export const statusWord = (flow: Flow, status: ApprovalStatus) => flow.statusWords?.[status] ?? status

// Requests

export const getRequest = (env: Env, recordId: number) => env.DB.prepare('SELECT * FROM approval_requests WHERE record_id = ?').bind(recordId).first<RequestRow>()

export async function history(env: Env, recordId: number) {
  const { results } = await env.DB.prepare('SELECT id, round, step, step_label, action, actor_id, actor_role, actor_name, comment, created_at FROM approval_decisions WHERE record_id = ? ORDER BY id').bind(recordId).all<DecisionRow>()
  return results
}

export const planOf = (request: Pick<RequestRow, 'plan'>) => JSON.parse(request.plan) as PlanStep[]

/** Where a record is, for pages, the API and Claude. */
export function describe(request: null | RequestRow) {
  if (!request) return { status: 'draft' as const }
  const plan = planOf(request)
  const current = request.status === 'pending' ? plan[request.step] : undefined
  return { status: request.status, step: request.step + 1, steps: plan.length, round: request.round, waitingFor: current ? { label: current.label, by: current.by, ...(current.person ? { name: current.person.name, email: current.person.email } : {}) } : null, plan: plan.map((step) => ({ label: step.label, by: step.by, ...(step.person ? { name: step.person.name } : {}) })), submittedAt: request.submitted_at, updatedAt: request.updated_at }
}

const ownerAccount = (env: Env, site: SiteRow) => (site.owner_customer_id ? env.DB.prepare('SELECT id, email, name FROM customers WHERE id = ?').bind(site.owner_customer_id).first<{ email: string; id: number; name: string }>() : Promise.resolve(null))

/** Turns one step of the flow into who approves it, for this record. */
async function resolveStep(env: Env, site: SiteRow, table: DataTable, data: Record<string, unknown>, step: Flow['steps'][number]): Promise<{ error: string } | { step: PlanStep }> {
  const approver = step.approver
  if (approver.by === 'staff' || approver.by === 'owner') return { step: { by: approver.by, label: step.label } }
  let address: unknown = approver.by === 'email' ? approver.email : data[approver.field]
  if (approver.by === 'field') {
    const field = table.fields.find((one) => one.name === approver.field)
    if (field?.type === 'reference' && typeof address === 'number') {
      const target = await getTable(env, site.id, field.table!)
      const linked = target && (await getRecord(env, target, address))
      const emailField = target?.fields.find((one) => one.type === 'email')
      address = linked && emailField ? (JSON.parse(linked.data) as Record<string, unknown>)[emailField.name] : undefined
    }
    if (!isEmail(address)) return { error: `Step "${step.label}" needs an approver, but "${field?.label ?? approver.field}" has no email.` }
  }
  const wanted = String(address).trim().toLowerCase()
  const settings = JSON.parse(site.settings) as Settings
  const owner = await ownerAccount(env, site)
  if (owner?.email.toLowerCase() === wanted || settings.notifyEmail?.toLowerCase() === wanted) return { step: { by: 'owner', label: step.label } }
  const person = await env.DB.prepare('SELECT id, email, name, role FROM customers WHERE site_id = ? AND email = ?').bind(site.id, wanted).first<Customer>()
  // Only staff open the back office, where approvals are made. Anyone else could never act on it.
  if (!person || person.role !== 'staff') return { error: `Step "${step.label}": ${wanted} needs to be a staff member of this site to approve.` }
  return { step: { by: 'person', label: step.label, person: { email: person.email, id: person.id, name: person.name } } }
}

/** The steps this record needs, worked out from its values now. */
export async function planFor(env: Env, site: SiteRow, table: DataTable, flow: Flow, row: DataRow): Promise<{ error: string } | { plan: PlanStep[] }> {
  const data = JSON.parse(row.data) as Record<string, unknown>
  const raw = flow.amountField ? data[flow.amountField] : undefined
  const amount = typeof raw === 'number' ? raw : NaN
  const ruled = flow.steps.some((step) => step.above !== undefined || step.atMost !== undefined)
  const amountField = table.fields.find((field) => field.name === flow.amountField)
  if (ruled && !Number.isFinite(amount)) return { error: `"${amountField?.label ?? flow.amountField}" is needed to know who approves.` }
  const plan: PlanStep[] = []
  for (const step of flow.steps) {
    if (step.above !== undefined && !(amount > step.above)) continue
    if (step.atMost !== undefined && !(amount <= step.atMost)) continue
    const resolved = await resolveStep(env, site, table, data, step)
    if ('error' in resolved) return resolved
    plan.push(resolved.step)
  }
  return { plan }
}

type Who = { id: null | number; name: string; role: 'member' | 'owner' | 'staff' }

const whoIs = (actor: Actor): Who => (actor.admin ? { id: null, name: 'Owner', role: 'owner' } : { id: actor.customer!.id, name: actor.customer!.name || actor.customer!.email, role: actor.customer!.role === 'staff' ? 'staff' : 'member' })

/** Whether this person may decide the current step. The owner always may, so a request never gets stuck. */
export async function mayDecide(env: Env, table: DataTable, request: RequestRow, actor: Actor): Promise<{ error: string } | { who: Who }> {
  if (actor.readOnly) return { error: 'A read-only key cannot decide approvals.' }
  if (actor.admin) return { who: whoIs(actor) }
  const customer = actor.customer
  if (!customer || customer.role !== 'staff') return { error: 'Only the approver of this step can decide it.' }
  if (request.requester_id === customer.id) return { error: 'Nobody can approve their own request.' }
  const current = planOf(request)[request.step]
  if (!current || current.by === 'owner') return { error: 'Only the owner can decide this step.' }
  if (current.by === 'person' && current.person?.id !== customer.id) return { error: `Only ${current.person?.name || current.person?.email} can decide this step.` }
  if (current.by === 'staff' && readScope(table, actor) !== 'all') return { error: 'Only staff who can read this table can decide this step.' }
  // Two steps mean two people, so one person can't approve a large amount alone.
  const earlier = await env.DB.prepare("SELECT 1 FROM approval_decisions WHERE request_id = ? AND round = ? AND action = 'approved' AND actor_id = ? LIMIT 1").bind(request.id, request.round, customer.id).first()
  if (earlier) return { error: 'You already approved an earlier step of this request. Another person must approve this one.' }
  return { who: whoIs(actor) }
}

/** Whether this person may see a request and its history. */
export function maySee(table: DataTable, request: null | RequestRow, row: DataRow, actor: Actor) {
  if (actor.admin || readScope(table, actor) === 'all') return true
  const id = actor.customer?.id
  if (!id) return false
  return row.customer_id === id || request?.requester_id === id || Boolean(request && planOf(request).some((step) => step.person?.id === id))
}

/** Whether this person may send a record for approval: the person it belongs to, staff for them, or the owner. */
export const maySubmit = (table: DataTable, row: DataRow, actor: Actor) => !actor.readOnly && (actor.admin || (actor.customer?.role === 'staff' && readScope(table, actor) === 'all') || (Boolean(actor.customer) && row.customer_id === actor.customer!.id))

const decisionSql = `INSERT INTO approval_decisions (site_id, request_id, table_name, record_id, round, step, step_label, action, actor_id, actor_role, actor_name, comment)
  SELECT ?, id, ?, record_id, round, step, ?, ?, ?, ?, ?, ? FROM approval_requests WHERE id = ? AND version = ?`

/** Keeps the table's status field in step with the request, in the same batch, and only if this change won. */
const statusSql = (field: string) => `UPDATE data_records SET data = json_set(data, '$.${field}', ?), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND EXISTS (SELECT 1 FROM approval_requests WHERE record_id = data_records.id AND version = ?) AND COALESCE(json_extract(data, '$.${field}'), '') != ?`

const written = (results: D1Result[]) => results.reduce((total, result) => total + (Number((result.meta as { rows_written?: number }).rows_written) || 0), 0)

/** Sends a record for approval: from a draft, or again after it was returned or rejected. */
export async function submit(env: Env, site: SiteRow, table: DataTable, row: DataRow, actor: Actor, comment = ''): Promise<Outcome> {
  const flow = await getFlow(env, table.id)
  if (!flow) return fail(404, 'no_flow', `The table ${table.label} has no approval flow.`)
  if (!flow.enabled) return fail(409, 'flow_off', 'Approvals for this table are switched off.')
  if (!maySubmit(table, row, actor)) return fail(403, 'forbidden', 'Only the person this record belongs to, staff or the owner can send it for approval.')
  const before = await getRequest(env, row.id)
  if (before && (before.status === 'pending' || before.status === 'approved')) return fail(409, before.status === 'pending' ? 'already_pending' : 'already_approved', before.status === 'pending' ? 'This is already waiting for approval.' : 'This is already approved.')
  const planned = await planFor(env, site, table, flow.rule, row)
  if ('error' in planned) return fail(400, 'no_approver', planned.error)
  const plan = planned.plan
  const status: ApprovalStatus = plan.length ? 'pending' : 'approved'
  const requester = row.customer_id ?? actor.customer?.id ?? null
  const version = newVersion()
  const who = whoIs(actor)
  // Inserted for a draft, updated after a return or rejection, and in both cases only if nobody changed it since it was read.
  const statements = [
    env.DB.prepare(`INSERT INTO approval_requests (flow_id, table_id, record_id, requester_id, status, step, round, plan, version) VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?)
      ON CONFLICT (record_id) DO UPDATE SET flow_id = excluded.flow_id, requester_id = excluded.requester_id, status = excluded.status, step = 0, round = approval_requests.round + 1, plan = excluded.plan, version = excluded.version, submitted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE approval_requests.version = ? AND approval_requests.status IN ('rejected', 'returned')`).bind(flow.id, table.id, row.id, requester, status, JSON.stringify(plan), version, before?.version ?? -1),
    env.DB.prepare(`INSERT INTO approval_decisions (site_id, request_id, table_name, record_id, round, step, step_label, action, actor_id, actor_role, actor_name, comment)
      SELECT ?, id, ?, record_id, round, 0, '', 'submitted', ?, ?, ?, ? FROM approval_requests WHERE record_id = ? AND version = ?`).bind(site.id, table.name, who.id, who.role, who.name, comment.slice(0, 2000), row.id, version),
  ]
  // A record no step applies to, such as a small amount when every step is for large ones, is approved by the flow's own rule.
  if (!plan.length) statements.push(env.DB.prepare(`INSERT INTO approval_decisions (site_id, request_id, table_name, record_id, round, step, step_label, action, actor_id, actor_role, actor_name, comment) SELECT ?, id, ?, record_id, round, 0, '', 'approved', NULL, 'rule', '', 'No approval step applies.' FROM approval_requests WHERE record_id = ? AND version = ?`).bind(site.id, table.name, row.id, version))
  const field = flow.rule.statusField
  if (field) statements.push(env.DB.prepare(statusSql(field)).bind(statusWord(flow.rule, status), row.id, version, statusWord(flow.rule, status)))
  const results = await env.DB.batch(statements)
  if (!results[0].meta.changes) return fail(409, 'changed', 'Someone else changed this request at the same moment. Please look again.')
  const request = (await getRequest(env, row.id))!
  await afterChange(env, site, table, row, flow, request, field ? (results.at(-1)!.meta.changes ? status : null) : null)
  return { request, rowsWritten: written(results), status: 200 }
}

/**
 * Approves, rejects or returns the current step. `seen` is the step and round the person was looking at: if the request
 * moved on since, nothing happens, so a second click or a second approver never approves the next step by accident.
 */
export async function decide(env: Env, site: SiteRow, table: DataTable, row: DataRow, actor: Actor, action: Decision, comment: string, seen: { round?: number; step: number }): Promise<Outcome> {
  const flow = await getFlow(env, table.id)
  const request = await getRequest(env, row.id)
  if (!flow || !request || request.status !== 'pending') return fail(409, 'not_pending', 'This is not waiting for approval.')
  if (seen.step !== request.step + 1 || (seen.round !== undefined && seen.round !== request.round)) return fail(409, 'changed', `This step was already decided. It is now at step ${request.step + 1} of ${planOf(request).length}.`)
  const allowed = await mayDecide(env, table, request, actor)
  if ('error' in allowed) return fail(403, 'forbidden', allowed.error)
  const note = comment.trim().slice(0, 2000)
  if (action !== 'approved' && !note) return fail(400, 'comment_needed', action === 'returned' ? 'Say what needs to change.' : 'Say why it is rejected.')
  const plan = planOf(request)
  const last = request.step + 1 >= plan.length
  const status: ApprovalStatus = action === 'approved' ? (last ? 'approved' : 'pending') : action
  const step = action === 'approved' && !last ? request.step + 1 : request.step
  const version = newVersion()
  const statements = [
    // The decision is written first, while the request still has the version that was read.
    env.DB.prepare(decisionSql).bind(site.id, table.name, plan[request.step]?.label ?? '', action, allowed.who.id, allowed.who.role, allowed.who.name, note, request.id, request.version),
    env.DB.prepare("UPDATE approval_requests SET status = ?, step = ?, version = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND version = ?").bind(status, step, version, request.id, request.version),
  ]
  const field = flow.rule.statusField
  if (field && status !== 'pending') statements.push(env.DB.prepare(statusSql(field)).bind(statusWord(flow.rule, status), row.id, version, statusWord(flow.rule, status)))
  const results = await env.DB.batch(statements)
  if (!results[1].meta.changes) return fail(409, 'changed', 'Someone else decided this at the same moment. Please look again.')
  const now = (await getRequest(env, row.id))!
  await afterChange(env, site, table, row, flow, now, field && status !== 'pending' && results[2]?.meta.changes ? status : null, note)
  return { request: now, rowsWritten: written(results), status: 200 }
}

// Telling people

const lines = (language: string | undefined) =>
  language === 'th'
    ? {
        waiting: (table: string, id: number) => `รออนุมัติ: ${table} #${id}`,
        waitingText: (step: string, steps: string) => `มีรายการรอให้คุณอนุมัติ ขั้น ${step} (${steps}) เปิดหลังร้าน แล้วไปที่หน้า "อนุมัติ"`,
        decided: (table: string, id: number, status: string) => `${table} #${id}: ${status}`,
        status: { approved: 'อนุมัติแล้ว', pending: 'รออนุมัติ', rejected: 'ไม่อนุมัติ', returned: 'ส่งกลับให้แก้ไข' } as Record<ApprovalStatus, string>,
        comment: 'ความเห็น',
        open: 'เปิดหน้าอนุมัติ',
      }
    : {
        waiting: (table: string, id: number) => `Waiting for your approval: ${table} #${id}`,
        waitingText: (step: string, steps: string) => `Something is waiting for you to approve, step ${step} (${steps}). Open the back office, then Approvals.`,
        decided: (table: string, id: number, status: string) => `${table} #${id}: ${status}`,
        status: { approved: 'approved', pending: 'waiting for approval', rejected: 'rejected', returned: 'returned for changes' } as Record<ApprovalStatus, string>,
        comment: 'Comment',
        open: 'Open approvals',
      }

/** Who should hear that a step is waiting for them. Staff steps go to every staff member who could decide them. */
async function approverEmails(env: Env, site: SiteRow, table: DataTable, request: RequestRow, settings: Settings) {
  const current = planOf(request)[request.step]
  if (!current) return []
  if (current.by === 'person') return current.person && current.person.id !== request.requester_id ? [current.person.email] : []
  if (current.by === 'owner') return isEmail(settings.notifyEmail) ? [settings.notifyEmail] : []
  if (table.read_access === 'owner') return []
  const { results } = await env.DB.prepare("SELECT id, email FROM customers WHERE site_id = ? AND role = 'staff' ORDER BY id LIMIT 20").bind(site.id).all<{ email: string; id: number }>()
  return results.filter((person) => person.id !== request.requester_id).map((person) => person.email)
}

/**
 * After a change: tells the next approver, or the person who sent it, by email through the owner's own Resend account,
 * and lets automations and webhooks hear about a changed status field, the same channels every other change uses.
 */
async function afterChange(env: Env, site: SiteRow, table: DataTable, row: DataRow, flow: FlowRow, request: RequestRow, statusChanged: ApprovalStatus | null, comment = '') {
  if (statusChanged && flow.rule.statusField) {
    const fresh = await getRecord(env, table, row.id)
    if (fresh) {
      // `approval` marks this as the flow's own write, so it never sends the record again by itself.
      await fireEvent(env, site.id, 'record.updated', { table: table.name, record: showRecord(table, fresh, ownerActor), approval: { status: request.status, step: request.step + 1, round: request.round } }, JSON.parse(row.data))
    }
  }
  if (!env.RESEND_API_KEY) return
  await later(
    env,
    (async () => {
      const settings = JSON.parse(liveSite(site).settings) as Settings
      if (!canSendEmail(env, settings)) return
      const say = lines(settings.language)
      const plan = planOf(request)
      const send = async (to: string, subject: string, text: string, facts: [string, string][] = []) => {
        if (await withinLimit(env, 'email-approvals', 200, 3600)) await sendEmail(env, settings, to, { facts, heading: subject, lines: [text], subject })
      }
      if (request.status === 'pending') {
        const step = plan[request.step]
        for (const to of await approverEmails(env, site, table, request, settings)) await send(to, say.waiting(table.label, row.id), say.waitingText(`${request.step + 1}/${plan.length}`, step?.label ?? ''))
        return
      }
      const requester = request.requester_id ? await env.DB.prepare('SELECT email FROM customers WHERE id = ?').bind(request.requester_id).first<{ email: string }>() : null
      if (requester && isEmail(requester.email)) await send(requester.email, say.decided(table.label, row.id, say.status[request.status]), say.decided(table.label, row.id, say.status[request.status]), comment ? [[say.comment, comment]] : [])
    })(),
  )
}

// Sending by saving

/**
 * With submit "on_save", adding a record sends it, and changing a returned or rejected one sends it again. This hears
 * the same events webhooks do. Records the owner adds without a customer, such as samples, stay drafts.
 */
async function sendOnSave(env: Env, siteId: number, event: string, data: unknown) {
  if (event !== 'record.created' && event !== 'record.updated') return
  const item = data as { approval?: unknown; record?: { customer_id?: null | number; id?: number }; table?: string }
  if (item.approval || !item.table || !item.record?.id || !item.record.customer_id) return
  try {
    const site = await getSite(env)
    if (!site || site.id !== siteId) return
    const table = await getTable(env, siteId, item.table)
    const flow = table && (await getFlow(env, table.id))
    if (!table || !flow?.enabled || flow.rule.submit === 'manual') return
    const row = await getRecord(env, table, item.record.id)
    if (!row) return
    const request = await getRequest(env, row.id)
    if (request && request.status !== 'returned' && request.status !== 'rejected') return
    const customer = await env.DB.prepare('SELECT id, email, name, role FROM customers WHERE id = ?').bind(row.customer_id).first<Customer>()
    if (!customer) return
    const sent = await submit(env, site, table, row, { admin: false, customer })
    if (sent.error) console.error('A record could not be sent for approval', table.name, row.id, sent.error)
  } catch (error) {
    console.error('Sending for approval failed', error)
  }
}

onEvent(sendOnSave)
