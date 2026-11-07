import { allowAttempt } from './auth'
import { decide, describe, getFlow, getRequest, history, listFlows, mayDecide, maySee, maySubmit, planOf, statusWord, submit } from './approvals'
import type { DecisionRow, Outcome, RequestRow } from './approvals'
import { office } from './cms'
import type { Desk, Notice } from './cms'
import { getRecord, getTable, listTables, ownerActor, showRecord } from './data'
import type { Actor, DataRow, DataTable } from './data'
import { escapeHtml, notFound, see } from './http'
import { officeLanguage } from './office-words'
import type { Env, Settings, SiteRow } from './types'

const en = {
  title: 'Approvals',
  intro: 'Records that need someone to approve them, such as expense claims. Each step can only be decided once, and the history below each one can never be changed or deleted.',
  waiting: 'Waiting for you',
  noneWaiting: 'Nothing is waiting for you.',
  others: 'Waiting for someone else',
  recent: 'Recently decided',
  noneRecent: 'Nothing decided yet.',
  flows: 'Approval flows',
  noFlows: 'No table needs approval yet. Ask Claude, for example: "Expense claims up to 5,000 need the manager. Above that, the owner approves too."',
  flowLine: (table: string, steps: string, waiting: number, on: boolean) => `${table}: ${steps}${on ? '' : ' (switched off)'} · ${waiting} waiting`,
  above: (amount: number) => `above ${amount.toLocaleString('en')}`,
  atMost: (amount: number) => `up to ${amount.toLocaleString('en')}`,
  approverKind: { email: 'a named person', field: 'the person in a field', owner: 'the owner', staff: 'any staff member' } as Record<string, string>,
  step: (step: number, steps: number, label: string) => `Step ${step} of ${steps}: ${label}`,
  waitingFor: (who: string) => `Waiting for ${who}`,
  anyStaff: 'any staff member',
  theOwner: 'the owner',
  status: { approved: 'Approved', draft: 'Draft', pending: 'Waiting for approval', rejected: 'Rejected', returned: 'Returned for changes' } as Record<string, string>,
  sentBy: (name: string) => `Sent by ${name}`,
  approve: 'Approve',
  reject: 'Reject',
  return: 'Return for changes',
  send: 'Send for approval again',
  comment: 'Comment. Needed to reject or return.',
  history: 'History',
  action: { approved: 'approved', rejected: 'rejected', returned: 'returned for changes', submitted: 'sent for approval' } as Record<string, string>,
  rule: 'the flow (no step applies)',
  saved: 'Done.',
  locked: 'This record is waiting for approval or already approved, so it cannot be deleted now.',
}

