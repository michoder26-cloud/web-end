// Tests the updater on throwaway folders. Usage: node tests/update.mjs
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '../scripts/update.mjs')
const root = mkdtempSync(path.join(tmpdir(), 'web-end-update-'))
let failed = 0
const check = (ok, name) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`)
  if (!ok) failed++
}

const databaseId = '0b667b58-ee9f-4ddf-827c-57a9428cc6fe'
const write = (folder, name, text) => {
  mkdirSync(path.dirname(path.join(folder, name)), { recursive: true })
  writeFileSync(path.join(folder, name), text)
}
const config = (name, database, id, extra = '') => `{\n  "name": "${name}",\n  "main": "src/index.ts",\n  ${extra}"d1_databases": [{ "binding": "DB", "database_name": "${database}", "database_id": "${id}" }],\n}\n`
const makeRelease = (version) => {
  const folder = path.join(root, `release-${version}-${Math.random()}`)
  write(folder, 'src/version.ts', `export const version = '${version}'\n`)
  write(folder, 'src/new-feature.ts', 'export const added = true\n')
  write(folder, 'migrations/0009_new.sql', 'SELECT 1;\n')
  write(folder, 'wrangler.jsonc', config('my-website', 'my-website', '00000000-0000-0000-0000-000000000000', '"compatibility_date": "2030-01-01",\n  '))
  return folder
}
const makeSite = (version = '0.1.0') => {
  const folder = path.join(root, `site-${Math.random()}`)
  if (version) write(folder, 'src/version.ts', `export const version = '${version}'\n`)
  write(folder, 'src/old-file.ts', 'export const old = true\n')
  write(folder, 'wrangler.jsonc', config('baan-coffee', 'baan-db', databaseId))
  write(folder, '.git/config', 'keep\n')
  write(folder, '.github/workflows/update-web-end.yml', 'keep\n')
  write(folder, 'node_modules/kept/index.js', 'keep\n')
  return folder
}
const run = (source, target) => spawnSync(process.execPath, [script, source, target], { encoding: 'utf8' })

const site = makeSite()
const updated = run(makeRelease('0.2.0'), site)
const settings = readFileSync(path.join(site, 'wrangler.jsonc'), 'utf8')
check(updated.status === 0 && updated.stdout.includes('0.1.0 to 0.2.0'), 'updates to a newer version')
check(settings.includes(`"database_id": "${databaseId}"`) && settings.includes('"database_name": "baan-db"') && settings.includes('"name": "baan-coffee"'), "keeps the site's name and database")
check(settings.includes('2030-01-01') && !settings.includes('00000000'), 'takes other settings from the new version')
check(existsSync(path.join(site, 'src/new-feature.ts')) && existsSync(path.join(site, 'migrations/0009_new.sql')), 'adds new files and database changes')
check(!existsSync(path.join(site, 'src/old-file.ts')), 'removes files the new version no longer has')
check(existsSync(path.join(site, '.git/config')) && existsSync(path.join(site, '.github/workflows/update-web-end.yml')), "leaves the site's Git data and updater alone")

const same = makeSite('0.2.0')
check(run(makeRelease('0.2.0'), same).stdout.includes('Already up to date') && existsSync(path.join(same, 'src/old-file.ts')), 'does nothing when already up to date')
const newer = makeSite('0.3.0')
check(run(makeRelease('0.2.0'), newer).stdout.includes('Already up to date') && existsSync(path.join(newer, 'src/old-file.ts')), 'never goes back to an older version')
check(run(makeRelease('0.10.0'), makeSite('0.9.0')).stdout.includes('0.9.0 to 0.10.0'), 'compares versions as numbers')
const first = makeSite('')
check(run(makeRelease('0.2.0'), first).stdout.includes('0.0.0 to 0.2.0'), 'updates sites installed before versions existed')

const placeholder = makeSite()
write(placeholder, 'wrangler.jsonc', config('x', 'x', '00000000-0000-0000-0000-00000000000g'))
const refused = run(makeRelease('0.2.0'), placeholder)
check(refused.status === 1 && existsSync(path.join(placeholder, 'src/old-file.ts')), "changes nothing if it can't read the database settings")
const notSite = path.join(root, 'empty')
mkdirSync(notSite)
write(notSite, 'precious.txt', 'keep\n')
check(run(makeRelease('0.2.0'), notSite).status === 1 && existsSync(path.join(notSite, 'precious.txt')), 'changes nothing in a folder that is not a site')

// The real settings file of this version, with its schedule, reaches a site installed before schedules existed.
const realRelease = makeRelease('0.3.0')
write(realRelease, 'wrangler.jsonc', readFileSync(path.join(path.dirname(script), '../wrangler.jsonc'), 'utf8'))
const beforeSchedules = makeSite('0.2.0')
write(beforeSchedules, 'wrangler.jsonc', `{\n  // Made by the Deploy to Cloudflare button.\n  "name": "baan-coffee",\n  "main": "src/index.ts",\n  "assets": { "directory": "public", "binding": "ASSETS" },\n  "d1_databases": [\n    {\n      "binding": "DB",\n      "database_name": "baan-db",\n      "database_id": "${databaseId}",\n      "migrations_dir": "migrations",\n    },\n  ],\n}\n`)
const scheduled = run(realRelease, beforeSchedules)
const withSchedule = readFileSync(path.join(beforeSchedules, 'wrangler.jsonc'), 'utf8')
check(scheduled.status === 0 && /"triggers"\s*:\s*\{\s*"crons"\s*:\s*\["\*\/15 \* \* \* \*"\]/.test(withSchedule), 'brings the schedule for automations into an older site', withSchedule)
check(withSchedule.includes(`"database_id": "${databaseId}"`) && withSchedule.includes('"database_name": "baan-db"') && /^\s*"name": "baan-coffee"/m.test(withSchedule) && !withSchedule.includes('00000000-0000') && !withSchedule.includes('"name": "my-website"'), "keeps the site's name and database alongside the schedule")
check((withSchedule.match(/"database_id"/g) ?? []).length === 1 && withSchedule.includes('"binding": "DB"') && withSchedule.includes('"migrations_dir": "migrations"'), 'keeps one database, with its migrations')
const oldSchedule = makeSite('0.2.0')
write(oldSchedule, 'wrangler.jsonc', config('baan-coffee', 'baan-db', databaseId, '"triggers": { "crons": ["0 * * * *"] },\n  '))
run(realRelease, oldSchedule)
const replaced = readFileSync(path.join(oldSchedule, 'wrangler.jsonc'), 'utf8')
check(replaced.includes('"*/15 * * * *"') && !replaced.includes('"0 * * * *"') && replaced.includes(`"database_id": "${databaseId}"`), 'takes the new schedule over an older one, keeping the database')
const unreadable = makeRelease('0.4.0')
write(unreadable, 'wrangler.jsonc', '{\n  "name": "my-website",\n  "d1_databases": [{ "binding": "DB" }],\n}\n')
const kept = makeSite('0.3.0')
const keptBefore = readFileSync(path.join(kept, 'wrangler.jsonc'), 'utf8')
check(run(unreadable, kept).status === 1 && readFileSync(path.join(kept, 'wrangler.jsonc'), 'utf8') === keptBefore && existsSync(path.join(kept, 'src/old-file.ts')), "changes nothing if the new settings can't hold the site's database")

rmSync(root, { force: true, recursive: true })
console.log(failed ? `\n${failed} checks failed.` : '\nAll checks passed.')
process.exit(failed ? 1 : 0)
