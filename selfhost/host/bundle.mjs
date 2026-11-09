// Backup, check and restore of a whole web-end installation as ONE file (a .tar.gz "move bundle"):
//   manifest.json  what is inside, every file's SHA-256, row counts per table, what is NOT inside
//   site.sqlite    the site: pages, tables and records, customers and password hashes, orders, media…
//   studio.sqlite  the builder: conversations, settings, usage ledger (AI keys stay sealed by the master key)
//   RESTORE.md     how to bring it back on another computer
// Restore never touches the running data until the copy is complete and checked: it unpacks into a
// staging folder, checks hashes, integrity and row counts, upgrades it, and only then swaps folders.
// The previous data is kept beside it (never deleted), so a failed or regretted restore can go back.
import { createHash, randomBytes } from 'node:crypto'
import { closeSync, createReadStream, createWriteStream, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { pipeline } from 'node:stream/promises'
import { createGunzip, createGzip } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { migrate, D1Database } from './d1.mjs'

export const bundleFormat = 'web-end-move-bundle'
export const bundleVersion = 1
const systemRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const migrationsDir = join(systemRoot, '..', 'cloud', 'migrations')

/** What a bundle can never carry, so a move is planned with eyes open. */
export const notIncluded = [
  { item: 'Server settings and secrets in data/.env or the environment (RESEND_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, GOOGLE_CLIENT_SECRET…)', todo: 'Copy them by hand or set them again on the new server. The bundle lists their names only.' },
  { item: 'The Studio master key (data/keys/master.key or WEB_END_MASTER_KEY), unless --include-key was used', todo: 'Without it the saved AI keys cannot be opened: enter the AI key again in Studio settings.' },
  { item: 'Customer and Studio sign-in sessions', todo: 'Cleared on purpose: everyone signs in again with the same password. Owner links and API keys keep working.' },
  { item: 'Domain name and DNS, HTTPS certificates', todo: 'Point the domain at the new server; Caddy gets a new certificate by itself.' },
  { item: 'Stripe webhook endpoint, Google sign-in redirect address, Resend sender domain', todo: 'Update the address in each service if the domain changes.' },
  { item: 'Emails and payments already sent, and webhooks already delivered', todo: 'A restore cannot undo what outside services received. Undelivered webhooks in the outbox are kept and retried.' },
  { item: 'Copies of the site outside this server (GitHub repository, CDN caches)', todo: 'Nothing to do for the site to work.' },
]

const sha256File = async (file) => {
  const hash = createHash('sha256')
  await pipeline(createReadStream(file), hash)
  return hash.digest('hex')
}

const tableCounts = (file) => {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name)
    return Object.fromEntries(tables.map((name) => [name, Number(db.prepare(`SELECT COUNT(*) AS n FROM "${name.replaceAll('"', '""')}"`).get().n)]))
  } finally {
    db.close()
  }
}

/** A consistent copy of a live SQLite database, safe while the server keeps writing. */
function snapshot(source, target) {
  const db = new DatabaseSync(source)
  try {
    db.exec('PRAGMA busy_timeout = 10000')
    db.prepare('VACUUM INTO ?').run(target)
  } finally {
    db.close()
  }
}

// --- A small tar (ustar) writer and reader: no outside packages, readable by any tar tool. ---
function tarHeader(name, size, mtime) {
  const header = Buffer.alloc(512)
  header.write(name, 0, 100, 'utf8')
  header.write('0000644\0', 100)
  header.write('0000000\0', 108)
  header.write('0000000\0', 116)
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124)
  header.write(`${Math.floor(mtime / 1000).toString(8).padStart(11, '0')}\0`, 136)
  header.write('        ', 148)
  header.write('0', 156)
  header.write('ustar\0', 257)
  header.write('00', 263)
  let sum = 0
  for (const byte of header) sum += byte
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
  return header
}

