// Tests the Studio end to end against a stand-in AI service (OpenAI-compatible and Anthropic formats),
// so it needs no API key and no internet: sign-in, tool calls into the real engine, approval of risky
// actions, server-side budgets, the repeat guard, key secrecy, the usage ledger and the preview.
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from '../host/server.mjs'
import { contextWindow } from '../builder/agent.mjs'

let failed = 0
let passed = 0
const check = (ok, name, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : `: ${detail}`}`)
  ok ? passed++ : failed++
}

// A stand-in AI: each request takes the next scripted answer, and every request is kept for checks.
const script = []
const seen = []
const mock = createServer((request, response) => {
  let body = ''
  request.on('data', (part) => (body += part))
  request.on('end', () => {
    seen.push({ auth: request.headers.authorization ?? request.headers['x-api-key'] ?? '', body: JSON.parse(body || '{}'), path: request.url })
    const next = script.shift() ?? { text: 'Done.' }
    response.setHeader('Content-Type', 'application/json')
    if (request.url.endsWith('/messages')) {
      const content = [...(next.text ? [{ text: next.text, type: 'text' }] : []), ...(next.calls ?? []).map((call, i) => ({ id: `tu_${seen.length}_${i}`, input: call.args, name: call.name, type: 'tool_use' }))]
      return response.end(JSON.stringify({ content, stop_reason: next.calls ? 'tool_use' : 'end_turn', usage: { input_tokens: 1000, output_tokens: 50 } }))
    }
    const message = { content: next.text ?? null, role: 'assistant', ...(next.calls ? { tool_calls: next.calls.map((call, i) => ({ function: { arguments: JSON.stringify(call.args), name: call.name }, id: `call_${seen.length}_${i}`, type: 'function' })) } : {}) }
    response.end(JSON.stringify({ choices: [{ finish_reason: next.calls ? 'tool_calls' : 'stop', message }], usage: { completion_tokens: 50, prompt_tokens: 1000 } }))
  })
})
await new Promise((done) => mock.listen(0, '127.0.0.1', done))
const mockUrl = `http://127.0.0.1:${mock.address().port}/v1`

const dataDir = mkdtempSync(join(tmpdir(), 'web-end-studio-'))
const server = await startServer({ dataDir, port: 0, schedule: false })
const base = server.url
const claimed = await (await fetch(`${base}/setup`, { method: 'POST', redirect: 'manual' })).text()
const code = claimed.match(/\/mcp\/([a-z0-9-]{20,60})/)?.[1]
check(Boolean(code), 'a fresh install gives the owner a private link')

// Signing in
check((await fetch(`${base}/studio`)).status === 200 && (await (await fetch(`${base}/studio`)).text()).includes('name="link"'), 'the Studio asks for the owner link first')
check((await fetch(`${base}/studio/api/state`)).status === 401, 'the Studio API refuses anyone who has not signed in')
const wrong = await fetch(`${base}/studio/sign-in`, { body: new URLSearchParams({ link: `${base}/owner/aaaaaaaa-bbbbbbbb-cccccccc-dddddddd` }), method: 'POST', redirect: 'manual' })
check(wrong.status === 401, 'a wrong owner link is refused')
const signIn = await fetch(`${base}/studio/sign-in`, { body: new URLSearchParams({ link: `${base}/owner/${code}` }), method: 'POST', redirect: 'manual' })
const cookie = (signIn.headers.get('set-cookie') ?? '').split(';')[0]
check(signIn.status === 303 && /HttpOnly/.test(signIn.headers.get('set-cookie')) && /SameSite=Strict/.test(signIn.headers.get('set-cookie')) && !signIn.headers.get('set-cookie').includes(code), 'the owner link signs in with a private cookie that does not contain the link')
const api = async (path, body, method = body === undefined ? 'GET' : 'POST') => {
  const response = await fetch(`${base}/studio/api/${path}`, { body: body === undefined ? undefined : JSON.stringify(body), headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: base }, method })
  return { body: await response.json(), status: response.status }
}
const page = await (await fetch(`${base}/studio`, { headers: { Cookie: cookie } })).text()
check(page.includes('id="composer"') && !page.includes(code), 'the Studio page opens and never shows the owner link')
const thai = await (await fetch(`${base}/studio`, { headers: { 'Accept-Language': 'th-TH,th;q=0.9', Cookie: cookie } })).text()
check(thai.includes('lang="th"') && thai.includes('หลังร้าน') && thai.includes('data-tab="dashboard"') && thai.includes('id="panel-dashboard"') && thai.includes('href="/studio/office/pages"'), 'the Thai Studio opens a per-site Dashboard with management links')
const chosenThai = await (await fetch(`${base}/studio?lang=th`, { headers: { Cookie: cookie } })).text()
check(chosenThai.includes('lang="th"') && chosenThai.includes('จัดการเว็บของคุณ') && chosenThai.includes('>English</a>'), 'the owner can choose Thai even when the browser language is English')
const pagesShortcut = await fetch(`${base}/studio/office/pages`, { headers: { Cookie: cookie }, redirect: 'manual' })
check(pagesShortcut.status === 303 && pagesShortcut.headers.get('location') === `/owner/${code}/pages` && (await fetch(`${base}/studio/office/unknown`, { headers: { Cookie: cookie }, redirect: 'manual' })).status === 404, 'Dashboard shortcuts open only known back-office sections')
const foreign = await fetch(`${base}/studio/api/settings`, { body: '{}', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'https://evil.test' }, method: 'POST' })
check(foreign.status === 403, 'changes from another site are refused')

