import { itemMissing, localizeItem } from './languages'
import type { Block, Env, FormField, Item, Variant } from './types'

export const isAvailable = (item: Item) => {
  const options = item.variants ?? []
  return options.length ? options.some((option) => option.stock === null || option.stock > 0) : item.stock === null || item.stock > 0
}

async function attachVariants(env: Env, items: Item[]) {
  if (!items.length) return items
  const byId = new Map(items.map((item) => [item.id, item]))
  const { results } = await env.DB.prepare(`SELECT * FROM item_variants WHERE item_id IN (${items.map(() => '?').join(',')}) ORDER BY sort, id`).bind(...items.map((item) => item.id)).all<Variant>()
  for (const item of items) item.variants = []
  for (const variant of results) byId.get(variant.item_id)?.variants?.push(variant)
  return items
}

// In an extra language, products come in its words where they exist, and are marked when something isn't translated yet.
const inLanguage = (items: Item[], language?: null | string) => (language ? items.map((item) => ({ ...localizeItem(item, language), untranslated: itemMissing(item, language).length > 0 })) : items)

export async function getProduct(env: Env, siteId: number, id: number, language?: null | string) {
  const item = await env.DB.prepare('SELECT * FROM items WHERE site_id = ? AND id = ? AND published = 1').bind(siteId, id).first<Item>()
  if (!item) return null
  await attachVariants(env, [item])
  return inLanguage([item], language)[0]
}

export async function getProducts(env: Env, siteId: number, ids: number[], language?: null | string) {
  if (!ids.length) return []
  const { results } = await env.DB.prepare(`SELECT * FROM items WHERE site_id = ? AND published = 1 AND id IN (${ids.map(() => '?').join(',')})`).bind(siteId, ...ids).all<Item>()
  return inLanguage(await attachVariants(env, results), language)
}

/** Loads the items a page shows, and fills in form choices that come from a collection. */
export async function loadItems(env: Env, siteId: number, blocks: Block[], language?: null | string) {
  const names = new Set<string>()
  for (const block of blocks) {
    if (block.type === 'collection') names.add(block.collection)
    if (block.type === 'form') for (const field of block.fields as FormField[]) if (field.optionsFrom) names.add(field.optionsFrom)
  }
  const items = new Map<string, Item[]>()
  if (!names.size) return items
  const { results } = await env.DB.prepare('SELECT * FROM items WHERE site_id = ? AND published = 1 ORDER BY sort, id LIMIT 500').bind(siteId).all<Item>()
  const wanted = inLanguage(await attachVariants(env, results.filter((item) => names.has(item.collection))), language)
  for (const item of wanted) items.set(item.collection, [...(items.get(item.collection) ?? []), item])
  for (const block of blocks) {
    if (block.type !== 'form') continue
    for (const field of block.fields as FormField[]) {
      if (field.optionsFrom) field.options = (items.get(field.optionsFrom) ?? []).map((item) => item.title)
    }
  }
  return items
}

const signatures: [string, (bytes: Uint8Array) => boolean][] = [
  ['image/png', (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47],
  ['image/jpeg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['image/gif', (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46],
  ['image/webp', (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50],
]

const maxImageBytes = 1_000_000
const maxSiteImageBytes = 200_000_000

/** Stores a photo in the database, trusting its bytes and not the name or type the browser sent. */
export async function saveImage(env: Env, siteId: number, file: File, source: null | string = null) {
  if (file.size > maxImageBytes) return { error: 'That image is larger than 1 MB. Please make it smaller.' }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = signatures.find(([, matches]) => matches(bytes))?.[0]
  if (!type) return { error: 'Use a PNG, JPEG, WebP or GIF image.' }
  const used = await env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS total FROM media WHERE site_id = ?').bind(siteId).first<{ total: number }>()
  if ((used?.total ?? 0) + bytes.length > maxSiteImageBytes) return { error: 'The image storage is full. Delete some images first.' }
  const row = await env.DB.prepare('INSERT INTO media (site_id, name, type, size, bytes, source) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(siteId, file.name.slice(0, 120) || 'image', type, bytes.length, bytes.buffer, source)
    .first<{ id: number }>()
  return { url: `/media/${row!.id}` }
}

export async function showImage(env: Env, siteId: number, id: string) {
  const row = await env.DB.prepare('SELECT type, bytes FROM media WHERE site_id = ? AND id = ?').bind(siteId, Number(id)).first<{ bytes: number[]; type: string }>()
  if (!row) return null
  return new Response(new Uint8Array(row.bytes), {
    headers: { 'Cache-Control': 'public, max-age=86400', 'Content-Type': row.type, 'X-Content-Type-Options': 'nosniff' },
  })
}