async function writeTarGz(target, entries) {
  async function* chunks() {
    for (const entry of entries) {
      const size = entry.file ? statSync(entry.file).size : entry.content.length
      yield tarHeader(entry.name, size, Date.now())
      if (entry.file) for await (const chunk of createReadStream(entry.file)) yield chunk
      else yield entry.content
      if (size % 512) yield Buffer.alloc(512 - (size % 512))
    }
    yield Buffer.alloc(1024)
  }
  await pipeline(chunks, createGzip({ level: 6 }), createWriteStream(target))
}

/** Unpacks only plain files with simple names into `folder`; anything else in the archive is refused. */
async function readTarGz(source, folder) {
  mkdirSync(folder, { recursive: true })
  const names = []
  let buffer = Buffer.alloc(0)
  let current = null // { name, left, out }
  let padding = 0
  const allowed = /^[A-Za-z0-9._-]{1,64}$/
  const handle = async (chunk) => {
    buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk
    for (;;) {
      if (padding) {
        const take = Math.min(padding, buffer.length)
        buffer = buffer.subarray(take)
        padding -= take
        if (padding) return
      }
      if (current) {
        if (!buffer.length) return
        const take = Math.min(current.left, buffer.length)
        if (!current.out.write(buffer.subarray(0, take))) await new Promise((done) => current.out.once('drain', done))
        buffer = buffer.subarray(take)
        current.left -= take
        if (current.left) return
        await new Promise((done) => current.out.end(done))
        padding = (512 - (current.size % 512)) % 512
        current = null
        continue
      }
      if (buffer.length < 512) return
      const header = buffer.subarray(0, 512)
      buffer = buffer.subarray(512)
      if (header.every((byte) => byte === 0)) continue
      const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '')
      const size = parseInt(header.subarray(124, 136).toString('utf8').replace(/\0.*$/s, '').trim() || '0', 8)
      const type = String.fromCharCode(header[156] || 48)
      if (type !== '0' || !allowed.test(name) || names.includes(name)) throw new Error(`The bundle holds something unexpected (${JSON.stringify(name)}), so it was not restored.`)
      names.push(name)
      current = { left: size, name, out: createWriteStream(join(folder, name)), size }
      if (!size) {
        await new Promise((done) => current.out.end(done))
        current = null
      }
    }
  }
  const gunzip = createReadStream(source).pipe(createGunzip())
  for await (const chunk of gunzip) await handle(chunk)
  if (current) throw new Error('The bundle file is cut short.')
  return names
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z')

const restoreGuide = (manifest) => `# Restoring this web-end bundle

Made ${manifest.createdAt} by web-end-selfhost ${manifest.host.version}, engine ${manifest.engine.version}.

1. Install web-end-selfhost on the new computer (see README.md), or use the Docker image.
2. Stop the server if it is running.
3. Run:  web-end restore ${basename(manifest.fileName ?? 'bundle.tar.gz')} --data <data folder>
   It checks every file's SHA-256 and the row counts before anything is replaced.
4. Copy or set again the server settings listed under "notIncluded" in manifest.json:
${manifest.notIncluded.map((entry) => `   - ${entry.item}\n     ${entry.todo}`).join('\n')}
5. Start the server. The owner link is the same as before.
`

