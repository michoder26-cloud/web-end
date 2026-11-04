import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'

import { handleAccount } from './account'
import { handleApi } from './api'
import { getCustomer } from './auth'
import { allows, handleOffice, ownerDesk, staffEntry } from './cms'
import type { Desk } from './cms'
import { loadPageRecords, receiveRecord } from './data'
import { tellOwnerAboutEntry } from './email'
import { validateEntry } from './forms'
import { escapeHtml, html, notFound, privateHeaders, see } from './http'
import { loadItems, showImage } from './items'
import { createMcpServer } from './mcp'
import { followRedirect } from './moving'
import { browserWords, officeText } from './office-words'
import { claimedPage, claimSite, getSite, isOwner, setupPage, shell } from './owner'
import { renderPage } from './render'
import { cartCount, handleShop } from './shop'
import { stripeWebhook } from './stripe'
import type { Block, Env, FormField, Settings, SiteRow } from './types'
import { findLivePage, findWorkingPage, liveSite, liveSlugs } from './versions'

const maxEntriesPerHour = 200
const maxBodyBytes = 32 * 1024

// Custom code gets an empty origin, so its scripts run but cannot reach the site or its database.
const frameHeaders = {
  'Content-Security-Policy': "sandbox allow-scripts allow-forms; default-src https: data: 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'self'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex',
}

const customerFor = (request: Request, env: Env, site: SiteRow) => ((JSON.parse(site.settings) as Settings).accounts ? getCustomer(request, env, site.id) : Promise.resolve(null))

const buildingPage = () =>
  shell(
    'Coming soon',
    `<h1>This website is being built.</h1>
<p>Are you the owner? Open Claude, start a new chat with your connector on, and say what you want. For example: "Build a website for my coffee shop."</p>
<p lang="th">เว็บนี้กำลังสร้างอยู่ ถ้าคุณเป็นเจ้าของ ให้เปิด Claude เริ่มแชตใหม่โดยเปิด connector ไว้ แล้วบอกว่าอยากได้เว็บแบบไหน</p>`,
  )

