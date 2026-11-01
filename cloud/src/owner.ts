import type { Block, Env, FormField, Settings, SiteRow } from './types'

const statuses = ['new', 'confirmed', 'done']

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

export const hashCode = async (code: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const newCode = () => {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  const code = [...crypto.getRandomValues(new Uint8Array(32))].map((byte) => alphabet[byte % alphabet.length]).join('')
  return code.match(/.{1,8}/g)!.join('-')
}

export const getSite = (env: Env) => env.DB.prepare('SELECT id, slug, settings FROM sites LIMIT 1').first<SiteRow>()

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

const shell = (title: string, body: string) => `<!doctype html>
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
<main><section class="block tone-plain"><div class="wrap account account--wide">${body}</div></section></main>
</body>
</html>`

export const setupPage = () =>
  shell(
    'Set up your website',
    `<h1>Your website is installed.</h1>
<p class="lead">One step left. Get your private link to connect Claude.</p>
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
<p>See messages and bookings here at any time:</p>
<p><a href="/owner/${escapeHtml(code)}" style="overflow-wrap:anywhere">${escapeHtml(`${origin}/owner/${code}`)}</a></p>`,
  )

export async function ownerPage(env: Env, origin: string, code: string, site: SiteRow) {
  const [{ results: pages }, { results: entries }] = await Promise.all([
    env.DB.prepare('SELECT slug, title, published, blocks FROM pages WHERE site_id = ? ORDER BY slug').bind(site.id).all<{ blocks: string; published: number; slug: string; title: string }>(),
    env.DB.prepare('SELECT id, form, page, data, status, created_at FROM entries WHERE site_id = ? ORDER BY id DESC LIMIT 200').bind(site.id).all<{ created_at: string; data: string; form: string; id: number; page: string; status: string }>(),
  ])
  const labels = new Map<string, FormField[]>()
  for (const page of pages) {
    for (const block of JSON.parse(page.blocks) as Block[]) {
      if (block.type === 'form') labels.set(`${page.slug}/${block.name}`, block.fields)
    }
  }
  const settings = JSON.parse(site.settings) as Settings

  const pageRows = pages.length
    ? pages.map((page) => `<li><a href="/${page.slug === 'home' ? '' : escapeHtml(page.slug)}">${escapeHtml(page.title)}</a>${page.published ? '' : ' (hidden)'}</li>`).join('')
    : '<li>No pages yet. Ask Claude to build your site.</li>'

  const entryRows = entries.length
    ? entries
        .map((entry) => {
          const data = JSON.parse(entry.data) as Record<string, unknown>
          const fields = labels.get(`${entry.page}/${entry.form}`) ?? Object.keys(data).map((name) => ({ label: name, name }) as FormField)
          const rows = fields
            .filter((field) => data[field.name] !== undefined)
            .map((field) => `<div><dt>${escapeHtml(field.label)}</dt><dd class="pre-line">${escapeHtml(data[field.name] === true ? 'Yes' : data[field.name] === false ? 'No' : data[field.name])}</dd></div>`)
            .join('')
          const buttons = [...statuses.filter((status) => status !== entry.status), 'delete']
            .map((status) => `<button class="button button--small" name="status" type="submit" value="${status}">${status}</button> `)
            .join('')
          return `<article class="card account__record"><h3>${escapeHtml(entry.form)} · ${escapeHtml(entry.status)}</h3><p class="post-date">${escapeHtml(entry.created_at.slice(0, 16).replace('T', ' '))} UTC</p><dl>${rows}</dl><form action="/owner/${escapeHtml(code)}/entry/${entry.id}" method="post">${buttons}</form></article>`
        })
        .join('')
    : '<p>Nothing yet. Messages and bookings from your forms will appear here.</p>'

  return shell(
    `${settings.name}: back office`,
    `<h1>${escapeHtml(settings.name)}</h1>
<p><a href="/">Open your website</a></p>
<h2>Pages</h2><ul>${pageRows}</ul>
<h2>Messages and bookings</h2>${entryRows}
<h2>Connect Claude</h2>
<p>Add this link as a custom connector in Claude, with no sign-in. Keep it private.</p>
<p><code style="overflow-wrap:anywhere">${escapeHtml(`${origin}/mcp/${code}`)}</code></p>`,
  )
}
