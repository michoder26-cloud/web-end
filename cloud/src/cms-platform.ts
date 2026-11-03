import { newApiKey } from './api'
import { newToken, sha256 } from './auth'
import { firstProblem, input, office, readField, spec } from './cms'
import type { Notice } from './cms'
import { accessLevels, createRecord, deleteRecord, fieldTypes, getRecord, getTable, listRecords, listTables, ownerActor, recordsCsv, saveTable, tableSchema, updateRecord } from './data'
import type { DataField, DataTable } from './data'
import { escapeHtml, notFound, see } from './http'
import { checkMove, cleanPath, finishMove, importProducts, moveStatus, safeWebUrl, saveRedirects } from './moving'
import type { MoveReport } from './moving'
import { latestRelease } from './updates'
import { listVersions, publishVersion, restoreVersion, unpublishedChanges } from './versions'
import { version } from './version'
import { eventNames, validWebhookUrl } from './webhooks'
import type { Env, Settings, SiteRow } from './types'

const accessNames: Record<string, string> = { members: 'Logged-in customers', own: 'Logged-in customers, their own only', owner: 'Only you', public: 'Anyone', staff: 'Staff and you' }

const fieldSpec = () =>
  spec('fields', 'Fields', 'list', {
    fields: [
      spec('name', 'Name, English letters, such as start_date'),
      spec('label', 'Label'),
      spec('type', 'Type', 'select', { options: [...fieldTypes] }),
      spec('required', 'Required', 'bool'),
      spec('staffOnly', 'Hidden from customers', 'bool'),
      spec('readOnly', 'Customers can see it but not change it', 'bool'),
      spec('setOnce', 'Customers can fill it in once, then not change it', 'bool'),
      spec('options', 'Choices, one per line', 'lines'),
      spec('table', 'Table it points to, for a reference'),
      spec('default', 'Starting value'),
      spec('capacityField', 'Limit from this number field of the other table, such as seats'),
      spec('unique', 'No repeats', 'select', { options: ['', 'table', 'customer'] }),
      spec('ignoreField', 'Do not count records when this field'),
      spec('ignoreValues', 'has one of these values, one per line', 'lines'),
    ],
  })

const accessSelect = (name: string, label: string, value: string) => `<label>${label}<select name="${name}">${accessLevels.map((level) => `<option${level === value ? ' selected' : ''} value="${level}">${accessNames[level]}</option>`).join('')}</select></label>`

const tableForm = (code: string, table?: DataTable) =>
  `<form action="/owner/${escapeHtml(code)}/data${table ? `/${escapeHtml(table.name)}` : ''}" class="contact-form cms-form" method="post"><input name="op" type="hidden" value="schema">
${table ? `<input name="name" type="hidden" value="${escapeHtml(table.name)}">` : '<label>Table name, English letters, such as bookings<input maxlength="40" name="name" pattern="[a-z][a-z0-9_]*" required></label>'}
<label>Label<input maxlength="80" name="label" required value="${escapeHtml(table?.label)}"></label>
${accessSelect('readAccess', 'Who can read', table?.read_access ?? 'owner')}${accessSelect('writeAccess', 'Who can add', table?.write_access ?? 'owner')}
${input('fields', fieldSpec(), table?.fields)}
<button class="button" type="submit">${table ? 'Save table' : 'Create table'}</button></form>`

const readTable = (form: FormData) =>
  tableSchema.safeParse({
    fields: readField(form, 'fields', fieldSpec()),
    label: String(form.get('label') ?? '').trim(),
    name: String(form.get('name') ?? '').trim(),
    readAccess: form.get('readAccess'),
    writeAccess: form.get('writeAccess'),
  })

async function tablesPage(env: Env, site: SiteRow, code: string, notice?: Notice) {
  const tables = await listTables(env, site.id)
  const rows = tables.map((table) => `<li><a href="/owner/${escapeHtml(code)}/data/${escapeHtml(table.name)}">${escapeHtml(table.label)}</a> <small>${table.record_count} records · read: ${accessNames[table.read_access]} · add: ${accessNames[table.write_access]}</small></li>`).join('')
  return office(site, code, 'Data', `<p>Your own database tables. Show them on a page with the Records and Add record sections, or use them from other systems through the API.</p><ul>${rows || '<li>No tables yet. Ask Claude for one, or create it here.</li>'}</ul><h2>Create a table</h2>${tableForm(code)}`, notice)
}

