import { getRecord, getTable, listRecords, readScope } from './data'
import type { Actor, DataField, DataRow, DataTable, PageRecords } from './data'
import type { Block, Env } from './types'

/** The table block: loading what the visitor may see, then searching, filtering, sorting and paging it in memory. Nothing here runs in the browser. */

export const tableScanLimit = 1000
const defaultPageSize = 20
const maxColumns = 12

export type TableLoaded = PageRecords & { capped?: boolean }

const isStaff = (actor: Actor) => actor.admin || actor.customer?.role === 'staff'

/** Fields this visitor may see: private (staffOnly) fields are dropped before anything is loaded or drawn. */
export const visibleFields = (table: Pick<DataTable, 'fields'>, actor: Actor) => table.fields.filter((field) => !field.staffOnly || isStaff(actor))

/** The columns to draw: the ones the owner chose and this visitor may see, in the owner's order. Without a choice: the first few short fields. */
export function tableColumns(table: Pick<DataTable, 'fields'>, block: Block, actor: Actor) {
  const visible = visibleFields(table, actor)
  const chosen = Array.isArray(block.columns) ? (block.columns as unknown[]).map(String) : null
  if (chosen?.length) return chosen.flatMap((name) => visible.find((field) => field.name === name) ?? []).slice(0, maxColumns)
  return visible.filter((field) => field.type !== 'textarea').slice(0, 6)
}

const firstLabelField = (table: DataTable) => table.fields.find((field) => !field.staffOnly && ['text', 'email', 'select'].includes(field.type))

const labelOf = (table: DataTable, row: DataRow) => {
  const field = firstLabelField(table)
  const value = field ? (JSON.parse(row.data) as Record<string, unknown>)[field.name] : undefined
  return typeof value === 'string' && value ? value : `#${row.id}`
}

/** Loads the rows each table block needs: all rows up to a limit (for a list), or the one row in ?row= (for a detail block). Respects who is looking. */
export async function loadTableBlocks(env: Env, siteId: number, blocks: Block[], actor: Actor, query: URLSearchParams, loaded: Map<number, PageRecords>) {
  for (const [index, block] of blocks.entries()) {
    if (block.type !== 'table') continue
    const table = await getTable(env, siteId, String(block.table))
    if (!table) continue
    const scope = readScope(table, actor)
    const page: TableLoaded = { labels: new Map(), left: new Map(), options: new Map(), rows: [], scope, table }
    if (scope && block.detail) {
      const id = query.get('row') ?? ''
      const row = /^\d{1,12}$/.test(id) ? await getRecord(env, table, Number(id)) : null
      if (row && (scope === 'all' || row.customer_id === actor.customer?.id)) page.rows = [row]
    } else if (scope) {
      let after = 0
      for (;;) {
        const list = await listRecords(env, table, actor, { after: after || undefined, limit: 100 })
        if (!list.rows) break
        page.rows.push(...list.rows)
        if (list.next === null || list.next === undefined) break
        if (page.rows.length >= tableScanLimit) {
          page.capped = true
          break
        }
        after = list.next
      }
    }
    const shown = block.detail ? visibleFields(table, actor) : tableColumns(table, block, actor)
    for (const field of shown.filter((item) => item.type === 'reference')) {
      const target = await getTable(env, siteId, field.table!)
      if (!target || readScope(target, actor) !== 'all') continue
      const list = await listRecords(env, target, actor, { limit: 100 })
      for (const row of list.rows ?? []) page.labels.set(`${field.name}:${row.id}`, labelOf(target, row))
    }
    loaded.set(index, page)
  }
  return loaded
}

export type TableState = { dir: 'asc' | 'desc'; filters: Record<string, string>; page: number; q: string; sort: string }

const clean = (value: string | null, max: number) => (value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max)

