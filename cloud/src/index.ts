import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'

import { handleAccount } from './account'
import { handleAdmin } from './admin'
import { handleApi } from './api'
import { getCustomer } from './auth'
import { runAutomations, runSchedules } from './automations'
import { adminDesk, allows, handleOffice, ownerDesk, staffEntry } from './cms'
import type { Desk } from './cms'
import { loadPageRecords, receiveRecord } from './data'
import { tellOwnerAboutEntry } from './email'
import { validateEntry } from './forms'
import { guidedStart, noteClaude, notePhone } from './first-steps'
import { escapeHtml, html, notFound, privateHeaders, see } from './http'
import { loadItems, showImage } from './items'
import { alternates, extraLanguages, keepLanguage, languageName, localizePage, localizeSite, mainLanguage, siteLanguages } from './languages'
import { createMcpServer } from './mcp'
import { addSubscriber, handleNewsLink, runNews } from './news'
import { followRedirect } from './moving'
import { browserWords, officeText } from './office-words'
import { claimSite, getSite, isOwner, setupPage, shell } from './owner'
import { renderPage } from './render'
import { cartCount, handleShop, releaseExpiredCardOrders } from './shop'
import { cleanStats, countConversion, countVisit } from './stats'
import { stripeWebhook } from './stripe'
import type { Block, Env, FormField, Settings, SiteRow } from './types'
import { findLivePage, findWorkingPage, liveSite, liveSlugs } from './versions'
import { runWebhookOutbox } from './webhooks'

const maxEntriesPerHour = 200
const maxBodyBytes = 32 * 1024

// Custom code gets an empty origin, so its scripts run but cannot reach the site or its database.
const frameHeaders = {
  'Content-Security-Policy': "sandbox allow-scripts allow-forms; default-src https: data: 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'self'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex',
}

/** The extra language this copy of the site is for, or null for the main language. */
const viewingIn = (site: SiteRow) => (JSON.parse(site.settings) as Settings).viewLanguage ?? null

const customerFor = (request: Request, env: Env, site: SiteRow) => ((JSON.parse(site.settings) as Settings).accounts ? getCustomer(request, env, site.id) : Promise.resolve(null))

const buildingPage = () =>
  shell(
    'Coming soon',
    `<h1>This website is being built.</h1>
<p>Are you the owner? Open your back office link and pick a starter for a working site in one click. Or open Claude, start a new chat with your connector on, and say what you want. For example: "Build a website for my coffee shop."</p>
<p lang="th">เว็บนี้กำลังสร้างอยู่ ถ้าคุณเป็นเจ้าของ ให้เปิดลิงก์หลังบ้านแล้วเลือกเว็บตั้งต้น ได้เว็บที่ใช้งานได้ในคลิกเดียว หรือเปิด Claude เริ่มแชตใหม่โดยเปิด connector ไว้ แล้วบอกว่าอยากได้เว็บแบบไหน</p>`,
  )

async function showPage(request: Request, env: Env, url: URL, site: SiteRow, slug: string) {
  const found = await findLivePage(env, site, slug)
  if (!found) {
    if (slug !== 'home') return notFound()
    return html(buildingPage())
  }
  const language = viewingIn(site)
  const page = localizePage({ ...found, blocks: JSON.parse(found.blocks) as Block[] }, language)
  const blocks = page.blocks
  const [items, customer] = await Promise.all([loadItems(env, site.id, blocks, language), customerFor(request, env, site)])
  const records = await loadPageRecords(env, site.id, blocks, { admin: false, customer: customer ?? null })
  return html(
    renderPage(
      site,
      { ...page, blocks },
      {
        canonical: `${url.origin}${url.pathname}`,
        cartCount: cartCount(request),
        customer,
        error: url.searchParams.get('error') ?? undefined,
        items,
        query: url.searchParams,
        records,
        sent: url.searchParams.get('sent') ?? undefined,
      },
    ),
  )
}

