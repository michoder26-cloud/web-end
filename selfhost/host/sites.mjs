// One directory, SQLite database, port and owner Dashboard per site.
import { createServer } from 'node:net'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const validName = /^[a-z][a-z0-9-]{1,54}[a-z0-9]$/
export const defaultSitesDir = resolve(import.meta.dirname, '..', 'sites')

export function siteData(name, sitesDir = defaultSitesDir) {
  if (!validName.test(name)) throw new Error('Choose a name with 3–56 lowercase letters, numbers or hyphens, starting with a letter and ending with a letter or number.')
  return join(resolve(sitesDir), name)
}

export function sitePort(name, sitesDir = defaultSitesDir) {
  const file = join(siteData(name, sitesDir), '.env')
  if (!existsSync(file)) throw new Error(`Site "${name}" has not been created. Run web-end new ${name} first.`)
  const port = Number(/^WEB_END_PORT=(\d+)$/m.exec(readFileSync(file, 'utf8'))?.[1])
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`Site "${name}" has no valid port.`)
  return port
}

const available = (port) => new Promise((done) => {
  const probe = createServer()
  probe.once('error', () => done(false))
  probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)))
})

export async function createSite(name, sitesDir = defaultSitesDir) {
  const folder = siteData(name, sitesDir)
  if (existsSync(folder)) throw new Error(`Site "${name}" already exists. Run web-end site ${name} to open it.`)
  mkdirSync(resolve(sitesDir), { recursive: true })
  const used = new Set()
  for (const entry of readdirSync(resolve(sitesDir), { withFileTypes: true })) {
    if (!entry.isDirectory() || !validName.test(entry.name)) continue
    try { used.add(sitePort(entry.name, sitesDir)) } catch { /* An incomplete directory reserves its name, not a port. */ }
  }
  let port
  for (let candidate = 8799; candidate <= 8899; candidate++) {
    if (!used.has(candidate) && await available(candidate)) { port = candidate; break }
  }
  if (!port) throw new Error('No free port from 8799 to 8899. Stop an unused local site or choose another host.')
  mkdirSync(folder) // Fails safely if another creation won the name.
  writeFileSync(join(folder, '.env'), `WEB_END_PORT=${port}\n`, { flag: 'wx', mode: 0o600 })
  return { dataDir: folder, port }
}