/** Writes one bundle file. The server may keep running: databases are copied as consistent snapshots. */
export async function createBundle({ dataDir, includeKey = false, out }) {
  const data = resolve(dataDir)
  const site = join(data, 'site.sqlite')
  if (!existsSync(site)) throw new Error(`There is no site in ${data} to back up.`)
  const work = join(data, 'tmp', `backup-${stamp()}-${randomBytes(3).toString('hex')}`)
  mkdirSync(work, { recursive: true })
  const files = []
  const add = async (name, file) => files.push({ bytes: statSync(file).size, name, sha256: await sha256File(file), path: file })
  try {
    snapshot(site, join(work, 'site.sqlite'))
    await add('site.sqlite', join(work, 'site.sqlite'))
    if (existsSync(join(data, 'studio.sqlite'))) {
      snapshot(join(data, 'studio.sqlite'), join(work, 'studio.sqlite'))
      await add('studio.sqlite', join(work, 'studio.sqlite'))
    }
    const keyFile = join(data, 'keys', 'master.key')
    if (includeKey && existsSync(keyFile)) await add('master.key', keyFile)
    const envNames = existsSync(join(data, '.env')) ? Object.keys(Object.fromEntries(readFileSync(join(data, '.env'), 'utf8').split(/\r?\n/).map((line) => /^\s*([A-Z0-9_]+)\s*=/.exec(line)).filter(Boolean).map((m) => [m[1], 1]))) : []
    const release = JSON.parse(readFileSync(join(systemRoot, '..', 'cloud', 'latest.json'), 'utf8'))
    const pkg = JSON.parse(readFileSync(join(systemRoot, 'package.json'), 'utf8'))
    const db = new DatabaseSync(join(work, 'site.sqlite'), { readOnly: true })
    const migrations = db.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map((row) => row.name)
    db.close()
    const target = resolve(out ?? join(data, 'backups', `web-end-${stamp()}.tar.gz`))
    const manifest = {
      createdAt: new Date().toISOString(),
      engine: { version: release.version, repository: 'https://github.com/michoder26-cloud/web-end' },
      envNames,
      fileName: basename(target),
      files: files.map(({ bytes, name, sha256 }) => ({ bytes, name, sha256 })),
      format: bundleFormat,
      formatVersion: bundleVersion,
      host: { name: pkg.name, version: pkg.version },
      includesMasterKey: files.some((file) => file.name === 'master.key'),
      migrations,
      notIncluded: notIncluded.filter((entry) => !(includeKey && entry.item.startsWith('The Studio master key'))),
      rows: { site: tableCounts(join(work, 'site.sqlite')), ...(existsSync(join(work, 'studio.sqlite')) ? { studio: tableCounts(join(work, 'studio.sqlite')) } : {}) },
    }
    mkdirSync(dirname(target), { recursive: true })
    await writeTarGz(target, [
      { content: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), name: 'manifest.json' },
      ...files.map((file) => ({ file: file.path, name: file.name })),
      { content: Buffer.from(restoreGuide(manifest)), name: 'RESTORE.md' },
    ])
    return { bytes: statSync(target).size, file: target, manifest }
  } finally {
    rmSync(work, { force: true, recursive: true })
  }
}

/** Unpacks and checks a bundle into `folder`. Throws with a plain reason when anything is off. */
export async function unpackAndCheck(bundle, folder) {
  const names = await readTarGz(resolve(bundle), folder)
  if (!names.includes('manifest.json')) throw new Error('This file is not a web-end move bundle (no manifest.json).')
  const manifest = JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8'))
  if (manifest.format !== bundleFormat) throw new Error('This file is not a web-end move bundle.')
  if (manifest.formatVersion > bundleVersion) throw new Error(`This bundle was made by a newer web-end (format ${manifest.formatVersion}). Update this server first.`)
  const problems = []
  for (const file of manifest.files) {
    const path = join(folder, file.name)
    if (!existsSync(path)) problems.push(`${file.name} is missing`)
    else if (statSync(path).size !== file.bytes || (await sha256File(path)) !== file.sha256) problems.push(`${file.name} does not match its SHA-256`)
  }
  const extra = names.filter((name) => !['manifest.json', 'RESTORE.md', ...manifest.files.map((file) => file.name)].includes(name))
  if (extra.length) problems.push(`unexpected files: ${extra.join(', ')}`)
  if (problems.length) throw new Error(`The bundle is damaged: ${problems.join('; ')}. Nothing was restored.`)
  for (const name of ['site.sqlite', 'studio.sqlite']) {
    if (!manifest.files.some((file) => file.name === name)) continue
    const db = new DatabaseSync(join(folder, name), { readOnly: true })
    const integrity = db.prepare('PRAGMA integrity_check').get()
    db.close()
    if (Object.values(integrity)[0] !== 'ok') throw new Error(`${name} failed its integrity check. Nothing was restored.`)
    const counted = tableCounts(join(folder, name))
    const expected = manifest.rows[name.replace('.sqlite', '')] ?? {}
    const wrong = Object.entries(expected).filter(([table, count]) => counted[table] !== count)
    if (wrong.length) throw new Error(`${name} row counts differ from the manifest (${wrong.map(([t]) => t).join(', ')}). Nothing was restored.`)
  }
  return manifest
}

