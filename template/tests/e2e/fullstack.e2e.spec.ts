import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { test, expect, type Page } from '@playwright/test'

import { adminToken, createApiKey } from '../helpers/seedUser'

const baseURL = process.env.BASE_URL || 'http://localhost:3000'
const password = 'local-e2e-member-password'
const ana = `ana-${Date.now()}@example.test`
const ben = `ben-${Date.now()}@example.test`

type Result = { content: { text: string }[]; isError?: boolean }

test.describe('Full-stack features built through MCP', () => {
  test.describe.configure({ mode: 'serial' })

  let client: Client

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = (await client.callTool({ name, arguments: args })) as Result
    const text = result.content[0]?.text ?? ''
    let data: any = text
    try {
      data = JSON.parse(text)
    } catch {
      // Plain message.
    }
    return { data, isError: Boolean(result.isError), text }
  }

  const signUp = async (page: Page, email: string) => {
    await page.goto('/signup')
    await page.locator('input[name="email"]').fill(email)
    await page.locator('input[name="password"]').fill(password)
    await page.locator('form[action="/api/account/signup"] button').click()
    await expect(page).toHaveURL(/\/account$/)
  }

  test.beforeAll(async () => {
    client = new Client({ name: 'web-end-tests', version: '1.0.0' })
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/api/mcp', baseURL), {
        requestInit: { headers: { Authorization: `Bearer ${await createApiKey(await adminToken())}` } },
      }),
    )
    const saved = await call('save_data_type', {
      slug: 'bookings',
      name: 'Bookings',
      whoCanSubmit: 'anyone',
      whoCanSee: 'owner',
      fields: [
        { name: 'guest', label: 'Name', type: 'text', required: true },
        { name: 'contact', label: 'Email', type: 'email', required: true },
        { name: 'day', label: 'Date', type: 'date', required: true },
        { name: 'seats', label: 'Seats', type: 'number', required: true },
        { name: 'area', label: 'Area', type: 'select', options: ['Inside', 'Garden'] },
      ],
    })
    expect(saved.isError).toBe(false)
    await call('save_data_type', {
      slug: 'reviews',
      name: 'Reviews',
      whoCanSubmit: 'members',
      whoCanSee: 'public',
      fields: [
        { name: 'title', label: 'Title', type: 'text', required: true, public: true },
        { name: 'body', label: 'Review', type: 'textarea', public: true },
        { name: 'private_note', label: 'Note to owner', type: 'text' },
      ],
    })
    const page = await call('save_page', {
      slug: 'book',
      title: 'Book a table',
      description: 'Book a table at the cafe, inside or in the garden, and we will confirm it with you the same day.',
      published: true,
      blocks: [
        { type: 'hero', heading: 'Book a table' },
        { type: 'dataForm', dataType: 'bookings', heading: 'Your booking', buttonLabel: 'Request table', sentMessage: 'Booking received' },
        { type: 'dataForm', dataType: 'reviews', heading: 'Write a review', buttonLabel: 'Send review', sentMessage: 'Review received' },
        { type: 'dataList', dataType: 'reviews', heading: 'What people say' },
      ],
    })
    expect(page.isError).toBe(false)
  })

  test.afterAll(async () => {
    await call('update_site', { allowSignup: false })
    for (const slug of ['book', 'members-area', 'journal', 'post-one']) await call('delete_page', { slug })
    for (const slug of ['bookings', 'reviews', 'open-type']) {
      await call('delete_data_type', { confirmEntriesDeleted: true, slug })
    }
    await client.close()
  })

  test('a visitor sends a form and the owner reads it', async ({ page }) => {
    await page.goto('/book')
    const form = page.locator('form[action="/api/data/bookings"]')
    await form.locator('input[name="guest"]').fill('Ana')
    await form.locator('input[name="contact"]').fill('ana@example.test')
    await form.locator('input[name="day"]').fill('2027-03-01')
    await form.locator('input[name="seats"]').fill('4')
    await form.locator('select[name="area"]').selectOption('Garden')
    await form.locator('button').click()
    await expect(page.locator('[role="status"]')).toHaveText('Booking received')

    const { data } = await call('list_records', { dataType: 'bookings' })
    expect(data.total).toBe(1)
    expect(data.entries[0].data).toEqual({ area: 'Garden', contact: 'ana@example.test', day: '2027-03-01', guest: 'Ana', seats: 4 })
    expect(data.entries[0].status).toBe('new')

    const updated = await call('update_record', { id: data.entries[0].id, status: 'confirmed' })
    expect(updated.data.entry.status).toBe('confirmed')
  })

  test('bad or tampered form posts are not saved', async ({ request }) => {
    const send = (form: Record<string, string>) =>
      request.post('/api/data/bookings', { form: { page: '/book', ...form }, maxRedirects: 0 })
    const good = { contact: 'x@example.test', day: '2027-03-02', guest: 'Good', seats: '2' }

    for (const bad of [
      { ...good, contact: 'not-an-email' },
      { ...good, day: 'tomorrow' },
      { ...good, seats: 'many' },
      { ...good, area: 'Roof' },
      { contact: 'x@example.test' },
    ]) {
      expect((await send(bad)).headers().location).toContain('error=bookings')
    }

    expect((await send({ ...good, website: 'https://spam.test' })).headers().location).toContain('sent=bookings')
    const before = (await call('list_records', { dataType: 'bookings' })).data.total
    expect(before).toBe(1)

    const tampered = await send({ ...good, owner: '1', roles: 'admin', status: 'published', sneaky: 'value' })
    expect(tampered.headers().location).toContain('sent=bookings')
    const { data } = await call('list_records', { dataType: 'bookings' })
    expect(data.total).toBe(2)
    expect(data.entries[0].status).toBe('new')
    expect(data.entries[0].fromMember).toBe(false)
    expect(data.entries[0].data.sneaky).toBeUndefined()
  })

  test('form posts from another website are refused', async ({ request }) => {
    const response = await request.post('/api/data/bookings', {
      form: { contact: 'x@example.test', day: '2027-03-02', guest: 'Other', seats: '2' },
      headers: { Origin: 'https://evil.example' },
      maxRedirects: 0,
    })
    expect(response.status()).toBe(403)
  })

  test('visitors cannot reach entries or data types directly', async ({ request }) => {
    expect((await request.get('/api/records')).status()).toBe(403)
    expect((await request.get('/api/data-types')).status()).toBe(403)
    expect((await request.post('/api/records', { data: { data: {}, dataType: 1 } })).status()).toBe(403)
    expect((await request.post('/api/data/does-not-exist', { form: { a: 'b' }, maxRedirects: 0 })).headers().location).toContain('error=')
  })

  test('signup stays closed until the owner opens it', async ({ page, request }) => {
    expect((await page.goto('/signup'))?.status()).toBe(404)
    const closed = await request.post('/api/account/signup', {
      form: { email: 'early@example.test', password },
      maxRedirects: 0,
    })
    expect(closed.headers().location).toContain('error=1')
    await call('update_site', { allowSignup: true })
    expect((await page.goto('/signup'))?.status()).toBe(200)
  })

  test('signup rejects short passwords and role tampering', async ({ request }) => {
    const short = await request.post('/api/account/signup', {
      form: { email: 'short@example.test', password: 'short' },
      maxRedirects: 0,
    })
    expect(short.headers().location).toContain('error=1')

    const email = `tamper-${Date.now()}@example.test`
    await request.post('/api/account/signup', {
      form: { email, password, roles: 'admin' },
      maxRedirects: 0,
    })
    const { data } = await call('list_members', {})
    const account = data.accounts.find((item: { email: string }) => item.email === email)
    expect(account.roles).toEqual(['member'])
  })

  test('wrong passwords do not log in', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[name="email"]').fill('nobody@example.test')
    await page.locator('input[name="password"]').fill('wrong-password-here')
    await page.locator('form[action="/api/account/login"] button').click()
    await expect(page.locator('[role="alert"]')).toBeVisible()
    await page.goto('/account')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('members see only their own entries, and public lists show only public fields', async ({ browser }) => {
    const first = await (await browser.newContext()).newPage()
    await signUp(first, ana)

    await first.goto('/book')
    const form = first.locator('form[action="/api/data/reviews"]')
    await form.locator('input[name="title"]').fill('<b>Lovely</b> place')
    await form.locator('textarea[name="body"]').fill('Great coffee.')
    await form.locator('input[name="private_note"]').fill('secret-note-for-owner')
    await form.locator('button').click()
    await expect(first.locator('[role="status"]')).toHaveText('Review received')

    await first.goto('/account')
    await expect(first.locator('.account__record')).toContainText('secret-note-for-owner')

    const second = await (await browser.newContext()).newPage()
    await signUp(second, ben)
    await expect(second.locator('main')).not.toContainText('secret-note-for-owner')
    const seen = await second.request.get('/api/records')
    expect((await seen.json()).docs).toEqual([])

    // Unreviewed entries stay off the public page.
    const visitor = await (await browser.newContext()).newPage()
    await visitor.goto('/book')
    await expect(visitor.locator('main')).not.toContainText('Lovely')

    const { data } = await call('list_records', { dataType: 'reviews' })
    expect(data.entries[0].fromMember).toBe(true)
    await call('update_record', { id: data.entries[0].id, status: 'published' })

    await visitor.goto('/book')
    await expect(visitor.locator('.block--list h3')).toHaveText('<b>Lovely</b> place')
    await expect(visitor.locator('main')).toContainText('Great coffee.')
    expect(await visitor.content()).not.toContain('secret-note-for-owner')
  })

  test('visitors must log in to send a members-only form', async ({ page, request }) => {
    await page.goto('/book')
    await expect(page.locator('form[action="/api/data/reviews"]')).toHaveCount(0)
    const response = await request.post('/api/data/reviews', {
      form: { page: '/book', title: 'Anonymous review' },
      maxRedirects: 0,
    })
    expect(response.headers().location).toContain('/login')
    const { data } = await call('list_records', { dataType: 'reviews' })
    expect(data.total).toBe(1)
  })

  test('members-only pages stay private and drafts stay hidden', async ({ browser, request }) => {
    await call('save_page', {
      slug: 'members-area',
      title: 'Members area',
      description: 'A private area for members with information that is only meant for people who have an account.',
      published: true,
      visibility: 'members',
      blocks: [{ type: 'text', body: 'secret-members-text' }],
    })

    const visitor = await (await browser.newContext()).newPage()
    await visitor.goto('/members-area')
    await expect(visitor).toHaveURL(/\/login$/)
    const api = await request.get('/api/pages?where[slug][equals]=members-area')
    expect((await api.json()).docs).toEqual([])

    const member = await (await browser.newContext()).newPage()
    await signUp(member, `gamma-${Date.now()}@example.test`)
    await member.goto('/members-area')
    await expect(member.locator('main')).toContainText('secret-members-text')
    await expect(member.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  })

  test('a member can log out and delete their own account', async ({ browser }) => {
    const email = `delete-${Date.now()}@example.test`
    const page = await (await browser.newContext()).newPage()
    await signUp(page, email)

    await page.locator('form[action="/api/account/logout"] button').click()
    await page.goto('/account')
    await expect(page).toHaveURL(/\/login$/)

    await page.locator('input[name="email"]').fill(email)
    await page.locator('input[name="password"]').fill(password)
    await page.locator('form[action="/api/account/login"] button').click()
    await expect(page).toHaveURL(/\/account$/)

    await page.locator('input[name="confirm"]').check()
    await page.locator('form[action="/api/account/delete"] button').click()
    const { data } = await call('list_members', {})
    expect(data.accounts.map((item: { email: string }) => item.email)).not.toContain(email)
  })

  test('a blog lists its posts', async ({ page }) => {
    await call('save_page', {
      slug: 'post-one',
      title: 'Our first post',
      description: 'The first post on our journal, about how we choose and roast the beans we serve every morning.',
      published: true,
      category: 'journal',
      blocks: [{ type: 'text', body: 'Hello.' }],
    })
    await call('save_page', {
      slug: 'journal',
      title: 'Journal',
      description: 'News and stories from the cafe, about coffee, the people who drink it and the people who roast it.',
      published: true,
      blocks: [{ type: 'pageList', category: 'journal', heading: 'Latest posts' }],
    })
    await page.goto('/journal')
    await page.locator('.block--list a', { hasText: 'Our first post' }).click()
    await expect(page.locator('h1')).toHaveText('Our first post')
  })

  test('tools refuse unsafe definitions and check_site finds mistakes', async () => {
    const reserved = await call('save_data_type', {
      slug: 'open-type',
      name: 'Bad',
      whoCanSubmit: 'anyone',
      whoCanSee: 'owner',
      fields: [{ name: 'website', label: 'Trap', type: 'text' }],
    })
    expect(reserved.isError).toBe(true)

    const noOptions = await call('save_data_type', {
      slug: 'open-type',
      name: 'Bad',
      whoCanSubmit: 'anyone',
      whoCanSee: 'owner',
      fields: [{ name: 'choice', label: 'Choice', type: 'select' }],
    })
    expect(noOptions.isError).toBe(true)

    const reservedPage = await call('save_page', {
      slug: 'login',
      title: 'Fake login',
      description: 'A page trying to take over the login address, which must not be allowed by the site.',
      published: true,
      blocks: [{ type: 'text', body: 'Hello' }],
    })
    expect(reservedPage.isError).toBe(true)

    await call('save_data_type', {
      slug: 'open-type',
      name: 'Open',
      whoCanSubmit: 'nobody',
      whoCanSee: 'owner',
      fields: [{ name: 'contact', label: 'Email', type: 'email', public: true }],
    })
    await call('save_page', {
      slug: 'book',
      title: 'Book a table',
      description: 'Book a table at the cafe, inside or in the garden, and we will confirm it with you the same day.',
      published: true,
      blocks: [
        { type: 'hero', heading: 'Book a table' },
        { type: 'dataForm', dataType: 'open-type' },
        { type: 'text', body: 'Words' },
        { type: 'dataList', dataType: 'missing-type' },
      ],
    })
    const { data } = await call('check_site')
    const problems = data.problems.join(' ')
    expect(problems).toContain('nobody is allowed to send it')
    expect(problems).toContain('"missing-type" that does not exist')
    expect(problems).toContain('shows Email publicly')
  })
})
