import { firstProblem, office } from './cms'
import type { Desk, Notice } from './cms'
import { canSendEmail, isEmail, renderMessage } from './email'
import { escapeHtml, html, notFound, see } from './http'
import {
  campaignMessage,
  campaignProgress,
  campaignSchema,
  dailyLimit,
  daysToFinish,
  deleteDraft,
  getCampaign,
  importSubscribers,
  listCampaigns,
  listSubscribers,
  maxDailyLimit,
  maxImport,
  readImport,
  removeSubscriber,
  saveCampaign,
  sendTest,
  sentToday,
  startCampaign,
  stopCampaign,
  subscriberCounts,
  subscribersCsv,
} from './news'
import type { Campaign } from './news'
import { officeText } from './office-words'
import type { OfficeWords } from './office-words'
import type { Env, Settings, SiteRow } from './types'
import { liveSite } from './versions'

type Draft = { body?: string; buttonHref?: string; buttonLabel?: string; imageAlt?: string; imageUrl?: string; subject?: string }

const fromCampaign = (campaign: Campaign): Draft => ({ body: campaign.body, buttonHref: campaign.button_href, buttonLabel: campaign.button_label, imageAlt: campaign.image_alt, imageUrl: campaign.image_url, subject: campaign.subject })

const readDraft = (form: FormData | null): Draft =>
  Object.fromEntries(['subject', 'body', 'imageUrl', 'imageAlt', 'buttonLabel', 'buttonHref'].map((key) => [key, String(form?.get(key) ?? '').trim()]))

