// E0 benchmark worker. Runs the real listRecords/createRecord from src/ against local D1 and reports
// what D1 says each statement cost (rows_read, rows_written, duration). Not part of the site: run it with
//   npx wrangler dev --local scripts/bench-worker.ts --port 8803 --persist-to <dir>
// and drive it with scripts/bench-records.mjs. Never deploy it.
import '../src/automations' // registers the automation hook, so createRecord does the same reads as on the site
import { createRecord, getTable, listRecords, ownerActor, saveTable, type DataTable } from '../src/data'
import type { Env } from '../src/types'

type Cost = { duration: number; rows_read: number; rows_written: number; sql: string; values: unknown[] }

/** Wraps env.DB so every statement's D1 meta is recorded. first() goes through all(), which D1 also does internally. */
function metered(db: D1Database, costs: Cost[]): D1Database {
  const note = (sql: string, meta: D1Meta & Record<string, unknown>, values: unknown[] = []) =>
    costs.push({ duration: Number(meta.duration ?? 0), rows_read: Number(meta.rows_read ?? 0), rows_written: Number(meta.rows_written ?? 0), sql: sql.replace(/\s+/g, ' '), values })
  const wrap = (sql: string, inner: D1PreparedStatement, bound: unknown[] = []): D1PreparedStatement => {
    const statement = {
      inner,
      bind: (...values: unknown[]) => wrap(sql, inner.bind(...values), values),
      async all() {
        const result = await inner.all()
        note(sql, result.meta as D1Meta & Record<string, unknown>, bound)
        return result
      },
      async run() {
        const result = await inner.run()
        note(sql, result.meta as D1Meta & Record<string, unknown>, bound)
        return result
      },
      async first(column?: string) {
        const result = await inner.all<Record<string, unknown>>()
        note(sql, result.meta as D1Meta & Record<string, unknown>, bound)
        const row = result.results[0]
        return row === undefined ? null : column ? row[column] : row
      },
      raw: (options?: { columnNames?: boolean }) => inner.raw(options as never),
    }
    return statement as unknown as D1PreparedStatement
  }
  return {
    prepare: (sql: string) => wrap(sql, db.prepare(sql)),
    async batch(statements: D1PreparedStatement[]) {
      const results = await db.batch(statements.map((item) => (item as unknown as { inner: D1PreparedStatement }).inner))
      results.forEach((result) => note('[batch]', result.meta as D1Meta & Record<string, unknown>))
      return results
    },
    exec: (sql: string) => db.exec(sql),
    dump: () => db.dump(),
    withSession: () => db.withSession(),
  } as unknown as D1Database
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data, null, 1), { status, headers: { 'content-type': 'application/json' } })

async function benchSite(env: Env) {
  const existing = await env.DB.prepare("SELECT id FROM sites WHERE slug = 'e0-bench'").first<{ id: number }>()
  if (existing) return existing.id
  const row = await env.DB.prepare("INSERT INTO sites (slug, edit_hash, settings) VALUES ('e0-bench', 'e0-bench-not-a-secret', '{}') RETURNING id").first<{ id: number }>()
  return row!.id
}

const statuses = ['draft', 'sent', 'paid', 'overdue', 'void']

/** n rows: status = i % 5 (20% each), customer = (i * 7919) % 997 (about 0.1% each, independent of status), amount, note. */
async function seed(env: Env, siteId: number, name: string, n: number) {
  const error = await saveTable(env, siteId, {
    name,
    label: name,
    readAccess: 'public',
    writeAccess: 'owner',
    fields: [
      { name: 'status', label: 'Status', type: 'select', options: statuses },
      { name: 'customer', label: 'Customer', type: 'number' },
      { name: 'amount', label: 'Amount', type: 'number' },
      { name: 'note', label: 'Note', type: 'text' },
    ],
  })
  if (error) throw new Error(error)
  const table = (await getTable(env, siteId, name))!
  await env.DB.prepare('DELETE FROM data_records WHERE table_id = ?').bind(table.id).run()
  // Chunks keep each statement well inside local limits.
  for (let start = 0; start < n; start += 5000) {
    const end = Math.min(start + 5000, n)
    await env.DB.prepare(`WITH RECURSIVE k(i) AS (SELECT ? UNION ALL SELECT i + 1 FROM k WHERE i + 1 < ?)
      INSERT INTO data_records (table_id, data) SELECT ?, json_object('status', CASE i % 5 WHEN 0 THEN 'draft' WHEN 1 THEN 'sent' WHEN 2 THEN 'paid' WHEN 3 THEN 'overdue' ELSE 'void' END,
        'customer', (i * 7919) % 997, 'amount', (i * 37) % 100000, 'note', 'Row number ' || i || ' with some text like a real record') FROM k`)
      .bind(start, end, table.id)
      .run()
  }
  await env.DB.prepare('UPDATE data_tables SET record_count = (SELECT COUNT(*) FROM data_records WHERE table_id = ?) WHERE id = ?').bind(table.id, table.id).run()
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM data_records WHERE table_id = ?').bind(table.id).first<{ n: number }>()
  return { table: name, rows: count!.n }
}

