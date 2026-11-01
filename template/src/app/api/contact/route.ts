import config from '@payload-config'
import { getPayload } from 'payload'

const maxBodyBytes = 16 * 1024

const safePath = (value: unknown) =>
  typeof value === 'string' && /^\/[a-z0-9-]*$/.test(value) ? value : '/'

const back = (request: Request, path: string, state: 'error' | 'sent') =>
  Response.redirect(new URL(`${path}?${state}=1#contact`, request.url), 303)

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > maxBodyBytes) return back(request, '/', 'error')

  const form = await request.formData().catch((): null => null)
  if (!form) return back(request, '/', 'error')

  const path = safePath(form.get('page'))
  // Bots fill in the hidden field. Tell them it worked and keep nothing.
  if (form.get('website')) return back(request, path, 'sent')

  const value = (name: string) => {
    const field = form.get(name)
    return typeof field === 'string' ? field.trim() : ''
  }

  try {
    const payload = await getPayload({ config: await config })
    await payload.create({
      collection: 'messages',
      data: { email: value('email'), message: value('message'), name: value('name'), page: path },
    })
    return back(request, path, 'sent')
  } catch {
    return back(request, path, 'error')
  }
}