const recordFields = (field: DataField, value: unknown) => {
  if (field.type === 'boolean') return input(field.name, spec(field.name, field.label, 'bool'), value)
  if (field.type === 'textarea') return input(field.name, spec(field.name, field.label, 'long'), value)
  if (field.type === 'select') return input(field.name, spec(field.name, field.label, 'select', { options: ['', ...(field.options ?? [])] }), value)
  return input(field.name, spec(field.name, field.label), value)
}

async function tablePage(env: Env, site: SiteRow, code: string, table: DataTable, notice?: Notice) {
  const base = `/owner/${escapeHtml(code)}/data/${escapeHtml(table.name)}`
  const list = await listRecords(env, table, ownerActor, { limit: 100, newestFirst: true })
  const rows = (list.rows ?? [])
    .map((row) => {
      const data = JSON.parse(row.data) as Record<string, unknown>
      const summary = table.fields.slice(0, 3).map((field) => escapeHtml(data[field.name])).filter(Boolean).join(' · ')
      return `<details class="card account__record"><summary>#${row.id} ${summary}</summary><form action="${base}/${row.id}" class="contact-form" method="post">${table.fields.map((field) => recordFields(field, data[field.name])).join('')}<button class="button button--small" type="submit">Save</button></form><form action="${base}/${row.id}/delete" class="cms-danger contact-form" method="post"><label class="check"><input name="confirm" required type="checkbox"> Yes, delete this record</label><button class="button button--small" type="submit">Delete</button></form></details>`
    })
    .join('')
  return office(
    site,
    code,
    `Data: ${table.label}`,
    `<p><a href="${base}/export.csv">Download as a spreadsheet file (CSV)</a>. Other systems read it at <code>/api/v1/data/${escapeHtml(table.name)}</code>.</p>
<h2>Add a record</h2><form action="${base}" class="contact-form" method="post"><input name="op" type="hidden" value="add">${table.fields.map((field) => recordFields(field, field.default)).join('')}<button class="button button--small" type="submit">Add</button></form>
<h2>Records (${table.record_count})</h2>${rows || '<p>None yet.</p>'}
<h2>Fields and access</h2>${tableForm(code, table)}
<h2>Delete this table</h2><form action="${base}/delete" class="cms-danger contact-form" method="post"><label class="check"><input name="confirm" required type="checkbox"> Yes, delete this table and its ${table.record_count} records</label><button class="button button--small" type="submit">Delete table</button></form>`,
    notice,
  )
}

const formRecord = (table: DataTable, form: FormData) => {
  const values: Record<string, unknown> = {}
  for (const field of table.fields) values[field.name] = field.type === 'boolean' ? form.get(field.name) === 'on' : String(form.get(field.name) ?? '')
  return values
}

