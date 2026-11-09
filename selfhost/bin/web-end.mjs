#!/usr/bin/env node
// web-end on your own computer or server.
//   web-end serve   [--data DIR] [--port N] [--host ADDR]   start the site and the Studio
//   web-end backup  [--data DIR] [--out FILE] [--include-key] write one move bundle (safe while running)
//   web-end verify  FILE                                      check a bundle without restoring it
//   web-end restore FILE [--data DIR]                         restore through a checked staging copy
//   web-end licenses [--out FILE]                             list every bundled package and its license
//   web-end doctor  [--data DIR]                              say what this installation depends on
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

process.removeAllListeners('warning')
process.on('warning', (warning) => {
  if (warning.name !== 'ExperimentalWarning') console.warn(warning)
})

const args = process.argv.slice(2)
const command = args[0] ?? 'help'
const option = (name) => {
  const index = args.indexOf(`--${name}`)
  return index > -1 ? args[index + 1] : undefined
}
const has = (name) => args.includes(`--${name}`)
const valueOptions = ['--data', '--out', '--port', '--host']
const positional = args.slice(1).find((arg, index, list) => !arg.startsWith('--') && !(index > 0 && valueOptions.includes(list[index - 1])))
const dataDir = option('data') ?? process.env.WEB_END_DATA ?? 'data'
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

