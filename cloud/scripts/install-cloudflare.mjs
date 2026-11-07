// Installs one independent copy of web-end in the account currently signed in to Wrangler.
// It deliberately refuses to touch an existing site: use `npm run deploy` for later releases.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { spawnSync } from 'node:child_process'

const configPath = path.join(process.cwd(), 'wrangler.jsonc')
const placeholderId = '00000000-0000-0000-0000-000000000000'
const locations = new Set(['weur', 'eeur', 'apac', 'oc', 'wnam', 'enam'])
const jurisdictions = new Set(['eu', 'fedramp', 'us'])
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'

const usage = () => {
  console.log(`
Install your own web-end Worker and D1 database.

Usage:
  npm run install:cloudflare -- <site-name> [--location <region> | --jurisdiction <area>] [--yes]

Examples:
  npm run install:cloudflare -- baan-coffee --location apac
  npm run install:cloudflare -- vienna-studio --jurisdiction eu

Regions: weur, eeur, apac, oc, wnam, enam
Jurisdictions: eu, us, fedramp

This creates a new D1 database and Worker in the Cloudflare account currently signed in to Wrangler.
It never sends Cloudflare credentials anywhere and refuses to overwrite an existing web-end installation.
`)
}

const stop = (message) => {
  console.error(`\n${message}`)
  process.exit(1)
}

function parseArgs(args) {
  const options = { yes: false }
  for (let index = 0; index < args.length; index++) {
    const value = args[index]
    if (value === '--help' || value === '-h') return { help: true }
    if (value === '--yes' || value === '-y') {
      options.yes = true
      continue
    }
    if (value === '--location' || value === '--jurisdiction') {
      const choice = args[++index]
      if (!choice) stop(`${value} needs a value.`)
      options[value.slice(2)] = choice
      continue
    }
    if (!options.name) {
      options.name = value
      continue
    }
    stop(`I don't understand "${value}". Run with --help for the choices.`)
  }
  return options
}

function run(args, { capture = false } = {}) {
  const result = spawnSync(npx, args, { cwd: process.cwd(), encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' })
  if (capture) {
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
  }
  if (result.error) stop(`Could not start Wrangler: ${result.error.message}`)
  if (result.status !== 0) stop(`Cloudflare did not finish the command: npx ${args.join(' ')}`)
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`
}

const quoted = (value) => JSON.stringify(value)

function configuredFor(name, databaseName, databaseId) {
  return (config) => {
    const replacements = [
      [/^(\s*"name"\s*:\s*)"[^"]+"/m, `$1${quoted(name)}`],
      [/("database_name"\s*:\s*)"[^"]+"/, `$1${quoted(databaseName)}`],
      [/("database_id"\s*:\s*)"00000000-0000-0000-0000-000000000000"/, `$1${quoted(databaseId)}`],
    ]
    let next = config
    for (const [pattern, replacement] of replacements) {
      if (!pattern.test(next)) stop('This wrangler.jsonc is not a fresh web-end install. Nothing was changed.')
      next = next.replace(pattern, replacement)
    }
    return next
  }
}

const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

/**
 * The id of the database this run created, and only that one. An account can hold other sites' databases, and
 * running migrations on the wrong one would damage that site, so this never guesses: no match means it stops.
 */
function databaseIdFrom(created, listed, databaseName) {
  // `wrangler d1 create` prints the new binding, such as "database_id": "…", for exactly this database.
  const fromCreate = /"database_id"\s*[:=]\s*"([0-9a-f-]{36})"/i.exec(created)?.[1]
  let fromList = null
  // `d1 list --json` prints a JSON array, possibly after log lines, so try each line that starts one.
  for (const [index] of [...listed.matchAll(/^\s*\[/gm)].map((match) => [match.index])) {
    try {
      const databases = JSON.parse(listed.slice(index))
      const database = Array.isArray(databases) ? databases.find((item) => item?.name === databaseName) : null
      const id = database?.uuid ?? database?.id
      if (typeof id === 'string' && uuidPattern.test(id)) fromList = id
      break
    } catch {
      // Not the JSON array yet; try the next line that starts with "[".
    }
  }
  if (fromCreate && fromList && fromCreate !== fromList) return null
  const id = fromList ?? fromCreate
  return id && uuidPattern.test(id) ? id : null
}

const options = parseArgs(process.argv.slice(2))
if (options.help) {
  usage()
  process.exit(0)
}

if (!options.name || !/^[a-z][a-z0-9-]{1,54}[a-z0-9]$/.test(options.name)) stop('Choose a site name with 3–56 lowercase letters, numbers or hyphens, starting with a letter and ending with a letter or number.')
if (options.location && !locations.has(options.location)) stop(`Location must be one of: ${[...locations].join(', ')}.`)
if (options.jurisdiction && !jurisdictions.has(options.jurisdiction)) stop(`Jurisdiction must be one of: ${[...jurisdictions].join(', ')}.`)
if (options.location && options.jurisdiction) stop('Choose either --location or --jurisdiction, not both.')

let config
try {
  config = await readFile(configPath, 'utf8')
} catch {
  stop('Run this from the cloud folder of a fresh web-end copy, where wrangler.jsonc is located.')
}
if (!config.includes(placeholderId)) stop('This copy already points to a D1 database. Nothing was changed; use npm run deploy for future releases.')

const databaseName = `${options.name}-db`
console.log(`\nThis will create and deploy:\n  Worker: ${options.name}\n  D1 database: ${databaseName}${options.location ? `\n  D1 location hint: ${options.location}` : ''}${options.jurisdiction ? `\n  D1 jurisdiction: ${options.jurisdiction}` : ''}\n`)

if (!options.yes) {
  if (!input.isTTY) stop('Run this in a terminal and confirm the plan, or add --yes after reviewing it.')
  const prompt = createInterface({ input, output })
  const answer = (await prompt.question('Create these resources in your Cloudflare account? [y/N] ')).trim().toLowerCase()
  prompt.close()
  if (answer !== 'y' && answer !== 'yes') stop('Cancelled. Nothing was created.')
}

run(['wrangler', 'whoami'])
const create = ['wrangler', 'd1', 'create', databaseName]
if (options.location) create.push('--location', options.location)
if (options.jurisdiction) create.push('--jurisdiction', options.jurisdiction)
const created = run(create, { capture: true })

const listed = run(['wrangler', 'd1', 'list', '--json'], { capture: true })
const databaseId = databaseIdFrom(created, listed, databaseName)
if (!databaseId) stop(`The D1 database was created, but its ID could not be read safely. Find ${databaseName} in Cloudflare, add its ID to wrangler.jsonc, then run npm run deploy.`)

await writeFile(configPath, configuredFor(options.name, databaseName, databaseId)(config))
console.log('\nSaved your Worker and D1 binding in wrangler.jsonc.')
run(['wrangler', 'd1', 'migrations', 'apply', 'DB', '--remote'])
run(['wrangler', 'deploy', '--message', 'Initial self-hosted web-end installation'])

console.log('\nInstalled. Open the Worker URL shown above, click "Get my Claude link", and save the two private links it gives you.')