/** Which fields get a drop-down: the owner's choice, or every select field among the columns. Only boolean and select fields can be filtered. */
export function filterFields(block: Block, columns: DataField[], visible: DataField[]) {
  const wanted = Array.isArray(block.filters) ? (block.filters as unknown[]).map(String) : columns.filter((field) => field.type === 'select').map((field) => field.name)
  return wanted.flatMap((name) => visible.find((field) => field.name === name && (field.type === 'select' || field.type === 'boolean')) ?? [])
}

/** Reads the form and the links. Anything unknown is ignored, never trusted: a sort on a hidden field falls back to the default order. */
export function readState(block: Block, index: number, query: URLSearchParams, columns: DataField[], filters: DataField[]): TableState {
  const key = `t${index}`
  const sortable = new Set(columns.filter((field) => field.type !== 'image').map((field) => field.name))
  const wanted = clean(query.get(`${key}s`), 60) || String(block.sort ?? '')
  const sort = sortable.has(wanted) ? wanted : ''
  const dirText = query.has(`${key}s`) ? query.get(`${key}d`) : block.dir
  const state: TableState = { dir: dirText === 'desc' ? 'desc' : 'asc', filters: {}, page: 1, q: block.search === false ? '' : clean(query.get(`${key}q`), 100), sort }
  for (const field of filters) {
    const value = clean(query.get(`${key}f_${field.name}`), 200)
    if (value && (field.type === 'boolean' ? ['true', 'false'].includes(value) : field.options?.includes(value))) state.filters[field.name] = value
  }
  const page = Number(query.get(`${key}p`))
  state.page = Number.isInteger(page) && page >= 1 && page <= 100_000 ? page : 1
  return state
}

export const pageSizeOf = (block: Block) => Math.min(Math.max(Math.floor(Number(block.pageSize)) || defaultPageSize, 1), 100)

type Cell = { raw: unknown; text: string }

/** Applies search, filters, sort and paging to the rows. `text` turns a value into what the visitor reads, so searching and sorting follow what is on screen. */
export function viewRows(rows: { data: Record<string, unknown>; id: number }[], columns: DataField[], filters: DataField[], state: TableState, size: number, text: (field: DataField, value: unknown) => string, language?: string) {
  const cell = (row: { data: Record<string, unknown> }, field: DataField): Cell => ({ raw: row.data[field.name], text: row.data[field.name] === undefined || row.data[field.name] === null ? '' : text(field, row.data[field.name]) })
  const needle = state.q.toLocaleLowerCase()
  let found = rows
  if (needle) found = found.filter((row) => columns.some((field) => field.type !== 'image' && cell(row, field).text.toLocaleLowerCase().includes(needle)))
  for (const field of filters) {
    const wanted = state.filters[field.name]
    if (wanted !== undefined) found = found.filter((row) => (field.type === 'boolean' ? String(Boolean(row.data[field.name])) : String(row.data[field.name] ?? '')) === wanted)
  }
  const sortField = columns.find((field) => field.name === state.sort)
  if (sortField) {
    const collator = new Intl.Collator(language || 'en', { numeric: true, sensitivity: 'base' })
    const numeric = sortField.type === 'number'
    const sign = state.dir === 'desc' ? -1 : 1
    // Empty values always go last, whichever way it is sorted.
    found = found
      .map((row, position) => ({ cell: cell(row, sortField), position, row }))
      .sort((a, b) => {
        const empty = Number(a.cell.text === '') - Number(b.cell.text === '')
        if (empty) return empty
        const order = numeric ? Number(a.cell.raw) - Number(b.cell.raw) : sortField.type === 'boolean' ? Number(Boolean(a.cell.raw)) - Number(Boolean(b.cell.raw)) : collator.compare(a.cell.text, b.cell.text)
        return (order || a.position - b.position) * (order ? sign : 1)
      })
      .map((item) => item.row)
  }
  const total = found.length
  const pages = Math.max(1, Math.ceil(total / size))
  const page = Math.min(state.page, pages)
  return { page, pages, rows: found.slice((page - 1) * size, page * size), total }
}