const th: typeof en = {
  title: 'อนุมัติ',
  intro: 'รายการที่ต้องมีคนอนุมัติ เช่น ใบเบิกค่าใช้จ่าย แต่ละขั้นตัดสินได้ครั้งเดียว และประวัติใต้แต่ละรายการแก้ไขหรือลบไม่ได้',
  waiting: 'รอคุณอนุมัติ',
  noneWaiting: 'ไม่มีรายการรอคุณอนุมัติ',
  others: 'รอคนอื่นอนุมัติ',
  recent: 'ตัดสินล่าสุด',
  noneRecent: 'ยังไม่มีรายการที่ตัดสินแล้ว',
  flows: 'ขั้นตอนอนุมัติ',
  noFlows: 'ยังไม่มีตารางที่ต้องอนุมัติ ลองบอก Claude เช่น "ใบเบิกไม่เกิน 5,000 บาท ให้หัวหน้าอนุมัติ ถ้าเกินให้เจ้าของอนุมัติอีกขั้น"',
  flowLine: (table, steps, waiting, on) => `${table}: ${steps}${on ? '' : ' (ปิดอยู่)'} · รอ ${waiting} รายการ`,
  above: (amount) => `เกิน ${amount.toLocaleString('th')}`,
  atMost: (amount) => `ไม่เกิน ${amount.toLocaleString('th')}`,
  approverKind: { email: 'คนที่ระบุชื่อ', field: 'คนในฟิลด์ของรายการ', owner: 'เจ้าของ', staff: 'พนักงานคนใดก็ได้' },
  step: (step, steps, label) => `ขั้น ${step} จาก ${steps}: ${label}`,
  waitingFor: (who) => `รอ ${who}`,
  anyStaff: 'พนักงานคนใดก็ได้',
  theOwner: 'เจ้าของ',
  status: { approved: 'อนุมัติแล้ว', draft: 'ฉบับร่าง', pending: 'รออนุมัติ', rejected: 'ไม่อนุมัติ', returned: 'ส่งกลับให้แก้ไข' },
  sentBy: (name) => `ส่งโดย ${name}`,
  approve: 'อนุมัติ',
  reject: 'ไม่อนุมัติ',
  return: 'ส่งกลับให้แก้ไข',
  send: 'ส่งขออนุมัติอีกครั้ง',
  comment: 'ความเห็น (ต้องใส่เมื่อไม่อนุมัติหรือส่งกลับ)',
  history: 'ประวัติ',
  action: { approved: 'อนุมัติ', rejected: 'ไม่อนุมัติ', returned: 'ส่งกลับให้แก้ไข', submitted: 'ส่งขออนุมัติ' },
  rule: 'กฎของขั้นตอน (ไม่มีขั้นที่ต้องอนุมัติ)',
  saved: 'เรียบร้อยแล้ว',
  locked: 'รายการนี้รออนุมัติหรืออนุมัติแล้ว จึงลบตอนนี้ไม่ได้',
}

export const approvalWords = (site: SiteRow) => (officeLanguage(JSON.parse(site.settings) as Settings) === 'th' ? th : en)

// Staff follow each table's own rules here too. The owner may decide any step, so a request never gets stuck.
const deskActor = (desk: Desk): Actor => (desk.staff ? { admin: false, customer: desk.staff } : ownerActor)

const when = (time: string) => `${time.slice(0, 16).replace('T', ' ')} UTC`

type Loaded = { decisions: Map<number, DecisionRow[]>; names: Map<number, string>; rows: Map<number, DataRow>; tables: Map<number, DataTable> }

async function load(env: Env, siteId: number, requests: RequestRow[]): Promise<Loaded> {
  const tables = new Map((await listTables(env, siteId)).map((table) => [table.id, table]))
  const ids = requests.map((request) => request.record_id)
  const people = [...new Set(requests.map((request) => request.requester_id).filter((id): id is number => id !== null))]
  const marks = (list: unknown[]) => list.map(() => '?').join(',')
  const [rows, decisions, names] = await Promise.all([
    ids.length ? env.DB.prepare(`SELECT id, customer_id, data, created_at, updated_at FROM data_records WHERE id IN (${marks(ids)})`).bind(...ids).all<DataRow>() : { results: [] as DataRow[] },
    ids.length ? env.DB.prepare(`SELECT id, record_id, round, step, step_label, action, actor_id, actor_role, actor_name, comment, created_at FROM approval_decisions WHERE record_id IN (${marks(ids)}) ORDER BY id`).bind(...ids).all<DecisionRow & { record_id: number }>() : { results: [] as (DecisionRow & { record_id: number })[] },
    people.length ? env.DB.prepare(`SELECT id, name, email FROM customers WHERE id IN (${marks(people)})`).bind(...people).all<{ email: string; id: number; name: string }>() : { results: [] as { email: string; id: number; name: string }[] },
  ])
  const grouped = new Map<number, DecisionRow[]>()
  for (const decision of decisions.results) grouped.set(decision.record_id, [...(grouped.get(decision.record_id) ?? []), decision])
  return { decisions: grouped, names: new Map(names.results.map((person) => [person.id, person.name || person.email])), rows: new Map(rows.results.map((row) => [row.id, row])), tables }
}