// Settings and the key
const secretKey = 'sk-test-THE-SECRET-KEY-123456'
const saved = await api('settings', { apiKey: secretKey, baseUrl: mockUrl, model: 'stand-in-1', provider: 'openai' })
check(saved.status === 200 && saved.body.hints['provider:openai'] === '…3456' && !JSON.stringify(saved.body).includes(secretKey), 'the API key is saved and only its last 4 characters come back')
check((await api('settings', { baseUrl: 'javascript:alert(1)' })).status === 400, 'a provider address must be http or https')
check(!readFileSync(join(dataDir, 'studio.sqlite')).includes(Buffer.from(secretKey)), 'the key is not stored in readable form')
script.push({ calls: [{ args: { ok: true }, name: 'report_connection' }] })
const probe = await api('test', {})
check(probe.body.ok && probe.body.toolCalling && seen.at(-1).auth === `Bearer ${secretKey}`, 'Test connection checks that the model really calls tools, with the saved key')

const waitFor = async (runId, want = (run) => run.status !== 'running') => {
  for (let i = 0; i < 100; i++) {
    const { body } = await api(`runs/${runId}`)
    if (want(body.run)) return body.run
    await new Promise((done) => setTimeout(done, 100))
  }
  throw new Error('run did not finish')
}

// A turn that builds through the engine's own tools, then asks before publishing
script.push(
  { calls: [{ args: {}, name: 'get_site' }], text: 'I will make a class booking system.' },
  { calls: [{ args: { fields: [{ label: 'Title', name: 'title', required: true, type: 'text' }, { label: 'Seats', name: 'seats', required: true, type: 'number' }], label: 'Classes', name: 'classes', readAccess: 'public', writeAccess: 'owner' }, name: 'save_table' }] },
  { calls: [{ args: { table: 'classes', values: { seats: 8, title: 'Morning yoga' } }, name: 'save_record' }] },
  { calls: [{ args: { note: 'First version' }, name: 'publish_site' }] },
  { text: 'Your class booking system is ready.' },
)
const started = await api('chat', { text: 'Make a booking system for my yoga classes.' })
check(started.status === 200 && started.body.run.status === 'running', 'a message starts a run')
check((await api('chat', { text: 'another' })).status === 409, 'a second message waits until the first is done')
const waiting = await waitFor(started.body.run.id)
check(waiting.status === 'waiting' && waiting.pending?.tool === 'publish_site' && waiting.pending.risk === 'risky', 'publishing waits for the owner to allow it', JSON.stringify(waiting))
check(waiting.steps.filter((step) => step.kind === 'tool' && step.outcome === 'done').map((step) => step.tool).join() === 'get_site,save_table,save_record', 'normal changes ran without asking', JSON.stringify(waiting.steps))
const toolsSent = seen.at(-1).body.tools?.map((tool) => tool.function.name) ?? []
check(toolsSent.length >= 60 && toolsSent.includes('save_page') && !toolsSent.some((name) => /shell|exec|file/.test(name)), 'the AI is offered only the site tools, with no shell or file access', String(toolsSent.length))
check(seen.at(-1).body.messages[0].role === 'system' && seen.at(-1).body.messages[0].content.includes('web-end Studio'), 'the AI gets the engine instructions and the Studio rules')
const approved = await api(`runs/${waiting.id}/approve`, {})
const done = await waitFor(approved.body.run.id)
check(done.status === 'done' && done.reply === 'Your class booking system is ready.', 'after the owner allows it, the run publishes and finishes', JSON.stringify(done))
check((await (await fetch(base)).text()).length > 0 && done.steps.some((step) => step.tool === 'publish_site' && step.outcome !== 'declined'), 'the publish step ran after approval', JSON.stringify(done.steps.at(-1)))

