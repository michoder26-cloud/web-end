// A small stand-in for Cloudflare D1 on top of Node's built-in SQLite (node:sqlite).
// It implements only what the web-end engine uses: prepare().bind().first()/all()/run()/raw(),
// batch() as one transaction, and exec(). Results have the same shape as D1's.
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

const toSqlite = (value) => {
  if (value === undefined) throw new TypeError('D1_TYPE_ERROR: Type "undefined" is not supported as a value')
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value) && !(value instanceof Uint8Array)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  if (Array.isArray(value)) return Uint8Array.from(value)
  return value
}

// D1 hands blobs back as plain arrays of byte values.
const fromRow = (row) => {
  if (!row) return row
  for (const key of Object.keys(row)) if (row[key] instanceof Uint8Array) row[key] = Array.from(row[key])
  return row
}

export class D1Database {
  constructor(file) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
    this.file = file
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;')
    this.cache = new Map()
    this.inBatch = false
  }

  prepare(sql) {
    return new D1PreparedStatement(this, sql, [])
  }

  statement(sql) {
    let statement = this.cache.get(sql)
    if (!statement) {
      statement = this.db.prepare(sql)
      if (this.cache.size > 2000) this.cache.clear()
      this.cache.set(sql, statement)
    }
    return statement
  }

  meta(started, extra = {}) {
    return { changed_db: Boolean(extra.changes), changes: 0, duration: performance.now() - started, last_row_id: 0, rows_read: 0, rows_written: 0, size_after: this.size(), ...extra }
  }

  size() {
    try {
      const pages = this.db.prepare('PRAGMA page_count').get().page_count
      const size = this.db.prepare('PRAGMA page_size').get().page_size
      return Number(pages) * Number(size)
    } catch {
      return 0
    }
  }

  async batch(statements) {
    // D1 runs a batch as one transaction: all of it happens, or none of it does.
    this.db.exec('BEGIN IMMEDIATE')
    this.inBatch = true
    try {
      const results = statements.map((statement) => statement.runSync())
      this.db.exec('COMMIT')
      return results
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    } finally {
      this.inBatch = false
    }
  }

  async exec(sql) {
    const started = performance.now()
    this.db.exec(sql)
    const count = sql.split(';').filter((part) => part.trim()).length
    return { count, duration: performance.now() - started }
  }

  async dump() {
    throw new Error('dump() is not supported; use the backup command instead')
  }

  close() {
    this.db.close()
  }
}

class D1PreparedStatement {
  constructor(database, sql, params) {
    this.database = database
    this.sql = sql
    this.params = params
  }

  bind(...values) {
    return new D1PreparedStatement(this.database, this.sql, values.map(toSqlite))
  }

  returnsRows() {
    // A statement that reads gives rows; RETURNING makes a write give rows too.
    return /^\s*(with|select|pragma|values|explain)\b/i.test(this.sql) || /\breturning\b/i.test(this.sql)
  }

  runSync() {
    const started = performance.now()
    const statement = this.database.statement(this.sql)
    if (this.returnsRows()) {
      const results = statement.all(...this.params).map(fromRow)
      return { meta: this.database.meta(started, { rows_read: results.length }), results, success: true }
    }
    const info = statement.run(...this.params)
    const changes = Number(info.changes)
    return { meta: this.database.meta(started, { changes, changed_db: changes > 0, last_row_id: Number(info.lastInsertRowid), rows_written: changes }), results: [], success: true }
  }

  async run() {
    return this.runSync()
  }

  async all() {
    return this.runSync()
  }

  async first(column) {
    const statement = this.database.statement(this.sql)
    const row = fromRow(statement.get(...this.params))
    if (row === undefined) return null
    if (column === undefined) return row
    if (!(column in row)) throw new Error(`D1_COLUMN_NOTFOUND: Column not found (${column})`)
    return row[column]
  }

  async raw(options = {}) {
    const statement = this.database.statement(this.sql)
    const columns = statement.columns().map((column) => column.name)
    const rows = statement.all(...this.params).map((row) => columns.map((name) => (row[name] instanceof Uint8Array ? Array.from(row[name]) : row[name])))
    return options.columnNames ? [columns, ...rows] : rows
  }
}

/** Applies the engine's migrations in order, remembering them the way `wrangler d1 migrations apply` does. */
export function migrate(database, folder) {
  const db = database.db
  db.exec('CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)')
  const done = new Set(db.prepare('SELECT name FROM d1_migrations').all().map((row) => row.name))
  const files = readdirSync(folder).filter((name) => name.endsWith('.sql')).sort()
  const applied = []
  for (const name of files) {
    if (done.has(name)) continue
    const sql = readFileSync(join(folder, name), 'utf8')
    db.exec('BEGIN')
    try {
      db.exec(sql)
      db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(name)
      db.exec('COMMIT')
      applied.push(name)
    } catch (error) {
      db.exec('ROLLBACK')
      throw new Error(`Migration ${name} failed: ${error.message}`)
    }
  }
  return { applied, total: files.length }
}

export const fileSize = (file) => {
  try {
    return statSync(file).size
  } catch {
    return 0
  }
}
