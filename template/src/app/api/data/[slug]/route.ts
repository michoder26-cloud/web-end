import config from '@payload-config'
import { getPayload } from 'payload'

import { isSameOrigin, validateRecord, type FieldDefinition } from '@/lib/data'

const maxBodyBytes = 32 * 1024
const maxPerHour = 200

const safePath = (value: unknown) =>
  typeof value === 'string' && /^\/[a-z0-9-]*$/.test(value) ? value : '/'

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const back = (path: string, state: 'error' | 'sent') =>
    Response.redirect(new URL(`${path}?${state}=${slug}#form-${slug}`, request.url), 303)

  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 })
  if (Number(request.headers.get('content-length') || 0) > maxBodyBytes) return back('/', 'error')

  const form = await request.formData().catch((): null => null)
  if (!form) return back('/', 'error')

  const path = safePath(form.get('page'))
  // Bots fill in the hidden field. Tell them it worked and keep nothing.
  if (form.get('website')) return back(path, 'sent')

  const payload = await getPayload({ config: await config })
  const { docs } = await payload.find({
    collection: 'data-types',
    depth: 0,
    limit: 1,
    where: { slug: { equals: slug } },
  })
  const definition = docs[0]
  if (!definition || definition.whoCanSubmit === 'nobody') return back(path, 'error')

  // The owner always comes from the login, never from the form.
  const { user } = await payload.auth({ headers: request.headers })
  if (definition.whoCanSubmit === 'members' && !user) {
    return Response.redirect(new URL('/login', request.url), 303)
  }

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const recent = await payload.count({
    collection: 'records',
    where: { and: [{ dataType: { equals: definition.id } }, { createdAt: { greater_than: since } }] },
  })
  if (recent.totalDocs >= maxPerHour) return back(path, 'error')

  const input = Object.fromEntries(
    [...form.entries()].filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
  const result = validateRecord((definition.fields ?? []) as FieldDefinition[], input)
  if (!result.ok) return back(path, 'error')

  try {
    await payload.create({
      collection: 'records',
      data: { data: result.data as never, dataType: definition.id, owner: user?.id, status: 'new' },
    })
    return back(path, 'sent')
  } catch {
    return back(path, 'error')
  }
}