function card(desk: Desk, words: typeof en, loaded: Loaded, request: RequestRow, actor: Actor, canDecide: boolean) {
  const table = loaded.tables.get(request.table_id)
  const row = loaded.rows.get(request.record_id)
  if (!table || !row) return ''
  const shown = showRecord(table, row, actor) as Record<string, unknown>
  const facts = table.fields
    .filter((field) => shown[field.name] !== undefined && shown[field.name] !== '')
    .slice(0, 6)
    .map((field) => `<div><dt>${escapeHtml(field.label)}</dt><dd class="pre-line">${escapeHtml(shown[field.name])}</dd></div>`)
    .join('')
  const plan = planOf(request)
  const current = plan[request.step]
  const who = current ? (current.by === 'person' ? current.person?.name || current.person?.email || '' : current.by === 'owner' ? words.theOwner : words.anyStaff) : ''
  const where = request.status === 'pending' && current ? `<p>${escapeHtml(words.step(request.step + 1, plan.length, current.label))} · ${escapeHtml(words.waitingFor(who))}</p>` : ''
  const requester = request.requester_id ? loaded.names.get(request.requester_id) : null
  const log = (loaded.decisions.get(request.record_id) ?? [])
    .map((decision) => `<li>${escapeHtml(when(decision.created_at))} · ${escapeHtml(decision.actor_role === 'rule' ? words.rule : decision.actor_name || decision.actor_role)} · ${escapeHtml(words.action[decision.action] ?? decision.action)}${decision.step_label ? ` (${escapeHtml(decision.step_label)})` : ''}${decision.comment ? `<br><span class="pre-line">${escapeHtml(decision.comment)}</span>` : ''}</li>`)
    .join('')
  const action = `${escapeHtml(desk.base)}/approvals/${escapeHtml(table.name)}/${row.id}`
  const seen = `<input name="step" type="hidden" value="${request.step + 1}"><input name="round" type="hidden" value="${request.round}">`
  const buttons = canDecide
    ? `<form action="${action}" class="contact-form" method="post">${seen}<label>${escapeHtml(words.comment)}<textarea maxlength="2000" name="comment" rows="2"></textarea></label><div class="cms-actions"><button class="button button--small" name="op" type="submit" value="approve">${escapeHtml(words.approve)}</button> <button class="button button--small button--ghost" name="op" type="submit" value="return">${escapeHtml(words.return)}</button> <button class="button button--small button--ghost" name="op" type="submit" value="reject">${escapeHtml(words.reject)}</button></div></form>`
    : (request.status === 'returned' || request.status === 'rejected') && maySubmit(table, row, actor)
      ? `<form action="${action}" class="contact-form" method="post"><input name="op" type="hidden" value="submit"><button class="button button--small" type="submit">${escapeHtml(words.send)}</button></form>`
      : ''
  return `<article class="card account__record" data-approval="${request.status}" id="approval-${row.id}"><h3>${escapeHtml(table.label)} #${row.id} · ${escapeHtml(words.status[request.status] ?? request.status)}</h3>${requester ? `<p class="post-date">${escapeHtml(words.sentBy(requester))} · ${escapeHtml(when(request.submitted_at))}</p>` : ''}<dl>${facts}</dl>${where}${buttons}<details><summary>${escapeHtml(words.history)}</summary><ol>${log}</ol></details></article>`
}