async function main() {
  if (command === 'serve') {
    const { startServer } = await import('../host/server.mjs')
    const server = await startServer({ dataDir, host: option('host'), port: option('port') })
    console.log(`web-end is running at ${server.url}`)
    console.log(`  data folder: ${server.config.dataDir}  (database: site.sqlite, ${server.migrations.total} migrations)`)
    console.log(`  Studio (the AI builder): ${server.config.studio ? `${server.url}/studio` : 'off'}`)
    console.log(`  update check on GitHub: ${server.config.updateCheck ? 'on (WEB_END_UPDATE_CHECK=off turns it off)' : 'off'}`)
    if (server.migrations.applied.length) console.log(`  database prepared: ${server.migrations.applied.length} migrations applied`)
    const stop = async () => {
      console.log('Stopping…')
      await server.close()
      process.exit(0)
    }
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
    return
  }
  if (command === 'backup') {
    const { createBundle } = await import('../host/bundle.mjs')
    const result = await createBundle({ dataDir, includeKey: has('include-key'), out: option('out') })
    console.log(`Backup written: ${result.file} (${(result.bytes / 1024).toFixed(0)} KB)`)
    console.log(`  ${result.manifest.files.map((file) => `${file.name} sha256 ${file.sha256.slice(0, 16)}…`).join('\n  ')}`)
    console.log('Not in the bundle (see manifest.json → notIncluded):')
    for (const entry of result.manifest.notIncluded) console.log(`  - ${entry.item}`)
    return
  }
  if (command === 'verify') {
    if (!positional) throw new Error('Say which bundle file to check.')
    const { verifyBundle } = await import('../host/bundle.mjs')
    const { manifest } = await verifyBundle(positional)
    const rows = Object.values(manifest.rows.site).reduce((total, count) => total + count, 0)
    console.log(`The bundle is complete and undamaged: made ${manifest.createdAt}, ${manifest.files.length} files, ${rows} rows in the site database, every SHA-256 matches.`)
    return
  }
  if (command === 'restore') {
    if (!positional) throw new Error('Say which bundle file to restore.')
    const { restoreBundle } = await import('../host/bundle.mjs')
    const result = await restoreBundle({ bundle: positional, dataDir })
    console.log(`Restored into ${resolve(dataDir)}.`)
    if (result.previous) console.log(`  The data that was there before is kept in ${result.previous}`)
    if (result.migrationsApplied.length) console.log(`  Upgraded with ${result.migrationsApplied.length} newer migrations.`)
    console.log('  Everyone signs in again (sessions are not moved). Owner links and API keys work as before.')
    console.log('Still to do by hand:')
    for (const entry of result.manifest.notIncluded) console.log(`  - ${entry.todo}`)
    return
  }
  if (command === 'licenses') {
    const lines = []
    const seen = new Map()
    const walk = (folder) => {
      if (!existsSync(folder)) return
      for (const name of readdirSync(folder)) {
        if (name.startsWith('.')) continue
        const path = join(folder, name)
        if (name.startsWith('@')) {
          walk(path)
          continue
        }
        const file = join(path, 'package.json')
        if (!existsSync(file)) continue
        const pkg = JSON.parse(readFileSync(file, 'utf8'))
        const license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? (pkg.licenses ?? []).map((entry) => entry.type).join(' OR ') ?? 'UNKNOWN'
        seen.set(`${pkg.name}@${pkg.version}`, license || 'UNKNOWN')
        walk(join(path, 'node_modules'))
      }
    }
    walk(join(root, 'node_modules'))
    const permissive = /^(\(?(MIT|ISC|BSD-2-Clause|BSD-3-Clause|Apache-2\.0|0BSD|BlueOak-1\.0\.0|CC0-1\.0|Unlicense|Python-2\.0)( OR | AND |\)|$))+/
    const flagged = [...seen].filter(([, license]) => !permissive.test(license))
    lines.push('# Third-party packages', '', 'web-end-selfhost itself is MIT (see LICENSE). The engine is web-end (MIT).', '', '| Package | License |', '| --- | --- |')
    for (const [name, license] of [...seen].sort()) lines.push(`| ${name} | ${license} |`)
    lines.push('', flagged.length ? `Needs a look: ${flagged.map(([name, license]) => `${name} (${license})`).join(', ')}` : 'Every package uses a permissive license (MIT, ISC, BSD, Apache-2.0 or similar).')
    const text = `${lines.join('\n')}\n`
    if (option('out')) writeFileSync(option('out'), text)
    else process.stdout.write(text)
    if (flagged.length) process.exitCode = 2
    return
  }
  if (command === 'doctor') {
    const { loadConfig } = await import('../host/config.mjs')
    const config = loadConfig({ dataDir })
    const release = JSON.parse(readFileSync(join(root, '..', 'cloud', 'latest.json'), 'utf8'))
    const node = process.versions.node.split('.').map(Number)
    const report = [
      ['Node.js', process.versions.node, node[0] > 22 || (node[0] === 22 && node[1] >= 13) ? 'ok' : 'needs 22.13 or newer'],
      ['engine', `web-end ${release.version} (MIT)`, existsSync(join(root, 'dist', 'engine.mjs')) ? 'built' : 'run npm run build'],
      ['data folder', config.dataDir, existsSync(config.databaseFile) ? 'has a site' : 'empty (a new site starts on first visit)'],
      ['master key', config.masterKey ? 'from WEB_END_MASTER_KEY' : config.keyFile, config.masterKey || existsSync(config.keyFile) ? 'present (keep a copy apart from backups)' : 'made on first Studio use'],
      ['listens on', `${config.host}:${config.port}`, config.host === '127.0.0.1' ? 'this computer only' : 'other computers too: put HTTPS in front (see Caddyfile)'],
      ['account with us', 'none', 'nothing to sign up for; no license server'],
      ['telemetry', 'none', 'the server sends no usage data anywhere'],
      ['update check', config.updateCheck ? 'on' : 'off', 'asks raw.githubusercontent.com for the newest web-end version when the back office opens'],
      ['email / payments / Google sign-in', Object.keys(config.engineEnv).filter((key) => key !== 'WEBHOOK_ALLOW_HTTP').join(', ') || 'not set up', 'only used if set'],
      ['Studio', config.studio ? 'on at /studio' : 'off', 'the AI service is the one chosen in Studio settings'],
    ]
    for (const [name, value, note] of report) console.log(`${name.padEnd(36)} ${String(value).padEnd(40)} ${note}`)
    return
  }
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 8).map((line) => line.replace(/^\/\/ ?/, '')).join('\n'))
}

main().catch((error) => {
  console.error(`web-end: ${error.message}`)
  process.exit(1)
})
