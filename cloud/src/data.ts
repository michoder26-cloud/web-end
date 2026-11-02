import { z } from 'zod'

import { allowAttempt } from './auth'
import { see } from './http'
import { isSafeHref } from './theme'
import type { Block, Customer, Env, SiteRow } from './types'
import { fireEvent } from './webhooks'

export const accessLevels = ['public', 'members', 'own', 'staff', 'owner'] as const
export const fieldTypes = ['text', 'textarea', 'number', 'boolean', 'date', 'time', 'email', 'phone', 'url', 'select', 'image', 'reference'] as const
export const maxTablesPerSite = 50
export const maxRecordsPerTable = 50_000

const maxRecordBytes = 20_000
const reservedFields = ['id', 'created_at', 'updated_at', 'customer_id', 'mine', 'website', 'next', 'op', 'confirm']
const namePattern = /^[a-z][a-z0-9_]{0,39}$/

export type Access = (typeof accessLevels)[number]
export type DataField = {
  default?: boolean | number | string
  label: string
  name: string
  options?: string[]
  required?: boolean
  staffOnly?: boolean
  table?: string
  type: (typeof fieldTypes)[number]
}
export type DataTable = { fields: DataField[]; id: number; label: string; name: string; read_access: Access; record_count: number; write_access: Access }
export type DataRow = { created_at: string; customer_id: null | number; data: string; id: number; updated_at: string }
export type Actor = { admin: boolean; customer: Customer | null; readOnly?: boolean }

export const ownerActor: Actor = { admin: true, customer: null }

export const tableBase = z.object({
    name: z.string().regex(namePattern).describe('Short English name used in links and code, such as bookings'),
    label: z.string().trim().min(1).max(80).describe('The name people see, in the language of the site'),
    fields: z
      .array(
        z.object({
          name: z.string().regex(namePattern).refine((name) => !reservedFields.includes(name), 'That name is reserved.'),
          label: z.string().trim().min(1).max(80),
          type: z.enum(fieldTypes),
          required: z.boolean().optional(),
          options: z.array(z.string().trim().min(1).max(80)).max(100).optional().describe('The choices of a select field'),
          table: z.string().regex(namePattern).optional().describe('The table a reference field points to'),
          staffOnly: z.boolean().optional().describe('Only staff and the owner can see or change this field, such as a status or a private note'),
          default: z.union([z.string().max(500), z.number(), z.boolean()]).optional().describe('The value of a new record when none is given'),
        }),
      )
      .min(1)
      .max(40),
    readAccess: z.enum(accessLevels).describe('Who can read: public (anyone), members (logged-in customers), own (customers see only their own records), staff, or owner'),
    writeAccess: z.enum(accessLevels).describe('Who can add: public (anyone), members or own (logged-in customers, who can change only their own records), staff, or owner'),
})

export const tableSchema = tableBase.superRefine((table, context) => {
    const seen = new Set<string>()
    table.fields.forEach((field, index) => {
      const problem = (message: string) => context.addIssue({ code: 'custom', message, path: ['fields', index, 'name'] })
      if (seen.has(field.name)) problem(`The field "${field.name}" appears twice.`)
      seen.add(field.name)
      if (field.type === 'select' && !field.options?.length) problem(`The field "${field.name}" needs a list of options.`)
      if (field.type === 'reference' && !field.table) problem(`The field "${field.name}" needs the table it points to.`)
      if (field.default !== undefined && !('value' in coerce(field as DataField, field.default))) problem(`The default of "${field.name}" isn't valid for its type.`)
    })
})

const isStaff = (actor: Actor) => actor.admin || actor.customer?.role === 'staff'

/** Whether someone can read a table, and if so whether all of it or only their own records. */
export function readScope(table: Pick<DataTable, 'read_access'>, actor: Actor): 'all' | 'mine' | null {
  if (actor.admin) return 'all'
  if (table.read_access === 'owner') return null
  if (actor.customer?.role === 'staff' || table.read_access === 'public') return 'all'
  if (!actor.customer || table.read_access === 'staff') return null
  return table.read_access === 'own' ? 'mine' : 'all'
}

export function canCreate(table: Pick<DataTable, 'write_access'>, actor: Actor) {
  if (actor.readOnly) return false
  if (actor.admin) return true
  if (table.write_access === 'owner') return false
  if (actor.customer?.role === 'staff' || table.write_access === 'public') return true
  return Boolean(actor.customer) && table.write_access !== 'staff'
}

export function canChange(table: Pick<DataTable, 'write_access'>, actor: Actor, row: Pick<DataRow, 'customer_id'>) {
  if (actor.readOnly) return false
  if (actor.admin) return true
  if (table.write_access === 'owner') return false
  if (actor.customer?.role === 'staff') return true
  return table.write_access !== 'staff' && Boolean(actor.customer) && row.customer_id === actor.customer?.id
}

