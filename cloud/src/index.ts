import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'

import { handleAccount } from './account'
import { getCustomer } from './auth'
import { handleOffice } from './cms'
import { validateEntry } from './forms'
import { html, notFound, privateHeaders, see } from './http'
import { loadItems, showImage } from './items'
import { createMcpServer } from './mcp'
import { claimedPage, claimSite, getSite, isOwner, setupPage, shell } from './owner'
import { renderPage } from './render'
import { cartCount, handleShop } from './shop'
import { stripeWebhook } from './stripe'
import type { Block, Env, FormField, PageRow, Settings, SiteRow } from './types'

const maxEntriesPerHour = 200
const maxBodyBytes = 32 * 1024

// Custom code gets an empty origin, so its scripts run but cannot reach the site or its database.
const frameHeaders = {
  'Content-Security-Policy': "sandbox allow-scripts allow-forms; default-src https: data: 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'self'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex',
}

const findPage = (env: Env, siteId: number, slug: string) =>
  env.DB.prepare('SELECT slug, title, description, published, blocks FROM pages WHERE site_id = ? AND slug = ? AND published = 1')
    .bind(siteId, slug)
    .first<PageRow>()

const customerFor = (request: Request, env: Env, site: SiteRow) => ((JSON.parse(site.settings) as Settings).accounts ? getCustomer(request, env, site.id) : Promise.resolve(null))

const buildingPage = () =>
  shell(
    'Coming soon',
    `<h1>This website is being built.</h1>
<p>Are you the owner? Open Claude, start a new chat with your connector on, and say what you want. For example: "Build a website for my coffee shop."</p>
<p lang="th">เว็บนี้กำลังสร้างอยู่ ถ้าคุณเป็นเจ้าของ ให้เปิด Claude เริ่มแชตใหม่โดยเปิด connector ไว้ แล้วบอกว่าอยากได้เว็บแบบไหน</p>`,
  )

async function showPage(request: Request, env: Env, url: URL, site: SiteRow, slug: string) {
  const page = await findPage(env, site.id, slug)
  if (!page) {
    if (slug !== 'home') return notFound()
    return html(buildingPage())
  }
  const blocks = JSON.parse(page.blocks) as Block[]
  const [items, customer] = await Promise.all([loadItems(env, site.id, blocks), customerFor(request, env, site)])
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
        sent: url.searchParams.get('sent') ?? undefined,
      },
    ),
  )
}

async function showFrame(env: Env, site: SiteRow, slug: string, index: string) {
  const page = await findPage(env, site.id, slug)
  const block = page && (JSON.parse(page.blocks) as Block[])[Number(index)]
  return block?.type === 'html' ? html(block.code, 200, frameHeaders) : notFound()
}

async function receiveForm(request: Request, env: Env, url: URL, site: SiteRow, pageSlug: string, formName: string) {
  const page = await findPage(env, site.id, pageSlug)
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
  const { results } = await env.DB.prepare('SELECT slug FROM pages WHERE site_id = ? AND published = 1').bind(site.id).all<{ slug: string }>()
  const { results: products } = await env.DB.prepare('SELECT id FROM items WHERE site_id = ? AND published = 1 LIMIT 500').bind(site.id).all<{ id: number }>()
  const urls = [...results.map(({ slug }) => `/${slug === 'home' ? '' : slug}`), ...products.map(({ id }) => `/product/${id}`)].map((path) => `<url><loc>${url.origin}${path}</loc></url>`).join('')
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { 'Content-Type': 'application/xml' },
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)
    try {
      const site = await getSite(env)

      if (!site) {
        if (url.pathname === '/setup' && request.method === 'POST') {
          const code = await claimSite(env)
          return code ? html(claimedPage(url.origin, code), 200, privateHeaders) : see(url, '/')
        }
        return url.pathname === '/' ? html(setupPage(), 200, privateHeaders) : notFound()
      }

      if (url.pathname === '/setup') return see(url, '/')
      if (url.pathname === '/robots.txt') {
        return new Response(`User-agent: *\nDisallow: /owner/\nDisallow: /mcp/\nDisallow: /frame/\nDisallow: /account\nDisallow: /cart\nDisallow: /checkout\nDisallow: /order/\nDisallow: /login\nDisallow: /signup\nDisallow: /reset/\nSitemap: ${url.origin}/sitemap.xml\n`, { headers: { 'Content-Type': 'text/plain' } })
      }
      if (url.pathname === '/sitemap.xml') return await sitemap(env, url, site)

      if (parts[0] === 'mcp' || parts[0] === 'owner') {
        // A wrong code looks the same as a page that doesn't exist.
        if (!(await isOwner(env, parts[1]))) return notFound()
        if (parts[0] === 'mcp') return parts.length === 2 ? await handleMcp(request, env, url, parts[1]) : notFound()
        return await handleOffice(request, env, url, site, parts[1], parts)
      }

      if (['account', 'login', 'logout', 'reset', 'signup'].includes(parts[0])) return await handleAccount(request, env, url, site, parts)
      if (['cart', 'checkout', 'order', 'product'].includes(parts[0])) return await handleShop(request, env, url, site, parts)
      if (url.pathname === '/stripe/webhook' && request.method === 'POST') return await stripeWebhook(request, env, site)

      if (parts[0] === 'form' && request.method === 'POST' && parts.length === 3) {
        return await receiveForm(request, env, url, site, parts[1], parts[2])
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
      if (parts[0] === 'media' && parts.length === 2 && /^\d+$/.test(parts[1])) return (await showImage(env, site.id, parts[1])) ?? notFound()
      if (parts[0] === 'frame' && parts.length === 3 && /^\d+$/.test(parts[2])) return await showFrame(env, site, parts[1], parts[2])
      if (parts.length > 1) return notFound()
      return await showPage(request, env, url, site, parts[0] ?? 'home')
    } catch (error) {
      console.error(error)
      return html('<!doctype html><meta charset="utf-8"><title>Error</title><h1>Something went wrong</h1><p>Please try again.</p>', 500)
    }
  },
} satisfies ExportedHandler<Env>
