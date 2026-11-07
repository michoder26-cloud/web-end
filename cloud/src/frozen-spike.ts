import type { Env } from './types'

// SPIKE (spike/wix-pixel, not for main as-is): serves a page frozen by spikes/wix-pixel/capture.mjs and
// patches owner-editable regions into it while it streams, with HTMLRewriter. Off unless FROZEN_SPIKE=1.
// Regions come from the owner's data table "frozen_regions": records {page, selector, kind, value},
// where kind is text, image or href. Values are set as text, so a region can never inject HTML.

type Region = { page: string; selector: string; kind: 'text' | 'image' | 'href'; value: string }

const safeUrl = (value: string) => value.startsWith('/') || value.startsWith('https://')

export async function showFrozen(request: Request, env: Env, parts: string[]): Promise<Response | null> {
  if (env.FROZEN_SPIKE !== '1' || parts[0] !== 'frozen' || parts.length !== 3) return null
  const [, page, width] = parts
  if (!/^[a-z0-9-]{1,40}$/.test(page) || !/^\d{3,4}$/.test(width)) return null
  const file = await env.ASSETS.fetch(new URL(`/_frozen/${page}/w${width}.html`, request.url))
  if (!file.ok) return null

  const found = await env.DB.prepare(
    "SELECT r.data FROM data_records r JOIN data_tables t ON t.id = r.table_id WHERE t.name = 'frozen_regions' ORDER BY r.id LIMIT 200",
  ).all<{ data: string }>()
  const regions = found.results.map((row) => JSON.parse(row.data) as Region).filter((one) => one.page === page)

  let rewriter = new HTMLRewriter()
  for (const region of regions) {
    try {
      rewriter = rewriter.on(region.selector, {
        element(element) {
          if (region.kind === 'text') element.setInnerContent(region.value)
          else if (region.kind === 'image' && safeUrl(region.value)) {
            element.setAttribute('src', region.value)
            element.removeAttribute('srcset')
          } else if (region.kind === 'href' && safeUrl(region.value)) element.setAttribute('href', region.value)
        },
      })
    } catch {
      // A selector HTMLRewriter does not support is skipped, never a broken page.
    }
  }
  return rewriter.transform(
    new Response(file.body, { headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8', 'X-Frozen-Regions': String(regions.length) } }),
  )
}
