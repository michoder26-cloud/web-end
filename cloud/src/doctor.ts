// The site doctor: one look over the whole site before publishing, in plain findings the owner can act on,
// most with a fix that needs no AI. It adds what the general checks (findProblems) can't see on pages moved
// with their own look: files still on the old site, photos without a description, links to pages that don't
// exist here, and pages without a description for search results.
import { copyMoreFiles, copyTexts, copyWaiting, decodeEntities, isCopyPage, maxCopyBytes, type CopyBlock } from './copying'
import { cleanPath, saveRedirects } from './moving'
import { rememberPage } from './page-history'
import type { Block, Env, SiteRow } from './types'

export type Finding = {
  code: 'files' | 'alt' | 'links' | 'description' | 'general'
  level: 'high' | 'medium' | 'low'
  page?: string
  count?: number
  sample?: string[]
  text?: string
  fix?: boolean
}

type PageRow = { blocks: string; description: string; published: number; slug: string; title: string }

const imgTags = (html: string) => [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0])
const hasAlt = (tag: string) => /\salt="[^"]*\S[^"]*"/i.test(tag) || /\saria-hidden="true"/i.test(tag) || /\srole="presentation"/i.test(tag)
const srcOf = (tag: string) => /\ssrc="([^"]*)"/i.exec(tag)?.[1] ?? ''

/** Links in a copied page to this site's own paths that lead nowhere: no page, and no redirect. */
async function deadLinks(env: Env, siteId: number, html: string, slugs: Set<string>) {
  const paths = new Set<string>()
  for (const match of html.matchAll(/<a\b[^>]*\shref="(\/[^"#?]*)/gi)) {
    const path = cleanPath(decodeEntities(match[1]))
    if (!path || path === '/' || /^\/(media|cart|account|login|logout|signup|product|form|data|owner)(\/|$)/.test(path)) continue
    if (slugs.has(path.slice(1))) continue
    paths.add(path)
  }
  if (!paths.size) return []
  const list = [...paths].slice(0, 90)
  const { results } = await env.DB.prepare(`SELECT from_path FROM redirects WHERE site_id = ? AND from_path IN (${list.map(() => '?').join(',')})`).bind(siteId, ...list).all<{ from_path: string }>()
  const redirected = new Set(results.map((row) => row.from_path))
  return list.filter((path) => !redirected.has(path))
}

/** Everything the doctor finds, most important first, with a score out of 100. */
export async function examineSite(env: Env, site: SiteRow, general: string[]) {
  const { results: pages } = await env.DB.prepare('SELECT slug, title, description, published, blocks FROM pages WHERE site_id = ?').bind(site.id).all<PageRow>()
  const slugs = new Set(pages.map((page) => page.slug))
  const findings: Finding[] = []
  for (const page of pages) {
    const blocks = JSON.parse(page.blocks) as Block[]
    if (!isCopyPage(blocks)) continue
    const copy = blocks[0]
    const waiting = copyWaiting(copy)
    if (waiting) findings.push({ code: 'files', level: 'high', page: page.slug, count: waiting, fix: true })
    const bare = imgTags(copy.html).filter((tag) => !hasAlt(tag))
    if (bare.length) findings.push({ code: 'alt', level: 'medium', page: page.slug, count: bare.length, fix: true })
    const dead = await deadLinks(env, site.id, copy.html, slugs)
    if (dead.length) findings.push({ code: 'links', level: 'high', page: page.slug, count: dead.length, sample: dead.slice(0, 5), fix: true })
    if (!page.description.trim() || page.description.trim() === page.title.trim()) findings.push({ code: 'description', level: 'low', page: page.slug, fix: true })
  }
  // A page the doctor already lists for its description is not listed twice.
  const described = new Set(findings.filter((finding) => finding.code === 'description').map((finding) => finding.page))
  for (const text of general) {
    const page = /^Page "([^"]+)" needs a description/.exec(text)?.[1]
    if (!page || !described.has(page)) findings.push({ code: 'general', level: 'medium', text })
  }
  const weight = { high: 12, medium: 5, low: 2 }
  const score = Math.max(0, 100 - findings.reduce((sum, finding) => sum + weight[finding.level], 0))
  const order = { high: 0, medium: 1, low: 2 }
  findings.sort((a, b) => order[a.level] - order[b.level])
  return { score, findings }
}