export async function verifyBundle(bundle, { scratch } = {}) {
  const folder = scratch ?? mkdtempSync(join(tmpdir(), 'web-end-verify-'))
  try {
    return { manifest: await unpackAndCheck(bundle, folder) }
  } finally {
    if (!scratch) rmSync(folder, { force: true, recursive: true })
  }
}

const lockName = 'server.lock'
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

/** One server per data folder, and no restore while it runs. */
const held = new Set()
export function acquireLock(dataDir) {
  mkdirSync(dataDir, { recursive: true })
  const file = join(dataDir, lockName)
  if (held.has(resolve(file))) throw new Error(`Another web-end server in this process is already using ${dataDir}.`)
  if (existsSync(file)) {
    const pid = Number(readFileSync(file, 'utf8').trim())
    if (pid && pid !== process.pid && alive(pid)) throw new Error(`Another web-end server (process ${pid}) is already using ${dataDir}.`)
  }
  writeFileSync(file, String(process.pid))
  held.add(resolve(file))
  return {
    release() {
      held.delete(resolve(file))
      try {
        if (readFileSync(file, 'utf8').trim() === String(process.pid)) unlinkSync(file)
      } catch {
        // Already gone.
      }
    },
  }
}

/**
 * Restores a bundle into dataDir. Steps: unpack into staging → check hashes, integrity and row counts →
 * clear sign-in sessions → bring the schema up to this engine's migrations → swap folders.
 * `failAfter` is for tests: it throws at that step to prove the live data stays untouched.
 */
export async function restoreBundle({ bundle, dataDir, failAfter = null }) {
  const data = resolve(dataDir)
  const lockFile = join(data, lockName)
  if (existsSync(lockFile)) {
    const pid = Number(readFileSync(lockFile, 'utf8').trim())
    if (pid && alive(pid)) throw new Error(`The server (process ${pid}) is running on ${data}. Stop it before restoring.`)
  }
  const id = `${stamp()}-${randomBytes(3).toString('hex')}`
  const staging = `${data}.restore-${id}`
  const manifest = await unpackAndCheck(bundle, staging)
  if (failAfter === 'check') throw new Error('test: stopped after the check')
  // Sessions are not carried over: on a new server everyone signs in again.
  const site = new D1Database(join(staging, 'site.sqlite'))
  site.db.exec('DELETE FROM sessions; DELETE FROM password_resets;')
  const upgraded = migrate(site, migrationsDir)
  site.close()
  if (existsSync(join(staging, 'studio.sqlite'))) {
    const studio = new DatabaseSync(join(staging, 'studio.sqlite'))
    studio.exec('DELETE FROM sessions')
    studio.close()
  }
  for (const name of readdirSync(staging)) if (/-(wal|shm)$/.test(name)) unlinkSync(join(staging, name))
  if (failAfter === 'prepare') throw new Error('test: stopped before the swap')
  // Files the bundle does not carry (settings, the master key, earlier backups) stay with the data.
  let previous = null
  if (existsSync(data)) {
    for (const keep of ['.env', 'keys', 'backups']) {
      if (existsSync(join(data, keep)) && !(keep === 'keys' && manifest.includesMasterKey)) renameSync(join(data, keep), join(staging, keep))
    }
    previous = `${data}.before-restore-${id}`
    renameSync(data, previous)
  }
  if (manifest.includesMasterKey) {
    mkdirSync(join(staging, 'keys'), { recursive: true })
    renameSync(join(staging, 'master.key'), join(staging, 'keys', 'master.key'))
  }
  renameSync(staging, data)
  return { manifest, migrationsApplied: upgraded.applied, previous }
}

export const readHeadBytes = (file, count = 2) => {
  const fd = openSync(file, 'r')
  const buffer = Buffer.alloc(count)
  readSync(fd, buffer, 0, count, 0)
  closeSync(fd)
  return buffer
}
