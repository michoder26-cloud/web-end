// The ownership acceptance checklist, as tests that run on every release. Each check names the promise
// it tests (O1…O13, see OWNERSHIP.md). Everything runs on this computer: no account, no internet.
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { startServer } from '../host/server.mjs'
import { createBundle, restoreBundle, verifyBundle } from '../host/bundle.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
let failed = 0
let passed = 0
const results = []
const check = (id, ok, name, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${id}  ${name}${ok || !detail ? '' : `: ${detail}`}`)
  results.push({ id, name, ok })
  ok ? passed++ : failed++
}
const work = mkdtempSync(join(tmpdir(), 'web-end-ownership-'))

async function connect(base, code) {
  const client = new Client({ name: 'ownership-test', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(`/mcp/${code}`, base)))
  return async (name, args = {}) => {
    const result = await client.callTool({ arguments: args, name })
    const text = result.content[0]?.text ?? ''
    try {
      return { data: JSON.parse(text), isError: Boolean(result.isError) }
    } catch {
      return { data: text, isError: Boolean(result.isError) }
    }
  }
}
const apiOf = (base) => async (path, { body, method = body ? 'POST' : 'GET', token } = {}) => {
  const response = await fetch(`${base}/api/v1${path}`, { body: body ? JSON.stringify(body) : undefined, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, method })
  return { body: await response.json().catch(() => null), status: response.status }
}
const claim = async (base) => (await (await fetch(`${base}/setup`, { method: 'POST', redirect: 'manual' })).text()).match(/\/mcp\/([a-z0-9-]{20,60})/)?.[1]

// --- A: a new installation, used by two customers ---
const dataA = join(work, 'a')
let server = await startServer({ dataDir: dataA, port: 0, schedule: false, updateCheck: false })
server.outbound.clear()
let base = server.url
const code = await claim(base)
check('O1', Boolean(code), 'a fresh install becomes the owner\'s with no account anywhere (the first visit claims it)')
let call = await connect(base, code)
await call('apply_starter', { replacePages: true, starter: 'services' })
await call('update_site', { accounts: true })
check('O1', !(await call('save_table', { fields: [{ label: 'What', name: 'what', required: true, type: 'text' }, { label: 'Status', name: 'status', options: ['new', 'done'], default: 'new', readOnly: true, type: 'select' }], label: 'Requests', name: 'requests', readAccess: 'own', writeAccess: 'members' })).isError, 'the owner builds a customer portal table (each customer sees only their own requests)')
await call('publish_site', { note: 'First' })
let api = apiOf(base)
const signup = (name) => api('/auth/signup', { body: { email: `${name}@portal.test`, name, password: `${name}-long-password` } })
const ann = (await signup('ann')).body.token
const ben = (await signup('ben')).body.token
check('O1', Boolean(ann && ben), 'two customers sign up')
await api('/data/requests', { body: { what: 'Fix my sink' }, token: ann })
await api('/data/requests', { body: { what: 'Paint the fence' }, token: ann })
await api('/data/requests', { body: { what: 'Ben\'s request' }, token: ben })
const annSees = (await api('/data/requests', { token: ann })).body.records.map((row) => row.what).sort().join()
check('O5', annSees === 'Fix my sink,Paint the fence', 'a customer sees only their own records', annSees)
const stranger = await api('/data/requests')
check('O5', [401, 403, 404].includes(stranger.status) || stranger.body?.records?.length === 0, 'a visitor who is not signed in sees no records', String(stranger.status))
await fetch(`${base}/owner/${code}`)
const contacted = server.outbound.list()
check('O9', contacted.every((entry) => entry.count === 0), 'with the update check off, the server contacted no other computer while being set up and used', JSON.stringify(contacted))
check('O9', contacted.some((entry) => entry.purpose === 'update check' && entry.blocked > 0), 'the one built-in connection (the release check on GitHub) was blocked as asked', JSON.stringify(contacted))
let second = null
try {
  second = await startServer({ dataDir: dataA, port: 0, schedule: false })
} catch (error) {
  second = error
}
check('O6', second instanceof Error && /already using/.test(second.message), 'a second server cannot open the same data at once')

// O2/O3: the builder off, the site goes on
const bundleWhileRunning = await createBundle({ dataDir: dataA, out: join(work, 'portal.tar.gz') })
check('O4', bundleWhileRunning.manifest.files.some((f) => f.name === 'site.sqlite') && bundleWhileRunning.manifest.rows.site.data_records >= 3, 'a backup can be made while the site keeps running', JSON.stringify(bundleWhileRunning.manifest.rows.site.data_records))
await server.close()
server = await startServer({ dataDir: dataA, port: 0, schedule: false, studio: false, updateCheck: false })
base = server.url
api = apiOf(base)
check('O3', (await fetch(`${base}/studio`)).status === 404 && (await fetch(base)).status === 200, 'with the Studio turned off, the published site still serves')
check('O3', (await api('/auth/login', { body: { email: 'ann@portal.test', password: 'ann-long-password' } })).status === 200 && (await api('/data/requests', { body: { what: 'Without the builder' }, token: ann })).status === 201, 'customers still sign in and add records with no builder and no AI')
await server.close()

// O4: the bundle is checked, and damage is caught
const { manifest } = await verifyBundle(bundleWhileRunning.file)
check('O4', manifest.files.every((file) => /^[0-9a-f]{64}$/.test(file.sha256)) && manifest.migrations.includes('0030_publish_interlock.sql'), 'the bundle lists every file with its SHA-256 and the schema version')
check('O12', manifest.notIncluded.length >= 5 && manifest.notIncluded.some((entry) => /STRIPE_SECRET_KEY/.test(entry.item)) && manifest.notIncluded.some((entry) => /DNS/.test(entry.item)), 'the bundle says plainly what it does not carry')
const damaged = join(work, 'damaged.tar.gz')
copyFileSync(bundleWhileRunning.file, damaged)
const bytes = readFileSync(damaged)
bytes[Math.floor(bytes.length / 2)] ^= 0xff
writeFileSync(damaged, bytes)
let damageCaught = false
try {
  await verifyBundle(damaged)
} catch {
  damageCaught = true
}
check('O4', damageCaught, 'a damaged bundle is refused')

// O6: a restore that fails half-way leaves the existing site exactly as it was
const dataC = join(work, 'c')
server = await startServer({ dataDir: dataC, port: 0, schedule: false, updateCheck: false })
const codeC = await claim(server.url)
let running = false
try {
  await restoreBundle({ bundle: bundleWhileRunning.file, dataDir: dataC })
} catch (error) {
  running = /Stop it before restoring/.test(error.message)
}
check('O6', running, 'a restore refuses to replace data while its server runs')
await server.close()
for (const step of ['check', 'prepare']) {
  try {
    await restoreBundle({ bundle: bundleWhileRunning.file, dataDir: dataC, failAfter: step })
  } catch {
    // Expected.
  }
  server = await startServer({ dataDir: dataC, port: 0, schedule: false, updateCheck: false })
  check('O6', (await fetch(`${server.url}/owner/${codeC}`)).status === 200 && (await fetch(`${server.url}/owner/${code}`)).status === 404, `a restore that stops ${step === 'check' ? 'right after checking' : 'just before the swap'} leaves the old site whole`)
  await server.close()
}
try {
  await restoreBundle({ bundle: damaged, dataDir: dataC })
} catch {
  // Expected.
}
server = await startServer({ dataDir: dataC, port: 0, schedule: false, updateCheck: false })
check('O4', (await fetch(`${server.url}/owner/${codeC}`)).status === 200, 'restoring a damaged bundle changes nothing')
await server.close()

// O4/O5/O8: the move itself, onto a server that already had another site
const restored = await restoreBundle({ bundle: bundleWhileRunning.file, dataDir: dataC })
check('O8', Boolean(restored.previous) && existsSync(join(restored.previous, 'site.sqlite')), 'the replaced data is kept beside the restored one, never deleted')
server = await startServer({ dataDir: dataC, port: 0, schedule: false, updateCheck: false })
base = server.url
api = apiOf(base)
check('O8', (await fetch(`${base}/owner/${code}`)).status === 200 && (await fetch(`${base}/owner/${codeC}`)).status === 404, 'after the move the owner link from the old server works on the new one')
check('O5', (await api('/data/requests', { token: ann })).status === 401, 'old sign-in sessions do not move: everyone signs in again')
const annAgain = (await api('/auth/login', { body: { email: 'ann@portal.test', password: 'ann-long-password' } })).body?.token
const annRecords = annAgain ? (await api('/data/requests', { token: annAgain })).body.records.map((row) => row.what).sort().join() : ''
check('O5', annRecords === 'Fix my sink,Paint the fence', 'customers sign in with the same password and see exactly their own records', annRecords)
const benAgain = (await api('/auth/login', { body: { email: 'ben@portal.test', password: 'ben-long-password' } })).body?.token
check('O5', benAgain && (await api('/data/requests', { token: benAgain })).body.records.length === 1, 'permissions are the same after the move')
call = await connect(base, code)
const tables = (await call('list_tables')).data
check('O4', Array.isArray(tables) && tables.some((table) => table.name === 'requests'), 'tables, rules and pages arrive with the data')
check('O4', (await (await fetch(base)).text()).length > 1000, 'the published site is served on the new server')
await server.close()

// O7: the AI provider is a setting, not a dependency (the Studio tests prove each adapter)
const studioSource = readFileSync(join(root, 'builder', 'providers.mjs'), 'utf8')
check('O7', ['anthropic', 'ollama', 'openai'].every((kind) => studioSource.includes(`${kind}: {`)) && !/fallback\s*=|fallbackProvider/i.test(studioSource), 'three kinds of AI service can be chosen, including a model on this computer, with no hidden fallback')

// O10: nothing in the code checks a license or registration
const engine = readFileSync(join(root, 'dist', 'engine.mjs'), 'utf8')
check('O10', !/license[_-]?(key|server|check)|activation[_-]?key|registerInstall/i.test(engine), 'the engine has no license key, license server or activation')

// O13: every bundled package has a permissive license
const licenses = spawnSync(process.execPath, [join(root, 'bin', 'web-end.mjs'), 'licenses'], { encoding: 'utf8' })
check('O13', licenses.status === 0 && licenses.stdout.includes('Every package uses a permissive license'), 'every bundled package is under a permissive license', licenses.stdout.split('\n').at(-2))

writeFileSync(join(work, 'ownership-report.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2))
console.log(`\nOwnership: ${passed} passed, ${failed} failed (report: ${join(work, 'ownership-report.json')})`)
process.exit(failed ? 1 : 0)
