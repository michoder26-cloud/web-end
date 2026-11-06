import { newApiKey } from './api'
import { newToken, sha256 } from './auth'
import { allows, firstProblem, input, office, readField, spec } from './cms'
import type { Desk, Notice } from './cms'
import { accessLevels, canChange, canCreate, createRecord, deleteRecord, fieldTypes, getRecord, getTable, listRecords, listTables, ownerActor, readScope, recordsCsv, saveTable, tableSchema, updateRecord } from './data'
import type { Actor, DataField, DataTable } from './data'
import { emailProblems, emailStatus, sendEmail } from './email'
import { googleProblems, googleStatus } from './google'
import { escapeHtml, notFound, see } from './http'
import { extraLanguages, languageName, mainLanguage } from './languages'
import { checkMove, cleanPath, finishMove, importProducts, moveReport, moveStatus, safeWebUrl, saveRedirects } from './moving'
import type { MoveReport } from './moving'
import { officeText } from './office-words'
import type { OfficeWords } from './office-words'
import { canPayByPromptPay } from './shop'
import { exportStats } from './stats'
import { latestRelease } from './updates'
import { listVersions, publishVersion, restoreVersion, unpublishedChanges } from './versions'
import { version } from './version'
import { eventNames, validWebhookUrl } from './webhooks'
import { redirectionCsv, woocommerceCsv, wordpressPlan, wordpressReport, wordpressXml } from './wordpress'
import type { Env, Settings, SiteRow } from './types'

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

const accessSelect = (name: string, label: string, value: string, t: OfficeWords) => `<label>${label}<select name="${name}">${accessLevels.map((level) => `<option${level === value ? ' selected' : ''} value="${level}">${t.access[level]}</option>`).join('')}</select></label>`

const tableForm = (desk: Desk, t: OfficeWords, table?: DataTable) =>
  `<form action="${escapeHtml(desk.base)}/data${table ? `/${escapeHtml(table.name)}` : ''}" class="contact-form cms-form" method="post"><input name="op" type="hidden" value="schema">
${table ? `<input name="name" type="hidden" value="${escapeHtml(table.name)}">` : `<label>${t.tableName}<input maxlength="40" name="name" pattern="[a-z][a-z0-9_]*" required></label>`}
<label>${t.tableLabel}<input maxlength="80" name="label" required value="${escapeHtml(table?.label)}"></label>
${accessSelect('readAccess', t.whoCanRead, table?.read_access ?? 'owner', t)}${accessSelect('writeAccess', t.whoCanAdd, table?.write_access ?? 'owner', t)}
${input('fields', fieldSpec(), table?.fields, t)}
<button class="button" type="submit">${table ? t.saveTable : t.createTable}</button></form>`

const readTable = (form: FormData) =>
  tableSchema.safeParse({
    fields: readField(form, 'fields', fieldSpec()),
    label: String(form.get('label') ?? '').trim(),
    name: String(form.get('name') ?? '').trim(),
    readAccess: form.get('readAccess'),
    writeAccess: form.get('writeAccess'),
  })

// Staff follow each table's own rules, the same as on the website and through the API. The owner sees everything.
const deskActor = (desk: Desk): Actor => (desk.staff ? { admin: false, customer: desk.staff } : ownerActor)

async function tablesPage(env: Env, site: SiteRow, desk: Desk, notice?: Notice) {
  const t = officeText(site)
  const tables = (await listTables(env, site.id)).filter((table) => readScope(table, deskActor(desk)))
  const rows = tables.map((table) => `<li><a href="${escapeHtml(desk.base)}/data/${escapeHtml(table.name)}">${escapeHtml(table.label)}</a> <small>${t.tableSummary(table.record_count, t.access[table.read_access], t.access[table.write_access])}</small></li>`).join('')
  return office(site, desk, t.nav.data, `<p>${t.dataIntro}</p><ul>${rows || `<li>${t.noTables}</li>`}</ul>${desk.staff ? '' : `<h2>${t.createATable}</h2>${tableForm(desk, t)}`}`, notice)
}

// The owner named these fields, so their labels and choices are shown as they are.
const recordFields = (field: DataField, value: unknown, t: OfficeWords) => {
  if (field.type === 'boolean') return input(field.name, spec(field.name, field.label, 'bool'), value, t, false)
  if (field.type === 'textarea') return input(field.name, spec(field.name, field.label, 'long'), value, t, false)
  if (field.type === 'select') return input(field.name, spec(field.name, field.label, 'select', { options: ['', ...(field.options ?? [])] }), value, t, false)
  return input(field.name, spec(field.name, field.label), value, t, false)
}

