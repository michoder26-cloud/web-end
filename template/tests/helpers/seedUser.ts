import { request } from '@playwright/test'
import { randomUUID } from 'node:crypto'

/** Only ever used against the throwaway test database. */
export const testAdmin = {
  email: 'admin@example.test',
  password: 'local-e2e-only-password',
}

export const testMember = {
  email: 'member@example.test',
  password: 'local-e2e-only-password',
}

const baseURL = process.env.BASE_URL || 'http://localhost:3000'

/** Each call gets its own connection, so a login never leaks a cookie into a test's `request`. */
async function withApi<T>(run: (api: Awaited<ReturnType<typeof request.newContext>>) => Promise<T>) {
  const api = await request.newContext({ baseURL })
  try {
    return await run(api)
  } finally {
    await api.dispose()
  }
}

export function logIn(user: { email: string; password: string }): Promise<string> {
  return withApi(async (api) => {
    const response = await api.post('/api/users/login', { data: user })
    if (!response.ok()) throw new Error(`Login failed with ${response.status()}`)
    return (await response.json()).token
  })
}

/** Creates the first account if the site has none, then logs in. Returns the API token. */
export async function adminToken(): Promise<string> {
  await withApi((api) =>
    api.post('/api/users/first-register', {
      data: { ...testAdmin, 'confirm-password': testAdmin.password },
    }),
  )
  return logIn(testAdmin)
}

/** Turns on an API key for an account and returns it, as the owner would in the admin panel. */
export function createApiKey(token: string, email?: string): Promise<string> {
  return withApi(async (api) => {
    const headers = { Authorization: `JWT ${token}` }
    const { user: self } = await (await api.get('/api/users/me', { headers })).json()
    const { docs } = await (await api.get('/api/users?limit=100', { headers })).json()
    const user = email ? docs.find((doc: { email: string }) => doc.email === email) : self
    const apiKey = randomUUID()
    const response = await api.patch(`/api/users/${user.id}`, {
      data: { apiKey, enableAPIKey: true },
      headers,
    })
    if (!response.ok()) throw new Error(`Could not set the key: ${response.status()}`)
    return apiKey
  })
}

/** Creates a normal member through the API, as an admin would. */
export async function ensureMember(): Promise<void> {
  const token = await adminToken()
  await withApi((api) =>
    api.post('/api/users', {
      data: testMember,
      headers: { Authorization: `JWT ${token}` },
    }),
  )
}