const state = await api('state')
check(state.body.messages.at(-1).text === 'Your class booking system is ready.' && state.body.messages[0].text.includes('yoga'), 'the conversation is kept')
check(state.body.tokensToday >= 5 * 1050 && state.body.tokensToday <= state.body.settings.maxTokensPerDay, 'the Dashboard reports actual AI tokens used today for this site')
const activity = await api('activity')
check(activity.body.usage.length >= 5 && activity.body.usage.every((row) => row.model === 'stand-in-1' && row.input_tokens === 1000), 'every AI call is in the usage ledger', JSON.stringify(activity.body.usage[0]))
check(activity.body.usage.every((row) => row.phase === 'completed' && row.cost_micros === null) && state.body.spend.today.unpriced === state.body.spend.today.calls && state.body.spend.trend === null, 'without prices the ledger shows tokens and says the cost is unknown')
check(activity.body.actions.some((row) => row.tool === 'save_table' && row.risk === 'change') && activity.body.actions.some((row) => row.tool === 'publish_site' && row.risk === 'risky'), 'every action is logged with its risk')

// Declining
script.push({ calls: [{ args: { table: 'classes' }, name: 'delete_table' }] }, { text: 'Okay, I kept the table.' })
const del = await api('chat', { text: 'Delete the classes table.' })
const delWait = await waitFor(del.body.run.id)
check(delWait.status === 'waiting' && delWait.pending.tool === 'delete_table', 'deleting waits for approval')
const declined = await waitFor((await api(`runs/${delWait.id}/decline`, {})).body.run.id)
const declineSeen = JSON.stringify(seen.at(-1).body.messages)
check(declined.status === 'done' && declineSeen.includes('The owner declined this action'), 'a declined action is not run, and the AI is told', declined.status)
const mcp = await fetch(`${base}/mcp/${code}`, { body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'tools/call', params: { arguments: {}, name: 'list_tables' } }), headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' }, method: 'POST' })
check((await mcp.text()).includes('classes'), 'the declined delete left the table in place')

// Budgets are checked on the server before each step
await api('settings', { maxStepsPerTurn: 2 })
script.push({ calls: [{ args: {}, name: 'get_site' }] }, { calls: [{ args: {}, name: 'list_tables' }] }, { calls: [{ args: {}, name: 'list_pages' }] }, { text: 'never reached' })
const capped = await waitFor((await api('chat', { text: 'Look around.' })).body.run.id)
check(capped.status === 'stopped' && /2 steps/.test(capped.stopReason) && capped.steps.filter((step) => step.kind === 'tool').length === 2, 'the step budget stops a run before it does more', JSON.stringify(capped))
script.length = 0
await api('settings', { maxStepsPerTurn: 16 })

// The same call three times is stopped
for (let i = 0; i < 4; i++) script.push({ calls: [{ args: { slug: 'nothing-here' }, name: 'get_page' }] })
const looped = await waitFor((await api('chat', { text: 'Find the page.' })).body.run.id)
check(looped.status === 'stopped' && /three times/.test(looped.stopReason) && looped.steps.filter((step) => step.kind === 'tool').length === 2, 'a run repeating the same call is stopped', JSON.stringify(looped.stopReason))
script.length = 0