// A photo's description from what is known about it: its file name, else the heading nearest before it.
const words = (value: string) => decodeEntities(value).replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_~]+/g, ' ').replace(/\b(mv2|copy|final|img|image|photo|dsc|untitled design)\b/gi, ' ').replace(/\d{4,}|[0-9a-f]{12,}/gi, ' ').replace(/\s+/g, ' ').trim()

function describedPhotos(html: string, title: string) {
  let lastHeading = ''
  return html.replace(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>|<img\b[^>]*>/gi, (tag, heading?: string) => {
    if (heading !== undefined) {
      lastHeading = decodeEntities(heading.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 120)
      return tag
    }
    if (hasAlt(tag)) return tag
    const name = words(decodeURIComponent(srcOf(tag).split('/').pop() ?? '').split('?')[0])
    const alt = (name.length >= 4 && /[a-z฀-๿]{3}/i.test(name) ? name : lastHeading || title).replace(/"/g, '').slice(0, 150)
    const cleaned = tag.replace(/\salt="[^"]*"/i, '')
    return cleaned.replace(/^<img\b/i, `<img alt="${alt.replace(/&/g, '&amp;')}"`)
  })
}

const firstWords = (html: string) => {
  const line = copyTexts(html).find((text) => text.length >= 40) ?? copyTexts(html).join(' ')
  const cut = line.slice(0, 160)
  return (cut.length < line.length ? `${cut.replace(/\s+\S*$/, '')}…` : cut).slice(0, 165)
}

/** Fixes what can be fixed without AI. Returns how many findings it fixed. */
export async function fixSite(env: Env, site: SiteRow, wanted?: { code?: string; page?: string }) {
  const { results: pages } = await env.DB.prepare('SELECT slug, title, description, published, blocks FROM pages WHERE site_id = ?').bind(site.id).all<PageRow>()
  const slugs = new Set(pages.map((page) => page.slug))
  let fixed = 0
  const wants = (code: string, slug: string) => (!wanted?.code || wanted.code === code) && (!wanted?.page || wanted.page === slug)
  for (const page of pages) {
    const blocks = JSON.parse(page.blocks) as Block[]
    if (!isCopyPage(blocks)) continue
    let copy: CopyBlock = blocks[0]
    let changed = false
    let description = page.description
    if (wants('files', page.slug) && copyWaiting(copy)) {
      const done = await copyMoreFiles(env, site.id, copy)
      copy = done.block
      changed = true
      if (!done.waiting) fixed++
    }
    if (wants('alt', page.slug) && imgTags(copy.html).some((tag) => !hasAlt(tag))) {
      copy = { ...copy, html: describedPhotos(copy.html, page.title) }
      changed = true
      fixed++
    }
    if (wants('links', page.slug)) {
      // Links to pages that were not moved lead to the home page, until the owner moves or makes them.
      const dead = await deadLinks(env, site.id, copy.html, slugs)
      if (dead.length) {
        const saved = await saveRedirects(env, site.id, dead.map((from) => ({ from, to: '/' })))
        if (saved.saved) fixed++
      }
    }
    if (wants('description', page.slug) && (!description.trim() || description.trim() === page.title.trim())) {
      const made = firstWords(copy.html)
      if (made) { description = made; fixed++ }
    }
    if (!changed && description === page.description) continue
    const stored = JSON.stringify([copy])
    if (stored.length > maxCopyBytes) continue
    await rememberPage(env, site.id, page.slug)
    await env.DB.prepare("UPDATE pages SET blocks = ?, description = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE site_id = ? AND slug = ?").bind(stored, description, site.id, page.slug).run()
  }
  return { fixed }
}
