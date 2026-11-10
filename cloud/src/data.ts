import { z } from 'zod'

import { allowAttempt } from './auth'
import { tellOwnerAboutRecord } from './email'
import { notFound, see } from './http'
import { isSafeHref } from './theme'
import type { Block, Customer, Env, SiteRow } from './types'
import { countConversion } from './stats'
import { staffPermissions } from './staff'
import { fireEvent } from './webhooks'

export const accessLevels = ['public', 'members', 'own', 'staff', 'owner'] as const
export const fieldTypes = ['text', 'textarea', 'number', 'boolean', 'date', 'time', 'email', 'phone', 'url', 'select', 'image', 'reference'] as const
export const maxTablesPerSite = 50
export const maxRecordsPerTable = 50_000
// Each index costs one more row written for every record added, changed or deleted in its table, so there are few.
export const maxIndexesPerTable = 4

const maxRecordBytes = 20_000
const reservedFields = ['id', 'created_at', 'updated_at', 'customer_id', 'mine', 'website', 'next', 'op', 'confirm', 'spots_left']
const namePattern = /^[a-z][a-z0-9_]{0,39}$/

export type Access = (typeof accessLevels)[number]
export type DataField = {
  capacityField?: string
  default?: boolean | number | string
  ignoreField?: string
  ignoreValues?: string[]
  indexed?: boolean
  label: string
  name: string
  options?: string[]
  readOnly?: boolean
  required?: boolean
  setOnce?: boolean
  staffOnly?: boolean
  table?: string
  type: (typeof fieldTypes)[number]
  unique?: '' | 'customer' | 'table'
}
// indexed: the fields whose index was last built, comma separated. NULL for tables saved before indexes existed.
export type DataTable = { fields: DataField[]; id: number; indexed: null | string; label: string; name: string; read_access: Access; record_count: number; write_access: Access }
export type DataRow = { created_at: string; customer_id: null | number; data: string; id: number; updated_at: string }
// quiet: an automation's own write, which tells the owner only when its rule says so.
export type Actor = { admin: boolean; customer: Customer | null; quiet?: boolean; readOnly?: boolean }

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
          staffOnly: z.boolean().optional().describe('Only staff and the owner can see or change this field, such as a private note'),
          readOnly: z.boolean().optional().describe('Everyone who can read the record can see this field, but only staff and the owner can change it, such as a booking status'),
          setOnce: z.boolean().optional().describe('Customers can fill this in when adding a record, but only staff and the owner can change it afterwards, such as the session they booked'),
          capacityField: z.string().regex(namePattern).optional().describe('On a reference field: the number field of the record it points to that limits how many records can point to it, such as seats. Enforced by the database, so it cannot be overbooked.'),
          unique: z.enum(['', 'table', 'customer']).optional().describe('table: no two records can have the same value. customer: one customer cannot use the same value twice, such as booking the same class twice.'),
          ignoreField: z.string().regex(namePattern).optional().describe('With capacityField or unique: records are not counted when this field has one of ignoreValues, such as a status of cancelled'),
          ignoreValues: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
          indexed: z.boolean().optional().describe(`Makes filtering on this field fast on big tables, for fields with many different values such as a customer number or an email. Unique and reference fields are fast already. Each fast field costs one extra write per record, and a table can have up to ${maxIndexesPerTable}.`),
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
      if (field.capacityField && field.type !== 'reference') problem(`The field "${field.name}" can only have a capacity if it is a reference.`)
      if (field.setOnce && (field.staffOnly || field.readOnly)) problem(`The field "${field.name}" can't be set once if customers can't set it at all.`)
      if (field.staffOnly && field.readOnly) problem(`The field "${field.name}" can't be both staff only and read only.`)
      if (field.ignoreField && !table.fields.some((other) => other.name === field.ignoreField)) problem(`The field "${field.name}" ignores records by "${field.ignoreField}", which this table doesn't have.`)
      if (field.ignoreField && !field.ignoreValues?.length) problem(`The field "${field.name}" needs the values to ignore.`)
      if (field.indexed && field.type === 'boolean') problem(`The field "${field.name}" has only two values, so making it fast to filter wouldn't help.`)
    })
    if (table.fields.filter((field) => field.unique || field.indexed).length > maxIndexesPerTable) context.addIssue({ code: 'custom', message: `A table can have up to ${maxIndexesPerTable} fields that are unique or fast to filter.`, path: ['fields'] })
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

