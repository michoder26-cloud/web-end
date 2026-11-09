// The Studio's two pages. Plain HTML, CSS and a small script with a per-page nonce: no framework,
// no outside fonts or scripts, so it works offline and loads nothing from anyone else's servers.

const words = {
  en: {
    activity: 'Activity', apiKey: 'API key', apiKeyHint: 'Kept encrypted on this server. Only its last 4 characters are shown.', approval: 'Ask me before',
    approvalAll: 'every change', approvalNone: 'nothing (not recommended)', approvalRisky: 'risky actions: publishing, deleting, emailing, orders, roles, outside systems',
    approve: 'Allow', baseUrl: 'Address (optional)', baseUrlHint: 'Leave empty for the provider\'s usual address. For LM Studio, vLLM or another OpenAI-compatible server, put its …/v1 address here.',
    budget: 'Limits', clearKey: 'Remove saved key', decline: 'Don\'t allow', empty: 'Tell the Studio what you want to build, for example: "A booking system for my yoga classes: customers sign up, book a class with limited seats, and I see the list each morning."',
    intro: 'Your own builder. It runs on your computer or server, and uses the AI service you choose.', link: 'Your owner link', linkHint: 'Paste the private owner link you got when you set up the site (it ends in four groups of 8 letters and numbers).',
    live: 'Live site', maxDay: 'AI tokens per day', maxSeconds: 'Seconds per message', maxSteps: 'Steps per message', maxTokens: 'AI tokens per message', model: 'Model', modelHint: 'For example gpt-5-mini, claude-sonnet-5-5, gemini-3-flash or, with Ollama, qwen3:14b.',
    noActivity: 'Nothing yet.', office: 'Back office', pending: 'The Studio wants to', preview: 'Preview', provider: 'AI service', save: 'Save settings', saved: 'Saved.', send: 'Send', settings: 'Settings',
    signIn: 'Open the Studio', signInBad: 'That link is not right for this site. Check it and try again.', signOut: 'Sign out', stop: 'Stop', test: 'Test connection', testing: 'Testing…', thinking: 'Working…',
    title: 'web-end Studio', usage: 'AI use', wrote: 'You',
  },
  th: {
    activity: 'ประวัติการทำงาน', apiKey: 'API key', apiKeyHint: 'เก็บแบบเข้ารหัสไว้ในเซิร์ฟเวอร์นี้ จะแสดงเฉพาะ 4 ตัวท้าย', approval: 'ถามฉันก่อน',
    approvalAll: 'ทุกการเปลี่ยนแปลง', approvalNone: 'ไม่ต้องถาม (ไม่แนะนำ)', approvalRisky: 'งานเสี่ยง: เผยแพร่ ลบ ส่งอีเมล คำสั่งซื้อ สิทธิ์ผู้ใช้ และการเชื่อมระบบภายนอก',
    approve: 'อนุญาต', baseUrl: 'ที่อยู่บริการ (ไม่บังคับ)', baseUrlHint: 'เว้นว่างเพื่อใช้ที่อยู่ปกติของผู้ให้บริการ ถ้าใช้ LM Studio, vLLM หรือเซิร์ฟเวอร์แบบ OpenAI-compatible อื่น ให้ใส่ที่อยู่ที่ลงท้ายด้วย /v1',
    budget: 'ขีดจำกัด', clearKey: 'ลบ key ที่บันทึกไว้', decline: 'ไม่อนุญาต', empty: 'บอก Studio ว่าอยากสร้างอะไร เช่น "ระบบจองคลาสโยคะ ลูกค้าสมัครสมาชิก จองคลาสที่มีที่นั่งจำกัด และฉันดูรายชื่อได้ทุกเช้า"',
    intro: 'เครื่องมือสร้างแอปของคุณเอง ทำงานบนเครื่องหรือเซิร์ฟเวอร์ของคุณ และใช้บริการ AI ที่คุณเลือก', link: 'ลิงก์เจ้าของเว็บ', linkHint: 'วางลิงก์ส่วนตัวของเจ้าของที่ได้ตอนตั้งค่าเว็บ (ท้ายลิงก์เป็นตัวอักษรและตัวเลข 4 ชุด ชุดละ 8 ตัว)',
    live: 'เว็บจริง', maxDay: 'จำนวน token ต่อวัน', maxSeconds: 'วินาทีต่อข้อความ', maxSteps: 'จำนวนขั้นตอนต่อข้อความ', maxTokens: 'จำนวน token ต่อข้อความ', model: 'โมเดล', modelHint: 'เช่น gpt-5-mini, claude-sonnet-5-5, gemini-3-flash หรือถ้าใช้ Ollama เช่น qwen3:14b',
    noActivity: 'ยังไม่มี', office: 'หลังร้าน', pending: 'Studio ขออนุญาต', preview: 'ตัวอย่าง', provider: 'บริการ AI', save: 'บันทึกการตั้งค่า', saved: 'บันทึกแล้ว', send: 'ส่ง', settings: 'ตั้งค่า',
    signIn: 'เปิด Studio', signInBad: 'ลิงก์นี้ไม่ตรงกับเว็บนี้ ตรวจแล้วลองใหม่', signOut: 'ออกจากระบบ', stop: 'หยุด', test: 'ทดสอบการเชื่อมต่อ', testing: 'กำลังทดสอบ…', thinking: 'กำลังทำงาน…',
    title: 'web-end Studio', usage: 'การใช้ AI', wrote: 'คุณ',
  },
}

