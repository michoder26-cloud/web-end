// E0 benchmark driver: seeds 10k and 50k-row tables and measures listRecords and a 1+5-record invoice.
// Needs scripts/bench-worker.ts running on local D1 (NOT --remote):
//   npx wrangler d1 migrations apply DB --local --persist-to <dir>
//   npx wrangler dev --local scripts/bench-worker.ts --port 8803 --persist-to <dir>
//   BENCH_URL=http://localhost:8803 BENCH_PERSIST=<dir> node scripts/bench-records.mjs [out.json]
// D1 meta.duration and performance.now() are whole milliseconds locally, so BENCH_PERSIST also re-times each
// listRecords statement directly on the same local SQLite file (read-only) with a sub-millisecond clock.
import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const base = process.env.BENCH_URL ?? 'http://localhost:8803'
const repeats = Number(process.env.BENCH_REPEATS ?? 5)

async function call(path) {
  const started = performance.now()
  const response = await fetch(base + path)
  const body = await response.json()
  if (!response.ok || body.error) throw new Error(`${path}: ${JSON.stringify(body.error ?? body)}`)
  return { ...body, http_ms: performance.now() - started }
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

// Selectivity matters more than size: listRecords walks the (table_id, id) index and stops after 51 matches,
// so a filter that matches little or nothing reads the whole table.
const scenarios = [
  ['none', {}],
  ['f1 common (status=paid, 20%)', { status: 'paid' }],
  ['f1 rare (customer=7, ~0.1%)', { customer: '7' }],
  ['f1 no match (customer=-1)', { customer: '-1' }],
  ['f2 rare (status=paid & customer=7)', { status: 'paid', customer: '7' }],
  ['f2 no match (status=paid & customer=-1)', { status: 'paid', customer: '-1' }],
  ['f2 both indexed (customer=598 & code=C7)', { customer: '598', code: 'C7' }],
  ['f1 unique (code=C49999)', { code: 'C49999' }],
]

const persist = process.env.BENCH_PERSIST
const folder = persist && join(persist, 'v3', 'd1', 'miniflare-D1DatabaseObject')
const file = folder && readdirSync(folder).find((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite')
const sqlite = file ? new DatabaseSync(join(folder, file), { readOnly: true }) : null
/** Median and max of 21 direct runs of one statement on the local SQLite file, in ms. */
function direct(sql, values) {
  if (!sqlite) return null
  const statement = sqlite.prepare(sql)
  const times = []
  for (let i = 0; i < 21; i++) {
    const started = process.hrtime.bigint()
    statement.all(...values)
    times.push(Number(process.hrtime.bigint() - started) / 1e6)
  }
  return { median: +median(times).toFixed(3), max: +Math.max(...times).toFixed(3) }
}

const report = { base, local: true, note: 'wrangler dev --local (miniflare/workerd + local SQLite), not --remote', seeds: [], lists: [], inserts: [], reindex: [], invoices: [] }

for (const [table, n] of [['bench_10k', 10_000], ['bench_50k', 50_000]]) {
  const seeded = await call(`/seed?table=${table}&n=${n}`)
  report.seeds.push({ table, rows: seeded.rows, seed_ms: Math.round(seeded.http_ms) })
  console.log(`seeded ${table}: ${seeded.rows} rows`)
  for (const [name, filters] of scenarios) {
    for (const newest of [false, true]) {
      const runs = []
      for (let i = 0; i < repeats; i++) runs.push(await call(`/list?table=${table}&newest=${newest ? 1 : 0}&filters=${encodeURIComponent(JSON.stringify(filters))}`))
      const sql = runs.map((run) => run.costs.reduce((sum, cost) => sum + cost.duration, 0))
      const row = {
        table,
        scenario: name,
        order: newest ? 'newest' : 'oldest',
        statements: runs[0].costs.length,
        rows_read: runs[0].costs.reduce((sum, cost) => sum + cost.rows_read, 0),
        rows_written: runs[0].costs.reduce((sum, cost) => sum + cost.rows_written, 0),
        returned: runs[0].matched,
        sql_ms_median: +median(sql).toFixed(3),
        sql_ms_max: +Math.max(...sql).toFixed(3),
        worker_wall_ms_median: +median(runs.map((run) => run.wall_ms)).toFixed(3),
        http_ms_median: +median(runs.map((run) => run.http_ms)).toFixed(1),
        sqlite_direct_ms: direct(runs[0].costs[0].sql, runs[0].costs[0].values),
        plan: (runs[0].plan ?? []).map((step) => step.detail).join(' | '),
      }
      report.lists.push(row)
      console.log(JSON.stringify(row))
    }
  }
  const inserted = await call(`/insert?table=${table}`)
  delete inserted.http_ms
  report.inserts.push({ table, ...inserted, plan: (inserted.plan ?? []).map((step) => step.detail).join(' | ') })
  console.log(JSON.stringify({ insert: table, ...report.inserts.at(-1) }))
  const rebuilt = await call(`/reindex?table=${table}`)
  report.reindex.push({ table, drop: rebuilt.drop, build: rebuilt.build })
  console.log(JSON.stringify({ reindex: table, drop: rebuilt.drop, build: rebuilt.build }))
}

for (const webhook of [false, true]) {
  const result = await call(`/invoice?webhook=${webhook ? 1 : 0}`)
  report.invoices.push({ with_webhook: webhook, total_read: result.total_read, total_written: result.total_written, steps: result.steps, statements: result.costs.map(({ values, ...cost }) => cost) })
  console.log(JSON.stringify({ invoice: true, with_webhook: webhook, total_read: result.total_read, total_written: result.total_written, steps: result.steps }))
}

if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 1))
