import { office } from './cms'
import type { Desk } from './cms'
import { escapeHtml } from './http'
import { officeText } from './office-words'
import type { OfficeWords } from './office-words'
import { readStats } from './stats'
import type { Ranked, Report } from './stats'
import type { Env, SiteRow } from './types'

const regionNames = new Map<string, Intl.DisplayNames | null>()
const countryName = (code: string, t: OfficeWords) => {
  if (!code) return t.stats.unknownCountry
  if (!regionNames.has(t.lang)) {
    try {
      regionNames.set(t.lang, new Intl.DisplayNames([t.lang], { type: 'region' }))
    } catch {
      regionNames.set(t.lang, null)
    }
  }
  try {
    return regionNames.get(t.lang)?.of(code) ?? code
  } catch {
    return code
  }
}

const number = (value: number, t: OfficeWords) => value.toLocaleString(t.lang === 'th' ? 'th-TH' : 'en-US')
const percent = (rate: null | number) => (rate === null ? '–' : `${(rate * 100).toFixed(1)}%`)

// Bars with no script: each day is a pair of rectangles, page views behind and visitors in front, with its numbers as a tooltip.
function chart(report: Report, t: OfficeWords) {
  const most = Math.max(1, ...report.daily.map((day) => day.views))
  const bars = report.daily
    .map((day, index) => {
      const views = (day.views / most) * 96
      const visitors = (day.visitors / most) * 96
      return `<g><title>${escapeHtml(t.stats.dayTitle(day.day, day.views, day.visitors))}</title><rect fill="currentColor" fill-opacity="0.25" height="${views.toFixed(2)}" width="8" x="${index * 10 + 1}" y="${(100 - views).toFixed(2)}"></rect><rect fill="currentColor" height="${visitors.toFixed(2)}" width="4" x="${index * 10 + 3}" y="${(100 - visitors).toFixed(2)}"></rect></g>`
    })
    .join('')
  return `<figure class="stats-chart" style="margin:1rem 0"><svg aria-label="${escapeHtml(t.stats.chartLabel(report.from, report.to))}" height="160" preserveAspectRatio="none" role="img" style="display:block;width:100%" viewBox="0 0 ${report.daily.length * 10} 100">${bars}</svg>
<figcaption style="display:flex;justify-content:space-between;gap:1rem;font-size:.85em"><span>${escapeHtml(report.from)}</span><span><span aria-hidden="true" style="opacity:.35">■</span> ${t.stats.views} · <span aria-hidden="true">■</span> ${t.stats.visitors}</span><span>${escapeHtml(report.to)}</span></figcaption></figure>`
}

// A short list with a bar for each row, sized against the largest.
function ranked(rows: Ranked[], by: 'views' | 'visitors', heading: string, column: string, t: OfficeWords, name: (value: string) => string = (value) => value) {
  if (!rows.length) return `<h2>${heading}</h2><p>${t.noneYet}</p>`
  const most = Math.max(1, ...rows.map((row) => row[by]))
  const body = rows
    .map((row) => `<tr><td style="overflow-wrap:anywhere">${escapeHtml(name(row.name))}<span aria-hidden="true" style="display:block;height:4px;background:currentColor;opacity:.3;width:${Math.round((row[by] / most) * 100)}%"></span></td><td style="text-align:right">${number(row[by], t)}</td></tr>`)
    .join('')
  return `<h2>${heading}</h2><table class="stats-table" style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">${column}</th><th style="text-align:right">${by === 'views' ? t.stats.views : t.stats.visitors}</th></tr></thead><tbody>${body}</tbody></table>`
}

/** The Statistics page: the owner's, and staff given the stats area. */
export async function statsPage(env: Env, url: URL, site: SiteRow, desk: Desk) {
  const t = officeText(site)
  const days = url.searchParams.get('days') === '30' ? 30 : 7
  const report = await readStats(env, site, days)
  const base = escapeHtml(desk.base)
  const tile = (label: string, value: string, help = '') => `<div class="card" style="padding:.75rem 1rem"><p style="margin:0;font-size:.85em">${label}</p><p style="margin:.25rem 0 0;font-size:1.6em;font-weight:700" data-stat="${escapeHtml(label)}">${value}</p>${help ? `<p style="margin:.25rem 0 0;font-size:.8em">${help}</p>` : ''}</div>`
  const switcher = [7, 30].map((span) => (span === days ? `<strong aria-current="page">${t.stats.lastDays(span)}</strong>` : `<a href="${base}/stats?days=${span}">${t.stats.lastDays(span)}</a>`)).join(' · ')
  const conversions = (['order', 'entry', 'record'] as const).map((kind) => `<tr><td>${t.stats.conversion[kind]}</td><td style="text-align:right">${number(report.conversions[kind], t)}</td></tr>`).join('')
  const daily = report.daily.map((day) => `<tr><td>${escapeHtml(day.day)}</td><td style="text-align:right">${number(day.visitors, t)}</td><td style="text-align:right">${number(day.views, t)}</td><td style="text-align:right">${number(day.conversions, t)}</td></tr>`).join('')
  const off = report.counting ? '' : `<p role="status">${desk.staff ? t.stats.offStaff : t.stats.off(`${base}/settings`)}</p>`
  return office(
    site,
    desk,
    t.nav.stats,
    `${off}<p>${t.stats.intro}</p>
<p>${switcher}</p>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:.75rem">${tile(t.stats.visitors, number(report.visitors, t))}${tile(t.stats.views, number(report.views, t))}${tile(t.stats.conversions, number(report.conversions.total, t))}${tile(t.stats.conversionRate, percent(report.conversionRate), t.stats.rateHelp)}</div>
${chart(report, t)}
<details><summary>${t.stats.dailyNumbers}</summary><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">${t.stats.day}</th><th style="text-align:right">${t.stats.visitors}</th><th style="text-align:right">${t.stats.views}</th><th style="text-align:right">${t.stats.conversions}</th></tr></thead><tbody>${daily}</tbody></table></details>
${ranked(report.pages, 'views', t.stats.pages, t.stats.page, t)}
${ranked(report.referrers, 'views', t.stats.referrers, t.stats.site, t)}<p><small>${t.stats.direct(report.direct)}</small></p>
${ranked(report.countries, 'visitors', t.stats.countries, t.stats.country, t, (code) => countryName(code, t))}
${ranked(report.devices, 'visitors', t.stats.devices, t.stats.devices, t, (device) => t.stats.device[device] ?? device)}
<h2>${t.stats.conversionsHeading}</h2><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">${t.stats.kind}</th><th style="text-align:right">${t.stats.count}</th></tr></thead><tbody>${conversions}</tbody></table>`,
  )
}