// Provider trouble stops the run with a reason, and never silently switches provider
await api('settings', { baseUrl: 'http://127.0.0.1:9/v1' })
const broken = await waitFor((await api('chat', { text: 'Hello?' })).body.run.id, (run) => run.status !== 'running')
check(broken.status === 'failed' && /Could not reach the AI service/.test(broken.stopReason), 'an unreachable AI service stops the run and says so', broken.stopReason)
const unreachable = (await api('activity')).body.usage.filter((row) => row.outcome === 'error')
check(unreachable.length === 3 && unreachable.every((row) => row.phase === 'not_sent' && row.input_tokens === 0 && row.cost_micros === null), 'each try that never reached the service is in the ledger as not sent, with no tokens or cost', JSON.stringify(unreachable[0]))

// The owner's own prices and spending limit
await api('settings', { baseUrl: mockUrl, inputPricePerMillion: 2, outputPricePerMillion: 10 })
check((await api('settings', { inputPricePerMillion: -1 })).status === 400 && (await api('settings', { maxCostPerDay: 'lots' })).status === 400, 'a price or limit that is not a sensible number is refused')
script.push({ text: 'Priced.' })
await waitFor((await api('chat', { text: 'Say something.' })).body.run.id)
const pricedState = await api('state')
check((await api('activity')).body.usage[0].cost_micros === 1000 * 2 + 50 * 10 && pricedState.body.spend.today.costMicros === 2500, 'with prices entered, a call shows what it cost', JSON.stringify(pricedState.body.spend.today))
await api('settings', { maxCostPerDay: 0.000001 })
const callsBefore = seen.length
const tooDear = await waitFor((await api('chat', { text: 'One more.' })).body.run.id, (run) => run.status !== 'running')
check(tooDear.status === 'stopped' && /spending limit/.test(tooDear.stopReason) && seen.length === callsBefore, 'a spending limit stops the next call before it is sent to the AI service', tooDear.stopReason)
await api('settings', { inputPricePerMillion: '', maxCostPerDay: 0, outputPricePerMillion: '' })
script.length = 0

// The same work with the Anthropic format
await api('settings', { apiKey: 'sk-ant-test-0000', baseUrl: mockUrl, model: 'claude-stand-in', provider: 'anthropic' })
script.push({ calls: [{ args: {}, name: 'get_site' }] }, { text: 'Seen it.' })
const viaClaude = await waitFor((await api('chat', { text: 'What is on my site?' })).body.run.id)
const last = seen.at(-1)
check(viaClaude.status === 'done' && last.path === '/v1/messages' && last.auth === 'sk-ant-test-0000' && last.body.messages.some((m) => m.content.some?.((block) => block.type === 'tool_result')), 'the Anthropic adapter runs the same tools', JSON.stringify(viaClaude.stopReason))
check(contextWindow([{ role: 'user', text: 'a' }, { role: 'tool', text: 'x'.repeat(5000) }, { role: 'user', text: 'b' }]).find((m) => m.role === 'tool').text.length < 2000, 'old tool results are shortened before they go to the AI')

// Preview in the Studio frame (a starter gives the site pages to show)
await fetch(`${base}/mcp/${code}`, { body: JSON.stringify({ id: 2, jsonrpc: '2.0', method: 'tools/call', params: { arguments: { replacePages: true, starter: 'cafe' }, name: 'apply_starter' } }), headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' }, method: 'POST' }).then((r) => r.text())
const preview = await fetch(`${base}/studio/preview`, { headers: { Cookie: cookie } })
const previewHtml = await preview.text()
check(preview.status === 200 && !previewHtml.includes(code) && /frame-ancestors 'self'/.test(preview.headers.get('content-security-policy') ?? ''), 'the preview opens in the Studio frame without the owner link', String(preview.status))

// Signing out ends the session
await fetch(`${base}/studio/sign-out`, { headers: { Cookie: cookie, Origin: base }, method: 'POST', redirect: 'manual' })
check((await api('state')).status === 401, 'signing out ends the Studio session')

await server.close()
mock.close()
console.log(`\nStudio: ${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