async function list(env: Env, siteId: number, name: string, filters: Record<string, string>, newestFirst: boolean) {
  const table = (await getTable(env, siteId, name)) as DataTable
  const costs: Cost[] = []
  const started = performance.now()
  const result = await listRecords({ ...env, DB: metered(env.DB, costs) }, table, ownerActor, { filters, limit: 50, newestFirst })
  const wall = performance.now() - started
  if ('error' in result) return { error: result.error }
  const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${costs[0].sql}`).bind(...costs[0].values).all().catch((error: unknown) => ({ results: [{ detail: String(error) }] }))
  return { costs, matched: result.rows.length, next: result.next, wall_ms: wall, plan: plan?.results }
}

async function invoice(env: Env, siteId: number, withWebhook: boolean) {
  for (const table of [
    { name: 'invoice', label: 'Invoice', readAccess: 'staff' as const, writeAccess: 'staff' as const, fields: [
      { name: 'number', label: 'Number', type: 'text' as const, required: true, unique: 'table' as const },
      { name: 'buyer', label: 'Buyer', type: 'text' as const },
      { name: 'issued', label: 'Issued', type: 'date' as const },
      { name: 'total', label: 'Total', type: 'number' as const },
      { name: 'status', label: 'Status', type: 'select' as const, options: ['draft', 'sent', 'paid'] },
    ] },
    { name: 'invoice_line', label: 'Invoice line', readAccess: 'staff' as const, writeAccess: 'staff' as const, fields: [
      { name: 'invoice', label: 'Invoice', type: 'reference' as const, table: 'invoice', required: true },
      { name: 'item', label: 'Item', type: 'text' as const },
      { name: 'qty', label: 'Qty', type: 'number' as const },
      { name: 'price', label: 'Price', type: 'number' as const },
    ] },
  ]) {
    const error = await saveTable(env, siteId, table)
    if (error) throw new Error(error)
  }
  await env.DB.prepare('DELETE FROM webhooks WHERE site_id = ?').bind(siteId).run()
  if (withWebhook) await env.DB.prepare("INSERT INTO webhooks (site_id, url, secret, events) VALUES (?, 'https://127.0.0.1:9/e0-bench', 'not-a-secret', '[\"record.created\"]')").bind(siteId).run()
  const header = (await getTable(env, siteId, 'invoice'))!
  const lines = (await getTable(env, siteId, 'invoice_line'))!
  const costs: Cost[] = []
  const db = { ...env, DB: metered(env.DB, costs) }
  const steps: { rows_read: number; rows_written: number; statements: number; step: string }[] = []
  const step = async (name: string, work: () => Promise<{ error?: string; row?: { id: number } }>) => {
    const from = costs.length
    const saved = await work()
    if (saved.error) throw new Error(`${name}: ${saved.error}`)
    const part = costs.slice(from)
    steps.push({ step: name, statements: part.length, rows_read: part.reduce((sum, item) => sum + item.rows_read, 0), rows_written: part.reduce((sum, item) => sum + item.rows_written, 0) })
    return saved.row!
  }
  const number = `INV-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const made = await step('header', () => createRecord(db, siteId, header, { number, buyer: 'Bench Co., Ltd.', issued: '2026-11-06', total: 5350, status: 'draft' }, ownerActor))
  for (let line = 1; line <= 5; line++) await step(`line ${line}`, () => createRecord(db, siteId, lines, { invoice: made.id, item: `Item ${line}`, qty: line, price: 1000 }, ownerActor))
  await env.DB.prepare('DELETE FROM webhooks WHERE site_id = ?').bind(siteId).run()
  return { costs, steps, total_read: costs.reduce((sum, item) => sum + item.rows_read, 0), total_written: costs.reduce((sum, item) => sum + item.rows_written, 0), with_webhook: withWebhook }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)
    try {
      const siteId = await benchSite(env)
      if (url.pathname === '/seed') return json(await seed(env, siteId, url.searchParams.get('table')!, Number(url.searchParams.get('n'))))
      if (url.pathname === '/list') return json(await list(env, siteId, url.searchParams.get('table')!, JSON.parse(url.searchParams.get('filters') ?? '{}'), url.searchParams.get('newest') === '1'))
      if (url.pathname === '/invoice') return json(await invoice(env, siteId, url.searchParams.get('webhook') === '1'))
      return json({ error: 'unknown' }, 404)
    } catch (error) {
      return json({ error: String((error as Error)?.stack ?? error) }, 500)
    }
  },
}
