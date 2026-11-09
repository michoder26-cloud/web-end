// Checks that the SQLite stand-in behaves like Cloudflare D1 where the engine depends on it:
// result shapes, metadata, first(column), batch() as one transaction, value types, BLOBs, RETURNING,
// JSON functions and raw(). Expected behaviour is taken from Cloudflare's D1 documentation
// (developers.cloudflare.com/d1/worker-api/), checked 2026-11-08.
import { D1Database } from '../host/d1.mjs'

let failed = 0
let passed = 0
const check = (ok, name, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : `: ${detail}`}`)
  ok ? passed++ : failed++
}
const throws = async (work) => {
  try {
    await work()
    return null
  } catch (error) {
    return error
  }
}

const db = new D1Database(':memory:')
await db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, flag INTEGER, data TEXT, bytes BLOB)')

const inserted = await db.prepare('INSERT INTO t (name, flag) VALUES (?, ?)').bind('a', true).run()
check(inserted.success === true && Array.isArray(inserted.results) && inserted.results.length === 0, 'run() gives { success, results: [] } for a write')
check(inserted.meta.changes === 1 && inserted.meta.last_row_id === 1 && inserted.meta.rows_written === 1 && inserted.meta.changed_db === true, 'run() metadata: changes, last_row_id, rows_written, changed_db', JSON.stringify(inserted.meta))
check(typeof inserted.meta.duration === 'number' && typeof inserted.meta.size_after === 'number' && inserted.meta.size_after > 0, 'run() metadata: duration and size_after')
check((await db.prepare('SELECT flag FROM t WHERE id = 1').first('flag')) === 1, 'true is stored as 1, as D1 does')
check((await db.prepare('UPDATE t SET name = ? WHERE id = ?').bind('zz', 999).run()).meta.changes === 0, 'an update that matches nothing reports 0 changes')
check((await throws(() => db.prepare('INSERT INTO t (name) VALUES (?)').bind(undefined).run()))?.message.includes('D1_TYPE_ERROR'), 'undefined is refused with D1_TYPE_ERROR')
check((await db.prepare('INSERT INTO t (name) VALUES (?)').bind(null).run()).success, 'null is accepted')

const all = await db.prepare('SELECT id, name FROM t ORDER BY id').all()
check(all.success && all.results.length === 2 && all.results[0].name === 'a' && all.meta.rows_read === 2, 'all() gives { success, results, meta }')
check((await db.prepare('SELECT * FROM t WHERE id = 42').first()) === null, 'first() with no row is null')
check((await db.prepare('SELECT name FROM t WHERE id = 1').first()).name === 'a', 'first() gives the first row')
check((await throws(() => db.prepare('SELECT name FROM t WHERE id = 1').first('nope')))?.message.includes('D1_COLUMN_NOTFOUND'), 'first(column) with an unknown column fails like D1')
check((await db.prepare('SELECT name FROM t WHERE id = 42').first('name')) === null, 'first(column) with no row is null')

const returning = await db.prepare('INSERT INTO t (name) VALUES (?) RETURNING id, name').bind('r').run()
check(returning.results.length === 1 && returning.results[0].name === 'r', 'RETURNING gives the written row back')

// batch(): all or nothing
const before = (await db.prepare('SELECT COUNT(*) AS n FROM t').first()).n
const batchError = await throws(() => db.batch([db.prepare('INSERT INTO t (name) VALUES (?)').bind('b1'), db.prepare('INSERT INTO t (name) VALUES (?)').bind('a')]))
check(Boolean(batchError) && (await db.prepare('SELECT COUNT(*) AS n FROM t').first()).n === before, 'a batch with one failing statement changes nothing (one transaction)')
const batch = await db.batch([db.prepare('INSERT INTO t (name) VALUES (?)').bind('b2'), db.prepare('SELECT COUNT(*) AS n FROM t')])
check(batch.length === 2 && batch[0].meta.changes === 1 && batch[1].results[0].n === before + 1, 'a batch gives one result per statement, in order, each seeing the ones before')

// BLOBs come back as arrays of byte values
await db.prepare('UPDATE t SET bytes = ? WHERE id = 1').bind(new Uint8Array([1, 2, 255])).run()
await db.prepare('UPDATE t SET bytes = ? WHERE id = 2').bind(new Uint8Array([9]).buffer).run()
const blob = await db.prepare('SELECT bytes FROM t WHERE id = 1').first('bytes')
check(Array.isArray(blob) && blob.join() === '1,2,255', 'a BLOB written as Uint8Array reads back as an array of numbers', JSON.stringify(blob))
check((await db.prepare('SELECT bytes FROM t WHERE id = 2').first('bytes')).join() === '9', 'a BLOB written as ArrayBuffer reads back too')
check((await db.prepare('SELECT length(bytes) AS n FROM t WHERE id = 1').first('n')) === 3, 'SQL sees the BLOB as bytes')

// JSON functions, used by the engine for records
await db.prepare('UPDATE t SET data = ? WHERE id = 1').bind(JSON.stringify({ seats: 3, title: 'Yoga' })).run()
check((await db.prepare("SELECT json_extract(data, '$.seats') AS s FROM t WHERE id = 1").first('s')) === 3, 'json_extract works')
await db.exec("CREATE INDEX t_seats ON t (json_extract(data, '$.seats'))")
check((await db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'index' AND name = 't_seats'").first('n')) === 1, 'indexes on JSON expressions work')

// raw()
const raw = await db.prepare('SELECT id, name FROM t WHERE id = 1').raw()
const rawNames = await db.prepare('SELECT id, name FROM t WHERE id = 1').raw({ columnNames: true })
check(JSON.stringify(raw) === '[[1,"a"]]' && JSON.stringify(rawNames) === '[["id","name"],[1,"a"]]', 'raw() gives arrays, with column names first when asked')

// exec(), and a prepared statement used more than once
check((await db.exec('CREATE TABLE u (x); INSERT INTO u VALUES (1); INSERT INTO u VALUES (2)')).count === 3, 'exec() runs several statements and counts them')
const statement = db.prepare('SELECT x FROM u WHERE x = ?')
check((await statement.bind(1).first('x')) === 1 && (await statement.bind(2).first('x')) === 2, 'one prepared statement binds new values each time')
check((await db.prepare('PRAGMA foreign_keys').first('foreign_keys')) === 1, 'foreign keys are enforced, as in D1')

db.close()
console.log(`\nD1 conformance: ${passed} passed, ${failed} failed`)
console.log("Known difference: integers beyond 2^53 make node:sqlite throw where D1 loses precision. The engine's own tests store none; not yet checked for every table.")
process.exit(failed ? 1 : 0)