async function approvalsPage(env: Env, site: SiteRow, desk: Desk, notice?: Notice, status = 200) {
  const words = approvalWords(site)
  const actor = deskActor(desk)
  const { results: pending } = await env.DB.prepare("SELECT approval_requests.* FROM approval_requests JOIN data_tables ON data_tables.id = approval_requests.table_id WHERE data_tables.site_id = ? AND approval_requests.status = 'pending' ORDER BY approval_requests.updated_at LIMIT 100").bind(site.id).all<RequestRow>()
  const { results: decided } = await env.DB.prepare("SELECT approval_requests.* FROM approval_requests JOIN data_tables ON data_tables.id = approval_requests.table_id WHERE data_tables.site_id = ? AND approval_requests.status != 'pending' ORDER BY approval_requests.updated_at DESC LIMIT 30").bind(site.id).all<RequestRow>()
  const loaded = await load(env, site.id, [...pending, ...decided])
  const mine: string[] = []
  const others: string[] = []
  for (const request of pending) {
    const table = loaded.tables.get(request.table_id)
    const row = loaded.rows.get(request.record_id)
    if (!table || !row || !maySee(table, request, row, actor)) continue
    const may = !('error' in (await mayDecide(env, table, request, actor)))
    ;(may ? mine : others).push(card(desk, words, loaded, request, actor, may))
  }
  const recent = decided
    .filter((request) => {
      const table = loaded.tables.get(request.table_id)
      const row = loaded.rows.get(request.record_id)
      return table && row && maySee(table, request, row, actor)
    })
    .map((request) => card(desk, words, loaded, request, actor, false))
  const flows = desk.staff
    ? ''
    : await (async () => {
        const all = await listFlows(env, site.id)
        const steps = (flow: (typeof all)[number]) => flow.rule.steps.map((step) => `${step.label} (${words.approverKind[step.approver.by]}${step.above !== undefined ? `, ${words.above(step.above)}` : ''}${step.atMost !== undefined ? `, ${words.atMost(step.atMost)}` : ''})`).join(' → ')
        return `<h2>${words.flows}</h2>${all.length ? `<ul>${all.map((flow) => `<li>${escapeHtml(words.flowLine(flow.tableLabel, steps(flow), flow.waiting, Boolean(flow.enabled)))}</li>`).join('')}</ul>` : `<p>${escapeHtml(words.noFlows)}</p>`}`
      })()
  return office(
    site,
    desk,
    words.title,
    `<p>${escapeHtml(words.intro)}</p><h2>${words.waiting}</h2>${mine.join('') || `<p>${escapeHtml(words.noneWaiting)}</p>`}${others.length ? `<h2>${words.others}</h2>${others.join('')}` : ''}<h2>${words.recent}</h2>${recent.join('') || `<p>${escapeHtml(words.noneRecent)}</p>`}${flows}`,
    notice,
    status,
  )
}

const decisions = { approve: 'approved', reject: 'rejected', return: 'returned' } as const

/** The back office page at /approvals, for the owner and for staff. Staff see only what they may see, and decide only their own steps. */
export async function handleApprovalsOffice(request: Request, env: Env, url: URL, site: SiteRow, desk: Desk, name: string | undefined, id: string | undefined, extra: string | undefined, saved?: Notice) {
  const words = approvalWords(site)
  if (request.method !== 'POST') return name ? notFound() : approvalsPage(env, site, desk, saved ? { saved: words.saved } : undefined)
  if (!name || !/^\d{1,12}$/.test(id ?? '') || extra) return notFound()
  const actor = deskActor(desk)
  const table = await getTable(env, site.id, name)
  const row = table && (await getRecord(env, table, Number(id)))
  if (!table || !row || !maySee(table, await getRequest(env, row.id), row, actor)) return notFound()
  const form = await request.formData().catch((): null => null)
  const op = String(form?.get('op') ?? '')
  const outcome: Outcome =
    op === 'submit'
      ? await submit(env, site, table, row, actor)
      : op in decisions
        ? await decide(env, site, table, row, actor, decisions[op as keyof typeof decisions], String(form?.get('comment') ?? ''), { round: Number(form?.get('round')) || undefined, step: Number(form?.get('step')) })
        : { code: 'bad_op', error: 'Choose approve, reject or return.', status: 400 }
  if (outcome.error) return approvalsPage(env, site, desk, { error: outcome.error }, outcome.status)
  return see(url, `${desk.base}/approvals?saved=1#approval-${row.id}`)
}

// The API

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }, status })
const fail = (status: number, code: string, message: string) => json({ error: { code, message } }, status)