/** A table's id written into SQL, so the database can use the indexes made for that table alone. */
const tableKey = (table: Pick<DataTable, 'id'>) => {
  if (!Number.isSafeInteger(table.id) || table.id < 1) throw new Error('Bad table id')
  return table.id
}

/**
 * The fields the database keeps an index on, so a filter on a rare value reads only the matching records.
 * Unique fields come first because their check runs on every write, then the fields asked for, then references,
 * which pages and lines of an invoice are looked up by. Each index covers one table only (a partial index),
 * so it costs nothing when records of other tables are written.
 */
export function indexedFields(fields: DataField[]) {
  const ranked = [...fields.filter((field) => field.unique), ...fields.filter((field) => field.indexed && !field.unique), ...fields.filter((field) => field.type === 'reference' && !field.unique && !field.indexed)]
  return ranked.slice(0, maxIndexesPerTable).map((field) => field.name).sort()
}

const indexName = (table: Pick<DataTable, 'id'>, field: string) => `data_field_${tableKey(table)}_${field}`

/** Makes the database's indexes match the table's fields. Field names were checked against namePattern, so they are safe in SQL. */
async function syncIndexes(env: Env, table: Pick<DataTable, 'fields' | 'id'>) {
  const want = indexedFields(table.fields)
  const { results } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'data_records' AND name GLOB ?").bind(`data_field_${tableKey(table)}_*`).all<{ name: string }>()
  const have = new Set(results.map((row) => row.name))
  const names = new Set(want.map((field) => indexName(table, field)))
  const steps = [
    ...[...have].filter((name) => !names.has(name)).map((name) => env.DB.prepare(`DROP INDEX IF EXISTS ${name}`)),
    ...want.filter((field) => !have.has(indexName(table, field))).map((field) => env.DB.prepare(`CREATE INDEX IF NOT EXISTS ${indexName(table, field)} ON data_records (json_extract(data, '$.${field}')) WHERE table_id = ${tableKey(table)}`)),
    env.DB.prepare('UPDATE data_tables SET indexed = ? WHERE id = ?').bind(want.join(','), table.id),
  ]
  await env.DB.batch(steps)
  return want.join(',')
}

/** Tables saved before indexes existed get theirs on their next write, so nobody has to do anything after an update. */
async function ensureIndexes(env: Env, table: DataTable) {
  if (table.indexed !== indexedFields(table.fields).join(',')) table.indexed = await syncIndexes(env, table)
}

/** Deletes a table, its records and its indexes. */
export async function deleteTable(env: Env, siteId: number, table: Pick<DataTable, 'id'>) {
  const { results } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'data_records' AND name GLOB ?").bind(`data_field_${tableKey(table)}_*`).all<{ name: string }>()
  const [deleted] = await env.DB.batch([env.DB.prepare('DELETE FROM data_tables WHERE id = ? AND site_id = ?').bind(table.id, siteId), ...results.map((row) => env.DB.prepare(`DROP INDEX IF EXISTS ${row.name}`))])
  return Boolean(deleted.meta.changes)
}

export async function getTable(env: Env, siteId: number, name: string) {
  if (!namePattern.test(name)) return null
  const row = await env.DB.prepare('SELECT id, name, label, fields, indexed, read_access, write_access, record_count FROM data_tables WHERE site_id = ? AND name = ?').bind(siteId, name).first<Omit<DataTable, 'fields'> & { fields: string }>()
  return row ? tableFrom(row) : null
}

export async function listTables(env: Env, siteId: number) {
  const { results } = await env.DB.prepare('SELECT id, name, label, fields, indexed, read_access, write_access, record_count FROM data_tables WHERE site_id = ? ORDER BY name').bind(siteId).all<Omit<DataTable, 'fields'> & { fields: string }>()
  return results.map(tableFrom)
}

