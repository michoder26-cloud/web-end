import config from '@payload-config'
import { generatePayloadCookie, generateExpiredPayloadCookie, getPayload } from 'payload'

import { isSameOrigin } from '@/lib/data'

const minPasswordLength = 10
const maxBodyBytes = 8 * 1024

const redirect = (request: Request, path: string, cookie?: string) => {
  const headers = new Headers({ Location: new URL(path, request.url).toString() })
  if (cookie) headers.append('Set-Cookie', cookie)
  return new Response(null, { headers, status: 303 })
}

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 })
  if (Number(request.headers.get('content-length') || 0) > maxBodyBytes) {
    return new Response('Too large', { status: 413 })
  }

  const payload = await getPayload({ config: await config })
  const users = payload.collections.users.config
  const form = await request.formData().catch((): null => null)
  const text = (name: string) => {
    const value = form?.get(name)
    return typeof value === 'string' ? value : ''
  }
  const email = text('email').trim().toLowerCase()
  const password = text('password')
  const logIn = async () => {
    const { token } = await payload.login({ collection: 'users', data: { email, password } })
    const cookie = generatePayloadCookie({
      collectionAuthConfig: users.auth,
      cookiePrefix: payload.config.cookiePrefix,
      token: token as string,
    })
    return redirect(request, '/account', cookie)
  }

  if (action === 'login') {
    try {
      return await logIn()
    } catch {
      return redirect(request, '/login?error=1')
    }
  }

  if (action === 'signup') {
    const site = await payload.findGlobal({ slug: 'site' })
    const owners = await payload.count({ collection: 'users' })
    // The first account owns the site, so it can only be made from the admin panel.
    if (!site.allowSignup || owners.totalDocs === 0) return redirect(request, '/signup?error=1')
    if (form?.get('website')) return redirect(request, '/login')
    if (password.length < minPasswordLength) return redirect(request, '/signup?error=1')
    try {
      await payload.create({ collection: 'users', data: { email, password, roles: ['member'] } })
      return await logIn()
    } catch {
      return redirect(request, '/signup?error=1')
    }
  }

  const expired = generateExpiredPayloadCookie({
    collectionAuthConfig: users.auth,
    cookiePrefix: payload.config.cookiePrefix,
  })

  if (action === 'logout') return redirect(request, '/', expired)

  if (action === 'delete') {
    const { user } = await payload.auth({ headers: request.headers })
    if (!user) return redirect(request, '/login')
    if (user.roles?.includes('admin') || form?.get('confirm') !== 'on') return redirect(request, '/account')
    await payload.delete({ collection: 'records', where: { owner: { equals: user.id } } })
    await payload.delete({ collection: 'users', id: user.id })
    return redirect(request, '/', expired)
  }

  return new Response('Not found', { status: 404 })
}
