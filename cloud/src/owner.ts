import { sha256 } from './auth'
import { escapeHtml } from './http'
import type { Block, Env, FormField, Settings, SiteRow } from './types'

export const hashCode = sha256

const newCode = () => {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  const code = [...crypto.getRandomValues(new Uint8Array(32))].map((byte) => alphabet[byte % alphabet.length]).join('')
  return code.match(/.{1,8}/g)!.join('-')
}

export const getSite = (env: Env) => env.DB.prepare('SELECT sites.id, sites.slug, sites.settings, sites.live_version, versions.settings AS live_settings FROM sites LEFT JOIN versions ON versions.id = sites.live_version LIMIT 1').first<SiteRow>()

export const isOwner = async (env: Env, code: string | undefined) => {
  if (!code || !/^[a-z0-9-]{20,60}$/.test(code)) return false
  const site = await env.DB.prepare('SELECT id FROM sites WHERE edit_hash = ?').bind(await hashCode(code)).first()
  return Boolean(site)
}

/** The first person to finish setup becomes the owner. Later attempts change nothing. */
export async function claimSite(env: Env) {
  const code = newCode()
  const settings: Settings = { language: 'en', name: 'My website', style: 'studio' }
  const result = await env.DB.prepare('INSERT INTO sites (id, slug, edit_hash, settings) VALUES (1, ?, ?, ?) ON CONFLICT DO NOTHING')
    .bind('site', await hashCode(code), JSON.stringify(settings))
    .run()
  return result.meta.changes ? code : null
}

export const shell = (title: string, body: string, wide = false) => `<!doctype html>
<html lang="en">
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
</body>
</html>`

export const setupPage = () =>
  shell(
    'Set up your website',
    `<h1>Your website is installed.</h1>
<p class="lead">One step left. Get your private link to connect Claude.</p>
<p role="alert">The next page shows your private links only once. Be ready to copy them.</p>
<form action="/setup" method="post"><button class="button" type="submit">Get my Claude link</button></form>`,
  )

export const claimedPage = (origin: string, code: string) =>
  shell(
    'Your Claude link',
    `<h1>You're the owner.</h1>
<p role="alert">Save these two links now. They are shown only once, and anyone who has them can change your site.</p>
<h2>1. Connect Claude</h2>
<p>In Claude's connector settings, add a custom connector, paste this link and choose no sign-in:</p>
<p><code style="overflow-wrap:anywhere">${escapeHtml(`${origin}/mcp/${code}`)}</code></p>
<h2>2. Say what you want</h2>
<p>Start a new chat with the connector on and try: "Build a website for my coffee shop."</p>
<h2>3. Your back office</h2>
<p>Edit your site and see orders, messages and customers here at any time:</p>
<p><a href="/owner/${escapeHtml(code)}" style="overflow-wrap:anywhere">${escapeHtml(`${origin}/owner/${code}`)}</a></p>`,
  )

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