const tableFrom = (row: Omit<DataTable, 'fields'> & { fields: string }): DataTable => ({ ...row, fields: JSON.parse(row.fields) as DataField[] })

export async function getTable(env: Env, siteId: number, name: string) {
  if (!namePattern.test(name)) return null
  const row = await env.DB.prepare('SELECT id, name, label, fields, read_access, write_access, record_count FROM data_tables WHERE site_id = ? AND name = ?').bind(siteId, name).first<Omit<DataTable, 'fields'> & { fields: string }>()
  return row ? tableFrom(row) : null
}

export async function listTables(env: Env, siteId: number) {
  const { results } = await env.DB.prepare('SELECT id, name, label, fields, read_access, write_access, record_count FROM data_tables WHERE site_id = ? ORDER BY name').bind(siteId).all<Omit<DataTable, 'fields'> & { fields: string }>()
  return results.map(tableFrom)
}

/** Creates a table or changes its fields. Existing records keep their values, and a removed field simply stops showing. */
export async function saveTable(env: Env, siteId: number, table: z.infer<typeof tableSchema>) {
  const existing = await getTable(env, siteId, table.name)
  if (!existing) {
    const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM data_tables WHERE site_id = ?').bind(siteId).first<{ total: number }>()
    if ((count?.total ?? 0) >= maxTablesPerSite) return `A site can have up to ${maxTablesPerSite} tables.`
  }
  for (const field of table.fields) {
    if (field.type === 'reference' && field.table !== table.name && !(await getTable(env, siteId, field.table!))) return `The field "${field.name}" points to a table that doesn't exist yet: ${field.table}. Create that table first.`
  }
  await env.DB.prepare(`INSERT INTO data_tables (site_id, name, label, fields, read_access, write_access) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (site_id, name) DO UPDATE SET label = excluded.label, fields = excluded.fields, read_access = excluded.read_access, write_access = excluded.write_access, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`)
    .bind(siteId, table.name, table.label, JSON.stringify(table.fields), table.readAccess, table.writeAccess)
    .run()
  return null
}

function coerce(field: DataField, raw: unknown): { error: string } | { value: boolean | number | string } {
  const invalid = { error: `"${field.label}" isn't valid.` }
  if (field.type === 'boolean') return raw === true || raw === 'true' || raw === 'on' || raw === 1 ? { value: true } : raw === false || raw === 'false' || raw === 0 ? { value: false } : invalid
  if (field.type === 'number' || field.type === 'reference') {
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN
    if (!Number.isFinite(value)) return invalid
    return field.type === 'reference' && (!Number.isInteger(value) || value < 1) ? invalid : { value }
  }
  if (typeof raw !== 'string' && typeof raw !== 'number') return invalid
  const value = String(raw).trim()
  if (value.length > (field.type === 'textarea' ? 10_000 : 500)) return { error: `"${field.label}" is too long.` }
  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return invalid
  if (field.type === 'phone' && !/^[+\d][\d\s()-]{4,29}$/.test(value)) return invalid
  if (field.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))) return invalid
  if (field.type === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return invalid
  if (field.type === 'url' && !(isSafeHref(value) && /^(https:|mailto:|tel:)/.test(value))) return invalid
  if (field.type === 'image' && !value.startsWith('https://') && !/^\/media\/\d+$/.test(value)) return invalid
  if (field.type === 'select' && !field.options?.includes(value)) return invalid
  return { value }
}

const blank = (value: unknown) => value === undefined || value === null || value === ''

/** Checks what someone sent against the table's fields. Anything the table doesn't define is dropped. */
async function readInput(env: Env, siteId: number, table: DataTable, input: Record<string, unknown>, actor: Actor, existing?: Record<string, unknown>) {
  const data: Record<string, unknown> = {}
  for (const field of table.fields) {
    const held = existing?.[field.name]
    const allowed = !field.staffOnly || isStaff(actor)
    const raw = allowed ? input[field.name] : undefined
    if (raw === undefined && existing) {
      if (held !== undefined) data[field.name] = held
      continue
    }
    if (blank(raw)) {
      const start = !existing && field.default !== undefined ? coerce(field, field.default) : null
      if (start && 'value' in start) data[field.name] = start.value
      else if (field.required && allowed) return { error: `"${field.label}" is required.`, field: field.name }
      continue
    }
    const read = coerce(field, raw)
    if ('error' in read) return { error: read.error, field: field.name }
    if (field.type === 'reference') {
      const found = await env.DB.prepare('SELECT data_records.id FROM data_records JOIN data_tables ON data_tables.id = data_records.table_id WHERE data_records.id = ? AND data_tables.site_id = ? AND data_tables.name = ?').bind(read.value, siteId, field.table!).first()
      if (!found) return { error: `"${field.label}" points to a record that doesn't exist.`, field: field.name }
    }
    data[field.name] = read.value
  }
  if (JSON.stringify(data).length > maxRecordBytes) return { error: 'That record is too large.' }
  return { data }
}