async function showPage(request: Request, env: Env, url: URL, site: SiteRow, slug: string) {
  const page = await findLivePage(env, site, slug)
  if (!page) {
    if (slug !== 'home') return notFound()
    return html(buildingPage())
  }
  const blocks = JSON.parse(page.blocks) as Block[]
  const [items, customer] = await Promise.all([loadItems(env, site.id, blocks), customerFor(request, env, site)])
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

/** Shows the owner, or staff who edit pages, the unpublished copy of a page, with its menu links staying inside the preview. */
async function showPreview(env: Env, url: URL, site: SiteRow, desk: Desk, slug: string) {
  const page = await findWorkingPage(env, site, slug)
  const t = officeText(site)
  if (!page) return html(shell(t.previewTitle, `<h1>${t.previewMissing}</h1><p><a href="${escapeHtml(desk.base)}/pages">${t.seeYourPages}</a></p>`, false, t.lang), 404, privateHeaders)
  const blocks = JSON.parse(page.blocks) as Block[]
  const [items, records, { results }] = await Promise.all([
    loadItems(env, site.id, blocks),
    loadPageRecords(env, site.id, blocks, { admin: false, customer: null }),
    env.DB.prepare('SELECT slug FROM pages WHERE site_id = ?').bind(site.id).all<{ slug: string }>(),
  ])
  const base = `${desk.base}/preview`
  const slugs = new Set(results.map((row) => row.slug))
  const rendered = renderPage(site, { ...page, blocks }, { canonical: `${url.origin}/`, customer: null, items, query: url.searchParams, records })
  const banner = `<p class="preview-banner" role="status">${t.previewBanner(`${escapeHtml(desk.base)}/publish`)}</p>`
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
  const page = await findLivePage(env, site, pageSlug)
  const blocks = page ? (JSON.parse(page.blocks) as Block[]) : []
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

  await loadItems(env, site.id, blocks)
  const data = validateEntry(block.fields as FormField[], form)
  if (!data) return back('error')
  await env.DB.prepare('INSERT INTO entries (site_id, form, page, data, customer_id) VALUES (?, ?, ?, ?, ?)')
    .bind(site.id, formName, pageSlug, JSON.stringify(data), customer?.id ?? null)
    .run()
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
  const urls = [...slugs.map((slug) => `/${slug === 'home' ? '' : slug}`), ...products.map(({ id }) => `/product/${id}`)].map((path) => `<url><loc>${url.origin}${path}</loc></url>`).join('')
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
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
        const code = await claimSite(env)
        return code ? html(claimedPage(url.origin, code, browserWords(request)), 200, privateHeaders) : see(url, '/')
      }
      return url.pathname === '/' ? html(setupPage(browserWords(request)), 200, privateHeaders) : notFound()
    }

    // Visitors get the published copy. Only the owner's routes below see the working copy.
    const site = liveSite(working)
    if (url.pathname === '/setup') return see(url, '/')
    if (url.pathname === '/robots.txt') {
      return new Response(`User-agent: *\nDisallow: /owner/\nDisallow: /staff\nDisallow: /mcp/\nDisallow: /api/\nDisallow: /data/\nDisallow: /frame/\nDisallow: /account\nDisallow: /cart\nDisallow: /checkout\nDisallow: /order/\nDisallow: /login\nDisallow: /signup\nDisallow: /reset/\nSitemap: ${url.origin}/sitemap.xml\n`, { headers: { 'Content-Type': 'text/plain' } })
    }
    if (url.pathname === '/sitemap.xml') return await sitemap(env, url, site)

    if (parts[0] === 'mcp' || parts[0] === 'owner') {
      // A wrong code looks the same as a page that doesn't exist.
      if (!(await isOwner(env, parts[1]))) return notFound()
      if (parts[0] === 'mcp') return parts.length === 2 ? await handleMcp(request, env, url, parts[1]) : notFound()
      const desk = ownerDesk(parts[1])
      if (parts[2] === 'preview' && parts.length <= 4 && request.method === 'GET') return await showPreview(env, url, working, desk, parts[3] ?? 'home')
      return await handleOffice(request, env, url, working, desk, parts.slice(2))
    }

    // Staff log in on the website and see only the parts of the back office the owner gave them.
    if (parts[0] === 'staff') {
      const desk = await staffEntry(request, env, url, working)
      if (desk instanceof Response) return desk
      if (parts[1] === 'preview' && parts.length <= 3 && request.method === 'GET' && allows(desk, 'pages')) return await showPreview(env, url, working, desk, parts[2] ?? 'home')
      return await handleOffice(request, env, url, working, desk, parts.slice(1))
    }

    if (parts[0] === 'api') return await handleApi(request, env, url, site, parts)
    if (parts[0] === 'data' && request.method === 'POST' && (parts.length === 2 || (parts.length === 4 && parts[3] === 'delete' && /^\d{1,12}$/.test(parts[2])))) {
      const customer = await customerFor(request, env, site)
      return await receiveRecord(request, env, url, site, { admin: false, customer: customer ?? null }, parts[1], parts[2] ? Number(parts[2]) : undefined)
    }

    if (['account', 'login', 'logout', 'reset', 'signup'].includes(parts[0])) return await handleAccount(request, env, url, site, parts)
    if (['cart', 'checkout', 'order', 'product'].includes(parts[0])) return await handleShop(request, env, url, site, parts)
    if (url.pathname === '/stripe/webhook' && request.method === 'POST') return await stripeWebhook(request, env, site)

    if (parts[0] === 'form' && request.method === 'POST' && parts.length === 3) {
      return await receiveForm(request, env, url, site, parts[1], parts[2])
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
    if (parts[0] === 'media' && parts.length === 2 && /^\d+(\.(gif|jpe?g|png|webp))?$/.test(parts[1])) return (await showImage(env, site.id, parts[1].split('.')[0])) ?? notFound()
    if (parts[0] === 'frame' && parts.length === 3 && /^\d+$/.test(parts[2])) return await showFrame(env, site, parts[1], parts[2])
    if (parts.length > 1) return notFound()
    return await showPage(request, env, url, site, parts[0] ?? 'home')
  } catch (error) {
    console.error(error)
    return html('<!doctype html><meta charset="utf-8"><title>Error</title><h1>Something went wrong</h1><p>Please try again.</p>', 500)
  }
}

export default {
  async fetch(request: Request, plainEnv: Env, context: ExecutionContext): Promise<Response> {
    const env: Env = { ...plainEnv, defer: (work) => context.waitUntil(work) }
    const response = await answer(request, env)
    if (response.status !== 404 || (request.method !== 'GET' && request.method !== 'HEAD')) return response
    const url = new URL(request.url)
    if (/^\/(owner|mcp|api)(\/|$)/.test(url.pathname)) return response
    return (await followRedirect(env, url).catch((): null => null)) ?? response
  },
} satisfies ExportedHandler<Env>