const readBody = async (request: Request) => {
  const text = await request.text().catch(() => '')
  if (text.length > 16_384) return null
  try {
    const body = text ? (JSON.parse(text) as unknown) : {}
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** One record's approval, as the API and Claude show it. */
export async function approvalView(env: Env, table: DataTable, row: DataRow) {
  const request = await getRequest(env, row.id)
  const flow = await getFlow(env, table.id)
  return { table: table.name, id: row.id, ...describe(request), statusWord: request && flow ? statusWord(flow.rule, request.status) : undefined, history: (await history(env, row.id)).map((decision) => ({ at: decision.created_at, round: decision.round, step: decision.step + 1, stepLabel: decision.step_label, action: decision.action, by: decision.actor_name || decision.actor_role, role: decision.actor_role, comment: decision.comment })) }
}

/**
 * /api/v1/approvals: what waits for the caller, one record's approval and history, and sending or deciding.
 * Deciding needs the step the caller saw, so a repeated call can't approve the next step too.
 */
export async function handleApprovalsApi(request: Request, env: Env, site: SiteRow, actor: Actor, parts: string[]) {
  const [name, id, action, more] = parts
  if (more) return fail(404, 'not_found', 'There is nothing at this address.')
  if (!actor.admin && !actor.customer) return fail(401, 'not_logged_in', 'Please log in.')
  if (!name) {
    if (request.method !== 'GET') return fail(405, 'bad_method', 'Use GET.')
    const tables = new Map((await listTables(env, site.id)).map((table) => [table.id, table]))
    const { results } = await env.DB.prepare("SELECT approval_requests.* FROM approval_requests JOIN data_tables ON data_tables.id = approval_requests.table_id WHERE data_tables.site_id = ? AND (approval_requests.status = 'pending' OR approval_requests.requester_id = ?) ORDER BY approval_requests.updated_at DESC LIMIT 200").bind(site.id, actor.customer?.id ?? -1).all<RequestRow>()
    const waiting = []
    const mine = []
    for (const item of results) {
      const table = tables.get(item.table_id)
      if (!table) continue
      if (item.requester_id !== null && item.requester_id === actor.customer?.id) mine.push({ table: table.name, id: item.record_id, ...describe(item) })
      else if (item.status === 'pending' && !('error' in (await mayDecide(env, table, item, actor)))) waiting.push({ table: table.name, id: item.record_id, ...describe(item) })
    }
    return json({ waiting, mine })
  }
  if (!/^\d{1,12}$/.test(id ?? '')) return fail(404, 'not_found', 'There is nothing at this address.')
  const table = await getTable(env, site.id, name)
  const row = table && (await getRecord(env, table, Number(id)))
  // Something the caller may not see looks the same as something that doesn't exist.
  if (!table || !row || !maySee(table, await getRequest(env, row.id), row, actor)) return fail(404, 'not_found', 'There is nothing at this address.')
  if (!action) return request.method === 'GET' ? json({ approval: await approvalView(env, table, row) }) : fail(405, 'bad_method', 'Use GET.')
  if (request.method !== 'POST') return fail(405, 'bad_method', 'Use POST.')
  if (!actor.admin && !(await allowAttempt(request, env, 'approval', 120, 3600))) return fail(429, 'too_many', 'Too many changes. Please wait a while.')
  const body = await readBody(request)
  if (!body) return fail(400, 'bad_body', 'Send a JSON object.')
  const comment = typeof body.comment === 'string' ? body.comment : ''
  let outcome: Outcome
  if (action === 'submit') outcome = await submit(env, site, table, row, actor, comment)
  else if (action in decisions) {
    const step = Number(body.step)
    if (!Number.isInteger(step) || step < 1) return fail(400, 'step_needed', 'Send step, the number of the step you are deciding, as shown by GET. It stops a repeated call from deciding the next step too.')
    outcome = await decide(env, site, table, row, actor, decisions[action as keyof typeof decisions], comment, { round: Number.isInteger(body.round) ? Number(body.round) : undefined, step })
  } else return fail(404, 'not_found', 'Use submit, approve, reject or return.')
  if (outcome.error) return fail(outcome.status, outcome.code ?? 'invalid', outcome.error)
  return json({ approval: await approvalView(env, table, row), rows_written: outcome.rowsWritten })
}

