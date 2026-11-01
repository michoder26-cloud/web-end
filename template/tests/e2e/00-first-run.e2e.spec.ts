import { test, expect } from '@playwright/test'

/** Runs first, on an empty database: nobody may claim the site through the public signup. */
test('a brand new site cannot be claimed through public signup', async ({ request }) => {
  const users = await request.post('/api/account/signup', {
    form: { email: 'intruder@example.test', password: 'not-a-real-password' },
    maxRedirects: 0,
  })
  expect(users.status()).toBe(303)
  expect(users.headers().location).toContain('/signup?error=1')

  const login = await request.post('/api/users/login', {
    data: { email: 'intruder@example.test', password: 'not-a-real-password' },
  })
  expect(login.ok()).toBe(false)
})