/** Creates a table or changes its fields. Existing records keep their values, and a removed field simply stops showing. */
export async function saveTable(env: Env, siteId: number, table: z.infer<typeof tableSchema>, createOnly = false) {
  const existing = await getTable(env, siteId, table.name)
  if (!existing) {
    const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM data_tables WHERE site_id = ?').bind(siteId).first<{ total: number }>()
    if ((count?.total ?? 0) >= maxTablesPerSite) return `A site can have up to ${maxTablesPerSite} tables.`
  }
  for (const field of table.fields) {
    if (field.type !== 'reference') continue
    const target = field.table === table.name ? null : await getTable(env, siteId, field.table!)
    if (field.table !== table.name && !target) return `The field "${field.name}" points to a table that doesn't exist yet: ${field.table}. Create that table first.`
    if (field.capacityField && (field.table === table.name ? table.fields : target!.fields).find((other) => other.name === field.capacityField)?.type !== 'number') return `The field "${field.name}" takes its capacity from "${field.capacityField}", which must be a number field of the table ${field.table}.`
  }
  const saved = await env.DB.prepare(`INSERT INTO data_tables (site_id, name, label, fields, read_access, write_access) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (site_id, name) ${createOnly ? 'DO NOTHING' : "DO UPDATE SET label = excluded.label, fields = excluded.fields, read_access = excluded.read_access, write_access = excluded.write_access, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"} RETURNING id`)
    .bind(siteId, table.name, table.label, JSON.stringify(table.fields), table.readAccess, table.writeAccess)
    .first<{ id: number }>()
  if (!saved && createOnly) return 'already-exists'
  // Only missing indexes are built. Building one reads every record of the table once.
  if (saved) await syncIndexes(env, { fields: table.fields as DataField[], id: saved.id })
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
export async function readInput(env: Env, siteId: number, table: DataTable, input: Record<string, unknown>, actor: Actor, existing?: Record<string, unknown>) {
  const data: Record<string, unknown> = {}
  for (const field of table.fields) {
    const held = existing?.[field.name]
    const allowed = !(field.staffOnly || field.readOnly || (existing && field.setOnce)) || isStaff(actor)
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

type ListOptions = { after?: number; filters?: Record<string, string>; limit?: number; newestFirst?: boolean; owner?: number }

export async function listRecords(env: Env, table: DataTable, actor: Actor, options: ListOptions = {}) {
  const scope = readScope(table, actor)
  if (!scope) return { error: 'forbidden' as const }
  const where = [`table_id = ${tableKey(table)}`]
  const values: unknown[] = []
  // The record block narrows a readable table to just the viewer's own rows, the only ones they may change.
  if (scope === 'mine' || options.owner !== undefined) {
    where.push('customer_id = ?')
    values.push(options.owner ?? actor.customer!.id)
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

type Saved = { code?: 'duplicate' | 'full' | 'locked'; error?: string; field?: string; row?: DataRow }

/**
 * A record waiting for approval can't change, so nobody edits it under an approver. Once approved, only the owner,
 * or the owner's automations, can change or delete it. Checked by the database in the same step as the write. See approvals.ts.
 */
export const approvalLock = (actor: Pick<Actor, 'admin'>) => `NOT EXISTS (SELECT 1 FROM approval_requests a WHERE a.record_id = data_records.id AND a.status IN (${actor.admin ? "'pending'" : "'pending', 'approved'"}))`

const lockedNow = async (env: Env, id: number, actor: Actor): Promise<Saved | null> => {
  const locked = await env.DB.prepare(`SELECT 1 AS locked FROM data_records WHERE id = ? AND NOT ${approvalLock(actor)}`).bind(id).first()
  return locked ? { code: 'locked', error: actor.admin ? 'This record is waiting for approval, so it cannot change now. Return it, or wait for the decision.' : 'This record is waiting for approval or already approved, so it cannot change.' } : null
}

const isIgnored = (field: DataField, data: Record<string, unknown>) => Boolean(field.ignoreField && field.ignoreValues?.includes(String(data[field.ignoreField] ?? '')))

const counted = (field: DataField, alias: string) => (field.ignoreField && field.ignoreValues?.length ? { sql: ` AND COALESCE(json_extract(${alias}.data, '$.${field.ignoreField}'), '') NOT IN (${field.ignoreValues.map(() => '?').join(', ')})`, values: field.ignoreValues as unknown[] } : { sql: '', values: [] as unknown[] })

type Guard = { code: 'duplicate' | 'full'; field: DataField; sql: string; values: unknown[] }

/** Conditions the database checks in the same step as a write, so two people can't take the last seat at once. Field names were checked when the table was saved. */
export function writeGuards(table: DataTable, data: Record<string, unknown>, customerId: null | number, self?: DataRow) {
  const before = self ? (JSON.parse(self.data) as Record<string, unknown>) : null
  const guards: Guard[] = []
  for (const field of table.fields) {
    const value = data[field.name]
    if (value === undefined || isIgnored(field, data)) continue
    // A change that doesn't add to the count is always fine, even if a limit was lowered later.
    if (before && before[field.name] === value && !isIgnored(field, before)) continue
    const live = counted(field, 'r')
    const others = self ? ' AND r.id != ?' : ''
    const otherValues = self ? [self.id] : []
    const same = `r.table_id = ${tableKey(table)} AND json_extract(r.data, '$.${field.name}') = ?${live.sql}${others}`
    const sameValues = [value, ...live.values, ...otherValues]
    if (field.unique === 'table') guards.push({ code: 'duplicate', field, sql: `NOT EXISTS (SELECT 1 FROM data_records r WHERE ${same})`, values: sameValues })
    // Someone who already has a place should hear that, not that the session is full.
    if (field.unique === 'customer' && customerId !== null) guards.push({ code: 'duplicate', field, sql: `NOT EXISTS (SELECT 1 FROM data_records r WHERE r.customer_id = ? AND ${same})`, values: [customerId, ...sameValues] })
    if (field.capacityField) guards.push({ code: 'full', field, sql: `(SELECT COUNT(*) FROM data_records r WHERE ${same}) < COALESCE((SELECT json_extract(p.data, '$.${field.capacityField}') FROM data_records p WHERE p.id = ?), 1000000000)`, values: [...sameValues, value] })
  }
  return guards
}

async function refused(env: Env, guards: Guard[]): Promise<Saved> {
  for (const guard of guards) {
    const check = await env.DB.prepare(`SELECT (${guard.sql}) AS ok`).bind(...guard.values).first<{ ok: number }>()
    if (!check?.ok) return { code: guard.code, error: guard.code === 'full' ? `"${guard.field.label}" is full.` : `"${guard.field.label}" is already taken.`, field: guard.field.name }
  }
  return { error: 'That could not be saved. Please try again.' }
}

export async function createRecord(env: Env, siteId: number, table: DataTable, input: Record<string, unknown>, actor: Actor): Promise<Saved> {
  if (table.record_count >= maxRecordsPerTable) return { error: `This table is full. It can hold up to ${maxRecordsPerTable} records.` }
  await ensureIndexes(env, table)
  const read = await readInput(env, siteId, table, input, actor)
  if (!read.data) return { error: read.error, field: read.field }
  const guards = writeGuards(table, read.data, actor.customer?.id ?? null)
  const row = await env.DB.prepare(`INSERT INTO data_records (table_id, customer_id, data, test) SELECT ?, ?, ?, ? WHERE ${guards.map((guard) => guard.sql).join(' AND ') || '1'} RETURNING id, customer_id, data, created_at, updated_at`)
    .bind(table.id, actor.customer?.id ?? null, JSON.stringify(read.data), env.test ? 1 : 0, ...guards.flatMap((guard) => guard.values))
    .first<DataRow>()
  if (!row) return refused(env, guards)
  await env.DB.prepare('UPDATE data_tables SET record_count = record_count + 1 WHERE id = ?').bind(table.id).run()
  await fireEvent(env, siteId, 'record.created', { table: table.name, record: showRecord(table, row, ownerActor) })
  // The owner already knows about records they add in the back office or through Claude. Visitors, customers and connected sites count.
  if (actor !== ownerActor && !actor.quiet) await tellOwnerAboutRecord(env, table, row)
  return { row }
}

export async function updateRecord(env: Env, siteId: number, table: DataTable, row: DataRow, input: Record<string, unknown>, actor: Actor): Promise<Saved> {
  const read = await readInput(env, siteId, table, input, actor, JSON.parse(row.data))
  if (!read.data) return { error: read.error, field: read.field }
  await ensureIndexes(env, table)
  const guards = writeGuards(table, read.data, row.customer_id, row)
  const updated = await env.DB.prepare(`UPDATE data_records SET data = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND table_id = ? AND ${approvalLock(actor)}${guards.map((guard) => ` AND ${guard.sql}`).join('')} RETURNING id, customer_id, data, created_at, updated_at`)
    .bind(JSON.stringify(read.data), row.id, table.id, ...guards.flatMap((guard) => guard.values))
    .first<DataRow>()
  if (!updated) return (await lockedNow(env, row.id, actor)) ?? refused(env, guards)
  await fireEvent(env, siteId, 'record.updated', { table: table.name, record: showRecord(table, updated, ownerActor) }, JSON.parse(row.data))
  return { row: updated }
}

/** Deletes a record, unless approvals lock it for this person. Says whether it went. */
export async function deleteRecord(env: Env, siteId: number, table: DataTable, row: DataRow, actor: Actor = ownerActor) {
  // One batch runs as one transaction, so the count drops if and only if the record went. changes() is the delete's.
  const [deleted] = await env.DB.batch([
    env.DB.prepare(`DELETE FROM data_records WHERE id = ? AND table_id = ? AND ${actor.admin ? '1' : approvalLock(actor)} RETURNING id`).bind(row.id, table.id),
    env.DB.prepare('UPDATE data_tables SET record_count = MAX(record_count - changes(), 0) WHERE id = ?').bind(table.id),
  ])
  if (!deleted.results.length) return false
  await fireEvent(env, siteId, 'record.deleted', { table: table.name, id: row.id })
  return true
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

/** How many places are left on each record, for tables that other tables book against. */
export async function spotsLeft(env: Env, siteId: number, parent: DataTable, rows: DataRow[]) {
  const left = new Map<number, number>()
  if (!rows.length) return left
  for (const child of await listTables(env, siteId)) {
    for (const field of child.fields) {
      if (field.type !== 'reference' || field.table !== parent.name || !field.capacityField) continue
      const live = counted(field, 'data_records')
      const { results } = await env.DB.prepare(`SELECT json_extract(data, '$.${field.name}') AS target, COUNT(*) AS used FROM data_records WHERE table_id = ${tableKey(child)}${live.sql} GROUP BY target`).bind(...live.values).all<{ target: number; used: number }>()
      const used = new Map(results.map((row) => [row.target, row.used]))
      for (const row of rows) {
        const capacity = (JSON.parse(row.data) as Record<string, unknown>)[field.capacityField]
        if (typeof capacity === 'number') left.set(row.id, Math.max(capacity - (used.get(row.id) ?? 0), 0))
      }
    }
  }
  return left
}

export type PageRecords = {
  labels: Map<string, string>
  left: Map<number, number>
  options: Map<string, { full: boolean; id: number; label: string }[]>
  rows: DataRow[]
  scope: 'all' | 'mine' | null
  table: DataTable
}

/** Loads what the records and record-form blocks of a page need, respecting who is looking. */
export async function loadPageRecords(env: Env, siteId: number, blocks: Block[], actor: Actor) {
  const loaded = new Map<number, PageRecords>()
  for (const [index, block] of blocks.entries()) {
    if (block.type !== 'records' && block.type !== 'record-form' && block.type !== 'record') continue
    const table = await getTable(env, siteId, block.table)
    if (!table) continue
    const scope = readScope(table, actor)
    const page: PageRecords = { labels: new Map(), left: new Map(), options: new Map(), rows: [], scope, table }
    const references = table.fields.filter((field) => field.type === 'reference')
    if (block.type === 'records' && scope) {
      const list = await listRecords(env, table, actor, { limit: Number(block.limit) || 24, newestFirst: block.newestFirst !== false })
      page.rows = list.rows ?? []
      page.left = await spotsLeft(env, siteId, table, page.rows)
    }
    // The record block shows the viewer their own records as editable forms, so it loads only rows they may change.
    if (block.type === 'record' && scope && actor.customer) {
      const list = await listRecords(env, table, actor, { limit: Number(block.limit) || 24, newestFirst: block.newestFirst !== false, owner: actor.customer.id })
      page.rows = list.rows ?? []
      page.left = await spotsLeft(env, siteId, table, page.rows)
    }
    for (const field of references) {
      const target = await getTable(env, siteId, field.table!)
      if (!target || readScope(target, actor) !== 'all') continue
      const list = await listRecords(env, target, actor, { limit: 100 })
      for (const row of list.rows ?? []) page.labels.set(`${field.name}:${row.id}`, labelOf(target, row))
      if (block.type === 'record-form' || block.type === 'record') {
        const left = await spotsLeft(env, siteId, target, list.rows ?? [])
        page.options.set(field.name, (list.rows ?? []).map((row) => ({ full: left.get(row.id) === 0, id: row.id, label: labelOf(target, row) })))
      }
    }
    loaded.set(index, page)
  }
  return loaded
}

const safePath = (value: unknown) => (typeof value === 'string' && /^\/[a-z0-9-]*$/.test(value) ? value : '/')

/** Receives the record-form block, and the delete button of the records block. These pages run no scripts, so both are plain forms. */
export async function receiveRecord(request: Request, env: Env, url: URL, site: SiteRow, actor: Actor, name: string, id?: number, remove?: boolean) {
  const form = await request.formData().catch((): null => null)
  const path = safePath(form?.get('next'))
  const back = (state: 'error' | 'sent', why?: string) => see(url, `${path}?${state}=record-${name}${why ? `&why=${why}` : ''}#record-${name}`)
  const table = await getTable(env, site.id, name)
  if (!form || !table) return see(url, path)
  if (id) {
    const row = await getRecord(env, table, id)
    // On the public site, staff change other people's records only if the owner gave them the data area of the back office.
    const mayChange = async (found: DataRow) => {
      if (!canChange(table, actor, found)) return false
      if (actor.admin || actor.customer?.role !== 'staff' || found.customer_id === actor.customer.id) return true
      return (await staffPermissions(env, actor.customer.id)).includes('data')
    }
    if (remove) {
      // Keep the actor: deleteRecord also refuses deletions while a request is pending or approved.
      if (row && (await mayChange(row))) await deleteRecord(env, site.id, table, row, actor)
      return see(url, path)
    }
    // Editing one of your own records. Someone else's, or a missing one, looks the same so an id can't be probed.
    if (!row || !(await mayChange(row))) return notFound()
    // A checkbox that isn't ticked sends nothing, so only the boxes the form says it showed are changed.
    // Every other field keeps its value, such as a "paid" box the block doesn't show.
    const boxes = new Set(form.getAll('_box').map(String))
    const input: Record<string, unknown> = {}
    for (const field of table.fields) {
      if (field.type === 'boolean') {
        if (boxes.has(field.name)) input[field.name] = form.get(field.name) === 'on'
      } else if (form.has(field.name)) input[field.name] = String(form.get(field.name))
    }
    // readInput drops staff-only, read-only and set-once fields for a customer, so those keep their value whatever is sent.
    const saved = await updateRecord(env, site.id, table, row, input, actor)
    return saved.row ? back('sent') : back('error', saved.code)
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
  if (saved.row) await countConversion(env, site, 'record')
  return saved.row ? back('sent') : back('error', saved.code)
}