/** Shows the owner, or staff who edit pages, the unpublished copy of a page, with its menu links staying inside the preview. In an extra language, it marks what isn't translated yet. */
async function showPreview(env: Env, url: URL, working: SiteRow, desk: Desk, parts: string[]) {
  const settings = JSON.parse(working.settings) as Settings
  const language = extraLanguages(settings).includes(parts[0]) ? parts[0] : null
  const slug = (language ? parts[1] : parts[0]) ?? 'home'
  const site = localizeSite(working, language)
  const found = await findWorkingPage(env, site, slug)
  const t = officeText(working)
  if (!found) return html(shell(t.previewTitle, `<h1>${t.previewMissing}</h1><p><a href="${escapeHtml(desk.base)}/pages">${t.seeYourPages}</a></p>`, false, t.lang), 404, privateHeaders)
  const page = localizePage({ ...found, blocks: JSON.parse(found.blocks) as Block[] }, language)
  const blocks = page.blocks
  const [items, records, { results }] = await Promise.all([
    loadItems(env, site.id, blocks, language),
    loadPageRecords(env, site.id, blocks, { admin: false, customer: null }),
    env.DB.prepare('SELECT slug FROM pages WHERE site_id = ?').bind(site.id).all<{ slug: string }>(),
  ])
  const base = `${desk.base}/preview${language ? `/${language}` : ''}`
  const slugs = new Set(results.map((row) => row.slug))
  const untranslatedItems = language ? [...items.values()].flat().filter((item) => item.untranslated).map((item) => item.title) : []
  const rendered = renderPage(site, page, { canonical: `${url.origin}/`, customer: null, items, query: url.searchParams, records, untranslated: language ? { blocks: page.untranslated, label: t.notTranslated } : undefined })
  const missing = language && (page.missing.length || untranslatedItems.length) ? `<br>${escapeHtml(t.previewUntranslated(languageName(language, t.lang), languageName(mainLanguage(settings), t.lang), page.missing.length, untranslatedItems))}` : ''
  // Only the owner sees these marks. Visitors get the main language's words in those places, without a mark.
  const marks = missing ? '<style>[data-untranslated]{outline:3px dashed #d97706;outline-offset:-3px}[data-untranslated]::before{content:attr(data-untranslated);display:block;background:#d97706;color:#16201b;font:600 14px/1.4 system-ui,sans-serif;padding:4px 12px}</style>' : ''
  const banner = `<p class="preview-banner" role="status">${t.previewBanner(`${escapeHtml(desk.base)}/publish`)}${missing}</p>${marks}`
  const body = rendered
    .replace(/href="\/([a-z0-9-]*)((?:[?#][^"]*)?)"/g, (match, target: string, rest: string) => (!target || slugs.has(target) ? `href="${base}${target ? `/${target}` : ''}${rest}"` : match))
    // A frame could read its own address, and this address holds the owner's secret.
    .replace(/<iframe class="custom-html"[^>]*><\/iframe>/g, `<p role="status">${t.customCodeLater}</p>`)
    .replace(/(<body[^>]*>)/, `$1${banner}`)
  return html(body, 200, privateHeaders)
}

async function showFrame(env: Env, site: SiteRow, slug: string, index: string) {
  const page = await findLivePage(env, site, slug)
  const block = page && (JSON.parse(page.blocks) as Block[])[Number(index)]
  return block?.type === 'html' ? html(block.code, 200, frameHeaders) : notFound()
}

