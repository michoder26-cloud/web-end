import { newToken } from './auth'
import { automationProblems, maxAutomationsPerSite } from './automations'
import { office, writeItem } from './cms'
import type { Desk } from './cms'
import { createRecord, getTable, ownerActor, saveTable, tableSchema } from './data'
import { escapeHtml, html, notFound, privateHeaders, see } from './http'
import { officeText } from './office-words'
import type { OfficeWords } from './office-words'
import { defaultSiteNames, shell } from './owner'
import { rememberPage } from './page-history'
import { starterIds, starterLanguages, starterSites } from './starters'
import type { StarterId, StarterLanguage } from './starters'
import type { Env, Settings, SiteRow } from './types'

// The first ten minutes: the guided start right after claiming, starters, and the checklist on the overview.

const maxItemsPerSite = 500

export const isStarter = (value: unknown): value is StarterId => (starterIds as readonly unknown[]).includes(value)
export const isStarterLanguage = (value: unknown): value is StarterLanguage => (starterLanguages as readonly unknown[]).includes(value)
export const siteStarterLanguage = (settings: Settings): StarterLanguage => (settings.language?.toLowerCase().startsWith('th') ? 'th' : 'en')

/** What the site already holds. A starter goes straight onto a site with none of these, and needs the owner's say-so otherwise. */
export async function siteContents(env: Env, siteId: number) {
  const row = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM pages WHERE site_id = ?) AS pages, (SELECT COUNT(*) FROM items WHERE site_id = ?) AS items, (SELECT COUNT(*) FROM data_tables WHERE site_id = ?) AS tables')
    .bind(siteId, siteId, siteId)
    .first<{ items: number; pages: number; tables: number }>()
  const contents = { items: row?.items ?? 0, pages: row?.pages ?? 0, tables: row?.tables ?? 0 }
  return { ...contents, empty: !contents.items && !contents.pages && !contents.tables }
}

/**
 * Puts a starter on the site. Pages and the design are replaced; products, tables and automations are only ever added,
 * and orders, customers, records and messages are never touched. A starter's table that already exists is left as it is.
 */
