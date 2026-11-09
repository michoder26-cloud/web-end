// Runs web-end's own end-to-end suite (cloud/tests/smoke.mjs) against this Node host,
// on a brand-new database in a temporary folder. Usage: npm run test:smoke [-- --keep]
// Optional parts of the suite are switched on the same way as upstream, e.g. SCHEDULE_TEST=1.
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startServer } from '../host/server.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const dataDir = mkdtempSync(join(tmpdir(), 'web-end-smoke-'))
// The suite's optional parts use local stand-ins over plain http, which a test-only switch allows.
// Upstream starts wrangler with these --var values for those parts only; the default run has none.
const on = (name) => process.env[name] === '1'
const env = {}
if (on('WEBHOOK_TEST') || on('SCHEDULE_TEST') || on('AUTOMATION_TEST') || on('NEWS_TEST') || on('GOOGLE_TEST')) env.WEBHOOK_ALLOW_HTTP = '1'
if (on('EMAIL_TEST') || on('SCHEDULE_TEST') || on('AUTOMATION_TEST') || on('NEWS_TEST')) {
  env.RESEND_API_KEY = 're_test_fake'
  env.RESEND_API_BASE = `http://localhost:${process.env.EMAIL_TEST_PORT || (on('EMAIL_TEST') ? 8823 : on('SCHEDULE_TEST') ? 8874 : on('NEWS_TEST') ? 8924 : 8864)}`
}
if (on('GOOGLE_TEST')) Object.assign(env, { GOOGLE_API_BASE: 'http://localhost:8824', GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret' })
const server = await startServer({ dataDir, env, port: 0, schedule: false, testClientAddress: true, testScheduled: true })
console.log(`web-end on Node at ${server.url} (data: ${dataDir})`)
const child = spawn(process.execPath, [join(root, '..', 'cloud', 'tests', 'smoke.mjs'), ...process.argv.slice(2).filter((a) => a !== '--keep')], {
  cwd: join(root, '..', 'cloud'),
  env: { ...process.env, BASE_URL: server.url },
  stdio: ['ignore', 'pipe', 'inherit'],
})
let passed = 0
let failed = 0
child.stdout.on('data', (chunk) => {
  const text = chunk.toString()
  process.stdout.write(text)
  passed += (text.match(/^ok /gm) ?? []).length
  failed += (text.match(/^FAIL/gm) ?? []).length
})
const code = await new Promise((done) => child.on('close', done))
await server.close()
console.log(`\nweb-end smoke suite on Node + SQLite: ${passed} passed, ${failed} failed (exit ${code})`)
process.exit(code === 0 && failed === 0 ? 0 : 1)