async function receiveForm(request: Request, env: Env, url: URL, site: SiteRow, pageSlug: string, formName: string) {
  const found = await findLivePage(env, site, pageSlug)
  const language = viewingIn(site)
  // In another language the choices and messages are in its words, so the answers are checked against those.
  const blocks = found ? localizePage({ ...found, blocks: JSON.parse(found.blocks) as Block[] }, language).blocks : []
  const block = blocks.find((item) => item.type === 'form' && item.name === formName)
  if (!block) return notFound()

  const path = `/${pageSlug === 'home' ? '' : pageSlug}`
  const back = (state: 'error' | 'sent') => see(url, `${path}?${state}=${formName}#form-${formName}`)

  const customer = await customerFor(request, env, site)
  if (block.membersOnly && !customer) return see(url, `/login?next=${encodeURIComponent(path)}`)

  if (Number(request.headers.get('content-length') || 0) > maxBodyBytes) return back('error')
  const form = await request.formData().catch((): null => null)
  if (!form) return back('error')
  // Bots fill in the hidden field. Tell them it worked and keep nothing.
  if (form.get('website')) return back('sent')

  const since = new Date(Date.now() - 3_600_000).toISOString()
  const recent = await env.DB.prepare('SELECT COUNT(*) AS total FROM entries WHERE site_id = ? AND created_at > ?')
    .bind(site.id, since)
    .first<{ total: number }>()
  if ((recent?.total ?? 0) >= maxEntriesPerHour) return back('error')

  await loadItems(env, site.id, blocks, language)
  const data = validateEntry(block.fields as FormField[], form)
  if (!data) return back('error')
  const entry = await env.DB.prepare('INSERT INTO entries (site_id, form, page, data, customer_id) VALUES (?, ?, ?, ?, ?) RETURNING id, created_at')
    .bind(site.id, formName, pageSlug, JSON.stringify(data), customer?.id ?? null)
    .first<{ created_at: string; id: number }>()
  await countConversion(env, site, 'entry')
  await runAutomations(env, site.id, 'entry.created', { form: formName, page: pageSlug, id: entry?.id, created_at: entry?.created_at, customer_id: customer?.id ?? null, data })
  // A newsletter form adds the person who sent it, or who ticked its box. Never anyone else: they still confirm by email.
  if (block.newsletter === 'signup' || (block.newsletter === 'checkbox' && form.get('_newsletter') === 'on')) {
    const fields = block.fields as FormField[]
    const email = fields.filter((field) => field.type === 'email').map((field) => data[field.name]).find((value) => typeof value === 'string' && value)
    const name = fields.filter((field) => field.type === 'text').map((field) => data[field.name]).find((value) => typeof value === 'string' && value)
    if (typeof email === 'string') await addSubscriber(env, site, url.origin, { email, name: typeof name === 'string' ? name : (customer?.name ?? ''), source: 'form', detail: `${pageSlug}/${formName}`, customerId: customer?.id ?? null })
  }
  await tellOwnerAboutEntry(env, { fields: block.fields as FormField[], heading: block.heading, name: formName }, data)
  return back('sent')
}

async function handleMcp(request: Request, env: Env, url: URL, code: string) {
  if (request.method !== 'POST') {
    if ((request.headers.get('accept') ?? '').includes('text/html')) {
      return html(
        shell(
          'Your private Claude link',
          `<h1>This link is for Claude, not for a browser.</h1>
<p>Nothing is wrong. Add it as a custom connector in Claude's settings and choose no sign-in. Keep it private, because anyone who has it can change your site.</p>
<p lang="th">ลิงก์นี้ใช้กับ Claude ไม่ได้ใช้เปิดในเบราว์เซอร์ ให้เพิ่มเป็น custom connector ในการตั้งค่าของ Claude และเก็บเป็นความลับ</p>`,
        ),
        405,
        { ...privateHeaders, Allow: 'POST' },
      )
    }
    return Response.json({ error: 'Use POST.' }, { headers: { Allow: 'POST' }, status: 405 })
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  })
  await createMcpServer(env, url.origin, code).connect(transport)
  return transport.handleRequest(request)
}

