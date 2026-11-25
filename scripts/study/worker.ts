// Runs the mover's own reader and block maker on a page a browser drew, and says what made it across.
// Local only: `npx wrangler dev --config scripts/study/wrangler.jsonc --local --port 8797`.
import { blocksFromReading, chromeOf, lookCss } from '../../cloud/src/importer'
import { readWebPage } from '../../cloud/src/moving'

const norm = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim()

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('POST { url, html }', { status: 405 })
    const { find, full, html, url } = (await request.json()) as { find?: string[]; full?: boolean; html: string; url: string }
    const reading = await readWebPage(new URL(url), html)
    if ('error' in reading) return Response.json({ error: reading.error })
    const blocks = blocksFromReading(reading, (photo) => photo)
    const chrome = chromeOf(reading, url)
    const built = norm(JSON.stringify(blocks))
    const kept = (list: string[]) => {
      const usable = [...new Set(list.map(norm).filter((text) => text.length >= 3))]
      const missing = usable.filter((text) => !built.includes(text.slice(0, 60)))
      return { total: usable.length, kept: usable.length - missing.length, missing: missing.slice(0, 25) }
    }
    // What a visitor reads on the page itself: not the menu, header or footer (those go to the site's own menu and footer), nor things drawn off the page.
    const chromeKinds = new Set(['header', 'nav', 'footer'])
    const body = (reading.flow ?? []).filter((item) => !(item.section && chromeKinds.has(item.section.kind)) && !((item as { y?: number }).y! < 0)) as { kind: string; text: string }[]
    const flowKinds: Record<string, number> = {}
    for (const item of reading.flow ?? []) flowKinds[item.kind] = (flowKinds[item.kind] ?? 0) + 1
    const bodyImages = [...new Set((body as unknown as { kind: string; url?: string }[]).filter((item) => item.kind === 'image').map((item) => item.url!))]
    const builtImages = bodyImages.filter((url) => built.includes(norm(url).slice(0, 80))).length
    return Response.json({
      title: reading.title,
      description: reading.description,
      design: reading.design,
      lookCss: lookCss(reading.design),
      tooFewWords: reading.tooFewWords ?? false,
      reviewReason: reading.reviewReason ?? '',
      truncated: reading.truncated,
      headings: reading.headings.slice(0, 40),
      sections: reading.sections.slice(0, 40).map((section) => ({ kind: section.kind, headings: section.headings.slice(0, 3), lines: section.lines, buttons: section.buttons.slice(0, 4), images: section.images.length })),
      flowKinds,
      blocks: full ? blocks : blocks.map((block) => ({ type: block.type, ...summary(block as unknown as Record<string, unknown>) })),
      chrome: { name: chrome.name, nav: chrome.nav.slice(0, 12), footer: chrome.footerText.slice(0, 200) },
      found: (find ?? []).map((word) => ({ word, items: (reading.flow ?? []).filter((item) => norm(JSON.stringify(item)).includes(norm(word))).slice(0, 4) })),
      coverage: {
        text: kept(body.filter((item) => item.kind === 'text').map((item) => item.text)),
        headings: kept(body.filter((item) => item.kind === 'heading').map((item) => item.text)),
        buttons: kept(body.filter((item) => item.kind === 'button').map((item) => item.text)),
        images: { total: bodyImages.length, kept: builtImages, missing: bodyImages.filter((url) => !built.includes(norm(url).slice(0, 80))).slice(0, 10) },
      },
    })
  },
}

function summary(block: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(block)) {
    if (key === 'type') continue
    if (typeof value === 'string') out[key] = value.slice(0, 80)
    else if (Array.isArray(value)) out[key] = `${value.length} items`
    else if (value && typeof value === 'object') out[key] = Object.keys(value).join(',')
    else out[key] = value
  }
  return out
}
