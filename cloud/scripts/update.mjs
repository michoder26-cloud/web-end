// Copies a new version of web-end into an installed site's repository.
// The owner's site name and database stay as they are, and nothing else in Git is touched.
// Usage: node update.mjs <new version folder> <site repository folder>
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [source, target] = process.argv.slice(2).map((folder) => path.resolve(folder))
if (!source || !target || source === target) {
  console.error('Usage: node update.mjs <new version folder> <site repository folder>')
  process.exit(2)
}

const skipped = new Set(['.git', '.github', '.wrangler', 'node_modules'])
const versionOf = (folder) => {
  const file = path.join(folder, 'src/version.ts')
  return existsSync(file) ? (/version = '(\d+)\.(\d+)\.(\d+)'/.exec(readFileSync(file, 'utf8'))?.slice(1).map(Number) ?? [0, 0, 0]) : [0, 0, 0]
}
const isNewer = (a, b) => {
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] > b[index]
  return false
}

const next = versionOf(source)
const current = versionOf(target)
if (!isNewer(next, current)) {
  console.log(`Already up to date at ${current.join('.')}.`)
  process.exit(0)
}

const wranglerFile = path.join(target, 'wrangler.jsonc')
const newWrangler = path.join(source, 'wrangler.jsonc')
if (!existsSync(wranglerFile) || !existsSync(newWrangler)) {
  console.error('This does not look like a web-end site, so nothing was changed.')
  process.exit(1)
}

// Keep this site's own name and database, and take everything else from the new version, such as the schedule
// in "triggers" that runs scheduled automations. A site updated from before schedules existed gets it this way.
const oldConfig = readFileSync(wranglerFile, 'utf8')
const read = (key) => new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`).exec(oldConfig)?.[1]
const siteName = read('name')
const databaseName = read('database_name')
const databaseId = read('database_id')
if (!siteName || !databaseName || !databaseId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(databaseId)) {
  console.error("Could not read this site's database settings, so nothing was changed.")
  process.exit(1)
}
const newConfig = readFileSync(newWrangler, 'utf8')
  .replace(/"name"\s*:\s*"[^"]+"/, `"name": "${siteName}"`)
  .replace(/"database_name"\s*:\s*"[^"]+"/, `"database_name": "${databaseName}"`)
  .replace(/"database_id"\s*:\s*"[^"]+"/, `"database_id": "${databaseId}"`)
// Losing the database setting would point the site at an empty database, so check before changing anything.
if (!newConfig.includes(`"database_id": "${databaseId}"`) || !newConfig.includes(`"database_name": "${databaseName}"`) || !newConfig.includes(`"name": "${siteName}"`)) {
  console.error("The new version's settings could not keep this site's database, so nothing was changed.")
  process.exit(1)
}

const names = (folder) => readdirSync(folder).filter((name) => !skipped.has(name))
const keep = new Set(names(source))
for (const name of names(target)) {
  if (!keep.has(name)) rmSync(path.join(target, name), { force: true, recursive: true })
}
mkdirSync(target, { recursive: true })
for (const name of keep) {
  rmSync(path.join(target, name), { force: true, recursive: true })
  cpSync(path.join(source, name), path.join(target, name), { recursive: true })
}
writeFileSync(wranglerFile, newConfig)
console.log(`Updated from ${current.join('.')} to ${next.join('.')}.`)
