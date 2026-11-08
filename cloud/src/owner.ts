import { sha256 } from './auth'
import { escapeHtml } from './http'
import { officeWords } from './office-words'
import type { OfficeLanguage, OfficeWords } from './office-words'
import type { Block, Env, FormField, Settings, SiteRow } from './types'

export const hashCode = sha256

export const newCode = () => {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  const code = [...crypto.getRandomValues(new Uint8Array(32))].map((byte) => alphabet[byte % alphabet.length]).join('')
  return code.match(/.{1,8}/g)!.join('-')
}

export const getSite = (env: Env) => env.DB.prepare('SELECT sites.id, sites.slug, sites.settings, sites.live_version, sites.owner_customer_id, versions.settings AS live_settings FROM sites LEFT JOIN versions ON versions.id = sites.live_version LIMIT 1').first<SiteRow>()

export const isOwner = async (env: Env, code: string | undefined) => {
  if (!code || !/^[a-z0-9-]{20,60}$/.test(code)) return false
  const site = await env.DB.prepare('SELECT id FROM sites WHERE edit_hash = ?').bind(await hashCode(code)).first()
  return Boolean(site)
}

/** The names a new site starts with. A starter may replace these, but never a name the owner chose. */
export const defaultSiteNames = ['My website', 'เว็บไซต์ของฉัน']

/** The first person to finish setup becomes the owner. Later attempts change nothing. Their browser's language becomes the site's, so the back office speaks it from the start. */
export async function claimSite(env: Env, language: OfficeLanguage = 'en') {
  const code = newCode()
  const settings: Settings = { language, name: defaultSiteNames[language === 'th' ? 1 : 0], style: 'studio' }
  const result = await env.DB.prepare('INSERT INTO sites (id, slug, edit_hash, settings) VALUES (1, ?, ?, ?) ON CONFLICT DO NOTHING')
    .bind('site', await hashCode(code), JSON.stringify(settings))
    .run()
  return result.meta.changes ? code : null
}

export const shell = (title: string, body: string, wide = false, lang = 'en', end = '') => `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/fonts/fonts.css">
<link rel="stylesheet" href="/site.css">
</head>
<body data-style="calm" style="--accent:#1f4d3a;--accent-dark:#fbfaf6;--accent-text:#1f4d3a;--accent-text-dark:#fbfaf6;--base-bg:#fbfaf6;--base-ink:#16201b;--on-accent:#ffffff;--on-accent-dark:#111111">
<main><section class="block tone-plain"><div class="wrap account ${wide ? 'cms' : 'account--wide'}">${body}</div></section></main>
${end}</body>
</html>`

export const setupPage = (t: OfficeWords = officeWords()) => {
  const copy = t.lang === 'th'
    ? { eyebrow: 'WEB-END', title: 'อยากสร้างอะไร?', intro: 'บอก Claude ด้วยภาษาปกติ แล้วได้ทั้งหน้าเว็บ ระบบลูกค้า ข้อมูล และหลังบ้านในพื้นที่ของคุณเอง', action: 'เริ่มสร้างฟรี', note: 'คุณเป็นเจ้าของโค้ด ฐานข้อมูล และ Cloudflare ของตัวเอง' }
    : { eyebrow: 'WEB-END', title: 'What do you want to build?', intro: 'Tell Claude in ordinary words. Build the website, data, customer system and back office in your own space.', action: 'Start building free', note: 'You own the code, database and Cloudflare account.' }
  return shell(
    t.setupTitle,
    `<section class="launch launch--first"><p class="launch__eyebrow">${copy.eyebrow}</p><h1>${copy.title}</h1><p class="lead">${copy.intro}</p><form action="/setup" method="post"><button class="button launch__primary" type="submit">${copy.action}</button></form><p class="launch__note">${copy.note}</p></section>`,
    false,
    t.lang,
  )
}

/** Maps each form to its fields, so saved entries can be shown with their labels. */
export function entryFields(pages: { blocks: string; slug: string }[]) {
  const labels = new Map<string, FormField[]>()
  for (const page of pages) {
    for (const block of JSON.parse(page.blocks) as Block[]) {
      if (block.type === 'form') labels.set(`${page.slug}/${block.name}`, block.fields)
    }
  }
  return labels
}