/** What someone is allowed to see of a record. Fields only staff can read never leave the database for anyone else. */
export function showRecord(table: DataTable, row: DataRow, actor: Actor) {
  const data = JSON.parse(row.data) as Record<string, unknown>
  const shown: Record<string, unknown> = { id: row.id }
  for (const field of table.fields) if ((!field.staffOnly || isStaff(actor)) && data[field.name] !== undefined) shown[field.name] = data[field.name]
  if (isStaff(actor)) shown.customer_id = row.customer_id
  if (actor.customer && row.customer_id === actor.customer.id) shown.mine = true
  return { ...shown, created_at: row.created_at, updated_at: row.updated_at }
}

type ListOptions = { after?: number; filters?: Record<string, string>; limit?: number; newestFirst?: boolean }

export async function listRecords(env: Env, table: DataTable, actor: Actor, options: ListOptions = {}) {
  const scope = readScope(table, actor)
  if (!scope) return { error: 'forbidden' as const }
  const where = ['table_id = ?']
  const values: unknown[] = [table.id]
  if (scope === 'mine') {
    where.push('customer_id = ?')
    values.push(actor.customer!.id)
  }
  for (const [name, value] of Object.entries(options.filters ?? {})) {
    const field = table.fields.find((item) => item.name === name)
    // Filtering on a hidden field would reveal its values one guess at a time.
    if (!field || (field.staffOnly && !isStaff(actor))) return { error: 'filter' as const, field: name }
    where.push(`json_extract(data, '$.${name}') = ?`)
    values.push(field.type === 'number' || field.type === 'reference' ? Number(value) : field.type === 'boolean' ? (value === 'true' ? 1 : 0) : value)
  }
  if (options.after) {
    where.push(options.newestFirst ? 'id < ?' : 'id > ?')
    values.push(options.after)
  }
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const { results } = await env.DB.prepare(`SELECT id, customer_id, data, created_at, updated_at FROM data_records WHERE ${where.join(' AND ')} ORDER BY id ${options.newestFirst ? 'DESC' : 'ASC'} LIMIT ?`).bind(...values, limit + 1).all<DataRow>()
  const rows = results.slice(0, limit)
  return { next: results.length > limit ? rows.at(-1)!.id : null, rows }
}

export const getRecord = (env: Env, table: DataTable, id: number) => env.DB.prepare('SELECT id, customer_id, data, created_at, updated_at FROM data_records WHERE id = ? AND table_id = ?').bind(id, table.id).first<DataRow>()

type Saved = { error?: string; field?: string; row?: DataRow }

export async function createRecord(env: Env, siteId: number, table: DataTable, input: Record<string, unknown>, actor: Actor): Promise<Saved> {
  if (table.record_count >= maxRecordsPerTable) return { error: `This table is full. It can hold up to ${maxRecordsPerTable} records.` }
  const read = await readInput(env, siteId, table, input, actor)
  if (!read.data) return { error: read.error, field: read.field }
  const [inserted] = await env.DB.batch<DataRow>([
    env.DB.prepare('INSERT INTO data_records (table_id, customer_id, data) VALUES (?, ?, ?) RETURNING id, customer_id, data, created_at, updated_at').bind(table.id, actor.customer?.id ?? null, JSON.stringify(read.data)),
    env.DB.prepare('UPDATE data_tables SET record_count = record_count + 1 WHERE id = ?').bind(table.id),
  ])
  const row = inserted.results[0]
  await fireEvent(env, siteId, 'record.created', { table: table.name, record: showRecord(table, row, ownerActor) })
  return { row }
}

export async function updateRecord(env: Env, siteId: number, table: DataTable, row: DataRow, input: Record<string, unknown>, actor: Actor): Promise<Saved> {
  const read = await readInput(env, siteId, table, input, actor, JSON.parse(row.data))
  if (!read.data) return { error: read.error, field: read.field }
  const updated = await env.DB.prepare("UPDATE data_records SET data = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND table_id = ? RETURNING id, customer_id, data, created_at, updated_at").bind(JSON.stringify(read.data), row.id, table.id).first<DataRow>()
  await fireEvent(env, siteId, 'record.updated', { table: table.name, record: showRecord(table, updated!, ownerActor) })
  return { row: updated! }
}