async function campaignForm(env: Env, site: SiteRow, desk: Desk, t: OfficeWords, draft: Draft, id?: number) {
  const words = t.news
  const { results: media } = await env.DB.prepare('SELECT id, name FROM media WHERE site_id = ? ORDER BY id DESC LIMIT 100').bind(site.id).all<{ id: number; name: string }>()
  const images = [['', words.noImage], ...media.map((image) => [`/media/${image.id}`, `${image.name} (/media/${image.id})`])]
  return `<form action="${escapeHtml(desk.base)}/news/campaign${id ? `/${id}` : ''}" class="contact-form cms-form" method="post">
<label>${words.subject}<input maxlength="150" name="subject" required value="${escapeHtml(draft.subject)}"></label>
<label>${words.body}<textarea maxlength="20000" name="body" required rows="10">${escapeHtml(draft.body)}</textarea></label>
<label>${words.image}<select name="imageUrl">${images.map(([value, label]) => `<option value="${escapeHtml(value)}"${value === (draft.imageUrl ?? '') ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>
<label>${words.imageAlt}<input maxlength="200" name="imageAlt" value="${escapeHtml(draft.imageAlt)}"></label>
<label>${words.buttonLabel}<input maxlength="60" name="buttonLabel" value="${escapeHtml(draft.buttonLabel)}"></label>
<label>${words.buttonHref}<input maxlength="1000" name="buttonHref" value="${escapeHtml(draft.buttonHref)}"></label>
<button class="button" type="submit">${words.saveDraft}</button></form>`
}

const progressLine = async (env: Env, site: SiteRow, campaign: Campaign, t: OfficeWords) => {
  const settings = JSON.parse(liveSite(site).settings) as Settings
  const limit = dailyLimit(settings)
  const progress = await campaignProgress(env, site.id, campaign)
  const leftToday = Math.max(0, limit - (await sentToday(env, site.id)))
  return { line: t.news.progress(campaign.status, progress, daysToFinish(progress.left, leftToday, limit)), progress }
}

/** The News page: campaigns for everyone allowed here, and for the owner the people, their consent, and the settings. */
async function newsPage(env: Env, site: SiteRow, desk: Desk, notice?: Notice, draft: Draft = {}) {
  const t = officeText(site)
  const words = t.news
  const base = `${escapeHtml(desk.base)}/news`
  const settings = JSON.parse(liveSite(site).settings) as Settings
  const owner = !desk.staff
  const [counts, campaigns, used] = await Promise.all([subscriberCounts(env, site.id), listCampaigns(env, site.id), sentToday(env, site.id)])
  const cards = await Promise.all(
    campaigns.map(async (campaign) => `<li><a href="${base}/campaign/${campaign.id}">${escapeHtml(campaign.subject)}</a> · <b>${escapeHtml(words.state(campaign.status))}</b><br><small>${escapeHtml((await progressLine(env, site, campaign, t)).line)}</small></li>`),
  )
  const people = owner ? await listSubscribers(env, site.id, 200) : []
  const rows = people
    .map(
      (person) => `<tr><td>${escapeHtml(person.email)}</td><td>${escapeHtml(person.name)}</td><td>${escapeHtml(words.personState(person.status))}</td><td>${escapeHtml(words.source(person.source))}${person.source_detail ? `<br><small>${escapeHtml(person.source_detail)}</small>` : ''}</td><td>${escapeHtml(person.consented_at.slice(0, 16).replace('T', ' '))}</td><td>${escapeHtml((person.confirmed_at ?? '').slice(0, 16).replace('T', ' '))}${person.unsubscribed_at ? `<br><small>${escapeHtml(words.left(person.unsubscribed_at.slice(0, 10)))}</small>` : ''}</td>
<td><form action="${base}/subscriber/${person.id}/delete" class="cms-danger" method="post"><label class="check"><input name="confirm" required type="checkbox"> ${words.confirmRemove}</label><button class="button button--small" type="submit">${t.remove}</button></form></td></tr>`,
    )
    .join('')
  const ownerParts = owner
    ? `<h2>${words.subscribersHeading}</h2><p>${escapeHtml(words.counts(counts.subscribed, counts.pending, counts.unsubscribed))}</p>
<p><a class="button button--small" href="${base}/subscribers.csv">${words.download}</a></p>
${rows ? `<div class="cms-table"><table><thead><tr>${words.columns.map((label) => `<th>${label}</th>`).join('')}<th></th></tr></thead><tbody>${rows}</tbody></table></div>${people.length >= 200 ? `<p><small>${words.latestOnly(200)}</small></p>` : ''}` : `<p>${words.noSubscribers}</p>`}
<h2>${words.importHeading}</h2><p>${words.importHelp}</p>
<form action="${base}/import" class="contact-form cms-form" method="post">
<label>${words.importList(maxImport)}<textarea name="people" required rows="6"></textarea></label>
<label>${words.importNote}<input maxlength="300" name="note" required></label>
<label class="check"><input name="confirm" required type="checkbox"> ${words.importConfirm}</label>
<button class="button button--small" type="submit">${words.importButton}</button></form>
<h2>${words.settingsHeading}</h2>
<form action="${base}/settings" class="contact-form cms-form" method="post">
<label class="check"><input name="newsletter" type="checkbox"${settings.newsletter ? ' checked' : ''}> ${words.askBox}</label>
<label>${words.dailyLimit}<input max="${maxDailyLimit}" min="1" name="limit" required type="number" value="${dailyLimit(settings)}"></label>
<p><small>${words.limitHelp}</small></p>
<button class="button button--small" type="submit">${words.saveSettings}</button></form>`
    : `<p>${escapeHtml(words.counts(counts.subscribed, counts.pending, counts.unsubscribed))}</p><p><small>${words.staffNoAddresses}</small></p>`
  return office(
    site,
    desk,
    words.title,
    `<p>${words.intro}</p>${canSendEmail(env, settings) ? '' : `<p role="alert">${words.emailOff}</p>`}
<p><small>${escapeHtml(words.today(used, dailyLimit(settings)))}</small></p>
<h2>${words.campaignsHeading}</h2>${cards.length ? `<ul>${cards.join('')}</ul>` : `<p>${words.noCampaigns}</p>`}
<details${draft.subject || draft.body ? ' open' : ''}><summary>${words.newCampaign}</summary>${await campaignForm(env, site, desk, t, draft)}</details>
${ownerParts}`,
    notice,
  )
}

/** One campaign: its words while it is a draft, a preview, and for the owner a test and the send button. */
async function campaignPage(env: Env, site: SiteRow, desk: Desk, campaign: Campaign, notice?: Notice, draft?: Draft) {
  const t = officeText(site)
  const words = t.news
  const base = `${escapeHtml(desk.base)}/news/campaign/${campaign.id}`
  const settings = JSON.parse(liveSite(site).settings) as Settings
  const { line, progress } = await progressLine(env, site, campaign, t)
  const owner = !desk.staff
  const canEmail = canSendEmail(env, settings)
  const draftOnly = campaign.status === 'draft'
  const ownerParts = !owner
    ? ''
    : draftOnly
      ? `<h2>${words.sendHeading}</h2>${canEmail ? '' : `<p role="alert">${words.emailOff}</p>`}
${canEmail && isEmail(settings.notifyEmail) ? `<form action="${base}/test" class="contact-form" method="post"><button class="button button--small button--ghost" type="submit">${escapeHtml(words.sendTest(settings.notifyEmail))}</button></form>` : `<p>${words.noTestAddress}</p>`}
${canEmail && progress.total ? `<form action="${base}/send" class="contact-form" method="post"><label class="check"><input name="confirm" required type="checkbox"> ${escapeHtml(words.sendConfirm(progress.total))}</label><button class="button" type="submit">${words.sendNow}</button></form>` : canEmail ? `<p>${words.noOne}</p>` : ''}
<form action="${base}/delete" class="cms-danger contact-form" method="post"><label class="check"><input name="confirm" required type="checkbox"> ${words.confirmDelete}</label><button class="button button--small" type="submit">${t.delete}</button></form>`
      : campaign.status === 'sending'
        ? `<form action="${base}/stop" class="cms-danger contact-form" method="post"><label class="check"><input name="confirm" required type="checkbox"> ${words.confirmStop}</label><button class="button button--small" type="submit">${words.stop}</button></form>`
        : ''
  return office(
    site,
    desk,
    campaign.subject,
    `<p><a href="${escapeHtml(desk.base)}/news">${words.title}</a> · <b>${escapeHtml(words.state(campaign.status))}</b></p><p role="status">${escapeHtml(line)}</p>
${draftOnly ? await campaignForm(env, site, desk, t, draft ?? fromCampaign(campaign), campaign.id) : `<p>${words.locked}</p>`}
<h2>${words.preview}</h2><iframe class="news-preview" sandbox src="${base}/preview" style="width:100%;height:640px;border:1px solid #ccc;border-radius:8px;background:#fff" title="${words.preview}"></iframe>
${ownerParts}`,
    notice,
  )
}

/** The email exactly as people get it, shown in a sandboxed frame of the back office. */
function preview(site: SiteRow, campaign: Campaign, origin: string) {
  const settings = JSON.parse(liveSite(site).settings) as Settings
  const { html: body } = renderMessage(settings, { ...campaignMessage(settings, campaign, origin), footerLink: { href: `${origin}/`, label: officeText(site).news.unsubscribeLink } })
  return html(body, 200, {
    'Content-Security-Policy': "sandbox; default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; frame-ancestors 'self'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex',
  })
}

/**
 * /news and everything under it. Staff with the news area may write drafts and see previews, nothing more:
 * staffMay refuses the rest before this runs, and the owner-only parts check again here.
 */
export async function handleNewsOffice(request: Request, env: Env, url: URL, site: SiteRow, desk: Desk, id: string | undefined, action: string | undefined, extra: string | undefined, saved?: Notice) {
  const post = request.method === 'POST'
  const t = officeText(site)
  const words = t.news
  const owner = !desk.staff
  const back = (path = '') => see(url, `${desk.base}/news${path}`)
  const form = post ? await request.formData().catch((): null => null) : null

  if (!id) return post ? notFound() : newsPage(env, site, desk, saved)

  if (id === 'campaign') {
    if (!action) {
      if (!post) return notFound()
      const draft = readDraft(form)
      const parsed = campaignSchema.safeParse(draft)
      if (!parsed.success) return newsPage(env, site, desk, { error: firstProblem(parsed.error) }, draft)
      const result = await saveCampaign(env, site.id, parsed.data)
      return 'error' in result ? newsPage(env, site, desk, { error: result.error }, draft) : back(`/campaign/${result.id}?saved=1`)
    }
    if (!/^\d{1,12}$/.test(action)) return notFound()
    const campaign = await getCampaign(env, site.id, Number(action))
    if (!campaign) return notFound()
    const path = `/campaign/${campaign.id}`
    if (!post) {
      if (extra === 'preview') return preview(site, campaign, url.origin)
      return extra ? notFound() : campaignPage(env, site, desk, campaign, saved)
    }
    if (!extra) {
      const draft = readDraft(form)
      const parsed = campaignSchema.safeParse(draft)
      if (!parsed.success) return campaignPage(env, site, desk, campaign, { error: firstProblem(parsed.error) }, draft)
      const result = await saveCampaign(env, site.id, parsed.data, campaign.id)
      return 'error' in result ? campaignPage(env, site, desk, campaign, { error: result.error }, draft) : back(`${path}?saved=1`)
    }
    // Testing, sending, stopping and deleting are the owner's alone.
    if (!owner) return notFound()
    if (extra === 'test') {
      const result = await sendTest(env, site, campaign, url.origin)
      return campaignPage(env, site, desk, campaign, 'problem' in result ? { error: result.problem } : { saved: words.testSent(result.sentTo) })
    }
    if (extra === 'send' && form?.get('confirm') === 'on') {
      if (!canSendEmail(env, JSON.parse(liveSite(site).settings) as Settings)) return campaignPage(env, site, desk, campaign, { error: words.emailOff })
      if (!(await startCampaign(env, site.id, campaign.id, url.origin))) return back(path)
      return campaignPage(env, site, desk, (await getCampaign(env, site.id, campaign.id))!, { saved: words.started })
    }
    if (extra === 'stop' && form?.get('confirm') === 'on') {
      await stopCampaign(env, site.id, campaign.id)
      return back(path)
    }
    if (extra === 'delete' && form?.get('confirm') === 'on') {
      await deleteDraft(env, site.id, campaign.id)
      return back()
    }
    return notFound()
  }

  // Everything below is the owner's alone: the people, their addresses and the settings.
  if (!owner) return notFound()
  if (id === 'subscribers.csv' && !post && !action) {
    return new Response(await subscribersCsv(env, site.id), { headers: { 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="subscribers.csv"', 'Content-Type': 'text/csv; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' } })
  }
  if (!post) return notFound()
  if (id === 'subscriber' && action && /^\d{1,12}$/.test(action) && extra === 'delete') {
    if (form?.get('confirm') === 'on') await removeSubscriber(env, site.id, Number(action))
    return back('?saved=1')
  }
  if (id === 'import' && !action) {
    const note = String(form?.get('note') ?? '').trim()
    if (form?.get('confirm') !== 'on' || !note) return newsPage(env, site, desk, { error: words.importNeedsConsent })
    const { bad, people } = readImport(String(form?.get('people') ?? ''))
    if (bad.length) return newsPage(env, site, desk, { error: words.importBad(bad.slice(0, 5).join(', ')) })
    const result = await importSubscribers(env, site.id, people, note)
    return newsPage(env, site, desk, { saved: words.imported(result.added, result.skipped.length, result.tooMany) })
  }
  if (id === 'settings' && !action) {
    const limit = Number(form?.get('limit'))
    if (!Number.isInteger(limit) || limit < 1 || limit > maxDailyLimit) return newsPage(env, site, desk, { error: words.badLimit(maxDailyLimit) })
    const settings = JSON.parse(site.settings) as Settings
    // These two work at once, without publishing, like the email settings.
    await env.DB.prepare("UPDATE sites SET settings = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(JSON.stringify({ ...settings, newsDailyLimit: limit, newsletter: form?.get('newsletter') === 'on' }), site.id).run()
    return back('?saved=1')
  }
  return notFound()
}
