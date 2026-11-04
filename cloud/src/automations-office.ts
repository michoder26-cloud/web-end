import { listAutomations, namesFor, noteText, recentRuns, sentence } from './automations'
import { office } from './cms'
import type { Desk, Notice } from './cms'
import { canSendEmail } from './email'
import { escapeHtml, notFound, see } from './http'
import { officeText } from './office-words'
import type { Env, Settings, SiteRow } from './types'
import { liveSite } from './versions'

/** The owner's list of automations: each in a plain sentence, with its switch, its last runs and a way to delete it. */
async function automationsPage(env: Env, site: SiteRow, desk: Desk, notice?: Notice) {
  const t = officeText(site)
  const words = t.automations
  const base = `${escapeHtml(desk.base)}/automations`
  const all = await listAutomations(env, site.id)
  const settings = JSON.parse(liveSite(site).settings) as Settings
  const sendsEmail = all.some((item) => item.enabled && item.rule.actions.some((action) => action.do === 'email'))
  const cards = await Promise.all(
    all.map(async (item) => {
      const runs = await recentRuns(env, item.id)
      const log = runs
        .map((run) => `<li><b>${escapeHtml(words.outcome(run.outcome))}</b> · <small>${escapeHtml(run.at.slice(0, 16).replace('T', ' '))} UTC</small><br>${[...run.notes, ...(run.error ? [run.error] : [])].map((note) => escapeHtml(noteText(note, t))).join(' ')}</li>`)
        .join('')
      const signs = item.rule.actions.some((action) => action.do === 'webhook')
      return `<article class="card account__record"><h3>${escapeHtml(item.name)} · ${item.enabled ? words.on : words.off}</h3><p>${escapeHtml(sentence(item.rule, await namesFor(env, site, item.rule), t))}</p><p><small>${escapeHtml(words.ran(item.runs, (item.last_run_at ?? '').slice(0, 16).replace('T', ' ')))}</small></p>
<form action="${base}/${item.id}/switch" class="contact-form" method="post"><input name="enabled" type="hidden" value="${item.enabled ? '0' : '1'}"><button class="button button--small${item.enabled ? ' button--ghost' : ''}" type="submit">${item.enabled ? words.switchOff : words.switchOn}</button></form>
<details><summary>${words.lastRuns}</summary>${log ? `<ul>${log}</ul>` : `<p>${t.nothingYet}</p>`}</details>${signs ? `<details><summary>${words.signingSecret}</summary><code style="overflow-wrap:anywhere">${escapeHtml(item.secret)}</code></details>` : ''}
<form action="${base}/${item.id}/delete" class="cms-danger contact-form" method="post"><label class="check"><input name="confirm" required type="checkbox"> ${words.confirmDelete}</label><button class="button button--small" type="submit">${t.delete}</button></form></article>`
    }),
  )
  return office(site, desk, words.title, `<p>${words.intro}</p>${sendsEmail && !canSendEmail(env, settings) ? `<p role="alert">${words.emailOff}</p>` : ''}${cards.join('') || `<p>${words.none}</p>`}`, notice)
}

/** Only the owner reaches this, through their secret link. Staff never do, even with every area. Rules are added through Claude, which checks them. */
export async function handleAutomationsOffice(request: Request, env: Env, url: URL, site: SiteRow, desk: Desk, id: string | undefined, action: string | undefined, saved?: Notice) {
  if (desk.staff) return notFound()
  if (request.method !== 'POST') return id ? notFound() : automationsPage(env, site, desk, saved)
  if (!/^\d{1,12}$/.test(id ?? '')) return notFound()
  const form = await request.formData().catch((): null => null)
  if (action === 'switch') await env.DB.prepare("UPDATE automations SET enabled = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND site_id = ?").bind(form?.get('enabled') === '1' ? 1 : 0, Number(id), site.id).run()
  else if (action === 'delete' && form?.get('confirm') === 'on') await env.DB.prepare('DELETE FROM automations WHERE id = ? AND site_id = ?').bind(Number(id), site.id).run()
  else return notFound()
  return see(url, `${desk.base}/automations?saved=1`)
}
