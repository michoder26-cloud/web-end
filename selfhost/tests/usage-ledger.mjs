// Tests the Studio's AI usage ledger on its own: every call is written down once, limits hold when many
// calls start together, an interrupted call is reported honestly, and costs come only from the owner's prices.
// Usage: node tests/usage-ledger.mjs
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { defaultSettings, openStore, priceOf } from '../builder/store.mjs'

let failed = 0
const check = (ok, name, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : `  (${detail})`}`)
  if (!ok) failed++
}

const folder = mkdtempSync(path.join(tmpdir(), 'web-end-ledger-'))
const config = { keyFile: path.join(folder, 'key'), masterKey: 'test-master-key', studioFile: path.join(folder, 'studio.sqlite') }
const call = { model: 'stand-in', provider: 'openai', runId: 'run_1' }
let store = openStore(config)
const settings = { ...defaultSettings }

// One call, one line
const first = store.beginUsage(call, settings)
check(first.ok && first.requestId.startsWith('req_'), 'a call is written down before it is sent')
check(store.usage(5)[0].outcome === 'started' && store.usage(5)[0].phase === 'sent_unconfirmed', 'until it ends, the line says it may be running')
check(store.finishUsage(first.requestId, { inputTokens: 1000, outcome: 'reply', outputTokens: 50 }, settings) === true, 'the call is closed with what it used')
check(store.finishUsage(first.requestId, { inputTokens: 9999, outcome: 'reply', outputTokens: 9999 }, settings) === false && store.tokensSince(0) === 1050, 'closing the same call twice changes nothing')
check(store.usage(5).length === 1 && store.usage(5)[0].phase === 'completed', 'one call makes exactly one line')

// Costs come only from prices the owner entered
check(store.usage(5)[0].cost_micros === null && store.spendSince(0).unpriced === 1, 'without prices, the cost is unknown, never zero')
check(priceOf(settings, 'ollama').input === 0 && priceOf(settings, 'openai') === null, 'a model on this computer costs nothing, and an unknown price stays unknown')
const priced = { ...settings, inputPricePerMillion: 3, outputPricePerMillion: 15 }
const second = store.beginUsage(call, priced)
store.finishUsage(second.requestId, { inputTokens: 1000, outcome: 'reply', outputTokens: 50 }, priced)
check(store.usage(5)[0].cost_micros === 1000 * 3 + 50 * 15, 'with prices, a call costs its tokens times the prices', String(store.usage(5)[0].cost_micros))
const third = store.beginUsage(call, { ...priced, inputPricePerMillion: 300 })
store.finishUsage(third.requestId, { inputTokens: 1000, outcome: 'reply', outputTokens: 0 }, { ...priced, inputPricePerMillion: 300 })
check(store.usage(5)[1].cost_micros === 3750, 'a later price change never rewrites an earlier cost')
check(store.spendSince(0).costMicros === 3750 + 300_000 && store.spendSince(0).unpriced === 1, 'totals add the known costs and count the unknown ones')

// A failed call says how far it got, and costs nothing
const unreachable = store.beginUsage(call, priced)
store.finishUsage(unreachable.requestId, { outcome: 'error', phase: 'not_sent' }, priced)
check(store.usage(5)[0].phase === 'not_sent' && store.usage(5)[0].cost_micros === null && store.usage(5)[0].input_tokens === 0, 'a call that never reached the service is marked not sent, with no tokens or cost')

// Limits hold when many calls start together
const tokensNow = store.tokensSince(0)
const capped = { ...settings, maxTokensPerDay: tokensNow + 5000 }
const started = Array.from({ length: 20 }, () => store.beginUsage(call, capped))
const allowed = started.filter((one) => one.ok)
check(allowed.length >= 1 && allowed.length < 20 && started.some((one) => !one.ok && /tokens today/.test(one.reason)), 'of 20 calls started together, only as many as fit the daily limit are let through', `${allowed.length} allowed`)
for (const one of allowed) store.finishUsage(one.requestId, { inputTokens: 1000, outcome: 'reply', outputTokens: 50 }, capped)
check(store.tokensSince(0) <= capped.maxTokensPerDay + 1050, 'together they stay within the limit, give or take one call', `${store.tokensSince(0)} of ${capped.maxTokensPerDay}`)
check(store.beginUsage(call, capped).ok === false, 'once the limit is reached, the next call is refused before it is sent')

const spendNow = store.spendSince(0).costMicros / 1e6
const money = { ...priced, maxCostPerDay: spendNow + 0.000001 }
const paid = store.beginUsage(call, money)
store.finishUsage(paid.requestId, { inputTokens: 1000, outcome: 'reply', outputTokens: 50 }, money)
const overMoney = store.beginUsage(call, money)
check(paid.ok && !overMoney.ok && overMoney.limit === 'maxCostPerDay' && /spending limit/.test(overMoney.reason), 'a spending limit in dollars stops calls the same way', overMoney.reason)
check(store.beginUsage(call, { ...priced, maxTokensPerMonth: 1 }).limit === 'maxTokensPerMonth', 'a monthly limit is checked too')
check(store.beginUsage(call, { ...settings, maxTokensPerDay: 0, maxTokensPerMonth: 0, maxCostPerDay: 0, maxCostPerMonth: 0 }).ok, 'a limit of 0 means no limit')

// A call still open when the Studio stops is not lost, and not claimed as finished
const interrupted = store.beginUsage(call, settings)
const before = store.usage(100).length
store.close()
store = openStore(config)
const after = store.usage(100)
const row = after.find((one) => one.outcome === 'interrupted')
check(after.length === before && Boolean(row) && row.phase === 'sent_unconfirmed', 'after a restart, an open call is kept and marked as interrupted, since it may have run')
check(store.finishUsage(interrupted.requestId, { inputTokens: 5, outcome: 'reply', outputTokens: 5 }, settings) === false, 'an interrupted call cannot be closed later as if nothing happened')
check(store.beginUsage(call, { ...settings, maxTokensPerDay: store.tokensSince(0) + 1_000_000 }).ok, 'an interrupted call no longer holds back new ones')

// Unusual spend needs two weeks of history
check(store.spendTrend() === null, 'with less than 14 days of use, no trend is claimed')
const week = 7 * 24 * 60 * 60 * 1000
const now = Date.now()
const old = store.beginUsage(call, settings, now - 2 * week - 1000)
store.finishUsage(old.requestId, { inputTokens: 10_000, outcome: 'reply', outputTokens: 0 }, settings)
const recent = store.beginUsage(call, settings, now - 1000)
store.finishUsage(recent.requestId, { inputTokens: 90_000, outcome: 'reply', outputTokens: 0 }, settings)
const trend = store.spendTrend(now)
check(trend !== null && trend.unusual === true && trend.recent > trend.before * 2, 'a week that used more than twice the week before is flagged', JSON.stringify(trend))

store.close()
rmSync(folder, { force: true, recursive: true })
console.log(failed ? `\n${failed} checks failed.` : '\nAll checks passed.')
process.exit(failed ? 1 : 0)