export async function applyStarter(env: Env, site: SiteRow, id: StarterId, language: StarterLanguage, replacePages: boolean) {
  const content = starterSites[id][language]
  const before = await siteContents(env, site.id)
  if (!before.empty && !replacePages) return { before, error: 'not-empty' as const }

  const current = JSON.parse(site.settings) as Settings
  const next: Settings = { ...current, ...content.settings, language }
  // Keep a name the owner chose. Only the default name or another starter's sample name gives way.
  const sampleNames = new Set([...defaultSiteNames, ...starterIds.flatMap((other) => starterLanguages.map((lang) => starterSites[other][lang].settings.name))])
  if (current.name && !sampleNames.has(current.name)) next.name = current.name
  // The starter brings its own look, so colours chosen for another design would only clash.
  delete next.background
  delete next.text
  // Replacing the pages is intentional, but the owner can still recover every page
  // individually from its private history after choosing a starter.
  if (replacePages) {
    const { results } = await env.DB.prepare('SELECT slug FROM pages WHERE site_id = ?').bind(site.id).all<{ slug: string }>()
    await Promise.all(results.map((page) => rememberPage(env, site.id, page.slug)))
  }
  await env.DB.batch([
    ...(replacePages ? [env.DB.prepare('DELETE FROM pages WHERE site_id = ?').bind(site.id)] : []),
    ...content.pages.map((page) =>
      env.DB.prepare(`INSERT INTO pages (site_id, slug, title, description, published, blocks) VALUES (?, ?, ?, ?, 1, ?)
        ON CONFLICT (site_id, slug) DO UPDATE SET title = excluded.title, description = excluded.description, published = 1, blocks = excluded.blocks, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`).bind(site.id, page.slug, page.title, page.description, JSON.stringify(page.blocks)),
    ),
    env.DB.prepare("UPDATE sites SET settings = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(JSON.stringify(next), site.id),
  ])

  const tables: string[] = []
  for (const table of content.tables) {
    if (await getTable(env, site.id, table.name)) continue
    const problem = await saveTable(env, site.id, tableSchema.parse(table))
    if (problem) throw new Error(`Starter ${id}: ${problem}`)
    tables.push(table.name)
    const created = await getTable(env, site.id, table.name)
    for (const values of content.records[table.name] ?? []) if (created) await createRecord(env, site.id, created, values, ownerActor)
  }

  let items = 0
  const { results: held } = await env.DB.prepare('SELECT collection, title FROM items WHERE site_id = ?').bind(site.id).all<{ collection: string; title: string }>()
  const have = new Set(held.map((item) => `${item.collection}\n${item.title}`))
  for (const item of content.items) {
    if (have.has(`${item.collection}\n${item.title}`) || held.length + items >= maxItemsPerSite) continue
    await writeItem(env, site.id, item)
    items++
  }

  const automations: string[] = []
  const { results: rules } = await env.DB.prepare('SELECT name FROM automations WHERE site_id = ?').bind(site.id).all<{ name: string }>()
  for (const rule of content.automations) {
    if (rules.some((existing) => existing.name === rule.name) || rules.length + automations.length >= maxAutomationsPerSite) continue
    // Checked like one Claude saves, so an owner's own table with the same name can't get a rule that doesn't fit it.
    if ((await automationProblems(env, site, rule)).length) continue
    await env.DB.prepare('INSERT INTO automations (site_id, name, rule, enabled, secret) VALUES (?, ?, ?, 1, ?)').bind(site.id, rule.name, JSON.stringify(rule), newToken()).run()
    automations.push(rule.name)
  }
  return { added: { automations, items, tables }, before, pages: content.pages.map((page) => page.slug) }
}

// The checklist

/** Claude has used the private link. Remembered once, for the checklist. */
export const noteClaude = (env: Env) =>
  env.DB.prepare("UPDATE sites SET claude_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE claude_seen_at IS NULL")
    .run()
    .catch((error: unknown) => console.error(error))

const onPhone = (request: Request) => request.headers.get('sec-ch-ua-mobile') === '?1' || /Mobi|Android|iPhone|iPad/i.test(request.headers.get('user-agent') ?? '')

/** The owner opened their back office or preview on a phone, so they have seen the site there. */
export const notePhone = async (request: Request, env: Env) => {
  if (request.method !== 'GET' || !onPhone(request)) return
  await env.DB.prepare("UPDATE sites SET phone_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE phone_seen_at IS NULL")
    .run()
    .catch((error: unknown) => console.error(error))
}

/** Each step of the checklist, worked out from what really happened rather than from ticks the owner sets. */
export async function firstSteps(env: Env, site: SiteRow) {
  const row = await env.DB.prepare("SELECT claude_seen_at, phone_seen_at, (SELECT COUNT(*) FROM pages WHERE site_id = sites.id AND slug = 'home') AS home FROM sites WHERE id = ?")
    .bind(site.id)
    .first<{ claude_seen_at: null | string; home: number; phone_seen_at: null | string }>()
    .catch((error: unknown) => {
      console.error(error)
      return null
    })
  if (!row) return null
  return { build: row.home > 0, claude: Boolean(row.claude_seen_at), phone: Boolean(row.phone_seen_at), publish: Boolean(site.live_version) }
}

export type FirstSteps = NonNullable<Awaited<ReturnType<typeof firstSteps>>>

export function checklist(steps: FirstSteps, base: string, t: OfficeWords) {
  const s = t.start
  const rows: [keyof FirstSteps, string, string][] = [
    ['claude', s.stepClaude, s.stepClaudeHelp],
    ['build', s.stepBuild, s.stepBuildHelp(`${base}/starters`)],
    ['phone', s.stepPhone, s.stepPhoneHelp],
    ['publish', s.stepPublish, s.stepPublishHelp(`${base}/publish`)],
  ]
  const items = rows
    .map(([key, title, help], index) => {
      const done = steps[key]
      return `<li data-done="${done ? 1 : 0}" data-step="${key}"><span aria-hidden="true" class="checklist__mark">${done ? '✓' : index + 1}</span><div><b>${title}</b> <small class="checklist__state">${done ? s.done : s.toDo}</small>${done ? '' : `<p>${help}</p>`}</div></li>`
    })
    .join('')
  return `<section aria-labelledby="first-steps" class="first-steps"><h2 id="first-steps">${s.checklistHeading}</h2><p>${s.checklistIntro}</p><ol class="checklist">${items}</ol></section>`
}

// Connecting Claude, shown on the guided start and on the overview until Claude has connected

/** A read-only field that is easy to select. With the guided start's script it also gets a copy button. */
const copyField = (id: string, label: string, value: string, t: OfficeWords, rows = 0) => {
  // A label already shown just above, such as the last connect step, is only read out.
  const named = rows ? ` aria-label="${escapeHtml(label)}"` : ''
  const field = rows ? `<textarea id="${id}"${named} readonly rows="${rows}">${escapeHtml(value)}</textarea>` : `<input id="${id}" readonly value="${escapeHtml(value)}">`
  return `<div class="copy-field">${rows ? '' : `<label for="${id}">${label}</label>`}<div class="copy-field__row">${field}<button class="button button--small" data-copy="${id}" data-done="${escapeHtml(t.start.copied)}" hidden type="button">${t.start.copy}</button></div></div>`
}

export const connectGuide = (t: OfficeWords) => {
  const steps = t.start.connectSteps
  const last = steps.length - 1
  return `<ol class="cms-steps">${steps.map((step, index) => `<li>${step}${index === last ? copyField('first-message', step.replace(/<[^>]*>/g, ''), t.start.firstMessage, t, 5) : ''}</li>`).join('')}</ol><p><small>${t.start.teamPlan}</small></p>`
}

export const claudeLinkField = (mcpUrl: string, t: OfficeWords) => copyField('claude-link', t.start.claudeLink, mcpUrl, t)

// The guided start

// The only script on any of the owner's pages: it fills in the copy buttons. It runs under a nonce made for this one response.
const copyScript = `for (const button of document.querySelectorAll('[data-copy]')) {
  const field = document.getElementById(button.dataset.copy)
  button.hidden = false
  field.addEventListener('focus', () => field.select())
  button.addEventListener('click', async () => {
    field.select()
    try {
      await navigator.clipboard.writeText(field.value)
    } catch {
      document.execCommand('copy')
    }
    button.textContent = button.dataset.done
  })
}`

/**
 * The page the owner sees once, right after claiming the site: save the links, connect Claude, and optionally start from a starter.
 * It keeps the old rules: shown once, never cached, never indexed, and it sends its address nowhere.
 */
export function guidedStart(origin: string, code: string, t: OfficeWords) {
  const nonce = newToken()
  const s = t.start
  const copy = t.lang === 'th'
    ? { eyebrow: 'พื้นที่ทำงานพร้อมแล้ว', pageTitle: 'พื้นที่ทำงานของคุณ', title: 'อยากสร้างอะไร?', intro: 'เลือกตัวอย่างเพื่อเริ่มทันที หรือบอก Claude ด้วยภาษาปกติว่าต้องการระบบแบบไหน', workspace: 'เปิด Dashboard ของฉัน', build: 'สร้างกับ Claude', buildHelp: 'เชื่อม Claude ครั้งเดียว แล้วคุยให้มันสร้างเว็บและระบบหลังบ้านของคุณ', samples: 'เริ่มจากตัวอย่าง', sampleHelp: 'เลือกได้เลย แล้วค่อยปรับทุกอย่างใน Dashboard', security: 'เก็บลิงก์กู้คืนไว้', securityHelp: 'ลิงก์นี้เห็นครั้งเดียว ใช้กลับเข้าพื้นที่ทำงานได้หากยังไม่ได้สร้างบัญชีเจ้าของ', connector: 'เชื่อม Claude', ownerLink: 'ลิงก์กู้คืน Dashboard' }
    : { eyebrow: 'Your workspace is ready', pageTitle: 'Your workspace', title: 'What do you want to build?', intro: 'Start from a working example, or tell Claude in ordinary words what system you need.', workspace: 'Open my Dashboard', build: 'Build with Claude', buildHelp: 'Connect Claude once, then ask it to build your site and back office.', samples: 'Start from an example', sampleHelp: 'Choose one now, then change every part from the Dashboard.', security: 'Keep a recovery link', securityHelp: 'This is shown once. Use it to get back into your workspace before you create an owner account.', connector: 'Connect Claude', ownerLink: 'Dashboard recovery link' }
  const officeUrl = `${origin}/owner/${code}`
  const starters = starterIds
    .map((id) => {
      const content = starterSites[id][t.lang]
      return `<form action="/owner/${escapeHtml(code)}/starters" class="card starter" method="post"><input name="starter" type="hidden" value="${id}"><input name="language" type="hidden" value="${t.lang}"><h3>${escapeHtml(content.label)}</h3><p>${escapeHtml(content.description)}</p><button class="button button--small" type="submit">${s.useStarter}</button></form>`
    })
    .join('')
  const body = `<section class="launch launch--claimed"><p class="launch__eyebrow">${copy.eyebrow}</p><h1>${copy.title}</h1>
<p class="lead">${copy.intro}</p><div class="launch__actions"><a class="button launch__primary" href="/owner/${escapeHtml(code)}">${copy.workspace}</a><a class="button button--ghost" href="#build-with-claude">${copy.build}</a></div>
<section class="launch__choice" id="build-with-claude"><div><h2>${copy.build}</h2><p>${copy.buildHelp}</p></div><details><summary>${copy.connector}</summary><div class="contact-form launch__details">${claudeLinkField(`${origin}/mcp/${code}`, t)}<p>${s.claudeLinkHelp}</p>${connectGuide(t)}</div></details></section>
<section class="launch__templates"><h2>${copy.samples}</h2><p>${copy.sampleHelp}</p><div class="grid starters">${starters}</div></section>
<details class="launch__recovery"><summary>${copy.security}</summary><div class="contact-form launch__details"><p role="alert">${copy.securityHelp}</p>${copyField('office-link', copy.ownerLink, officeUrl, t)}<p>${s.adminAccount}</p><p>${s.saveHow}</p></div></details></section>`
  const headers = { ...privateHeaders, 'Content-Security-Policy': privateHeaders['Content-Security-Policy'].replace("script-src 'none'", `script-src 'nonce-${nonce}'`) }
  return html(shell(copy.pageTitle, body, false, t.lang, `<script nonce="${nonce}">${copyScript}</script>`), 200, headers)
}

// The starters page of the back office

async function startersPage(env: Env, url: URL, site: SiteRow, desk: Desk, error?: string) {
  const t = officeText(site)
  const s = t.start
  const chosen = url.searchParams.get('lang')
  const language = isStarterLanguage(chosen) ? chosen : siteStarterLanguage(JSON.parse(site.settings) as Settings)
  const contents = await siteContents(env, site.id)
  const base = escapeHtml(desk.base)
  const languages = starterLanguages.map((lang) => `<a${lang === language ? ' aria-current="true"' : ''} href="${base}/starters?lang=${lang}">${lang === 'th' ? 'ภาษาไทย' : 'English'}</a>`).join(' · ')
  const cards = starterIds
    .map((id) => {
      const content = starterSites[id][language]
      return `<form action="${base}/starters" class="card starter contact-form" method="post"><input name="starter" type="hidden" value="${id}"><input name="language" type="hidden" value="${language}"><h2>${escapeHtml(content.label)}</h2><p>${escapeHtml(content.description)}</p><p><b>${s.includes}</b></p><ul>${content.includes.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>${contents.empty ? '' : `<label class="check"><input name="confirm" required type="checkbox"> ${s.replaceConfirm}</label>`}<button class="button" type="submit">${s.useStarter}</button></form>`
    })
    .join('')
  return office(site, desk, s.startersTitle, `<p>${s.startersIntro}</p><p>${s.starterLanguage}: ${languages}</p>${contents.empty ? '' : `<p role="alert">${s.replaceNote(contents.pages)}</p>`}<div class="grid starters">${cards}</div>`, error ? { error } : undefined, error ? 409 : 200)
}

/** Only the owner reaches this, through their secret link, because a starter replaces every page and the design. */
export async function handleStarters(request: Request, env: Env, url: URL, site: SiteRow, desk: Desk) {
  if (desk.staff || !desk.accountOwner) return notFound()
  if (request.method !== 'POST') return startersPage(env, url, site, desk)
  const form = await request.formData().catch((): null => null)
  const id = form?.get('starter')
  const language = form?.get('language')
  if (!isStarter(id) || !isStarterLanguage(language)) return notFound()
  const result = await applyStarter(env, site, id, language, form?.get('confirm') === 'on')
  if (result.error) return startersPage(env, url, site, desk, officeText(site).start.notEmpty)
  return see(url, `${desk.base}?started=${id}`)
}
