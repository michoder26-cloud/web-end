// Runs every test of web-end-selfhost in turn and prints one summary line each.
// The engine's own end-to-end suite runs with all its optional parts switched on.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const suites = [
  ['D1 conformance', ['tests/d1-conformance.mjs'], {}],
  ['HTMLRewriter stand-in', ['tests/html-rewriter.mjs'], {}],
  ['News progress UTC boundary', ['tests/news-progress.mjs'], {}],
  ['web-end smoke suite (all optional parts)', ['tests/run-smoke.mjs'], { AUTOMATION_TEST: '1', EMAIL_TEST: '1', GOOGLE_TEST: '1', NEWS_TEST: '1', SCHEDULE_TEST: '1', WEBHOOK_TEST: '1' }],
  ['Draft starter privacy', ['tests/draft-starter.mjs'], {}],
  ['Nonempty starter privacy', ['tests/nonempty-starter.mjs'], {}],
  ['Starter concurrency', ['tests/starter-race.mjs'], {}],
  ['Starter data concurrency', ['tests/starter-data-race.mjs'], {}],
  ['Restore token interleavings', ['tests/restore-race.mjs'], {}],
  ['First run', ['tests/first-run.mjs'], {}],
  ['Studio (AI builder)', ['tests/builder.mjs'], {}],
  ['Private document review', ['tests/documents.mjs'], {}],
  ['Ownership checklist', ['tests/ownership.mjs'], {}],
  ['Independent sites', ['tests/sites.mjs'], {}],
]
let bad = 0
for (const [name, args, env] of suites) {
  const started = Date.now()
  const result = spawnSync(process.execPath, ['--no-warnings', ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 })
  const output = `${result.stdout}\n${result.stderr}`
  const summary = output.split('\n').filter((line) => /passed, \d+ failed/.test(line)).at(-1) ?? 'no summary'
  if (result.status !== 0) {
    bad++
    console.log(output.split('\n').filter((line) => line.startsWith('FAIL')).join('\n'))
  }
  console.log(`${result.status === 0 ? 'PASS' : 'FAIL'}  ${name}: ${summary.trim()} (${Math.round((Date.now() - started) / 1000)} s)`)
}
process.exit(bad ? 1 : 0)
