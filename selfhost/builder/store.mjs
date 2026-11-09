// The Studio's own small database (studio.sqlite, beside the site's): settings, encrypted secrets,
// sign-in sessions, conversations, runs and the usage ledger. The site never reads it, so closing or
// deleting the Studio leaves the published site exactly as it was.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const schema = `
CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS secrets (name TEXT PRIMARY KEY, iv BLOB NOT NULL, tag BLOB NOT NULL, data BLOB NOT NULL, hint TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, code_iv BLOB NOT NULL, code_tag BLOB NOT NULL, code_data BLOB NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation TEXT NOT NULL, at INTEGER NOT NULL, body TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS messages_conversation ON messages (conversation, id);
CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, conversation TEXT NOT NULL, status TEXT NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER, steps TEXT NOT NULL DEFAULT '[]', pending TEXT, stop_reason TEXT, reply TEXT);
CREATE TABLE IF NOT EXISTS usage (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, at INTEGER NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL, tool_calls INTEGER NOT NULL, outcome TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS actions (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, at INTEGER NOT NULL, tool TEXT NOT NULL, risk TEXT NOT NULL, arguments TEXT NOT NULL, outcome TEXT NOT NULL, result TEXT NOT NULL);
`

export const defaultSettings = {
  approval: 'risky', // 'risky': ask before risky actions; 'all': ask before every change; 'none': never ask
  maxStepsPerTurn: 16,
  maxTokensPerTurn: 200_000,
  maxTokensPerDay: 2_000_000,
  maxSecondsPerTurn: 300,
  model: '',
  provider: 'openai',
  baseUrl: '',
}

function loadKey(config) {
  if (config.masterKey) return createHash('sha256').update(config.masterKey).digest()
  if (!existsSync(config.keyFile)) {
    mkdirSync(dirname(config.keyFile), { recursive: true })
    writeFileSync(config.keyFile, randomBytes(32).toString('base64'), { mode: 0o600 })
    try {
      chmodSync(config.keyFile, 0o600)
    } catch {
      // Windows keeps its own permissions.
    }
  }
  return Buffer.from(readFileSync(config.keyFile, 'utf8').trim(), 'base64')
}

export const hashToken = (token) => createHash('sha256').update(token).digest('hex')

export function openStore(config) {
  mkdirSync(dirname(config.studioFile), { recursive: true })
  const db = new DatabaseSync(config.studioFile)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
  db.exec(schema)
  const key = loadKey(config)
  const seal = (text) => {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
    return { data, iv, tag: cipher.getAuthTag() }
  }
  const open = ({ data, iv, tag }) => {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv))
    decipher.setAuthTag(Buffer.from(tag))
    return Buffer.concat([decipher.update(Buffer.from(data)), decipher.final()]).toString('utf8')
  }

  return {
    db,
    close: () => db.close(),
    settings() {
      const saved = Object.fromEntries(db.prepare('SELECT name, value FROM settings').all().map((row) => [row.name, JSON.parse(row.value)]))
      return { ...defaultSettings, ...saved }
    },
    saveSettings(values) {
      const write = db.prepare('INSERT INTO settings (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value')
      for (const [name, value] of Object.entries(values)) if (name in defaultSettings) write.run(name, JSON.stringify(value))
    },
    /** Saves a secret encrypted with the master key. Only its last 4 characters are ever shown again. */
    setSecret(name, value) {
      if (!value) return void db.prepare('DELETE FROM secrets WHERE name = ?').run(name)
      const sealed = seal(value)
      db.prepare('INSERT INTO secrets (name, iv, tag, data, hint, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET iv = excluded.iv, tag = excluded.tag, data = excluded.data, hint = excluded.hint, updated_at = excluded.updated_at').run(name, sealed.iv, sealed.tag, sealed.data, value.length > 8 ? `…${value.slice(-4)}` : '…', Date.now())
    },
    secret(name) {
      const row = db.prepare('SELECT iv, tag, data FROM secrets WHERE name = ?').get(name)
      if (!row) return ''
      try {
        return open(row)
      } catch {
        // Sealed with another master key (for example a bundle restored without its key): enter it again.
        return ''
      }
    },
    secretHints() {
      return Object.fromEntries(db.prepare('SELECT name, hint FROM secrets').all().map((row) => [row.name, row.hint]))
    },
    createSession(code) {
      const token = randomBytes(32).toString('base64url')
      const sealed = seal(code)
      const now = Date.now()
      db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now)
      db.prepare('INSERT INTO sessions (token_hash, code_iv, code_tag, code_data, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)').run(hashToken(token), sealed.iv, sealed.tag, sealed.data, now, now + 12 * 60 * 60 * 1000)
      return token
    },
    sessionCode(token) {
      if (!token) return null
      const row = db.prepare('SELECT code_iv AS iv, code_tag AS tag, code_data AS data, expires_at FROM sessions WHERE token_hash = ?').get(hashToken(token))
      if (!row || row.expires_at < Date.now()) return null
      try {
        return open(row)
      } catch {
        return null
      }
    },
    endSession(token) {
      if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
    },
    addMessage(conversation, body) {
      db.prepare('INSERT INTO messages (conversation, at, body) VALUES (?, ?, ?)').run(conversation, Date.now(), JSON.stringify(body))
    },
    messages(conversation) {
      return db.prepare('SELECT body FROM messages WHERE conversation = ? ORDER BY id').all(conversation).map((row) => JSON.parse(row.body))
    },
    saveRun(run) {
      db.prepare('INSERT INTO runs (id, conversation, status, started_at, finished_at, steps, pending, stop_reason, reply) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, finished_at = excluded.finished_at, steps = excluded.steps, pending = excluded.pending, stop_reason = excluded.stop_reason, reply = excluded.reply').run(
        run.id, run.conversation, run.status, run.startedAt, run.finishedAt ?? null, JSON.stringify(run.steps), run.pending ? JSON.stringify(run.pending) : null, run.stopReason ?? null, run.reply ?? null,
      )
    },
    run(id) {
      const row = db.prepare('SELECT * FROM runs WHERE id = ?').get(id)
      if (!row) return null
      return { conversation: row.conversation, finishedAt: row.finished_at, id: row.id, pending: row.pending ? JSON.parse(row.pending) : null, reply: row.reply, startedAt: row.started_at, status: row.status, steps: JSON.parse(row.steps), stopReason: row.stop_reason }
    },
    recordUsage(entry) {
      db.prepare('INSERT INTO usage (run_id, at, provider, model, input_tokens, output_tokens, tool_calls, outcome) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(entry.runId, Date.now(), entry.provider, entry.model, entry.inputTokens, entry.outputTokens, entry.toolCalls, entry.outcome)
    },
    tokensSince(time) {
      return Number(db.prepare('SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total FROM usage WHERE at >= ?').get(time).total)
    },
    usage(limit = 50) {
      return db.prepare('SELECT run_id, at, provider, model, input_tokens, output_tokens, tool_calls, outcome FROM usage ORDER BY id DESC LIMIT ?').all(limit)
    },
    recordAction(entry) {
      db.prepare('INSERT INTO actions (run_id, at, tool, risk, arguments, outcome, result) VALUES (?, ?, ?, ?, ?, ?, ?)').run(entry.runId, Date.now(), entry.tool, entry.risk, JSON.stringify(entry.arguments).slice(0, 20_000), entry.outcome, String(entry.result ?? '').slice(0, 4000))
    },
    actions(limit = 100) {
      return db.prepare('SELECT run_id, at, tool, risk, outcome, result FROM actions ORDER BY id DESC LIMIT ?').all(limit)
    },
  }
}
