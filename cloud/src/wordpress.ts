import { escapeHtml } from './http'
import { parsePrice } from './money'
import { version } from './version'
import type { Block, Env, Settings, SiteRow } from './types'

/**
 * Files for moving a site to WordPress: a WordPress import file (WXR) with pages, photos and the menu,
 * a WooCommerce product file, and a file of old addresses for the Redirection plugin.
 * A Wix site moves here first, so this is also the way from Wix to WordPress.
 */

type PageRow = { blocks: string; description: string; published: number; slug: string; title: string }
type ItemRow = { body: string; category: string; collection: string; compare_price: string; id: number; image_alt: string; image_url: string; link_href: string; link_label: string; price: string; published: number; sort: number; stock: null | number; title: string }
type VariantRow = { compare_price: string; item_id: number; name: string; price: string; sort: number; stock: null | number }

const extensions: Record<string, string> = { 'image/gif': 'gif', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const cdata = (value: string) => `<![CDATA[${value.replaceAll(']]>', ']]]]><![CDATA[>')}]]>`
const e = escapeHtml

async function load(env: Env, site: SiteRow) {
  const [pages, items, variants, media, redirects] = await Promise.all([
    env.DB.prepare('SELECT slug, title, description, published, blocks FROM pages WHERE site_id = ? ORDER BY slug = \'home\' DESC, slug').bind(site.id).all<PageRow>(),
    env.DB.prepare('SELECT id, collection, title, price, compare_price, category, stock, body, image_url, image_alt, link_label, link_href, sort, published FROM items WHERE site_id = ? ORDER BY collection, sort, id').bind(site.id).all<ItemRow>(),
    env.DB.prepare('SELECT item_variants.item_id, item_variants.name, item_variants.price, item_variants.compare_price, item_variants.stock, item_variants.sort FROM item_variants JOIN items ON items.id = item_variants.item_id WHERE items.site_id = ? ORDER BY item_variants.sort, item_variants.id').bind(site.id).all<VariantRow>(),
    env.DB.prepare('SELECT id, name, type FROM media WHERE site_id = ?').bind(site.id).all<{ id: number; name: string; type: string }>(),
    env.DB.prepare('SELECT from_path, to_path FROM redirects WHERE site_id = ? ORDER BY from_path').bind(site.id).all<{ from_path: string; to_path: string }>(),
  ])
  const variantsOf = new Map<number, VariantRow[]>()
  for (const variant of variants.results) variantsOf.set(variant.item_id, [...(variantsOf.get(variant.item_id) ?? []), variant])
  return { items: items.results, media: media.results, pages: pages.results, redirects: redirects.results, settings: JSON.parse(site.settings) as Settings, variantsOf }
}

/** Addresses that work on the WordPress side: photos keep loading from here until WordPress has copied them, and shop pages map to WooCommerce's. */
function addresses(origin: string, media: { id: number; type: string }[], products: ItemRow[]) {
  const typeOf = new Map(media.map((row) => [row.id, row.type]))
  const itemById = new Map(products.map((item) => [item.id, item]))
  const photo = (value: unknown) => {
    if (typeof value !== 'string' || !value) return ''
    const own = /^\/media\/(\d+)$/.exec(value)
    if (own) return `${origin}/media/${own[1]}.${extensions[typeOf.get(Number(own[1])) ?? ''] ?? 'jpg'}`
    return value.startsWith('https://') ? value : ''
  }
  const page = (value: unknown) => {
    if (typeof value !== 'string' || !value) return ''
    const path = value.split(/[?#]/)[0]
    const rest = value.slice(path.length)
    const product = /^\/product\/(\d+)$/.exec(path)
    if (product) {
      // WooCommerce picks its own product addresses, but a search with one result opens that product,
      // so an exact search for the name reaches the same product without knowing its new address.
      const item = itemById.get(Number(product[1]))
      return item?.published ? `/?post_type=product&sentence=1&s=${encodeURIComponent(item.title)}` : '/shop/'
    }
    if (/^\/product\//.test(path)) return '/shop/'
    if (path === '/cart' || path === '/checkout') return `/${path.slice(1)}/${rest}`
    if (['/account', '/login', '/signup'].includes(path) || path.startsWith('/order/')) return '/my-account/'
    // WordPress page addresses end in a slash, and the home page is the site's front page.
    const slug = /^\/([a-z0-9-]+)\/?$/.exec(path)?.[1]
    if (slug) return `${slug === 'home' ? '/' : `/${slug}/`}${rest}`
    return value
  }
  return { page, photo }
}

const paragraphs = (text: unknown) =>
  String(text ?? '')
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${e(part).replaceAll('\n', '<br>')}</p>`)
    .join('\n')

/** Turns one page into plain HTML that the WordPress editor shows as a Classic block and can convert into blocks. Returns what it could not move. */
function pageHtml(page: PageRow, items: ItemRow[], link: ReturnType<typeof addresses>, tagged: boolean) {
  const blocks = JSON.parse(page.blocks) as Block[]
  const todo: string[] = []
  // A section's heading carries its anchor, so links such as /#hours still jump to it. It goes in as a heading block,
  // because converting classic HTML to blocks drops the id of a plain heading. Anchors only use a-z, 0-9, - and _.
  const h2 = (text: unknown, id?: unknown) => {
    if (!text) return ''
    if (!id) return `<h2>${e(text)}</h2>`
    return `<!-- wp:heading {"anchor":"${e(id)}"} -->\n<h2 id="${e(id)}">${e(text)}</h2>\n<!-- /wp:heading -->`
  }
  const img = (url: unknown, alt: unknown, caption?: unknown) => {
    const src = link.photo(url)
    if (!src) return ''
    const tag = `<img src="${e(src)}" alt="${e(alt ?? '')}">`
    return caption ? `<figure>${tag}<figcaption>${e(caption)}</figcaption></figure>` : `<p>${tag}</p>`
  }
  const button = (label: unknown, href: unknown) => (label && href ? `<p><a class="wp-element-button" href="${e(link.page(href))}">${e(label)}</a></p>` : '')
  const named = (block: Block) => (block.heading ? `"${String(block.heading)}"` : `a ${block.type} section`)
  const parts = blocks.map((block) => {
    switch (block.type) {
      case 'hero':
        return [block.eyebrow ? `<p><strong>${e(block.eyebrow)}</strong></p>` : '', h2(block.heading), paragraphs(block.text), button(block.buttonLabel, block.buttonHref), img(block.imageUrl, block.imageAlt)].join('\n')
      case 'text':
        return [h2(block.heading), paragraphs(block.body)].join('\n')
      case 'split':
        return [h2(block.heading), paragraphs(block.body), img(block.imageUrl, block.imageAlt), button(block.buttonLabel, block.buttonHref)].join('\n')
      case 'features':
      case 'steps':
        return [h2(block.heading), paragraphs(block.intro), ...(block.items ?? []).map((item: any) => `<h3>${e(item.title)}</h3>\n${paragraphs(item.text)}`)].join('\n')
      case 'stats':
        return [h2(block.heading), `<ul>${(block.items ?? []).map((item: any) => `<li><strong>${e(item.value)}</strong> ${e(item.label)}</li>`).join('')}</ul>`].join('\n')
      case 'pricing':
        return [
          h2(block.heading),
          paragraphs(block.intro),
          ...(block.plans ?? []).map((plan: any) => {
            const features = String(plan.features ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
            return [`<h3>${e(plan.name)}</h3>`, `<p><strong>${e(plan.price)}</strong>${plan.note ? ` ${e(plan.note)}` : ''}</p>`, features.length ? `<ul>${features.map((line) => `<li>${e(line)}</li>`).join('')}</ul>` : '', button(plan.buttonLabel, plan.buttonHref)].join('\n')
          }),
        ].join('\n')
      case 'testimonials':
        return [h2(block.heading), ...(block.items ?? []).map((item: any) => `<blockquote>${paragraphs(item.quote)}<cite>${e(item.name)}${item.role ? `, ${e(item.role)}` : ''}</cite></blockquote>`)].join('\n')
      case 'team':
        return [h2(block.heading), paragraphs(block.intro), ...(block.members ?? []).map((member: any) => [`<h3>${e(member.name)}</h3>`, member.role ? `<p><em>${e(member.role)}</em></p>` : '', paragraphs(member.text), img(member.imageUrl, member.name)].join('\n'))].join('\n')
      case 'gallery':
        return [h2(block.heading), ...(block.images ?? []).map((image: any) => img(image.imageUrl, image.imageAlt, image.caption))].join('\n')
      case 'info':
        return [h2(block.heading, block.id), ...(block.items ?? []).map((item: any) => `<p><strong>${e(item.label)}</strong><br>${e(item.value).replaceAll('\n', '<br>')}</p>`), button(block.buttonLabel, block.buttonHref)].join('\n')
      case 'faq':
        return [h2(block.heading), ...(block.items ?? []).map((item: any) => `<h3>${e(item.question)}</h3>\n${paragraphs(item.answer)}`)].join('\n')
      case 'links':
        return [h2(block.heading), paragraphs(block.intro), `<ul>${(block.items ?? []).map((item: any) => `<li><a href="${e(link.page(item.href))}">${e(item.label)}</a>${item.text ? ` – ${e(item.text)}` : ''}</li>`).join('')}</ul>`].join('\n')
      case 'cta':
        return [h2(block.heading), paragraphs(block.text), button(block.buttonLabel, block.buttonHref)].join('\n')
      case 'collection': {
        const shown = items.filter((item) => item.collection === block.collection && item.published).slice(0, Number(block.limit) || undefined)
        if (shown.some((item) => parsePrice(item.price))) {
          // Like this section: all of its products unless it has a limit, in the same order, and only this collection when there are several.
          const only = tagged ? ` tag="${e(block.collection)}"` : ''
          return [h2(block.heading, block.id), paragraphs(block.intro), `[products limit="${Number(block.limit) || -1}" columns="3" orderby="menu_order" order="ASC"${only}]`].join('\n')
        }
        return [h2(block.heading, block.id), paragraphs(block.intro), ...shown.map((item) => [`<h3>${e(item.title)}</h3>`, item.price ? `<p><strong>${e(item.price)}</strong></p>` : '', paragraphs(item.body), img(item.image_url, item.image_alt || item.title), button(item.link_label, item.link_href)].join('\n'))].join('\n')
      }
      case 'form':
        todo.push(`The form ${named(block)} needs a form plugin, such as Contact Form 7 or WPForms. Its fields: ${(block.fields ?? []).map((field: any) => field.label).join(', ')}.`)
        return h2(block.heading, `form-${block.name}`)
      case 'records':
      case 'record-form':
        todo.push(`${named(block)} uses the table "${block.table}". WordPress has no tables like this, so it needs a plugin, or keep this site as the backend and call its API.`)
        return h2(block.heading, block.type === 'records' ? block.id || `record-${block.table}` : '')
      case 'html':
        todo.push(`${block.title ? `"${String(block.title)}"` : 'A custom code section'} was left out, because code made for a sandboxed frame can break a WordPress theme. Copy it into a Custom HTML block if you still need it.`)
        return ''
      default:
        return ''
    }
  })
  return { html: parts.filter(Boolean).join('\n\n'), todo }
}

/** A WordPress title is the page's heading, so the site name some titles end with is left for the SEO title instead. */
const shortTitle = (title: string, slug: string) => title.split(/\s+[|–—]\s+/)[0].trim() || (slug === 'home' ? 'Home' : slug)

export async function wordpressPlan(env: Env, site: SiteRow, origin: string) {
  const data = await load(env, site)
  const products = data.items.filter((item) => parsePrice(item.price) || data.variantsOf.get(item.id)?.some((variant) => parsePrice(variant.price)))
  const link = addresses(origin, data.media, products)
  // WooCommerce has one list of products, so separate collections become tags that each shop section can show.
  const tagged = new Set(products.map((item) => item.collection)).size > 1
  const pages = data.pages.map((page) => ({ ...pageHtml(page, data.items, link, tagged), page }))
  const todo = pages.flatMap(({ page, todo }) => todo.map((line) => `Page "${page.slug}": ${line}`))
  const shop = data.pages.find((page) => page.slug === 'shop')
  if (shop && products.length && (JSON.parse(shop.blocks) as Block[]).some((block) => block.type !== 'collection')) {
    todo.push('Page "shop": WooCommerce shows its own product list at /shop, so the other sections of this page won\'t show there. Move them to another page.')
  }
  if (data.settings.accounts) todo.push("Customer passwords can't move to any other system. Customers make new accounts in WooCommerce.")
  if (data.settings.cart) todo.push('Orders stay here. Download them with Download everything on the System page before you close this site.')
  // WooCommerce starts in US dollars, so the owner needs to know which currency to choose.
  const symbols: Record<string, string> = { '£': 'GBP', '¥': 'JPY', '฿': 'THB', '€': 'EUR' }
  const first = products.map((item) => parsePrice(item.price)).find(Boolean)
  const currency = data.settings.currency?.toUpperCase() || symbols[first?.prefix.trim() ?? ''] || (/บาท/.test(first?.suffix ?? '') ? 'THB' : '')
  return { currency, data, link, pages, products, tagged, todo }
}

export async function wordpressXml(env: Env, site: SiteRow, origin: string) {
  const { data, link, pages } = await wordpressPlan(env, site, origin)
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const pubDate = new Date().toUTCString()
  const meta = (key: string, value: string | number) => `<wp:postmeta><wp:meta_key>${cdata(key)}</wp:meta_key><wp:meta_value>${cdata(String(value))}</wp:meta_value></wp:postmeta>`
  const item = (fields: { content?: string; excerpt?: string; extra?: string; id: number; name: string; order?: number; status: string; title: string; type: string; url: string }) => `<item>
<title>${cdata(fields.title)}</title>
<link>${e(fields.url)}</link>
<pubDate>${pubDate}</pubDate>
<dc:creator>${cdata('web-end')}</dc:creator>
<guid isPermaLink="false">${e(`${origin}/?p=${fields.id}`)}</guid>
<description></description>
<content:encoded>${cdata(fields.content ?? '')}</content:encoded>
<excerpt:encoded>${cdata(fields.excerpt ?? '')}</excerpt:encoded>
<wp:post_id>${fields.id}</wp:post_id>
<wp:post_date>${cdata(now)}</wp:post_date>
<wp:post_date_gmt>${cdata(now)}</wp:post_date_gmt>
<wp:comment_status>${cdata('closed')}</wp:comment_status>
<wp:ping_status>${cdata('closed')}</wp:ping_status>
<wp:post_name>${cdata(fields.name)}</wp:post_name>
<wp:status>${cdata(fields.status)}</wp:status>
<wp:post_parent>0</wp:post_parent>
<wp:menu_order>${fields.order ?? 0}</wp:menu_order>
<wp:post_type>${cdata(fields.type)}</wp:post_type>
<wp:post_password>${cdata('')}</wp:post_password>
<wp:is_sticky>0</wp:is_sticky>
${fields.extra ?? ''}
</item>`

  // Only photos used on pages go in, so WordPress doesn't copy the whole library.
  const used = new Set([...pages.map(({ html }) => html).join(' ').matchAll(/\/media\/(\d+)\./g)].map((match) => Number(match[1])))
  const photos = data.media.filter((row) => used.has(row.id)).map((row) => {
    const url = link.photo(`/media/${row.id}`)
    // WooCommerce's product importer looks for this before downloading, so a product photo that is also on a page isn't copied twice.
    return item({ extra: `<wp:attachment_url>${cdata(url)}</wp:attachment_url>\n${meta('_wc_attachment_source', url)}`, id: 10_000 + row.id, name: `photo-${row.id}`, status: 'inherit', title: row.name || `Photo ${row.id}`, type: 'attachment', url })
  })
  const pageIds = new Map<string, number>()
  const pageItems = pages.map(({ html, page }, index) => {
    const id = 100 + index
    pageIds.set(page.slug, id)
    const extra = [meta('_yoast_wpseo_title', page.title), meta('_yoast_wpseo_metadesc', page.description), meta('rank_math_title', page.title), meta('rank_math_description', page.description)].join('\n')
    return item({ content: html, excerpt: page.description, extra, id, name: page.slug, order: index, status: page.published ? 'publish' : 'draft', title: shortTitle(page.title, page.slug), type: 'page', url: `${origin}/${page.slug === 'home' ? '' : page.slug}` })
  })
  const menuItems = (data.settings.nav ?? []).map((entry, index) => {
    const id = 20_000 + index
    const slug = /^\/([a-z0-9-]+)\/?$/.exec(entry.href)?.[1] ?? (entry.href === '/' ? 'home' : '')
    const target = pageIds.get(slug)
    const kind = target ? [meta('_menu_item_type', 'post_type'), meta('_menu_item_object', 'page'), meta('_menu_item_object_id', target), meta('_menu_item_url', '')] : [meta('_menu_item_type', 'custom'), meta('_menu_item_object', 'custom'), meta('_menu_item_object_id', id), meta('_menu_item_url', link.page(entry.href))]
    const extra = [`<category domain="nav_menu" nicename="main-menu">${cdata('Main menu')}</category>`, ...kind, meta('_menu_item_menu_item_parent', 0), meta('_menu_item_target', ''), meta('_menu_item_classes', 'a:1:{i:0;s:0:"";}'), meta('_menu_item_xfn', '')].join('\n')
    return item({ extra, id, name: `menu-${index + 1}`, order: index + 1, status: 'publish', title: entry.label, type: 'nav_menu_item', url: `${origin}/` })
  })

  return `<?xml version="1.0" encoding="UTF-8" ?>
<!-- A WordPress import file made by web-end ${version}. In WordPress: Tools, Import, WordPress, then tick "Download and import file attachments". -->
<rss version="2.0" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wfw="http://wellformedweb.org/CommentAPI/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
<title>${cdata(data.settings.name ?? '')}</title>
<link>${e(origin)}</link>
<description>${cdata(data.settings.tagline ?? '')}</description>
<pubDate>${pubDate}</pubDate>
<language>${e(data.settings.language ?? 'en')}</language>
<wp:wxr_version>1.2</wp:wxr_version>
<wp:base_site_url>${e(origin)}</wp:base_site_url>
<wp:base_blog_url>${e(origin)}</wp:base_blog_url>
<wp:author><wp:author_id>1</wp:author_id><wp:author_login>${cdata('web-end')}</wp:author_login><wp:author_email>${cdata('')}</wp:author_email><wp:author_display_name>${cdata(data.settings.name ?? 'web-end')}</wp:author_display_name><wp:author_first_name>${cdata('')}</wp:author_first_name><wp:author_last_name>${cdata('')}</wp:author_last_name></wp:author>
${menuItems.length ? `<wp:term><wp:term_id>1</wp:term_id><wp:term_taxonomy>${cdata('nav_menu')}</wp:term_taxonomy><wp:term_slug>${cdata('main-menu')}</wp:term_slug><wp:term_name>${cdata('Main menu')}</wp:term_name></wp:term>` : ''}
<generator>web-end ${version}</generator>
${[...photos, ...pageItems, ...menuItems].join('\n')}
</channel>
</rss>
`
}

const csv = (rows: (number | string)[][]) => rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n') + '\r\n'
const amount = (text: string) => {
  const price = parsePrice(text)
  return price ? String(price.amount / 100) : ''
}

/** Products in the layout WooCommerce's product importer reads, with options as variations. */
export async function woocommerceCsv(env: Env, site: SiteRow, origin: string) {
  const { data, link, products, tagged } = await wordpressPlan(env, site, origin)
  const header = ['Type', 'SKU', 'Name', 'Published', 'Short description', 'Description', 'In stock?', 'Stock', 'Regular price', 'Sale price', 'Categories', 'Tags', 'Images', 'Position', 'Parent', 'Attribute 1 name', 'Attribute 1 value(s)', 'Attribute 1 visible', 'Attribute 1 global']
  // WooCommerce splits lists on commas unless they are written \, (so a backslash of its own is dropped), and keeps options apart with |.
  const listed = (text: string) => text.replaceAll('\\', '').replaceAll(',', '\\,')
  // A former price is the regular price, and the price people pay is the sale price.
  const prices = (price: string, compare: string) => {
    const now = amount(price)
    const before = amount(compare)
    return before && now && Number(before) > Number(now) ? [before, now] : [now, '']
  }
  const stock = (value: null | number) => (value === null ? ['1', ''] : [value > 0 ? '1' : '0', String(value)])
  const rows: (number | string)[][] = [header]
  // Products keep the order they have here, as WooCommerce's custom order.
  products.forEach((item, position) => {
    const sku = `web-end-${item.id}`
    const options = data.variantsOf.get(item.id) ?? []
    const description = paragraphs(item.body)
    const image = link.photo(item.image_url)
    const published = item.published ? '1' : '-1'
    const groups = [listed(item.category), tagged ? item.collection : '']
    if (!options.length) {
      rows.push(['simple', sku, item.title, published, '', description, ...stock(item.stock), ...prices(item.price, item.compare_price), ...groups, image, position + 1, '', '', '', '', ''])
      return
    }
    const names = options.map((option) => listed(option.name.replaceAll('|', '/').trim()))
    rows.push(['variable', sku, item.title, published, '', description, '1', '', '', '', ...groups, image, position + 1, '', 'Option', names.join(', '), '1', '0'])
    options.forEach((option, index) => {
      rows.push(['variation', `${sku}-${index + 1}`, `${item.title} - ${option.name}`, published, '', '', ...stock(option.stock), ...prices(option.price || item.price, option.compare_price || item.compare_price), '', '', '', index + 1, sku, 'Option', names[index], '', '0'])
    })
  })
  return csv(rows)
}

/** Old addresses in the CSV layout the Redirection plugin imports: source, target, regex, code. */
export async function redirectionCsv(env: Env, site: SiteRow, origin: string) {
  const { data, link } = await wordpressPlan(env, site, origin)
  return csv([['source', 'target', 'regex', 'code'], ...data.redirects.map((row) => [row.from_path, link.page(row.to_path), '0', '301'])])
}
