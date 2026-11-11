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

// Columns added after the first release. An older studio.sqlite gets them when it is opened.
const usageColumns = { cost_micros: 'INTEGER', phase: "TEXT NOT NULL DEFAULT 'completed'", request_id: 'TEXT' }

export const defaultSettings = {
  approval: 'risky', // 'risky': ask before risky actions; 'all': ask before every change; 'none': never ask
  maxStepsPerTurn: 16,
  maxTokensPerTurn: 200_000,
  maxTokensPerDay: 2_000_000,
  // 0 means no limit. Costs are the owner's own estimate, from the prices they enter below.
  maxTokensPerMonth: 0,
  maxCostPerDay: 0,
  maxCostPerMonth: 0,
  // What the AI service charges for the chosen model, in US dollars per million tokens. Empty means unknown.
  inputPricePerMillion: '',
  outputPricePerMillion: '',
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

/** Micro-dollars per token for this provider, or null when the owner hasn't said. A model on this computer costs nothing. */
export const priceOf = (settings, provider) => {
  if (provider === 'ollama') return { input: 0, output: 0 }
  const [input, output] = [settings.inputPricePerMillion, settings.outputPricePerMillion].map((value) => (value === '' || value === null || value === undefined ? NaN : Number(value)))
  return Number.isFinite(input) && Number.isFinite(output) && input >= 0 && output >= 0 ? { input, output } : null
}

export const hashToken = (token) => createHash('sha256').update(token).digest('hex')

export function openStore(config) {
  mkdirSync(dirname(config.studioFile), { recursive: true })
  const db = new DatabaseSync(config.studioFile)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
  db.exec(schema)
  const present = new Set(db.prepare('PRAGMA table_info(usage)').all().map((column) => column.name))
  for (const [name, type] of Object.entries(usageColumns)) if (!present.has(name)) db.exec(`ALTER TABLE usage ADD COLUMN ${name} ${type}`)
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS usage_request ON usage (request_id) WHERE request_id IS NOT NULL')
  // A call that was still open when the Studio last stopped may or may not have run at the AI service. Say so.
  db.prepare("UPDATE usage SET outcome = 'interrupted' WHERE phase = 'sent_unconfirmed' AND outcome = 'started'").run()
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
    /**
     * Opens one AI call in the ledger before it is sent, or refuses it when a limit the owner set is reached.
     * Calls that are still running count against the limits with an estimate, so several at once can't slip past them.
     * Checking and opening happen in one synchronous step, so no other call can come between.
     */
    beginUsage({ model, provider, runId }, settings, now = Date.now()) {
      const day = new Date(now)
      day.setHours(0, 0, 0, 0)
      const month = new Date(day)
      month.setDate(1)
      // A running call is counted as the largest recent one, since its real size is only known when it ends.
      const largest = Number(db.prepare("SELECT COALESCE(MAX(input_tokens + output_tokens), 0) AS most FROM (SELECT input_tokens, output_tokens FROM usage WHERE phase = 'completed' ORDER BY id DESC LIMIT 50)").get().most) || 4000
      const price = priceOf(settings, provider)
      const estimateCost = price ? largest * Math.max(price.input, price.output) : 0
      const since = (time) => db.prepare("SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens, COALESCE(SUM(cost_micros), 0) AS cost, COALESCE(SUM(outcome = 'started'), 0) AS open FROM usage WHERE at >= ?").get(time)
      const [today, thisMonth] = [since(day.getTime()), since(month.getTime())]
      const checks = [
        ['maxTokensPerDay', Number(today.tokens) + Number(today.open) * largest, 'tokens', 'today'],
        ['maxTokensPerMonth', Number(thisMonth.tokens) + Number(thisMonth.open) * largest, 'tokens', 'this month'],
        ['maxCostPerDay', (Number(today.cost) + Number(today.open) * estimateCost) / 1_000_000, 'cost', 'today'],
        ['maxCostPerMonth', (Number(thisMonth.cost) + Number(thisMonth.open) * estimateCost) / 1_000_000, 'cost', 'this month'],
      ]
      for (const [name, used, kind, period] of checks) {
        const limit = Number(settings[name]) || 0
        if (limit > 0 && used >= limit) return { limit: name, ok: false, reason: kind === 'tokens' ? `Your AI limit of ${limit.toLocaleString('en')} tokens ${period} is used up. It can be raised in Settings.` : `Your AI spending limit of $${limit} ${period} is reached. It can be raised in Settings.` }
      }
      const requestId = `req_${randomBytes(12).toString('base64url')}`
      db.prepare("INSERT INTO usage (run_id, at, provider, model, input_tokens, output_tokens, tool_calls, outcome, phase, request_id) VALUES (?, ?, ?, ?, 0, 0, 0, 'started', 'sent_unconfirmed', ?)").run(runId, now, provider, model, requestId)
      return { ok: true, requestId }
    },
    /** Closes a call with what really happened. Closing the same call twice changes nothing. */
    finishUsage(requestId, { inputTokens = 0, outcome, outputTokens = 0, phase = 'completed', toolCalls = 0 }, settings) {
      const row = db.prepare("SELECT provider FROM usage WHERE request_id = ? AND outcome = 'started'").get(requestId)
      if (!row) return false
      const price = priceOf(settings, row.provider)
      // The cost is fixed at the price of the moment, so a later price change never rewrites history. Unknown stays unknown.
      const cost = price && phase === 'completed' ? Math.round(inputTokens * price.input + outputTokens * price.output) : null
      db.prepare('UPDATE usage SET input_tokens = ?, output_tokens = ?, tool_calls = ?, outcome = ?, phase = ?, cost_micros = ? WHERE request_id = ?').run(inputTokens, outputTokens, toolCalls, outcome, phase, cost, requestId)
      return true
    },
    tokensSince(time) {
      return Number(db.prepare('SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total FROM usage WHERE at >= ?').get(time).total)
    },
    /** Tokens and estimated cost since a time. `unpriced` counts finished calls whose cost is unknown, so a total is never shown as complete when it isn't. */
    spendSince(time) {
      const row = db.prepare("SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens, COALESCE(SUM(cost_micros), 0) AS cost, COALESCE(SUM(cost_micros IS NULL AND phase = 'completed'), 0) AS unpriced, COUNT(*) AS calls FROM usage WHERE at >= ?").get(time)
      return { calls: Number(row.calls), costMicros: Number(row.cost), tokens: Number(row.tokens), unpriced: Number(row.unpriced) }
    },
    /** The last 7 days against the 7 before, once there are 14 days of use to compare. */
    spendTrend(now = Date.now()) {
      const week = 7 * 24 * 60 * 60 * 1000
      const first = db.prepare('SELECT MIN(at) AS at FROM usage').get().at
      if (!first || now - first < 2 * week) return null
      const between = (from, to) => Number(db.prepare('SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens FROM usage WHERE at >= ? AND at < ?').get(from, to).tokens)
      const [recent, before] = [between(now - week, now + 1), between(now - 2 * week, now - week)]
      return { before, recent, unusual: recent > 20_000 && recent > before * 2 }
    },
    usage(limit = 50) {
      return db.prepare('SELECT run_id, at, provider, model, input_tokens, output_tokens, tool_calls, outcome, phase, cost_micros FROM usage ORDER BY id DESC LIMIT ?').all(limit)
    },
    recordAction(entry) {
      db.prepare('INSERT INTO actions (run_id, at, tool, risk, arguments, outcome, result) VALUES (?, ?, ?, ?, ?, ?, ?)').run(entry.runId, Date.now(), entry.tool, entry.risk, JSON.stringify(entry.arguments).slice(0, 20_000), entry.outcome, String(entry.result ?? '').slice(0, 4000))
    },
    actions(limit = 100) {
      return db.prepare('SELECT run_id, at, tool, risk, outcome, result FROM actions ORDER BY id DESC LIMIT ?').all(limit)
    },
  }
}