const style = `
:root{--ink:#1d2321;--soft:#5d6763;--line:#dfe4e1;--paper:#f7f8f6;--card:#fff;--accent:#1f6f5b;--accent-ink:#fff;--warn:#9a5b00;--bad:#a12c2c;font-family:system-ui,-apple-system,"Segoe UI","Noto Sans Thai","Leelawadee UI",sans-serif;color:var(--ink);background:var(--paper)}
*{box-sizing:border-box}body{margin:0;min-height:100vh}a{color:var(--accent)}
header{display:flex;gap:16px;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:1px solid var(--line);background:var(--card);flex-wrap:wrap}
header h1{font-size:18px;margin:0}header nav{display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:14px}
button,.button{font:inherit;border:1px solid var(--accent);background:var(--accent);color:var(--accent-ink);border-radius:8px;padding:8px 14px;cursor:pointer}
button.quiet{background:transparent;color:var(--accent)}button:disabled{opacity:.5;cursor:default}
main{display:grid;grid-template-columns:minmax(320px,1fr) minmax(320px,1.2fr);gap:0;height:calc(100vh - 57px)}
@media (max-width:900px){main{grid-template-columns:1fr;height:auto}#side{min-height:70vh}}
#chat{display:flex;flex-direction:column;border-right:1px solid var(--line);min-height:0}
#log{flex:1;overflow:auto;padding:16px 20px;display:flex;flex-direction:column;gap:12px}
.msg{max-width:92%;padding:10px 14px;border-radius:12px;white-space:pre-wrap;line-height:1.5;overflow-wrap:anywhere}
.user{align-self:flex-end;background:#e3efe9}.assistant{align-self:flex-start;background:var(--card);border:1px solid var(--line)}
.steps{font-size:13px;color:var(--soft);border-left:3px solid var(--line);padding:4px 10px;display:flex;flex-direction:column;gap:3px}
.steps .error,.steps .declined{color:var(--bad)}.steps .risky{color:var(--warn)}
.notice{border:1px solid var(--warn);background:#fff8ec;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px}
.notice.bad{border-color:var(--bad);background:#fff1f1}.notice pre{margin:0;max-height:160px;overflow:auto;font-size:12px;white-space:pre-wrap}
form#composer{display:flex;gap:8px;padding:12px 20px;border-top:1px solid var(--line);background:var(--card)}
textarea{flex:1;font:inherit;padding:10px;border:1px solid var(--line);border-radius:8px;resize:vertical;min-height:64px}
#side{display:flex;flex-direction:column;min-height:0}.tabs{display:flex;gap:4px;padding:8px 12px;border-bottom:1px solid var(--line);background:var(--card)}
.tabs button{background:transparent;color:var(--ink);border-color:transparent}.tabs button[aria-selected=true]{border-color:var(--line);background:var(--paper)}
.panel{flex:1;overflow:auto;min-height:0}.panel[hidden]{display:none}iframe{width:100%;height:100%;border:0;background:#fff}
.form{padding:16px 20px;display:grid;gap:14px;max-width:640px}label{display:grid;gap:4px;font-weight:600;font-size:14px}
label small,.hint{font-weight:400;color:var(--soft);font-size:13px}input,select{font:inherit;padding:8px;border:1px solid var(--line);border-radius:8px;width:100%}
fieldset{border:1px solid var(--line);border-radius:10px;display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
.wrap{padding:16px 20px;display:grid;gap:18px}.signin{max-width:520px;margin:10vh auto;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px;display:grid;gap:16px}
.error{color:var(--bad)}.stack{display:grid;gap:6px}.row{display:flex;gap:8px;flex-wrap:wrap}
`

