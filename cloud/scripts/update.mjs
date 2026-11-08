// Copies a new version of web-end into an installed site's repository.
// The owner's site name and database stay as they are, and nothing else in Git is touched.
// Usage: node update.mjs <new version folder> <site repository folder> [--force]
// Each update writes down a fingerprint of every file it put in place. The next update first checks them, and stops
// without changing anything if someone changed the code by hand since, unless --force says to update anyway.
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const force = args.includes('--force')
const [source, target] = args.filter((arg) => arg !== '--force').map((folder) => path.resolve(folder))
if (!source || !target || source === target) {
  console.error('Usage: node update.mjs <new version folder> <site repository folder>')
  process.exit(2)
}

const manifestName = '.web-end-files.json'
const skipped = new Set(['.git', '.github', '.wrangler', 'node_modules', manifestName])
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

// The site's own settings change by design, so they are not fingerprinted.
const ownSettings = new Set(['wrangler.jsonc', 'package-lock.json'])
const filesIn = (folder, prefix = '') =>
  readdirSync(path.join(folder, prefix)).flatMap((name) => {
    const relative = path.join(prefix, name).split(path.sep).join('/')
    if (!prefix && (skipped.has(name) || ownSettings.has(name))) return []
    return statSync(path.join(folder, relative)).isDirectory() ? filesIn(folder, relative) : [relative]
  })
const fingerprints = (folder) => Object.fromEntries(filesIn(folder).sort().map((file) => [file, createHash('sha256').update(readFileSync(path.join(folder, file))).digest('hex')]))

const manifestFile = path.join(target, manifestName)
if (!force && existsSync(manifestFile)) {
  const before = JSON.parse(readFileSync(manifestFile, 'utf8')).files ?? {}
  const now = fingerprints(target)
  const changed = [...new Set([...Object.keys(before), ...Object.keys(now)])].filter((file) => before[file] !== now[file]).sort()
  if (changed.length) {
    console.error(`Stopped, so nothing was changed. These files were changed by hand since the last update:`)
    for (const file of changed.slice(0, 30)) console.error(`  ${file}`)
    if (changed.length > 30) console.error(`  and ${changed.length - 30} more`)
    console.error('To update anyway, run the updater again with "Update even if the code was changed by hand" ticked. Your changes stay in the GitHub history.')
    process.exit(1)
  }
} else if (!force) {
  console.log('This is the first update with a record of its files, so the check for code changed by hand starts from the next update.')
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
writeFileSync(manifestFile, `${JSON.stringify({ files: fingerprints(target), note: 'Written by the web-end updater, to notice code changed by hand. Leave it in place.', version: next.join('.') }, null, 2)}\n`)
console.log(`Updated from ${current.join('.')} to ${next.join('.')}.`)