async function tablePage(env: Env, site: SiteRow, desk: Desk, table: DataTable, notice?: Notice, status = 200) {
  const t = officeText(site)
  const actor = deskActor(desk)
  const base = `${escapeHtml(desk.base)}/data/${escapeHtml(table.name)}`
  const list = await listRecords(env, table, actor, { limit: 100, newestFirst: true })
  const rows = (list.rows ?? [])
    .map((row) => {
      const data = JSON.parse(row.data) as Record<string, unknown>
      const summary = table.fields.slice(0, 3).map((field) => escapeHtml(data[field.name])).filter(Boolean).join(' · ')
      const shown = canChange(table, actor, row)
        ? `<form action="${base}/${row.id}" class="contact-form" method="post">${table.fields.map((field) => recordFields(field, data[field.name], t)).join('')}<button class="button button--small" type="submit">${t.save}</button></form><form action="${base}/${row.id}/delete" class="cms-danger contact-form" method="post"><label class="check"><input name="confirm" required type="checkbox"> ${t.confirmDeleteRecord}</label><button class="button button--small" type="submit">${t.delete}</button></form>`
        : `<dl>${table.fields.map((field) => `<div><dt>${escapeHtml(field.label)}</dt><dd class="pre-line">${escapeHtml(data[field.name])}</dd></div>`).join('')}</dl>`
      return `<details class="card account__record"><summary>#${row.id} ${summary}</summary>${shown}</details>`
    })
    .join('')
  // Only the owner changes a table's fields, who may use it, or deletes it.
  const ownerParts = desk.staff
    ? ''
    : `<h2>${t.fieldsAndAccess}</h2>${tableForm(desk, t, table)}
<h2>${t.deleteThisTable}</h2><form action="${base}/delete" class="cms-danger contact-form" method="post"><label class="check"><input name="confirm" required type="checkbox"> ${t.confirmDeleteTable(table.record_count)}</label><button class="button button--small" type="submit">${t.deleteTable}</button></form>`
  return office(
    site,
    desk,
    t.dataTitle(table.label),
    `<p>${t.downloadCsv(`${base}/export.csv`, `/api/v1/data/${escapeHtml(table.name)}`)}</p>
${canCreate(table, actor) ? `<h2>${t.addRecord}</h2><form action="${base}" class="contact-form" method="post"><input name="op" type="hidden" value="add">${table.fields.map((field) => recordFields(field, field.default, t)).join('')}<button class="button button--small" type="submit">${t.add}</button></form>` : ''}
<h2>${t.records(table.record_count)}</h2>${rows || `<p>${t.noneYet}</p>`}
${ownerParts}`,
    notice,
    status,
  )
}

const formRecord = (table: DataTable, form: FormData) => {
  const values: Record<string, unknown> = {}
  for (const field of table.fields) values[field.name] = field.type === 'boolean' ? form.get(field.name) === 'on' : String(form.get(field.name) ?? '')
  return values
}

