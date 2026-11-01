// Runs every check on one site and writes a plain-language report to <site>/docs/report.md.
// Usage: npm run gates -- --site sites/my-site [--only secrets,access]
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const option = (name) => {
  const index = process.argv.indexOf(`--${name}`)
  return index > -1 ? process.argv[index + 1] : undefined
}
const site = path.resolve(root, option('site') || 'template')
const only = option('only')?.split(',')
const port = 3100
const baseURL = `http://localhost:${port}`
const logs = path.join(site, '.gates-db', 'logs')

if (!existsSync(path.join(site, 'node_modules'))) {
  console.error(`${path.relative(root, site)} is not installed. Run npm run setup or npm run new-site first.`)
  process.exit(1)
}
mkdirSync(logs, { recursive: true })

const env = {
  ...process.env,
  CI: '1',
  NEXT_TELEMETRY_DISABLED: '1',
  NODE_OPTIONS: '--no-deprecation --max-old-space-size=6000',
  PAYLOAD_SECRET: randomBytes(32).toString('hex'),
}
const serverEnv = { ...env, NODE_ENV: 'production', WEBEND_DB_DIR: '.gates-db/server' }

const exec = (id, command, options = {}) => {
  const result = spawnSync(command, {
    cwd: site,
    encoding: 'utf8',
    env,
    maxBuffer: 1024 * 1024 * 256,
    shell: true,
    ...options,
  })
  const output = `${result.stdout || ''}${result.stderr || ''}`
  writeFileSync(path.join(logs, `${id}.log`), output)
  return { ok: result.status === 0, output }
}

const normalize = (text) => text.replace(/\r\n/g, '\n')
const notes = []

const gates = [
  {
    id: 'secrets',
    title: 'No passwords or keys in the project',
    run: (id) => exec(id, `node "${path.join(here, 'secrets.mjs')}"`, { cwd: root }),
  },
  {
    id: 'types',
    title: 'Front end and back end agree on the data',
    run: (id) => {
      const file = path.join(site, 'src/payload-types.ts')
      const before = readFileSync(file, 'utf8')
      const result = exec(id, 'npx --no-install payload generate:types')
      const after = readFileSync(file, 'utf8')
      if (normalize(before) === normalize(after)) return result
      writeFileSync(file, before)
      return { ok: false, output: 'The data model changed but src/payload-types.ts was not regenerated.' }
    },
  },
  {
    id: 'typecheck',
    title: 'Code has no type errors',
    run: (id) => {
      rmSync(path.join(site, '.next'), { force: true, recursive: true })
      return exec(id, 'npx --no-install tsc --noEmit')
    },
  },
  { id: 'lint', title: 'Code follows the project rules', run: (id) => exec(id, 'npx --no-install eslint .') },
  {
    id: 'access',
    title: 'People can only reach what they are allowed to',
    run: (id) => exec(id, 'npx --no-install vitest run --config ./vitest.config.mts'),
  },
  {
    id: 'audit',
    title: 'No serious known holes in the libraries used',
    run: (id) => {
      const { output } = exec(id, 'npm audit --omit=dev --json')
      const exceptions = JSON.parse(readFileSync(path.join(here, 'audit-exceptions.json'), 'utf8'))
      const today = new Date().toISOString().slice(0, 10)
      const accepted = new Map(exceptions.filter((item) => item.expires >= today).map((item) => [item.advisory, item]))
      const serious = new Map()
      for (const { via } of Object.values(JSON.parse(output).vulnerabilities || {})) {
        for (const advisory of via) {
          if (typeof advisory === 'object' && ['high', 'critical'].includes(advisory.severity)) {
            serious.set(advisory.url, `${advisory.severity}: ${advisory.name}: ${advisory.title} (${advisory.url})`)
          }
        }
      }
      const open = [...serious].filter(([url]) => ![...accepted.keys()].some((id) => url.endsWith(id)))
      for (const item of accepted.values()) notes.push(`Accepted until ${item.expires}: ${item.package} (${item.advisory}). ${item.reason}`)
      return { ok: open.length === 0, output: open.map(([, text]) => text).join('\n') }
    },
  },
  {
    id: 'migrate',
    title: 'Database can be set up from nothing',
    run: (id) => {
      rmSync(path.join(site, '.gates-db/server'), { force: true, recursive: true })
      return exec(id, 'npx --no-install payload migrate', { env: serverEnv })
    },
  },
  {
    id: 'build',
    title: 'Site builds for production',
    needs: ['migrate'],
    run: (id) => exec(id, 'npx --no-install next build --webpack', { env: serverEnv }),
  },
  {
    id: 'e2e',
    title: 'Real browser tests pass on desktop and mobile',
    needs: ['build'],
    server: true,
    run: (id) => {
      const browser = exec(`${id}-browser`, 'npx --no-install playwright install chromium')
      if (!browser.ok) return browser
      notes.push('Reading an uploaded image could not be tested on the local test server. Check one on the live site after publishing.')
      return exec(id, 'npx --no-install playwright test', {
        env: { ...env, BASE_URL: baseURL, GATES_RUNTIME: 'next-start' },
      })
    },
  },
  {
    id: 'quality',
    title: 'Links work, and speed, access and SEO meet the minimum',
    needs: ['build'],
    server: true,
    run: (id) =>
      exec(id, `node "${path.join(here, 'quality.mjs')}"`, {
        env: { ...env, BASE_URL: baseURL, SITE_DIR: site },
      }),
  },
]