async function sitemap(env: Env, url: URL, site: SiteRow) {
  const slugs = await liveSlugs(env, site)
  const { results: products } = await env.DB.prepare('SELECT id FROM items WHERE site_id = ? AND published = 1 LIMIT 500').bind(site.id).all<{ id: number }>()
  const paths = [...slugs.map((slug) => `/${slug === 'home' ? '' : slug}`), ...products.map(({ id }) => `/product/${id}`)]
  const settings = JSON.parse(site.settings) as Settings
  const several = siteLanguages(settings).length > 0
  // With more than one language, every page is listed in each, and each entry names all of them.
  const urls = several
    ? paths
        .flatMap((path) => {
          const all = alternates(settings, url.origin, path)
          const links = all.map((one) => `<xhtml:link rel="alternate" hreflang="${one.code}" href="${escapeHtml(one.href)}"/>`).join('')
          return all.map((one) => `<url><loc>${escapeHtml(one.href)}</loc>${links}</url>`)
        })
        .join('')
    : paths.map((path) => `<url><loc>${url.origin}${path}</loc></url>`).join('')
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${several ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : ''}>${urls}</urlset>`, {
    headers: { 'Content-Type': 'application/xml' },
  })
}

async function answer(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const parts = url.pathname.split('/').filter(Boolean)
  try {
    const working = await getSite(env)

    if (!working) {
      if (url.pathname === '/setup' && request.method === 'POST') {
        const words = browserWords(request)
        const code = await claimSite(env, words.lang)
        return code ? guidedStart(url.origin, code, words) : see(url, '/')
      }
      return url.pathname === '/' ? html(setupPage(browserWords(request)), 200, privateHeaders) : notFound()
    }

    // Visitors get the published copy. Only the owner's routes below see the working copy.
    const site = liveSite(working)
    if (url.pathname === '/setup') return see(url, '/')
    if (url.pathname === '/robots.txt') {
      return new Response(`User-agent: *\nDisallow: /admin\nDisallow: /owner/\nDisallow: /staff\nDisallow: /mcp/\nDisallow: /api/\nDisallow: /data/\nDisallow: /frame/\nDisallow: /account\nDisallow: /cart\nDisallow: /checkout\nDisallow: /order/\nDisallow: /login\nDisallow: /signup\nDisallow: /reset/\nDisallow: /newsletter/\nSitemap: ${url.origin}/sitemap.xml\n`, { headers: { 'Content-Type': 'text/plain' } })
    }
    if (url.pathname === '/sitemap.xml') return await sitemap(env, url, site)

    if (parts[0] === 'mcp' || parts[0] === 'owner') {
      // A wrong code looks the same as a page that doesn't exist.
      if (!(await isOwner(env, parts[1]))) return notFound()
      if (parts[0] === 'mcp') {
        if (parts.length !== 2) return notFound()
        // Ticks "Connect Claude" on the owner's checklist.
        if (request.method === 'POST') await noteClaude(env)
        return await handleMcp(request, env, url, parts[1])
      }
      // Ticks "Check on your phone" on the owner's checklist.
      await notePhone(request, env)
      const desk = ownerDesk(parts[1])
      if (parts[2] === 'preview' && parts.length <= 5 && request.method === 'GET') return await showPreview(env, url, working, desk, parts.slice(3))
      return await handleOffice(request, env, url, working, desk, parts.slice(2))
    }

    if (parts[0] === 'admin') {
      const customer = await getCustomer(request, env, working.id)
      if (parts[1] === 'preview' && customer?.id === working.owner_customer_id && parts.length <= 5 && request.method === 'GET') return await showPreview(env, url, working, adminDesk(), parts.slice(2))
      return await handleAdmin(request, env, url, working, parts.slice(1))
    }

    // Staff log in on the website and see only the parts of the back office the owner gave them.
    if (parts[0] === 'staff') {
      const desk = await staffEntry(request, env, url, working)
      if (desk instanceof Response) return desk
      if (parts[1] === 'preview' && parts.length <= 4 && request.method === 'GET' && allows(desk, 'pages')) return await showPreview(env, url, working, desk, parts.slice(2))
      return await handleOffice(request, env, url, working, desk, parts.slice(1))
    }

    if (parts[0] === 'api') return await handleApi(request, env, url, site, parts)
    if (url.pathname === '/stripe/webhook' && request.method === 'POST') return await stripeWebhook(request, env, site)

    // An extra language, such as /en/about, is the same site in its words, with every link and redirect kept in it.
    if (extraLanguages(JSON.parse(site.settings) as Settings).includes(parts[0])) {
      const inner = new URL(url)
      inner.pathname = `/${parts.slice(1).join('/')}`
      const response = await visit(request, env, inner, localizeSite(site, parts[0]), parts.slice(1))
      return await keepLanguage(response, `/${parts[0]}`, url.origin)
    }
    return await visit(request, env, url, localizeSite(site, null), parts)
  } catch (error) {
    console.error(error)
    return html('<!doctype html><meta charset="utf-8"><title>Error</title><h1>Something went wrong</h1><p>Please try again.</p>', 500)
  }
}

/** What visitors can open, in whichever language the site row was made for. */
async function visit(request: Request, env: Env, url: URL, site: SiteRow, parts: string[]) {
  if (parts[0] === 'data' && request.method === 'POST' && (parts.length === 2 || (parts.length === 4 && parts[3] === 'delete' && /^\d{1,12}$/.test(parts[2])))) {
    const customer = await customerFor(request, env, site)
    return await receiveRecord(request, env, url, site, { admin: false, customer: customer ?? null }, parts[1], parts[2] ? Number(parts[2]) : undefined)
  }

  // Confirm and unsubscribe links. Four parts long, so statistics never count them as page views.
  if (parts[0] === 'newsletter' && parts.length === 4 && (request.method === 'GET' || request.method === 'POST')) return await handleNewsLink(request, env, url, site, parts)
  if (['account', 'login', 'logout', 'reset', 'signup'].includes(parts[0])) return await handleAccount(request, env, url, site, parts)
  if (['cart', 'checkout', 'order', 'product'].includes(parts[0])) return await handleShop(request, env, url, site, parts)

  if (parts[0] === 'form' && request.method === 'POST' && parts.length === 3) {
    return await receiveForm(request, env, url, site, parts[1], parts[2])
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
  if (parts[0] === 'media' && parts.length === 2 && /^\d+(\.(gif|jpe?g|png|webp))?$/.test(parts[1])) return (await showImage(env, site.id, parts[1].split('.')[0])) ?? notFound()
  if (parts[0] === 'frame' && parts.length === 3 && /^\d+$/.test(parts[2])) return await showFrame(env, site, parts[1], parts[2])
  if (parts.length > 1) return notFound()
  return await showPage(request, env, url, site, parts[0] ?? 'home')
}

export default {
  async fetch(request: Request, plainEnv: Env, context: ExecutionContext): Promise<Response> {
    const env: Env = { ...plainEnv, defer: (work) => context.waitUntil(work) }
    const response = await answerOrRedirect(request, env)
    // Counts a public page view after it is sent, with no cookies and nothing kept about the visitor. See stats.ts.
    countVisit(env, request, new URL(request.url).pathname, response.status)
    return response
  },

  /** Cloudflare calls this about every 15 minutes, as wrangler.jsonc says, to run scheduled automations that are due. */
  async scheduled(controller: ScheduledController, plainEnv: Env, context: ExecutionContext): Promise<void> {
    const env: Env = { ...plainEnv, defer: (work) => context.waitUntil(work) }
    const now = testClock(env, controller.cron) ?? Date.now()
    // A visitor who leaves Stripe checkout cannot hold the shop's last item forever.
    await releaseExpiredCardOrders(env, now)
    await runSchedules(env, now)
    // News emails go out in batches, inside the owner's daily limit.
    await runNews(env, now)
    // Delivery retries are separate from the visitor request, and survive a transient endpoint failure.
    await runWebhookOutbox(env, now)
    // Once a day: forgets yesterday's visitor hashes and deletes statistics older than 400 days.
    await cleanStats(env, now).catch((error) => console.error('Statistics could not be cleaned up', error))
  },
} satisfies ExportedHandler<Env>

async function answerOrRedirect(request: Request, env: Env) {
  const response = await answer(request, env)
  if (response.status !== 404 || (request.method !== 'GET' && request.method !== 'HEAD')) return response
  const url = new URL(request.url)
  if (/^\/(owner|mcp|api)(\/|$)/.test(url.pathname)) return response
  return (await followRedirect(env, url).catch((): null => null)) ?? response
}

/**
 * Tests start a run through `wrangler dev --test-scheduled` at /__scheduled?cron=..., which passes on nothing but the cron text.
 * So a test can add " now=2026-05-01T02:05:00Z" to it to pretend it is that moment. Only with the test-only switch on:
 * a live site always uses the real time, and Cloudflare alone starts its scheduled runs.
 */
function testClock(env: Env, cron: string) {
  if (env.WEBHOOK_ALLOW_HTTP !== '1') return null
  const given = /(?:^|\s)now=(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z)(?:\s|$)/.exec(cron)?.[1]
  const time = given ? Date.parse(given) : NaN
  return Number.isFinite(time) ? time : null
}
