import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'

import { validateEntry } from './forms'
import { createMcpServer } from './mcp'
import { claimedPage, claimSite, getSite, isOwner, ownerPage, setupPage } from './owner'
import { renderPage } from './render'
import type { Block, Env, FormField, PageRow, SiteRow } from './types'

const maxEntriesPerHour = 200
const maxBodyBytes = 32 * 1024

const securityHeaders = {
  'Content-Security-Policy':
    "default-src 'self'; img-src https: data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'none'; frame-src 'self' srcdoc:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
}
// Owner links hold a secret, so they must not leak to other sites or search engines.
const privateHeaders = { ...securityHeaders, 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' }

const html = (body: string, status = 200, headers: Record<string, string> = securityHeaders) =>
  new Response(body, {
    headers: { ...headers, 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' },
    status,
  })

const notFound = () => html('<!doctype html><meta charset="utf-8"><title>Not found</title><h1>Page not found</h1>', 404)
const see = (url: URL, path: string) => Response.redirect(`${url.origin}${path}`, 303)

const findPage = (env: Env, siteId: number, slug: string) =>
  env.DB.prepare('SELECT slug, title, description, published, blocks FROM pages WHERE site_id = ? AND slug = ? AND published = 1')
    .bind(siteId, slug)
    .first<PageRow>()

async function showPage(env: Env, url: URL, site: SiteRow, slug: string) {
  const page = await findPage(env, site.id, slug)
  if (!page) {
    if (slug !== 'home') return notFound()
    return html('<!doctype html><meta charset="utf-8"><title>Coming soon</title><p>This website is being built.</p>')
  }
  return html(
    renderPage(
      site,
      { ...page, blocks: JSON.parse(page.blocks) as Block[] },
      {
        canonical: `${url.origin}${url.pathname}`,
        error: url.searchParams.get('error') ?? undefined,
        sent: url.searchParams.get('sent') ?? undefined,
      },
    ),
  )
}

async function receiveForm(request: Request, env: Env, url: URL, site: SiteRow, pageSlug: string, formName: string) {
  const page = await findPage(env, site.id, pageSlug)
  const block = page && (JSON.parse(page.blocks) as Block[]).find((item) => item.type === 'form' && item.name === formName)
  if (!block) return notFound()

  const path = `/${pageSlug === 'home' ? '' : pageSlug}`
  const back = (state: 'error' | 'sent') => see(url, `${path}?${state}=${formName}#form-${formName}`)

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

  const data = validateEntry(block.fields as FormField[], form)
  if (!data) return back('error')
  await env.DB.prepare('INSERT INTO entries (site_id, form, page, data) VALUES (?, ?, ?, ?)')
    .bind(site.id, formName, pageSlug, JSON.stringify(data))
    .run()
  return back('sent')
}

async function handleMcp(request: Request, env: Env, url: URL) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Use POST.' }, { headers: { Allow: 'POST' }, status: 405 })
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  })
  await createMcpServer(env, url.origin).connect(transport)
  return transport.handleRequest(request)
}

async function handleOwner(request: Request, env: Env, url: URL, site: SiteRow, code: string, parts: string[]) {
  if (request.method === 'GET' && parts.length === 2) return html(await ownerPage(env, url.origin, code, site), 200, privateHeaders)
  if (request.method === 'POST' && parts[2] === 'entry' && /^\d+$/.test(parts[3] ?? '') && parts.length === 4) {
    const form = await request.formData().catch((): null => null)
    const status = form?.get('status')
    const id = Number(parts[3])
    if (status === 'delete') {
      await env.DB.prepare('DELETE FROM entries WHERE id = ? AND site_id = ?').bind(id, site.id).run()
    } else if (status === 'new' || status === 'confirmed' || status === 'done') {
      await env.DB.prepare('UPDATE entries SET status = ? WHERE id = ? AND site_id = ?').bind(status, id, site.id).run()
    }
    return see(url, `/owner/${code}`)
  }
  return notFound()
}

async function sitemap(env: Env, url: URL, site: SiteRow) {
  const { results } = await env.DB.prepare('SELECT slug FROM pages WHERE site_id = ? AND published = 1').bind(site.id).all<{ slug: string }>()
  const urls = results.map(({ slug }) => `<url><loc>${url.origin}/${slug === 'home' ? '' : slug}</loc></url>`).join('')
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
        return new Response(`User-agent: *\nDisallow: /owner/\nDisallow: /mcp/\nSitemap: ${url.origin}/sitemap.xml\n`, { headers: { 'Content-Type': 'text/plain' } })
      }
      if (url.pathname === '/sitemap.xml') return await sitemap(env, url, site)

      if (parts[0] === 'mcp' || parts[0] === 'owner') {
        // A wrong code looks the same as a page that doesn't exist.
        if (!(await isOwner(env, parts[1]))) return notFound()
        if (parts[0] === 'mcp') return parts.length === 2 ? await handleMcp(request, env, url) : notFound()
        return await handleOwner(request, env, url, site, parts[1], parts)
      }

      if (parts[0] === 'form' && request.method === 'POST' && parts.length === 3) {
        return await receiveForm(request, env, url, site, parts[1], parts[2])
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
      if (parts.length > 1) return notFound()
      return await showPage(env, url, site, parts[0] ?? 'home')
    } catch (error) {
      console.error(error)
      return html('<!doctype html><meta charset="utf-8"><title>Error</title><h1>Something went wrong</h1><p>Please try again.</p>', 500)
    }
  },
} satisfies ExportedHandler<Env>