let server

async function startServer() {
  if (server) return
  const log = openSync(path.join(logs, 'server.log'), 'w')
  server = spawn('npx --no-install next start -p ' + port, {
    cwd: site,
    env: serverEnv,
    shell: true,
    stdio: ['ignore', log, log],
  })
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      if ((await fetch(baseURL)).status < 500) return
    } catch {
      // Not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error('The site did not start.')
}

function stopServer() {
  if (!server) return
  if (process.platform === 'win32') spawnSync(`taskkill /pid ${server.pid} /t /f`, { shell: true, stdio: 'ignore' })
  else server.kill()
  server = undefined
}

const results = new Map()
try {
  for (const gate of gates) {
    if (only && !only.includes(gate.id)) continue
    const blocked = (gate.needs || []).find((need) => ['failed', 'skipped'].includes(results.get(need)?.status))
    if (blocked) {
      results.set(gate.id, { status: 'skipped', detail: `Needs "${blocked}" to pass first.` })
      console.log(`SKIP  ${gate.title}`)
      continue
    }
    process.stdout.write(`...   ${gate.title}\r`)
    try {
      if (gate.server) await startServer()
      const { ok, output } = gate.run(gate.id)
      results.set(gate.id, { status: ok ? 'passed' : 'failed', detail: ok ? '' : output.trim().split('\n').slice(-15).join('\n') })
    } catch (error) {
      results.set(gate.id, { status: 'failed', detail: error.message })
    }
    console.log(`${results.get(gate.id).status === 'passed' ? 'PASS' : 'FAIL'}  ${gate.title}`)
  }
} finally {
  stopServer()
}

const label = { failed: 'Failed', passed: 'Passed', skipped: 'Not run' }
const rows = gates
  .filter((gate) => results.has(gate.id))
  .map((gate) => `| ${gate.title} | ${label[results.get(gate.id).status]} |`)
const failures = gates
  .filter((gate) => results.get(gate.id)?.status === 'failed')
  .map((gate) => `### ${gate.title}\n\n\`\`\`\n${results.get(gate.id).detail}\n\`\`\``)
const allPassed = [...results.values()].every((result) => result.status === 'passed')
const complete = !only

const report = `# Site check report

${new Date().toISOString().slice(0, 10)}, \`${path.relative(root, site).replaceAll('\\', '/')}\`

**${allPassed && complete ? 'All checks passed.' : allPassed ? 'The checks that ran passed. This was a partial run.' : 'Some checks did not pass. Do not publish yet.'}**

| Check | Result |
| --- | --- |
${rows.join('\n')}
${failures.length ? `\n## What failed\n\n${failures.join('\n\n')}\n` : ''}${notes.length ? `\n## Known risks accepted\n\n${notes.map((note) => `- ${note}`).join('\n')}\n` : ''}
## What these checks do not cover

Passing means the common mistakes were not found. It is not the same as a review by a security expert.

- Business logic mistakes that no test was written for
- Attacks that need a person to think creatively, and heavy traffic
- Legal duties such as privacy notices, imprint, cookies and consumer law
- Whether the words on the site are true and the design suits your customers
- Password strength rules, spam protection on forms, and backups

Get a professional review before you handle payments, health data or other sensitive personal data.
`
mkdirSync(path.join(site, 'docs'), { recursive: true })
writeFileSync(path.join(site, 'docs/report.md'), report)
console.log(`\nReport: ${path.relative(root, path.join(site, 'docs/report.md'))}`)
process.exit(allPassed ? 0 : 1)