const escape = (text) => String(text).replace(/[&<>"']/g, (char) => ({ '"': '&quot;', '&': '&amp;', "'": '&#39;', '<': '&lt;', '>': '&gt;' })[char])

export function signInPage({ error = false, lang, nonce }) {
  const w = words[lang]
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${w.title}</title><style nonce="${nonce}">${style}</style></head>
<body><form class="signin" method="post" action="/studio/sign-in"><h1>${w.title}</h1><p>${escape(w.intro)}</p>
${error ? `<p class="error" role="alert">${escape(w.signInBad)}</p>` : ''}
<label>${escape(w.link)}<input name="link" type="password" autocomplete="off" required autofocus><small>${escape(w.linkHint)}</small></label>
<button type="submit">${escape(w.signIn)}</button></form></body></html>`
}

export function studioPage({ lang, nonce }) {
  const w = words[lang]
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${w.title}</title><style nonce="${nonce}">${style}</style></head>
<body>
<header><h1>${w.title}</h1><nav><a href="/studio/office" target="_blank" rel="noreferrer">${w.office}</a><a href="/" target="_blank" rel="noreferrer">${w.live}</a>
<form method="post" action="/studio/sign-out"><button class="quiet" type="submit">${w.signOut}</button></form></nav></header>
<main>
<section id="chat" aria-label="Chat"><div id="log" aria-live="polite"></div>
<form id="composer"><textarea id="text" placeholder="${escape(w.empty)}" aria-label="${escape(w.send)}"></textarea><div class="stack"><button id="send" type="submit">${w.send}</button><button id="stop" class="quiet" type="button" hidden>${w.stop}</button></div></form></section>
<section id="side">
<div class="tabs" role="tablist"><button role="tab" aria-selected="true" data-tab="preview">${w.preview}</button><button role="tab" aria-selected="false" data-tab="settings">${w.settings}</button><button role="tab" aria-selected="false" data-tab="activity">${w.activity}</button></div>
<div class="panel" id="panel-preview"><iframe id="frame" title="${w.preview}" src="/studio/preview"></iframe></div>
<div class="panel" id="panel-settings" hidden><form class="form" id="settings">
<label>${w.provider}<select name="provider" id="provider"></select></label>
<label>${w.model}<input name="model" id="model" autocomplete="off"><small>${escape(w.modelHint)}</small></label>
<label>${w.apiKey} <span class="hint" id="keyhint"></span><input name="apiKey" id="apiKey" type="password" autocomplete="off"><small>${escape(w.apiKeyHint)}</small></label>
<label>${w.baseUrl}<input name="baseUrl" id="baseUrl" autocomplete="off" placeholder="https://…/v1"><small>${escape(w.baseUrlHint)}</small></label>
<label>${w.approval}<select name="approval" id="approval"><option value="risky">${escape(w.approvalRisky)}</option><option value="all">${escape(w.approvalAll)}</option><option value="none">${escape(w.approvalNone)}</option></select></label>
<fieldset><legend>${w.budget}</legend>
<label>${w.maxSteps}<input type="number" name="maxStepsPerTurn" id="maxStepsPerTurn" min="1" max="200"></label>
<label>${w.maxTokens}<input type="number" name="maxTokensPerTurn" id="maxTokensPerTurn" min="1000"></label>
<label>${w.maxDay}<input type="number" name="maxTokensPerDay" id="maxTokensPerDay" min="1000"></label>
<label>${w.maxSeconds}<input type="number" name="maxSecondsPerTurn" id="maxSecondsPerTurn" min="10" max="3600"></label></fieldset>
<div class="row"><button type="submit">${w.save}</button><button type="button" class="quiet" id="test">${w.test}</button><button type="button" class="quiet" id="clearKey">${w.clearKey}</button></div>
<p id="settingsNote" role="status"></p></form></div>
<div class="panel" id="panel-activity" hidden><div class="wrap"><div><h2>${w.usage}</h2><div id="usage"></div></div><div><h2>${w.activity}</h2><div id="actions"></div></div></div></div>
</section></main>
<script nonce="${nonce}">
const w = ${JSON.stringify(w)}
const $ = (id) => document.getElementById(id)
const api = async (path, options = {}) => {
  const response = await fetch('/studio/api/' + path, { ...options, headers: { 'Content-Type': 'application/json' } })
  if (response.status === 401) location.reload()
  return response.json()
}
const node = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el }
let current = null
let timer = null
function renderMessages(messages) {
  const log = $('log'); log.textContent = ''
  if (!messages.length) log.append(node('p', 'hint', w.empty))
  for (const message of messages) log.append(node('div', 'msg ' + message.role, message.text))
}
function renderRun(run) {
  document.querySelectorAll('.live').forEach((el) => el.remove())
  if (!run) return
  const log = $('log')
  const steps = node('div', 'steps live')
  for (const step of run.steps) {
    if (step.kind === 'tool') steps.append(node('span', step.outcome + ' ' + step.risk, (step.outcome === 'done' ? '✓ ' : step.outcome === 'declined' ? '✗ ' : '! ') + step.tool + (step.summary && step.outcome !== 'done' ? ': ' + step.summary : '')))
    else if (step.kind === 'retry') steps.append(node('span', 'error', '↻ ' + step.summary))
  }
  if (run.status === 'running') steps.append(node('span', '', w.thinking))
  if (steps.childNodes.length) log.append(steps)
  if (run.status === 'waiting' && run.pending) {
    const box = node('div', 'notice live')
    box.append(node('strong', '', w.pending + ': ' + run.pending.tool))
    box.append(node('pre', '', JSON.stringify(run.pending.arguments, null, 2)))
    const row = node('div'); row.style.display = 'flex'; row.style.gap = '8px'
    const yes = node('button', '', w.approve); yes.type = 'button'; yes.onclick = () => decide('approve')
    const no = node('button', 'quiet', w.decline); no.type = 'button'; no.onclick = () => decide('decline')
    row.append(yes, no); box.append(row); log.append(box)
  }
  if ((run.status === 'stopped' || run.status === 'failed') && run.stopReason) log.append(node('div', 'notice bad live', run.stopReason))
  log.scrollTop = log.scrollHeight
  const busy = run.status === 'running'
  $('send').disabled = busy; $('stop').hidden = !busy
}
async function refresh() {
  const state = await api('state')
  renderMessages(state.messages)
  current = state.run
  renderRun(current)
  fillSettings(state)
  if (current && current.status === 'running') poll()
}
function poll() {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    if (!current) return
    const { run } = await api('runs/' + current.id)
    current = run
    if (run.status === 'running') { renderRun(run); poll() }
    else { await refresh(); $('frame').src = '/studio/preview' }
  }, 1200)
}
async function decide(choice) {
  const { run, error } = await api('runs/' + current.id + '/' + choice, { method: 'POST' })
  if (error) return alert(error)
  current = run; renderRun(run); poll()
}
$('composer').onsubmit = async (event) => {
  event.preventDefault()
  const text = $('text').value.trim(); if (!text) return
  $('send').disabled = true
  const { run, error } = await api('chat', { body: JSON.stringify({ text }), method: 'POST' })
  if (error) { $('send').disabled = false; return alert(error) }
  $('text').value = ''
  $('log').append(node('div', 'msg user', text))
  current = run; renderRun(run); poll()
}
$('text').onkeydown = (event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) $('composer').requestSubmit() }
$('stop').onclick = () => current && api('runs/' + current.id + '/stop', { method: 'POST' })
function fillSettings(state) {
  const select = $('provider')
  if (!select.options.length) for (const [id, kind] of Object.entries(state.kinds)) select.append(new Option(kind.label, id))
  const s = state.settings
  select.value = s.provider; $('model').value = s.model; $('baseUrl').value = s.baseUrl; $('approval').value = s.approval
  for (const name of ['maxStepsPerTurn', 'maxTokensPerTurn', 'maxTokensPerDay', 'maxSecondsPerTurn']) $(name).value = s[name]
  $('keyhint').textContent = state.hints['provider:' + s.provider] ?? ''
  $('apiKey').value = ''
}
$('settings').onsubmit = async (event) => {
  event.preventDefault()
  const data = Object.fromEntries(new FormData($('settings')))
  const result = await api('settings', { body: JSON.stringify(data), method: 'POST' })
  $('settingsNote').textContent = result.error ?? w.saved
  if (!result.error) fillSettings(result)
}
$('clearKey').onclick = async () => { const result = await api('settings', { body: JSON.stringify({ clearKey: true }), method: 'POST' }); fillSettings(result); $('settingsNote').textContent = w.saved }
$('test').onclick = async () => {
  $('settingsNote').textContent = w.testing
  const result = await api('test', { method: 'POST' })
  $('settingsNote').textContent = result.ok ? '✓ ' + result.milliseconds + ' ms · tool calling: ' + (result.toolCalling ? 'yes' : 'NO — this model may not be able to build') : '✗ ' + result.error
}
async function loadActivity() {
  const { actions, usage } = await api('activity')
  const table = (rows, columns) => { if (!rows.length) return node('p', 'hint', w.noActivity); const t = node('table'); const head = t.insertRow(); columns.forEach((c) => head.append(node('th', '', c))); rows.forEach((row) => { const r = t.insertRow(); columns.forEach((c) => r.insertCell().textContent = c === 'at' ? new Date(row[c]).toLocaleString() : row[c]) }); return t }
  $('usage').replaceChildren(table(usage, ['at', 'provider', 'model', 'input_tokens', 'output_tokens', 'tool_calls', 'outcome']))
  $('actions').replaceChildren(table(actions, ['at', 'tool', 'risk', 'outcome', 'result']))
}
document.querySelectorAll('[data-tab]').forEach((tab) => tab.onclick = () => {
  document.querySelectorAll('[data-tab]').forEach((other) => other.setAttribute('aria-selected', String(other === tab)))
  for (const name of ['preview', 'settings', 'activity']) $('panel-' + name).hidden = name !== tab.dataset.tab
  if (tab.dataset.tab === 'activity') loadActivity()
})
refresh()
</script></body></html>`
}