export async function deleteRecord(env: Env, siteId: number, table: DataTable, row: DataRow) {
  await env.DB.batch([env.DB.prepare('DELETE FROM data_records WHERE id = ? AND table_id = ?').bind(row.id, table.id), env.DB.prepare('UPDATE data_tables SET record_count = MAX(record_count - 1, 0) WHERE id = ?').bind(table.id)])
  await fireEvent(env, siteId, 'record.deleted', { table: table.name, id: row.id })
}

/** Spreadsheets run a cell that starts with these characters as a formula, so they get a leading quote. */
const csvCell = (value: unknown) => {
  const text = value === undefined || value === null ? '' : String(value)
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

export async function recordsCsv(env: Env, table: DataTable) {
  const { results } = await env.DB.prepare('SELECT id, customer_id, data, created_at, updated_at FROM data_records WHERE table_id = ? ORDER BY id LIMIT 5000').bind(table.id).all<DataRow>()
  const names = table.fields.map((field) => field.name)
  const rows = results.map((row) => {
    const data = JSON.parse(row.data) as Record<string, unknown>
    return [row.id, ...names.map((name) => data[name]), row.created_at].map(csvCell).join(',')
  })
  return `﻿${['id', ...names, 'created_at'].join(',')}\n${rows.join('\n')}`
}

const firstLabelField = (table: DataTable) => table.fields.find((field) => !field.staffOnly && ['text', 'email', 'select'].includes(field.type))

const labelOf = (table: DataTable, row: DataRow) => {
  const field = firstLabelField(table)
  const value = field ? (JSON.parse(row.data) as Record<string, unknown>)[field.name] : undefined
  return typeof value === 'string' && value ? value : `#${row.id}`
}

export type PageRecords = {
  labels: Map<string, string>
  options: Map<string, { id: number; label: string }[]>
  rows: DataRow[]
  scope: 'all' | 'mine' | null
  table: DataTable
}

/** Loads what the records and record-form blocks of a page need, respecting who is looking. */
export async function loadPageRecords(env: Env, siteId: number, blocks: Block[], actor: Actor) {
  const loaded = new Map<number, PageRecords>()
  for (const [index, block] of blocks.entries()) {
    if (block.type !== 'records' && block.type !== 'record-form') continue
    const table = await getTable(env, siteId, block.table)
    if (!table) continue
    const scope = readScope(table, actor)
    const page: PageRecords = { labels: new Map(), options: new Map(), rows: [], scope, table }
    const references = table.fields.filter((field) => field.type === 'reference')
    if (block.type === 'records' && scope) {
      const list = await listRecords(env, table, actor, { limit: Number(block.limit) || 24, newestFirst: block.newestFirst !== false })
      page.rows = list.rows ?? []
    }
    for (const field of references) {
      const target = await getTable(env, siteId, field.table!)
      if (!target || readScope(target, actor) !== 'all') continue
      const list = await listRecords(env, target, actor, { limit: 100 })
      for (const row of list.rows ?? []) page.labels.set(`${field.name}:${row.id}`, labelOf(target, row))
      if (block.type === 'record-form') page.options.set(field.name, (list.rows ?? []).map((row) => ({ id: row.id, label: labelOf(target, row) })))
    }
    loaded.set(index, page)
  }
  return loaded
}

const safePath = (value: unknown) => (typeof value === 'string' && /^\/[a-z0-9-]*$/.test(value) ? value : '/')

/** Receives the record-form block, and the delete button of the records block. These pages run no scripts, so both are plain forms. */
export async function receiveRecord(request: Request, env: Env, url: URL, site: SiteRow, actor: Actor, name: string, id?: number) {
  const form = await request.formData().catch((): null => null)
  const path = safePath(form?.get('next'))
  const back = (state: 'error' | 'sent') => see(url, `${path}?${state}=record-${name}#record-${name}`)
  const table = await getTable(env, site.id, name)
  if (!form || !table) return see(url, path)
  if (id) {
    const row = await getRecord(env, table, id)
    if (row && canChange(table, actor, row)) await deleteRecord(env, site.id, table, row)
    return see(url, path)
  }
  // Bots fill in the hidden field. Tell them it worked and keep nothing.
  if (form.get('website')) return back('sent')
  if (!canCreate(table, actor)) return actor.customer ? back('error') : see(url, `/login?next=${encodeURIComponent(path)}`)
  if (!actor.admin && !(await allowAttempt(request, env, 'record', 60, 3600))) return back('error')
  const input: Record<string, unknown> = {}
  for (const field of table.fields) {
    if (field.type === 'boolean') input[field.name] = form.get(field.name) === 'on'
    else if (form.has(field.name)) input[field.name] = String(form.get(field.name))
  }
  const saved = await createRecord(env, site.id, table, input, actor)
  return back(saved.row ? 'sent' : 'error')
}