async function handleData(request: Request, env: Env, url: URL, site: SiteRow, code: string, name: string | undefined, id: string | undefined, action: string | undefined, saved?: Notice) {
  const post = request.method === 'POST'
  const owner = `/owner/${code}/data`
  if (!name) {
    if (!post) return tablesPage(env, site, code, saved)
    const parsed = readTable(await request.formData())
    if (!parsed.success) return tablesPage(env, site, code, { error: `Not saved. ${firstProblem(parsed.error)}` })
    const problem = await saveTable(env, site.id, parsed.data)
    return problem ? tablesPage(env, site, code, { error: problem }) : see(url, `${owner}/${parsed.data.name}?saved=1`)
  }
  const table = await getTable(env, site.id, name)
  if (!table) return notFound()
  const path = `${owner}/${table.name}`
  if (id === 'export.csv' && !action && !post) return new Response(await recordsCsv(env, table), { headers: { 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="${table.name}.csv"`, 'Content-Type': 'text/csv; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } })
  if (id === 'delete' && post && !action) {
    if ((await request.formData()).get('confirm') === 'on') await env.DB.prepare('DELETE FROM data_tables WHERE id = ? AND site_id = ?').bind(table.id, site.id).run()
    return see(url, owner)
  }
  if (!id) {
    if (!post) return tablePage(env, site, code, table, saved)
    const form = await request.formData()
    if (form.get('op') === 'schema') {
      const parsed = readTable(form)
      if (!parsed.success) return tablePage(env, site, code, table, { error: `Not saved. ${firstProblem(parsed.error)}` })
      const problem = await saveTable(env, site.id, { ...parsed.data, name: table.name })
      return problem ? tablePage(env, site, code, table, { error: problem }) : see(url, `${path}?saved=1`)
    }
    const added = await createRecord(env, site.id, table, formRecord(table, form), ownerActor)
    return added.row ? see(url, `${path}?saved=1`) : tablePage(env, site, code, table, { error: added.error })
  }
  if (!post || !/^\d{1,12}$/.test(id)) return notFound()
  const row = await getRecord(env, table, Number(id))
  if (!row) return notFound()
  const form = await request.formData()
  if (action === 'delete') {
    if (form.get('confirm') === 'on') await deleteRecord(env, site.id, table, row)
    return see(url, path)
  }
  if (action) return notFound()
  const changed = await updateRecord(env, site.id, table, row, formRecord(table, form), ownerActor)
  return changed.row ? see(url, `${path}?saved=1`) : tablePage(env, site, code, table, { error: changed.error })
}

const checkCard = (report: MoveReport) => {
  const group = (title: string, lines: string[]) => (lines.length ? `<h4>${escapeHtml(title)} (${lines.length})</h4><ul>${lines.map((line) => `<li style="overflow-wrap:anywhere">${escapeHtml(line)}</li>`).join('')}</ul>` : '')
  const facts = [...(report.titleKept ? [] : ['The page title changed.']), ...(report.descriptionKept ? [] : ['The search description changed.']), ...(report.oldPageWasCut ? ['The old page was too long to read in full.'] : [])]
  return `<article class="card account__record"><h3>${report.problems ? `${report.problems} differences` : 'No differences found'} · /${escapeHtml(report.newPage)}</h3><p style="overflow-wrap:anywhere"><small>Compared with ${escapeHtml(report.oldUrl)}. ${report.linesOnOldPage} lines of text and ${report.imagesFoundOnOldPage} photos on the old page.</small></p>${facts.map((fact) => `<p>${escapeHtml(fact)}</p>`).join('')}${group('Text not found', report.textMissing)}${group('Link or button text not found', report.linkTextMissing)}${group('Photos not copied', report.imagesNotCopied)}${group('Photos copied but not used here', report.imagesCopiedNotUsed)}${group('Photos still loading from the old site', report.imagesStillOnOldHost)}</article>`
}

async function movePage(env: Env, site: SiteRow, code: string, notice?: Notice) {
  const base = `/owner/${escapeHtml(code)}/move`
  const [status, { results: pages }] = await Promise.all([moveStatus(env, site), env.DB.prepare('SELECT slug FROM pages WHERE site_id = ? ORDER BY slug').bind(site.id).all<{ slug: string }>()])
  const { results } = await env.DB.prepare('SELECT from_path, to_path FROM redirects WHERE site_id = ? ORDER BY from_path LIMIT 2000').bind(site.id).all<{ from_path: string; to_path: string }>()
  return office(
    site,
    code,
    'Move your site here',
    `<p>Moving from Wix or another host? Start a chat with Claude and say "Move my website here". It rebuilds your pages from your own content. Keep your old site running until the new one is checked.</p>
<h2>Check the move yourself</h2><p>This compares a page here with your old page and lists what didn't come across. It reads what's on the two pages, so it doesn't depend on anything Claude said. It can't judge how a page looks, or whether a difference was a good choice.</p>
<form action="${base}/check" class="contact-form" method="post"><label>Old page address<input maxlength="500" name="url" placeholder="https://" required type="url"></label><label>Page here<select name="page">${pages.map((page) => `<option>${escapeHtml(page.slug)}</option>`).join('')}</select></label><button class="button button--small" type="submit">Compare</button></form>
${status.notRebuilt.length ? `<article class="card account__record"><h3>Old pages not rebuilt yet (${status.notRebuilt.length})</h3><ul>${status.notRebuilt.map((address) => `<li style="overflow-wrap:anywhere">${escapeHtml(address)}</li>`).join('')}</ul></article>` : ''}
${[...status.pages].sort((a, b) => b.problems - a.problems).map(checkCard).join('')}
${status.pages.length || status.notRebuilt.length ? `<form action="${base}/finish" class="cms-danger contact-form" method="post"><label class="check"><input name="confirm" required type="checkbox"> The move is finished, so stop comparing with the old site</label><button class="button button--small" type="submit">Finish the move</button></form>` : ''}
<h2>Products from Wix</h2><p>In Wix, open Store Products, then More Actions, Import, Export Products. Upload that file here. Products already here by name are skipped, so it's safe to do this twice. Photos stay on the old site until Claude copies them.</p>
<form action="${base}/products" class="contact-form" enctype="multipart/form-data" method="post"><label>Product file (CSV)<input accept=".csv,text/csv" name="file" required type="file"></label><button class="button button--small" type="submit">Import products</button></form>
<h2>Old links</h2><p>Each line sends an old address to its new page, so links and search results keep working once your domain points here. Example: /product-page/blue-mug | /product/12</p>
<form action="${base}/redirects" class="contact-form" method="post"><label>Old address | new address, one per line<textarea name="redirects" rows="8">${escapeHtml(results.map((row) => `${row.from_path} | ${row.to_path}`).join('\n'))}</textarea></label><button class="button button--small" type="submit">Save old links</button></form>`,
    notice,
  )
}

async function handleMove(request: Request, env: Env, url: URL, site: SiteRow, code: string, kind: string | undefined, saved?: Notice) {
  if (!kind) return request.method === 'POST' ? notFound() : movePage(env, site, code, saved)
  if (request.method !== 'POST') return notFound()
  const form = await request.formData().catch((): null => null)
  if (!form) return see(url, `/owner/${code}/move`)
  if (kind === 'finish') {
    if (form.get('confirm') === 'on') await finishMove(env, site.id)
    return see(url, `/owner/${code}/move?saved=1`)
  }
  if (kind === 'check') {
    const target = safeWebUrl(env, String(form.get('url') ?? '').trim())
    if (!target) return movePage(env, site, code, { error: 'Use a public https address.' })
    const result = await checkMove(env, site, target, String(form.get('page') ?? ''))
    return result.error ? movePage(env, site, code, { error: result.error }) : see(url, `/owner/${code}/move?saved=1`)
  }
  if (kind === 'products') {
    const file = form.get('file')
    if (!(file instanceof File) || !file.size) return movePage(env, site, code, { error: 'Choose the file first.' })
    if (file.size > 2_000_000) return movePage(env, site, code, { error: 'That file is larger than 2 MB. Please split it.' })
    const result = await importProducts(env, site, await file.text())
    if (result.error) return movePage(env, site, code, { error: result.error })
    const notes = [`Imported ${result.imported} products.`, result.skippedAlreadyThere ? `${result.skippedAlreadyThere} were already here.` : '', result.skippedNoRoom ? `${result.skippedNoRoom} didn't fit, because a site can have up to 500 products.` : '', result.notImportedExtraImages ? `${result.notImportedExtraImages} extra photos weren't imported, because each product has one photo here.` : '', result.imagesStillOnOldHost ? 'Photos still load from the old site, so ask Claude to copy them before you close it.' : '']
    return movePage(env, site, code, { saved: notes.filter(Boolean).join(' ') })
  }
  if (kind === 'redirects') {
    const pairs = String(form.get('redirects') ?? '').split('\n').map((line) => line.split('|').map((part) => part.trim())).filter(([from]) => from).map(([from, to]) => ({ from, to: to ?? '' }))
    const result = await saveRedirects(env, site.id, pairs)
    if (result.error) return movePage(env, site, code, { error: result.error })
    if (result.problems?.length) return movePage(env, site, code, { error: `Saved ${result.saved}. These couldn't be used, because the new address must start with / and can't be the same as the old one: ${result.problems.slice(0, 5).join(', ')}` })
    await env.DB.prepare(`DELETE FROM redirects WHERE site_id = ?${pairs.length ? ` AND from_path NOT IN (${pairs.map(() => '?').join(',')})` : ''}`).bind(site.id, ...pairs.map((pair) => cleanPath(pair.from) ?? '')).run()
    return see(url, `/owner/${code}/move?saved=1`)
  }
  return notFound()
}

/** Everything the owner needs to leave: their content and data in one file. Password data and secrets stay out. */
async function exportEverything(env: Env, site: SiteRow) {
  const all = async (sql: string) => (await env.DB.prepare(sql).bind(site.id).all()).results
  const tables = await listTables(env, site.id)
  const records: Record<string, unknown[]> = {}
  for (const table of tables) records[table.name] = (await env.DB.prepare('SELECT id, customer_id, data, created_at, updated_at FROM data_records WHERE table_id = ? ORDER BY id LIMIT 50000').bind(table.id).all<{ data: string }>()).results.map((row) => ({ ...row, data: JSON.parse(row.data) as unknown }))
  const [pages, items, variants, customers, orders, lines, entries, images] = await Promise.all([
    all('SELECT slug, title, description, published, blocks FROM pages WHERE site_id = ?'),
    all('SELECT * FROM items WHERE site_id = ?'),
    all('SELECT item_variants.* FROM item_variants JOIN items ON items.id = item_variants.item_id WHERE items.site_id = ?'),
    all('SELECT id, email, name, role, created_at FROM customers WHERE site_id = ?'),
    all('SELECT id, customer_id, name, phone, address, note, payment, status, subtotal, shipping, total, money_prefix, money_suffix, created_at, updated_at FROM orders WHERE site_id = ?'),
    all('SELECT order_lines.* FROM order_lines JOIN orders ON orders.id = order_lines.order_id WHERE orders.site_id = ?'),
    all('SELECT id, form, page, data, status, created_at, customer_id FROM entries WHERE site_id = ?'),
    all('SELECT id, name, type, size, created_at FROM media WHERE site_id = ?'),
  ])
  const body = JSON.stringify({ customers, entries, exported_at: new Date().toISOString(), format: 'web-end-export-1', images_note: 'Image files stay in your database. Each one can be downloaded from /media/<id>.', images, items, order_lines: lines, orders, pages, records, settings: JSON.parse(site.settings) as unknown, tables, variants, version }, null, 1)
  return new Response(body, { headers: { 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="web-end-export.json"', 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' } })
}

const wixExample = (origin: string) => `// In Wix: Secrets Manager, add WEB_END_KEY. Then in backend/webend.web.js:
import { Permissions, webMethod } from 'wix-web-module'
import { fetch } from 'wix-fetch'
import { getSecret } from 'wix-secrets-backend'

export const listRecords = webMethod(Permissions.Anyone, async () => {
  const key = await getSecret('WEB_END_KEY')
  const response = await fetch('${origin}/api/v1/data/YOUR_TABLE', { headers: { Authorization: 'Bearer ' + key } })
  return response.json()
})`

async function connectPage(env: Env, url: URL, site: SiteRow, code: string, notice?: Notice, newKey?: string) {
  const base = `/owner/${escapeHtml(code)}/connect`
  const settings = JSON.parse(site.settings) as Settings
  const [{ results: keys }, { results: hooks }] = await Promise.all([
    env.DB.prepare('SELECT id, name, scope, created_at, last_used_at FROM api_keys WHERE site_id = ? ORDER BY id').bind(site.id).all<{ created_at: string; id: number; last_used_at: null | string; name: string; scope: string }>(),
    env.DB.prepare('SELECT id, url, events, secret, last_status, last_at FROM webhooks WHERE site_id = ? ORDER BY id').bind(site.id).all<{ events: string; id: number; last_at: null | string; last_status: null | number; secret: string; url: string }>(),
  ])
  return office(
    site,
    code,
    'Connect',
    `${newKey ? `<p role="status">Copy this key now, because it won't be shown again. Keep it in server code only, such as the Wix Secrets Manager. Never put it in a web page or a chat.<br><code style="overflow-wrap:anywhere">${escapeHtml(newKey)}</code></p>` : ''}
<h2>Your API</h2><p>Other systems, such as a Wix site, use your data, logins and orders here:</p><p><code style="overflow-wrap:anywhere">${escapeHtml(url.origin)}/api/v1</code></p><p>Full description for developers and AI tools: <a href="/api/v1/openapi.json" target="_blank" rel="noopener">openapi.json</a></p>
<h2>Secret keys</h2><p>A key has the same power over your data as you do. Each system should have its own, so you can remove one without affecting the rest.</p>
${keys.map((key) => `<article class="card account__record"><h3>${escapeHtml(key.name)} · ${key.scope === 'read' ? 'read only' : 'full access'}</h3><p><small>Created ${escapeHtml(key.created_at.slice(0, 10))} · ${key.last_used_at ? `last used ${escapeHtml(key.last_used_at.slice(0, 10))}` : 'never used'}</small></p><form action="${base}/key/${key.id}/delete" class="cms-danger contact-form" method="post"><label class="check"><input name="confirm" required type="checkbox"> Yes, remove this key</label><button class="button button--small" type="submit">Remove key</button></form></article>`).join('')}
<form action="${base}/key" class="contact-form" method="post"><label>What is it for, such as My Wix site<input maxlength="80" name="name" required></label><label>Access<select name="scope"><option value="full">Full access</option><option value="read">Read only</option></select></label><button class="button button--small" type="submit">Create a key</button></form>
<h2>Websites that may call from a browser</h2><p>Only needed when a page calls the API directly, for public data or logged-in customers. Server code doesn't need this.</p>
<form action="${base}/origins" class="contact-form" method="post"><label>One per line, such as https://www.example.com<textarea name="origins" rows="3">${escapeHtml((settings.allowedOrigins ?? []).join('\n'))}</textarea></label><button class="button button--small" type="submit">Save</button></form>
<h2>Connect with Wix</h2><p>Keep your Wix pages and use this as the backend. This example hasn't been tested inside a real Wix site yet, so try it on a copy first. Claude can write the rest for you: ask it to read the connect_wix guide.</p><pre style="overflow:auto"><code>${escapeHtml(wixExample(url.origin))}</code></pre>
<h2>Get told about new orders for free</h2><p>Paste a Discord, Slack or Telegram address below, and new orders and bookings arrive in that chat. Treat that address like a password. This hasn't been tried with real chat accounts yet, so check it with a test order.</p>
<h2>Webhooks</h2><p>Sends a signed message to another service when something happens. Each message is sent once with no retry.</p>
${hooks.map((hook) => `<article class="card account__record"><h3 style="overflow-wrap:anywhere">${escapeHtml(hook.url)}</h3><p>${escapeHtml((JSON.parse(hook.events) as string[]).join(', '))}<br><small>${hook.last_at ? `Last message ${escapeHtml(hook.last_at.slice(0, 16).replace('T', ' '))} UTC: ${hook.last_status ? `answered ${hook.last_status}` : 'could not be reached'}` : 'Nothing sent yet'}</small></p><details><summary>Signing secret</summary><code style="overflow-wrap:anywhere">${escapeHtml(hook.secret)}</code></details><form action="${base}/webhook/${hook.id}/delete" class="cms-danger contact-form" method="post"><label class="check"><input name="confirm" required type="checkbox"> Yes, remove this webhook</label><button class="button button--small" type="submit">Remove</button></form></article>`).join('')}
<form action="${base}/webhook" class="contact-form" method="post"><label>Address<input maxlength="500" name="url" required type="url"></label><fieldset class="cms-block"><legend>Send when</legend>${eventNames.map((event) => `<label class="check"><input name="events" type="checkbox" value="${event}"> ${event}</label>`).join('')}</fieldset><button class="button button--small" type="submit">Add webhook</button></form>`,
    notice,
  )
}

async function handleConnect(request: Request, env: Env, url: URL, site: SiteRow, code: string, kind: string | undefined, id: string | undefined, action: string | undefined, saved?: Notice) {
  const owner = `/owner/${code}/connect`
  if (!kind) return request.method === 'POST' ? notFound() : connectPage(env, url, site, code, saved)
  if (request.method !== 'POST') return notFound()
  const form = await request.formData().catch((): null => null)
  if (!form) return see(url, owner)
  if (kind === 'origins' && !id) {
    const origins = String(form.get('origins') ?? '').split('\n').map((line) => line.trim().replace(/\/$/, '')).filter(Boolean)
    if (origins.length > 20 || origins.some((origin) => !/^(https:\/\/(\*\.)?[a-z0-9.-]+(:\d+)?|http:\/\/localhost(:\d+)?)$/.test(origin))) return connectPage(env, url, site, code, { error: 'Enter addresses like https://www.example.com, one per line.' })
    await env.DB.prepare("UPDATE sites SET settings = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(JSON.stringify({ ...(JSON.parse(site.settings) as Settings), allowedOrigins: origins }), site.id).run()
    return see(url, `${owner}?saved=1`)
  }
  if (kind === 'key' && !id) {
    const name = String(form.get('name') ?? '').trim().slice(0, 80)
    if (!name) return connectPage(env, url, site, code, { error: 'Give the key a name.' })
    const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM api_keys WHERE site_id = ?').bind(site.id).first<{ total: number }>()
    if ((count?.total ?? 0) >= 20) return connectPage(env, url, site, code, { error: 'A site can have up to 20 keys. Remove one first.' })
    const key = newApiKey()
    await env.DB.prepare('INSERT INTO api_keys (site_id, name, key_hash, scope) VALUES (?, ?, ?, ?)').bind(site.id, name, await sha256(key), form.get('scope') === 'read' ? 'read' : 'full').run()
    return connectPage(env, url, site, code, undefined, key)
  }
  if (kind === 'webhook' && !id) {
    const target = String(form.get('url') ?? '').trim()
    const events = form.getAll('events').map(String).filter((event) => (eventNames as readonly string[]).includes(event))
    if (target.length > 500 || !validWebhookUrl(env, target)) return connectPage(env, url, site, code, { error: 'Use an https address.' })
    if (!events.length) return connectPage(env, url, site, code, { error: 'Choose at least one event.' })
    const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM webhooks WHERE site_id = ?').bind(site.id).first<{ total: number }>()
    if ((count?.total ?? 0) >= 10) return connectPage(env, url, site, code, { error: 'A site can have up to 10 webhooks.' })
    await env.DB.prepare('INSERT INTO webhooks (site_id, url, events, secret) VALUES (?, ?, ?, ?)').bind(site.id, target, JSON.stringify(events), newToken()).run()
    return see(url, `${owner}?saved=1`)
  }
  if (action === 'delete' && /^\d+$/.test(id ?? '') && form.get('confirm') === 'on') {
    if (kind === 'key') await env.DB.prepare('DELETE FROM api_keys WHERE id = ? AND site_id = ?').bind(Number(id), site.id).run()
    if (kind === 'webhook') await env.DB.prepare('DELETE FROM webhooks WHERE id = ? AND site_id = ?').bind(Number(id), site.id).run()
  }
  return see(url, owner)
}

async function publishPage(env: Env, site: SiteRow, code: string, notice?: Notice) {
  const base = `/owner/${escapeHtml(code)}`
  const [versions, waiting] = await Promise.all([listVersions(env, site.id), unpublishedChanges(env, site)])
  const changes = waiting ? [...waiting.pages.map((slug) => `Page: ${slug}`), ...(waiting.settings ? ['Settings and design'] : [])] : []
  const state = !site.live_version
    ? '<p>Nothing is published yet, so changes appear on your site at once. After your first publish, changes stay private until you publish them.</p>'
    : changes.length
      ? `<p role="status">Waiting to be published:</p><ul>${changes.map((change) => `<li>${escapeHtml(change)}</li>`).join('')}</ul>`
      : '<p>Your site matches the published version.</p>'
  const rows = versions
    .map((item) => `<article class="card account__record"><h3>Version ${item.id}${item.id === site.live_version ? ' · live' : ''}</h3><p>${escapeHtml(item.note)}<br><small>${escapeHtml(item.created_at.slice(0, 16).replace('T', ' '))} UTC</small></p>${item.id === site.live_version ? '' : `<form action="${base}/publish/${item.id}/restore" class="cms-danger contact-form" method="post"><label class="check"><input name="confirm" required type="checkbox"> Yes, go back to this version. Unpublished changes will be lost.</label><button class="button button--small" type="submit">Go back</button></form>`}</article>`)
    .join('')
  return office(
    site,
    code,
    'Publish',
    `${state}<p><a class="button button--small button--ghost" href="${base}/preview" target="_blank" rel="noopener">Open the private preview</a></p>
<form action="${base}/publish" class="contact-form" method="post"><label>What changed, optional<input maxlength="200" name="note"></label><button class="button" type="submit">Publish to my website</button></form>
<h2>Versions</h2><p>The last 20 are kept. Going back changes pages and settings only. Orders, customers, products and records stay as they are.</p>${rows || '<p>None yet.</p>'}`,
    notice,
  )
}

async function handlePublish(request: Request, env: Env, url: URL, site: SiteRow, code: string, id: string | undefined, action: string | undefined, saved?: Notice) {
  const owner = `/owner/${code}/publish`
  if (request.method !== 'POST') return id ? notFound() : publishPage(env, site, code, saved)
  const form = await request.formData().catch((): null => null)
  if (!id) {
    const published = await publishVersion(env, site, String(form?.get('note') ?? '').trim())
    return published.error ? publishPage(env, site, code, { error: published.error }) : see(url, `${owner}?saved=1`)
  }
  if (action === 'restore' && /^\d+$/.test(id) && form?.get('confirm') === 'on') await restoreVersion(env, site, Number(id))
  return see(url, owner)
}

/** One summary of the whole system. It says whether secrets are set, never what they are. */
export async function systemStatus(env: Env, site: SiteRow, origin: string) {
  const settings = JSON.parse(site.settings) as Settings
  const count = async (sql: string) => (await env.DB.prepare(sql).bind(site.id).first<{ total: number }>())?.total ?? 0
  const [latest, waiting, tables, customers, orders, pages, imageBytes, records, keys, hooks] = await Promise.all([
    latestRelease(),
    unpublishedChanges(env, site),
    count('SELECT COUNT(*) AS total FROM data_tables WHERE site_id = ?'),
    count('SELECT COUNT(*) AS total FROM customers WHERE site_id = ?'),
    count('SELECT COUNT(*) AS total FROM orders WHERE site_id = ?'),
    count('SELECT COUNT(*) AS total FROM pages WHERE site_id = ?'),
    count('SELECT COALESCE(SUM(size), 0) AS total FROM media WHERE site_id = ?'),
    count('SELECT COALESCE(SUM(record_count), 0) AS total FROM data_tables WHERE site_id = ?'),
    count('SELECT COUNT(*) AS total FROM api_keys WHERE site_id = ?'),
    count('SELECT COUNT(*) AS total FROM webhooks WHERE site_id = ?'),
  ])
  return {
    address: origin,
    hosting: "Your own Cloudflare account. Connect your own domain in Cloudflare under the Worker's Settings, Domains and Routes.",
    version,
    latestVersion: latest?.version ?? 'unknown',
    publishing: { liveVersion: site.live_version ?? null, waiting },
    database: { imageBytes, customers, orders, pages, records, tables },
    login: { customerAccounts: Boolean(settings.accounts) },
    payments: { bankTransfer: Boolean(settings.payTransfer), card: Boolean(settings.payCard), cardSecretsSet: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET), payOnDelivery: Boolean(settings.payCod), cart: Boolean(settings.cart) },
    connections: { apiKeys: keys, browserSites: settings.allowedOrigins ?? [], webhooks: hooks },
  }
}

async function systemPage(env: Env, url: URL, site: SiteRow, code: string) {
  const status = await systemStatus(env, site, url.origin)
  const base = `/owner/${escapeHtml(code)}`
  const row = (label: string, value: unknown, href?: string) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}${href ? ` <a href="${base}${href}">Open</a>` : ''}</dd></div>`
  const on = (value: boolean) => (value ? 'On' : 'Off')
  const waiting = status.publishing.waiting
  return office(
    site,
    code,
    'System',
    `<p>Everything about your system in one place.</p>
<article class="card account__record"><h2>Hosting</h2><dl>${row('Address', status.address)}${row('Where it runs', status.hosting)}${row('Version', `${status.version}${status.latestVersion === 'unknown' || status.latestVersion === status.version ? '' : `, ${status.latestVersion} is available`}`, '/updates')}</dl></article>
<article class="card account__record"><h2>Publishing</h2><dl>${row('Live version', status.publishing.liveVersion ?? 'Not published yet, so changes show at once', '/publish')}${row('Waiting to publish', waiting ? waiting.pages.length + (waiting.settings ? 1 : 0) : 0)}</dl></article>
<article class="card account__record"><h2>Database</h2><dl>${row('Pages', status.database.pages, '/pages')}${row('Tables', status.database.tables, '/data')}${row('Records', status.database.records)}${row('Customers', status.database.customers, '/customers')}${row('Orders', status.database.orders, '/orders')}${row('Images', `${(status.database.imageBytes / 1_000_000).toFixed(1)} MB of 200 MB`, '/media')}</dl></article>
<article class="card account__record"><h2>Login and payments</h2><dl>${row('Customer accounts', on(status.login.customerAccounts), '/settings')}${row('Cart', on(status.payments.cart))}${row('Bank transfer', on(status.payments.bankTransfer))}${row('Pay on delivery', on(status.payments.payOnDelivery))}${row('Cards', on(status.payments.card))}${row('Stripe secrets in Cloudflare', status.payments.cardSecretsSet ? 'Set' : 'Not set')}</dl></article>
<article class="card account__record"><h2>Your data is yours</h2><p>Your code is in your GitHub, and your database is in your Cloudflare account. You can also download all your content and data in one file at any time.</p><p><a class="button button--small" href="${base}/export.json">Download everything</a></p></article>
<article class="card account__record"><h2>Connections</h2><dl>${row('Secret keys', status.connections.apiKeys, '/connect')}${row('Webhooks', status.connections.webhooks)}${row('Websites allowed to call from a browser', status.connections.browserSites.join(', ') || 'None')}</dl></article>`,
  )
}

/** The back office areas for tables, connections, publishing and system status. Returns null for anything else. */
export function handlePlatform(request: Request, env: Env, url: URL, site: SiteRow, code: string, area: string, id: string | undefined, action: string | undefined, extra: string | undefined, saved?: Notice) {
  if (area === 'data') return handleData(request, env, url, site, code, id, action, extra, saved)
  if (area === 'connect') return handleConnect(request, env, url, site, code, id, action, extra, saved)
  if (area === 'publish') return handlePublish(request, env, url, site, code, id, action, saved)
  if (area === 'system' && !id && request.method !== 'POST') return systemPage(env, url, site, code)
  if (area === 'export.json' && !id && request.method === 'GET') return exportEverything(env, site)
  if (area === 'move' && !action) return handleMove(request, env, url, site, code, id, saved)
  return null
}