async function handleData(request: Request, env: Env, url: URL, site: SiteRow, desk: Desk, name: string | undefined, id: string | undefined, action: string | undefined, saved?: Notice) {
  const post = request.method === 'POST'
  const owner = `${desk.base}/data`
  const actor = deskActor(desk)
  if (!name) {
    if (!post) return tablesPage(env, site, desk, saved)
    if (desk.staff) return notFound()
    const parsed = readTable(await request.formData())
    if (!parsed.success) return tablesPage(env, site, desk, { error: officeText(site).notSaved(firstProblem(parsed.error)) })
    const problem = await saveTable(env, site.id, parsed.data)
    return problem ? tablesPage(env, site, desk, { error: problem }) : see(url, `${owner}/${parsed.data.name}?saved=1`)
  }
  const table = await getTable(env, site.id, name)
  // A table staff may not read looks the same as one that doesn't exist.
  if (!table || !readScope(table, actor)) return notFound()
  const path = `${owner}/${table.name}`
  const refuse = () => tablePage(env, site, desk, table, { error: officeText(site).staffRefused }, 403)
  if (id === 'export.csv' && !action && !post) return new Response(await recordsCsv(env, table), { headers: { 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="${table.name}.csv"`, 'Content-Type': 'text/csv; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } })
  if (id === 'delete' && post && !action) {
    if (desk.staff) return refuse()
    if ((await request.formData()).get('confirm') === 'on') await env.DB.prepare('DELETE FROM data_tables WHERE id = ? AND site_id = ?').bind(table.id, site.id).run()
    return see(url, owner)
  }
  if (!id) {
    if (!post) return tablePage(env, site, desk, table, saved)
    const form = await request.formData()
    if (form.get('op') === 'schema') {
      if (desk.staff) return refuse()
      const parsed = readTable(form)
      if (!parsed.success) return tablePage(env, site, desk, table, { error: officeText(site).notSaved(firstProblem(parsed.error)) })
      const problem = await saveTable(env, site.id, { ...parsed.data, name: table.name })
      return problem ? tablePage(env, site, desk, table, { error: problem }) : see(url, `${path}?saved=1`)
    }
    if (!canCreate(table, actor)) return refuse()
    const added = await createRecord(env, site.id, table, formRecord(table, form), actor)
    return added.row ? see(url, `${path}?saved=1`) : tablePage(env, site, desk, table, { error: added.error })
  }
  if (!post || !/^\d{1,12}$/.test(id)) return notFound()
  const row = await getRecord(env, table, Number(id))
  if (!row) return notFound()
  if (!canChange(table, actor, row)) return refuse()
  const form = await request.formData()
  if (action === 'delete') {
    if (form.get('confirm') === 'on') await deleteRecord(env, site.id, table, row)
    return see(url, path)
  }
  if (action) return notFound()
  const changed = await updateRecord(env, site.id, table, row, formRecord(table, form), actor)
  return changed.row ? see(url, `${path}?saved=1`) : tablePage(env, site, desk, table, { error: changed.error })
}

const designCard = (design: NonNullable<Awaited<ReturnType<typeof moveStatus>>['design']>) => {
  const swatch = (value: string | undefined) => (value ? `<span style="background:${escapeHtml(value)};border:1px solid #888;display:inline-block;height:1em;vertical-align:middle;width:1.5em"></span> ${escapeHtml(value)}` : 'Not set')
  const row = (label: string, key: 'accent' | 'background' | 'text') => `<tr><th scope="row">${label}</th><td>${swatch(design.old[key])}</td><td>${swatch(design.now[key])}</td></tr>`
  return `<article class="card account__record"><h3>Colours and fonts</h3><div style="overflow-x:auto"><table><thead><tr><th scope="col"></th><th scope="col">Old site</th><th scope="col">Here</th></tr></thead><tbody>${row('Page background', 'background')}${row('Text', 'text')}${row('Buttons', 'accent')}<tr><th scope="row">Fonts</th><td>${escapeHtml(design.old.fonts.join(', ') || 'Not found')}</td><td>Headings: ${escapeHtml(design.now.headingFont)}<br>Text: ${escapeHtml(design.now.bodyFont)}</td></tr></tbody></table></div></article>`
}

const checkCard = (code: string, report: MoveReport, t: OfficeWords) => {
  const group = (title: string, lines: string[]) => (lines.length ? `<h4>${escapeHtml(title)} (${lines.length})</h4><ul>${lines.map((line) => `<li style="overflow-wrap:anywhere">${escapeHtml(line)}</li>`).join('')}</ul>` : '')
  const facts = [...(report.titleKept ? [] : [t.titleChanged]), ...(report.descriptionKept ? [] : [t.descriptionChanged]), ...(report.oldPageWasCut ? [t.oldPageCut] : [])]
  return `<article class="card account__record"><h3>${report.problems ? t.differences(report.problems) : t.noDifferences} · /${escapeHtml(report.newPage)}</h3><p style="overflow-wrap:anywhere"><small>${t.comparedWith(escapeHtml(report.oldUrl), report.linesOnOldPage, report.imagesFoundOnOldPage)}</small></p><p><a href="${escapeHtml(report.oldUrl)}" rel="noopener noreferrer" target="_blank">Open the old page</a> · <a href="/owner/${escapeHtml(code)}/preview/${escapeHtml(report.newPage)}" target="_blank">Open the new page</a></p>${facts.map((fact) => `<p>${escapeHtml(fact)}</p>`).join('')}${group('Headings in a different order', report.headingsOutOfOrder)}${group(t.textMissing, report.textMissing)}${group(t.linkTextMissing, report.linkTextMissing)}${group(t.imagesNotCopied, report.imagesNotCopied)}${group(t.imagesNotUsed, report.imagesCopiedNotUsed)}${group(t.imagesOnOldHost, report.imagesStillOnOldHost)}</article>`
}

async function movePage(env: Env, site: SiteRow, code: string, notice?: Notice) {
  const t = officeText(site)
  const base = `/owner/${escapeHtml(code)}/move`
  const [status, { results: pages }] = await Promise.all([moveStatus(env, site), env.DB.prepare('SELECT slug FROM pages WHERE site_id = ? ORDER BY slug').bind(site.id).all<{ slug: string }>()])
  const { results } = await env.DB.prepare('SELECT from_path, to_path FROM redirects WHERE site_id = ? ORDER BY from_path LIMIT 2000').bind(site.id).all<{ from_path: string; to_path: string }>()
  return office(
    site,
    code,
    t.moveTitle,
    `<p>${t.moveIntro}</p>
<h2>${t.checkHeading}</h2><p>${t.checkHelp}</p>
<form action="${base}/check" class="contact-form" method="post"><label>${t.oldPageAddress}<input maxlength="500" name="url" placeholder="https://" required type="url"></label><label>${t.pageHere}<select name="page">${pages.map((page) => `<option>${escapeHtml(page.slug)}</option>`).join('')}</select></label><button class="button button--small" type="submit">${t.compare}</button></form>
${status.notRebuilt.length ? `<article class="card account__record"><h3>${t.notRebuilt(status.notRebuilt.length)}</h3><ul>${status.notRebuilt.map((address) => `<li style="overflow-wrap:anywhere">${escapeHtml(address)}</li>`).join('')}</ul></article>` : ''}
${status.design ? designCard(status.design) : ''}
${[...status.pages].sort((a, b) => b.problems - a.problems).map((report) => checkCard(code, report, t)).join('')}
${status.pages.length || status.notRebuilt.length ? `<p><a class="button button--small button--ghost" href="${base}/report.json">${t.downloadMoveReport}</a></p>` : ''}
${status.pages.length || status.notRebuilt.length ? `<form action="${base}/finish" class="cms-danger contact-form" method="post"><label class="check"><input name="confirm" required type="checkbox"> ${t.confirmFinishMove}</label><button class="button button--small" type="submit">${t.finishMove}</button></form>` : ''}
<h2>${t.wixProducts}</h2><p>${t.wixProductsHelp}</p>
<form action="${base}/products" class="contact-form" enctype="multipart/form-data" method="post"><label>${t.productFile}<input accept=".csv,text/csv" name="file" required type="file"></label><button class="button button--small" type="submit">${t.importProducts}</button></form>
<h2>${t.oldLinks}</h2><p>${t.oldLinksHelp}</p>
<form action="${base}/redirects" class="contact-form" method="post"><label>${t.oldLinksLabel}<textarea name="redirects" rows="8">${escapeHtml(results.map((row) => `${row.from_path} | ${row.to_path}`).join('\n'))}</textarea></label><button class="button button--small" type="submit">${t.saveOldLinks}</button></form>`,
    notice,
  )
}

async function handleMove(request: Request, env: Env, url: URL, site: SiteRow, code: string, kind: string | undefined, saved?: Notice) {
  if (kind === 'report.json' && request.method === 'GET') return new Response(JSON.stringify(await moveReport(env, site), null, 2), { headers: { 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="web-end-move-report.json"', 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' } })
  if (!kind) return request.method === 'POST' ? notFound() : movePage(env, site, code, saved)
  if (request.method !== 'POST') return notFound()
  const form = await request.formData().catch((): null => null)
  if (!form) return see(url, `/owner/${code}/move`)
  const t = officeText(site)
  if (kind === 'finish') {
    if (form.get('confirm') === 'on') await finishMove(env, site.id)
    return see(url, `/owner/${code}/move?saved=1`)
  }
  if (kind === 'check') {
    const target = safeWebUrl(env, String(form.get('url') ?? '').trim())
    if (!target) return movePage(env, site, code, { error: t.usePublicHttps })
    const result = await checkMove(env, site, target, String(form.get('page') ?? ''))
    return result.error ? movePage(env, site, code, { error: result.error }) : see(url, `/owner/${code}/move?saved=1`)
  }
  if (kind === 'products') {
    const file = form.get('file')
    if (!(file instanceof File) || !file.size) return movePage(env, site, code, { error: t.chooseFile })
    if (file.size > 2_000_000) return movePage(env, site, code, { error: t.fileTooLarge })
    const result = await importProducts(env, site, await file.text())
    if (result.error) return movePage(env, site, code, { error: result.error })
    const notes = [t.imported(result.imported ?? 0), result.skippedAlreadyThere ? t.alreadyThere(result.skippedAlreadyThere) : '', result.skippedNoRoom ? t.noRoom(result.skippedNoRoom) : '', result.notImportedExtraImages ? t.extraImages(result.notImportedExtraImages) : '', result.imagesStillOnOldHost ? t.photosOnOldHost : '']
    return movePage(env, site, code, { saved: notes.filter(Boolean).join(' ') })
  }
  if (kind === 'redirects') {
    const pairs = String(form.get('redirects') ?? '').split('\n').map((line) => line.split('|').map((part) => part.trim())).filter(([from]) => from).map(([from, to]) => ({ from, to: to ?? '' }))
    const result = await saveRedirects(env, site.id, pairs)
    if (result.error) return movePage(env, site, code, { error: result.error })
    if (result.problems?.length) return movePage(env, site, code, { error: t.redirectProblems(result.saved ?? 0, result.problems.slice(0, 5).join(', ')) })
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
  const [pages, items, variants, customers, orders, lines, entries, images, automations, subscribers, campaigns] = await Promise.all([
    all('SELECT slug, title, description, published, blocks, translations FROM pages WHERE site_id = ?'),
    all('SELECT * FROM items WHERE site_id = ?'),
    all('SELECT item_variants.* FROM item_variants JOIN items ON items.id = item_variants.item_id WHERE items.site_id = ?'),
    all('SELECT id, email, name, role, created_at FROM customers WHERE site_id = ?'),
    all('SELECT id, customer_id, name, phone, email, address, note, payment, status, subtotal, shipping, total, money_prefix, money_suffix, language, created_at, updated_at FROM orders WHERE site_id = ?'),
    all('SELECT order_lines.* FROM order_lines JOIN orders ON orders.id = order_lines.order_id WHERE orders.site_id = ?'),
    all('SELECT id, form, page, data, status, created_at, customer_id FROM entries WHERE site_id = ?'),
    all('SELECT id, name, type, size, created_at FROM media WHERE site_id = ?'),
    // The rules, without their webhook signing secrets.
    all('SELECT id, name, rule, enabled, created_at FROM automations WHERE site_id = ?'),
    // Who agreed to get news, and when and how: the owner's record of consent. No hashes or signing secrets.
    all('SELECT id, email, name, status, source, source_detail, consented_at, confirmed_at, unsubscribed_at, created_at FROM subscribers WHERE site_id = ?'),
    all("SELECT id, subject, body, image_url, image_alt, button_label, button_href, status, started_at, finished_at, created_at, (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = campaigns.id AND status = 'sent') AS sent FROM campaigns WHERE site_id = ?"),
  ])
  const statistics = await exportStats(env, site.id)
  const body = JSON.stringify({ automations: automations.map((row) => ({ ...row, rule: JSON.parse(String((row as { rule: string }).rule)) as unknown })), campaigns, customers, entries, exported_at: new Date().toISOString(), format: 'web-end-export-1', images_note: 'Image files stay in your database. Each one can be downloaded from /media/<id>.', images, items, order_lines: lines, orders, pages, records, settings: JSON.parse(site.settings) as unknown, statistics, subscribers, tables, variants, version }, null, 1)
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
  const t = officeText(site)
  const base = `/owner/${escapeHtml(code)}/connect`
  const settings = JSON.parse(site.settings) as Settings
  const [{ results: keys }, { results: hooks }] = await Promise.all([
    env.DB.prepare('SELECT id, name, scope, created_at, last_used_at, expires_at FROM api_keys WHERE site_id = ? ORDER BY id').bind(site.id).all<{ created_at: string; expires_at: null | string; id: number; last_used_at: null | string; name: string; scope: string }>(),
    env.DB.prepare('SELECT id, url, events, secret, last_status, last_at FROM webhooks WHERE site_id = ? ORDER BY id').bind(site.id).all<{ events: string; id: number; last_at: null | string; last_status: null | number; secret: string; url: string }>(),
  ])
  return office(
    site,
    code,
    t.nav.connect,
    `${newKey ? `<p role="status">${t.newKeyHelp}<br><code style="overflow-wrap:anywhere">${escapeHtml(newKey)}</code></p>` : ''}
<h2>${t.yourApi}</h2><p>${t.apiHelp}</p><p><code style="overflow-wrap:anywhere">${escapeHtml(url.origin)}/api/v1</code></p><p>${t.apiDocs} <a href="/api/v1/openapi.json" target="_blank" rel="noopener">openapi.json</a></p>
<h2>${t.secretKeys}</h2><p>${t.keysHelp}</p>
${keys.map((key) => `<article class="card account__record"><h3>${escapeHtml(key.name)} · ${key.scope === 'read' ? t.readOnly : t.fullAccess}</h3><p><small>${t.created(escapeHtml(key.created_at.slice(0, 10)))} · ${key.last_used_at ? t.lastUsed(escapeHtml(key.last_used_at.slice(0, 10))) : t.neverUsed} · ${key.expires_at ? t.expiresOn(escapeHtml(key.expires_at.slice(0, 10))) : t.neverExpires}</small></p><form action="${base}/key/${key.id}/delete" class="cms-danger contact-form" method="post"><label class="check"><input name="confirm" required type="checkbox"> ${t.confirmRemoveKey}</label><button class="button button--small" type="submit">${t.removeKey}</button></form></article>`).join('')}
<form action="${base}/key" class="contact-form" method="post"><label>${t.keyName}<input maxlength="80" name="name" required></label><label>${t.keyAccess}<select name="scope"><option value="full">${t.fullAccessOption}</option><option value="read">${t.readOnlyOption}</option></select></label><label>${t.keyExpiry}<select name="expires"><option value="30">${t.expiresInDays(30)}</option><option selected value="90">${t.expiresInDays(90)}</option><option value="365">${t.expiresInDays(365)}</option><option value="never">${t.neverExpires}</option></select></label><button class="button button--small" type="submit">${t.createKey}</button></form>
<h2>${t.browserSites}</h2><p>${t.browserSitesHelp}</p>
<form action="${base}/origins" class="contact-form" method="post"><label>${t.originsLabel}<textarea name="origins" rows="3">${escapeHtml((settings.allowedOrigins ?? []).join('\n'))}</textarea></label><button class="button button--small" type="submit">${t.save}</button></form>
<h2>${t.connectWix}</h2><p>${t.connectWixHelp}</p><pre style="overflow:auto"><code>${escapeHtml(wixExample(url.origin))}</code></pre>
<h2>${t.chatHeading}</h2><p>${t.chatHelp}</p>
<h2>${t.webhooks}</h2><p>${t.webhooksHelp}</p>
${hooks.map((hook) => `<article class="card account__record"><h3 style="overflow-wrap:anywhere">${escapeHtml(hook.url)}</h3><p>${escapeHtml((JSON.parse(hook.events) as string[]).join(', '))}<br><small>${hook.last_at ? t.lastMessage(escapeHtml(hook.last_at.slice(0, 16).replace('T', ' ')), hook.last_status ? t.answered(hook.last_status) : t.unreachable) : t.nothingSent}</small></p><details><summary>${t.signingSecret}</summary><code style="overflow-wrap:anywhere">${escapeHtml(hook.secret)}</code></details><form action="${base}/webhook/${hook.id}/delete" class="cms-danger contact-form" method="post"><label class="check"><input name="confirm" required type="checkbox"> ${t.confirmRemoveWebhook}</label><button class="button button--small" type="submit">${t.remove}</button></form></article>`).join('')}
<form action="${base}/webhook" class="contact-form" method="post"><label>${t.webhookAddress}<input maxlength="500" name="url" required type="url"></label><fieldset class="cms-block"><legend>${t.sendWhen}</legend>${eventNames.map((event) => `<label class="check"><input name="events" type="checkbox" value="${event}"> ${event}</label>`).join('')}</fieldset><button class="button button--small" type="submit">${t.addWebhook}</button></form>`,
    notice,
  )
}

async function handleConnect(request: Request, env: Env, url: URL, site: SiteRow, code: string, kind: string | undefined, id: string | undefined, action: string | undefined, saved?: Notice) {
  const owner = `/owner/${code}/connect`
  if (!kind) return request.method === 'POST' ? notFound() : connectPage(env, url, site, code, saved)
  if (request.method !== 'POST') return notFound()
  const form = await request.formData().catch((): null => null)
  if (!form) return see(url, owner)
  const t = officeText(site)
  if (kind === 'origins' && !id) {
    const origins = String(form.get('origins') ?? '').split('\n').map((line) => line.trim().replace(/\/$/, '')).filter(Boolean)
    if (origins.length > 20 || origins.some((origin) => !/^(https:\/\/(?:\*\.[a-z0-9.-]+|[a-z0-9.-]+(?::\d+)?)|http:\/\/localhost(?::\d+)?)$/.test(origin))) return connectPage(env, url, site, code, { error: t.badOrigins })
    await env.DB.prepare("UPDATE sites SET settings = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(JSON.stringify({ ...(JSON.parse(site.settings) as Settings), allowedOrigins: origins }), site.id).run()
    return see(url, `${owner}?saved=1`)
  }
  if (kind === 'key' && !id) {
    const name = String(form.get('name') ?? '').trim().slice(0, 80)
    if (!name) return connectPage(env, url, site, code, { error: t.needKeyName })
    const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM api_keys WHERE site_id = ?').bind(site.id).first<{ total: number }>()
    if ((count?.total ?? 0) >= 20) return connectPage(env, url, site, code, { error: t.tooManyKeys })
    const key = newApiKey()
    const days = [30, 90, 365].includes(Number(form.get('expires'))) ? Number(form.get('expires')) : null
    const expires = days ? new Date(Date.now() + days * 86_400_000).toISOString() : null
    await env.DB.prepare('INSERT INTO api_keys (site_id, name, key_hash, scope, expires_at) VALUES (?, ?, ?, ?, ?)').bind(site.id, name, await sha256(key), form.get('scope') === 'read' ? 'read' : 'full', expires).run()
    return connectPage(env, url, site, code, undefined, key)
  }
  if (kind === 'webhook' && !id) {
    const target = String(form.get('url') ?? '').trim()
    const events = form.getAll('events').map(String).filter((event) => (eventNames as readonly string[]).includes(event))
    if (target.length > 500 || !validWebhookUrl(env, target)) return connectPage(env, url, site, code, { error: t.useHttps })
    if (!events.length) return connectPage(env, url, site, code, { error: t.chooseEvent })
    const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM webhooks WHERE site_id = ?').bind(site.id).first<{ total: number }>()
    if ((count?.total ?? 0) >= 10) return connectPage(env, url, site, code, { error: t.tooManyWebhooks })
    await env.DB.prepare('INSERT INTO webhooks (site_id, url, events, secret) VALUES (?, ?, ?, ?)').bind(site.id, target, JSON.stringify(events), newToken()).run()
    return see(url, `${owner}?saved=1`)
  }
  if (action === 'delete' && /^\d+$/.test(id ?? '') && form.get('confirm') === 'on') {
    if (kind === 'key') await env.DB.prepare('DELETE FROM api_keys WHERE id = ? AND site_id = ?').bind(Number(id), site.id).run()
    if (kind === 'webhook') await env.DB.prepare('DELETE FROM webhooks WHERE id = ? AND site_id = ?').bind(Number(id), site.id).run()
  }
  return see(url, owner)
}

async function publishPage(env: Env, site: SiteRow, desk: Desk, notice?: Notice) {
  const t = officeText(site)
  const base = escapeHtml(desk.base)
  const [versions, waiting] = await Promise.all([listVersions(env, site.id), unpublishedChanges(env, site)])
  const changes = waiting ? [...waiting.pages.map((slug) => t.pageChange(slug)), ...(waiting.settings ? [t.settingsChange] : [])] : []
  const state = !site.live_version
    ? `<p>${t.neverPublished}</p>`
    : changes.length
      ? `<p role="status">${t.waiting}</p><ul>${changes.map((change) => `<li>${escapeHtml(change)}</li>`).join('')}</ul>`
      : `<p>${t.upToDate}</p>`
  const rows = versions
    .map((item) => `<article class="card account__record"><h3>${t.version(item.id)}${item.id === site.live_version ? t.liveTag : ''}</h3><p>${escapeHtml(item.note)}<br><small>${escapeHtml(item.created_at.slice(0, 16).replace('T', ' '))} UTC</small></p>${item.id === site.live_version ? '' : `<form action="${base}/publish/${item.id}/restore" class="cms-danger contact-form" method="post"><label class="check"><input name="confirm" required type="checkbox"> ${t.confirmRestore}</label><button class="button button--small" type="submit">${t.goBack}</button></form>`}</article>`)
    .join('')
  return office(
    site,
    desk,
    t.nav.publish,
    `${state}${allows(desk, 'pages') ? `<p><a class="button button--small button--ghost" href="${base}/preview" target="_blank" rel="noopener">${t.openPreview}</a></p>` : ''}
<form action="${base}/publish" class="contact-form" method="post"><label>${t.whatChanged}<input maxlength="200" name="note"></label><button class="button" type="submit">${t.publishButton}</button></form>
<h2>${t.versions}</h2><p>${t.versionsHelp}</p>${rows || `<p>${t.noneYet}</p>`}`,
    notice,
  )
}

async function handlePublish(request: Request, env: Env, url: URL, site: SiteRow, desk: Desk, id: string | undefined, action: string | undefined, saved?: Notice) {
  const owner = `${desk.base}/publish`
  if (request.method !== 'POST') return id ? notFound() : publishPage(env, site, desk, saved)
  const form = await request.formData().catch((): null => null)
  if (!id) {
    const published = await publishVersion(env, site, String(form?.get('note') ?? '').trim())
    return published.error ? publishPage(env, site, desk, { error: published.error }) : see(url, `${owner}?saved=1`)
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
    payments: { bankTransfer: Boolean(settings.payTransfer), promptPay: Boolean(settings.payPromptPay), promptPayReady: canPayByPromptPay(settings), card: Boolean(settings.payCard), cardSecretsSet: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET), payOnDelivery: Boolean(settings.payCod), cart: Boolean(settings.cart) },
    email: emailStatus(env, settings),
    google: googleStatus(env, settings, origin),
    connections: { apiKeys: keys, browserSites: settings.allowedOrigins ?? [], webhooks: hooks },
  }
}

async function systemPage(env: Env, url: URL, site: SiteRow, code: string, notice?: Notice) {
  const status = await systemStatus(env, site, url.origin)
  const settings = JSON.parse(site.settings) as Settings
  const t = officeText(site)
  const base = `/owner/${escapeHtml(code)}`
  const row = (label: string, value: unknown, href?: string) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}${href ? ` <a href="${base}${href}">${t.open}</a>` : ''}</dd></div>`
  const on = (value: boolean) => (value ? t.on : t.off)
  const waiting = status.publishing.waiting
  return office(
    site,
    code,
    t.nav.system,
    `<p>${t.systemIntro}</p>
<article class="card account__record"><h2>${t.hosting}</h2><dl>${row(t.siteAddress, status.address)}${row(t.whereItRuns, t.hostingText)}${row(t.versionLabel, `${status.version}${status.latestVersion === 'unknown' || status.latestVersion === status.version ? '' : t.isAvailable(status.latestVersion)}`, '/updates')}</dl></article>
<article class="card account__record"><h2>${t.publishing}</h2><dl>${row(t.liveVersion, status.publishing.liveVersion ?? t.notPublishedYet, '/publish')}${row(t.waitingToPublish, waiting ? waiting.pages.length + (waiting.settings ? 1 : 0) : 0)}</dl></article>
<article class="card account__record"><h2>${t.database}</h2><dl>${row(t.nav.pages, status.database.pages, '/pages')}${row(t.tables, status.database.tables, '/data')}${row(t.recordsLabel, status.database.records)}${row(t.nav.customers, status.database.customers, '/customers')}${row(t.nav.orders, status.database.orders, '/orders')}${row(t.nav.images, t.imageSpace((status.database.imageBytes / 1_000_000).toFixed(1)), '/media')}</dl></article>
<article class="card account__record"><h2>${t.loginAndPayments}</h2><dl>${row(t.customerAccounts, on(status.login.customerAccounts), '/settings')}${row(t.cartLabel, on(status.payments.cart))}${row(t.bankTransfer, on(status.payments.bankTransfer))}${row(t.promptPay, status.payments.promptPay && !status.payments.promptPayReady ? t.promptPayHalf : on(status.payments.promptPay))}${row(t.payOnDelivery, on(status.payments.payOnDelivery))}${row(t.cards, on(status.payments.card))}${row(t.stripeSecrets, status.payments.cardSecretsSet ? t.isSet : t.notSet)}</dl></article>
<article class="card account__record"><h2>${t.emailHeading}</h2><dl>${row(t.resendKey, status.email.resendKeySet ? t.isSet : t.notSet)}${row(t.sendFrom, status.email.senderAddress ?? t.notSet, '/settings')}${row(t.notifyEmail, status.email.ownerAddress ?? t.notSet, '/settings')}${row(t.emails, status.email.sending ? t.on : t.off)}</dl>${emailProblems(env, settings).map((problem) => `<p role="alert">${escapeHtml(t.problem(problem))}</p>`).join('')}${status.email.ownerNotices ? `<form action="${base}/system/test-email" method="post"><button class="button button--small" type="submit">${t.sendTestEmail}</button></form>` : ''}</article>
<article class="card account__record"><h2>${t.googleHeading}</h2><p>${t.googleHelp}</p><dl>${row(t.googleClientId, status.google.clientIdSet ? t.isSet : t.notSet)}${row(t.googleClientSecret, status.google.clientSecretSet ? t.isSet : t.notSet)}${row(t.googleRedirect, status.google.redirectAddress)}${row(t.googleButton, on(status.google.on))}</dl>${googleProblems(env, settings).map((problem) => `<p role="alert">${escapeHtml(t.problem(problem))}</p>`).join('')}</article>
<article class="card account__record"><h2>${t.yourData}</h2><p>${t.yourDataHelp}</p><p><a class="button button--small" href="${base}/export.json">${t.downloadEverything}</a> <a class="button button--small" href="${base}/wordpress">${t.moveToWordpress}</a></p></article>
<article class="card account__record"><h2>${t.connections}</h2><dl>${row(t.secretKeys, status.connections.apiKeys, '/connect')}${row(t.webhooks, status.connections.webhooks)}${row(t.browserSitesRow, status.connections.browserSites.join(', ') || t.none)}</dl></article>`,
    notice,
  )
}

/** Lets the owner see that their email setup works, and what Resend said if it doesn't. */
async function testEmail(env: Env, url: URL, site: SiteRow, code: string) {
  const settings = JSON.parse(site.settings) as Settings
  const t = officeText(site)
  if (!settings.notifyEmail) return systemPage(env, url, site, code, { error: t.needNotifyEmail })
  const sent = await sendEmail(env, settings, settings.notifyEmail, {
    heading: t.testEmailHeading,
    lines: [t.testEmailText(url.origin)],
    subject: t.testEmailSubject(settings.name),
  })
  return systemPage(env, url, site, code, sent.ok ? { saved: t.testEmailSent(settings.notifyEmail) } : { error: t.notSent(t.problem(sent.problem ?? '')) })
}

const download = (body: string, name: string, type: string) =>
  new Response(body, { headers: { 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="${name}"`, 'Content-Type': `${type}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' } })

/** The steps and files for moving this site to WordPress. A Wix site moves here first, so this is also the way from Wix to WordPress. */
async function wordpressPage(env: Env, url: URL, site: SiteRow, code: string) {
  const plan = await wordpressPlan(env, site, url.origin)
  const t = officeText(site)
  const base = `/owner/${escapeHtml(code)}/wordpress`
  const file = (href: string, label: string, note: string) => `<p><a class="button button--small" href="${base}/${href}">${label}</a> ${note}</p>`
  return office(
    site,
    code,
    t.moveToWordpress,
    `<p>${t.wordpressIntro(`/owner/${escapeHtml(code)}/move`)}</p>
${extraLanguages(JSON.parse(site.settings) as Settings).length ? `<p role="note">${escapeHtml(t.wordpressMainOnly(languageName(mainLanguage(JSON.parse(site.settings) as Settings), t.lang)))}</p>` : ''}
<article class="card account__record"><h2>${t.downloadFiles}</h2>
${file('site.xml', t.wordpressFile, t.wordpressFileNote(plan.pages.length))}
${plan.products.length ? file('products.csv', t.woocommerceFile, t.woocommerceFileNote(plan.products.length)) : ''}
${plan.data.redirects.length ? file('redirects.csv', t.redirectsFile, t.redirectsFileNote(plan.data.redirects.length)) : ''}
${file('report.json', t.wordpressReport, t.wordpressReportHelp)}</article>
<article class="card account__record"><h2>${t.bringIn}</h2><ol>
<li>${t.wpSetUp}</li>
<li>${t.wpImport}</li>
<li>${t.wpHome}</li>
<li>${t.wpMenu}</li>
${plan.products.length ? `<li>${t.wpWoo(plan.currency ? escapeHtml(plan.currency) : '')}</li><li>${t.wpProducts}</li>` : ''}
${plan.data.redirects.length ? `<li>${t.wpRedirects}</li>` : ''}
</ol><p>${t.wpKeepOnline}</p></article>
<article class="card account__record"><h2>${t.needsAttention}</h2>${plan.todo.length ? `<ul>${plan.todo.map((line) => `<li>${escapeHtml(t.wordpressTodo(line))}</li>`).join('')}</ul>` : `<p>${t.nothingToDo}</p>`}</article>`,
  )
}

/** The back office areas for tables, connections, publishing and system status. Returns null for anything else. */
export function handlePlatform(request: Request, env: Env, url: URL, site: SiteRow, desk: Desk, area: string, id: string | undefined, action: string | undefined, extra: string | undefined, saved?: Notice) {
  if (area === 'data') return handleData(request, env, url, site, desk, id, action, extra, saved)
  if (area === 'publish') return handlePublish(request, env, url, site, desk, id, action, saved)
  // The rest is for the owner alone.
  const code = desk.code
  if (!code) return null
  if (area === 'connect') return handleConnect(request, env, url, site, code, id, action, extra, saved)
  if (area === 'system' && !id && request.method !== 'POST') return systemPage(env, url, site, code)
  if (area === 'system' && id === 'test-email' && !action && request.method === 'POST') return testEmail(env, url, site, code)
  if (area === 'export.json' && !id && request.method === 'GET') return exportEverything(env, site)
  if (area === 'move' && !action) return handleMove(request, env, url, site, code, id, saved)
  if (area === 'wordpress' && !action && request.method === 'GET') {
    if (!id) return wordpressPage(env, url, site, code)
    const wpLang = id === 'site.xml' ? undefined : id.startsWith('site-') ? id.slice(5, -4) : null
    if (wpLang === null) return new Response('Not found', { status: 404 })
    if (wpLang) return wordpressXml(env, site, url.origin, wpLang).then((body) => download(body, `wordpress-import-${wpLang}.xml`, 'application/xml'))
    return wordpressXml(env, site, url.origin).then((body) => download(body, 'wordpress-import.xml', 'application/xml'))
    if (id === 'products.csv') return woocommerceCsv(env, site, url.origin).then((body) => download(body, 'woocommerce-products.csv', 'text/csv'))
    if (id === 'redirects.csv') return redirectionCsv(env, site, url.origin).then((body) => download(body, 'redirection-old-links.csv', 'text/csv'))
    if (id === 'report.json') return wordpressReport(env, site, url.origin).then((body) => download(JSON.stringify(body, null, 2), 'wordpress-move-report.json', 'application/json'))
  }
  return null
}
