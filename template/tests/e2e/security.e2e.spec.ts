import { test, expect } from '@playwright/test'
import { adminToken, ensureMember, logIn, testMember } from '../helpers/seedUser'

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)
const image = { buffer: pixel, mimeType: 'image/png', name: 'pixel.png' }

test.describe('Anonymous visitors', () => {
  test.beforeEach(async () => {
    await adminToken()
  })

  test('cannot list users', async ({ request }) => {
    expect((await request.get('/api/users')).status()).toBe(403)
  })

  test('cannot create users', async ({ request }) => {
    const response = await request.post('/api/users', {
      data: { email: 'intruder@example.test', password: 'not-a-real-password' },
    })
    expect(response.status()).toBe(403)
  })

  test('cannot take over as the first admin', async ({ request }) => {
    const response = await request.post('/api/users/first-register', {
      data: {
        email: 'intruder@example.test',
        password: 'not-a-real-password',
        'confirm-password': 'not-a-real-password',
      },
    })
    expect(response.ok()).toBe(false)
  })

  test('cannot upload files', async ({ request }) => {
    const response = await request.post('/api/media', {
      multipart: { file: image, _payload: JSON.stringify({ alt: 'Anonymous' }) },
    })
    expect(response.status()).toBe(403)
  })

  test('cannot reach secret files or GraphQL', async ({ request }) => {
    expect((await request.get('/.env')).status()).toBe(404)
    expect((await request.get('/api/graphql')).ok()).toBe(false)
  })
})

test.describe('Members', () => {
  test.beforeEach(async () => {
    await ensureMember()
  })

  test('cannot use the admin panel', async ({ request }) => {
    const token = await logIn(testMember)
    const response = await request.get('/api/access', {
      headers: { Authorization: `JWT ${token}` },
    })
    expect(response.ok()).toBe(true)
    // Payload leaves permissions that are not granted out of this response.
    expect((await response.json()).canAccessAdmin).toBeFalsy()
  })

  test('only see their own account', async ({ request }) => {
    const token = await logIn(testMember)
    const response = await request.get('/api/users', {
      headers: { Authorization: `JWT ${token}` },
    })
    const { docs } = await response.json()
    expect(docs.map((doc: { email: string }) => doc.email)).toEqual([testMember.email])
  })

  test('cannot upload files', async ({ request }) => {
    const token = await logIn(testMember)
    const response = await request.post('/api/media', {
      headers: { Authorization: `JWT ${token}` },
      multipart: { file: image, _payload: JSON.stringify({ alt: 'Member' }) },
    })
    expect(response.status()).toBe(403)
  })
})

test.describe('Admins', () => {
  test('can upload an image', async ({ request }) => {
    const token = await adminToken()
    const upload = await request.post('/api/media', {
      headers: { Authorization: `JWT ${token}` },
      multipart: {
        file: { ...image, name: `pixel-${Date.now()}.png` },
        _payload: JSON.stringify({ alt: 'Admin upload' }),
      },
    })
    expect(upload.status()).toBe(201)
  })

  test('uploaded images are public', async ({ request }) => {
    // `next start` reaches local R2 through a proxy that cannot read file metadata
    // (cloudflare/workers-sdk#6047), so this runs in dev mode and is rechecked after deploy.
    test.skip(process.env.GATES_RUNTIME === 'next-start', 'Not testable on this local server')
    const token = await adminToken()
    const upload = await request.post('/api/media', {
      headers: { Authorization: `JWT ${token}` },
      multipart: {
        file: { ...image, name: `pixel-${Date.now()}.png` },
        _payload: JSON.stringify({ alt: 'Admin upload' }),
      },
    })
    expect(upload.status()).toBe(201)
    const { doc } = await upload.json()

    const file = await request.get(doc.url)
    expect(file.status()).toBe(200)
    expect(file.headers()['content-type']).toContain('image/png')
  })
})
