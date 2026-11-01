import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { test, expect } from '@playwright/test'

import { adminToken, createApiKey, ensureMember, testMember } from '../helpers/seedUser'

const baseURL = process.env.BASE_URL || 'http://localhost:3000'

const connect = async (key: string) => {
  const client = new Client({ name: 'web-end-tests', version: '1.0.0' })
  await client.connect(
    new StreamableHTTPClientTransport(new URL('/api/mcp', baseURL), {
      requestInit: { headers: { Authorization: `Bearer ${key}` } },
    }),
  )
  return client
}

type Result = { content: { text: string; type: string }[]; isError?: boolean }

const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
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

const home = {
  slug: 'home',
  title: 'Moonlight Coffee, Vienna',
  description: 'A small neighbourhood coffee roaster in Vienna, open every morning with beans roasted on site each week.',
  published: true,
  blocks: [
    { type: 'hero', heading: 'Coffee roasted down the street.', text: 'Fresh beans every week.', buttonLabel: 'See the menu', buttonHref: '/menu' },
    { type: 'features', heading: 'Why people come back', items: [{ title: 'Roasted here', text: 'Every bean, every week.' }] },
    { type: 'faq', heading: 'Questions', items: [{ question: 'Do you sell beans?', answer: 'Yes, in 250 g bags.' }] },
    { type: 'contact', heading: 'Say hello' },
  ],
}

const menu = {
  slug: 'menu',
  title: 'Menu',
  description: 'Espresso, filter coffee and pastries, with prices, served at Moonlight Coffee in Vienna every morning.',
  published: true,
  blocks: [{ type: 'text', heading: 'Drinks', body: 'Espresso.\n\nFilter coffee.' }],
}

test.describe('MCP access', () => {
  test('refuses requests without a valid key', async ({ request }) => {
    const body = { id: 1, jsonrpc: '2.0', method: 'tools/list' }
    const headers = { Accept: 'application/json, text/event-stream' }
    expect((await request.post('/api/mcp', { data: body, headers })).status()).toBe(401)
    expect(
      (
        await request.post('/api/mcp', {
          data: body,
          headers: { ...headers, Authorization: 'Bearer 00000000-0000-0000-0000-000000000000' },
        })
      ).status(),
    ).toBe(401)
  })

  test('refuses members, even with their own key', async ({ request }) => {
    await ensureMember()
    const key = await createApiKey(await adminToken(), testMember.email)

    // Prove the key itself works, so the refusal below is about the role.
    const me = await request.get('/api/users/me', {
      headers: { Authorization: `users API-Key ${key}` },
    })
    expect((await me.json()).user?.email).toBe(testMember.email)

    const response = await request.post('/api/mcp', {
      data: { id: 1, jsonrpc: '2.0', method: 'tools/list' },
      headers: { Accept: 'application/json, text/event-stream', Authorization: `Bearer ${key}` },
    })
    expect(response.status()).toBe(403)
  })
})

test.describe('Building a site through MCP', () => {
  test.describe.configure({ mode: 'serial' })

  let client: Client

  test.beforeAll(async () => {
    client = await connect(await createApiKey(await adminToken()))
  })

  test.afterAll(async () => {
    await client?.close()
  })

  test('offers the expected tools and instructions', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'add_image',
      'add_record',
      'check_site',
      'delete_data_type',
      'delete_page',
      'delete_record',
      'get_page',
      'get_site_overview',
      'list_data_types',
      'list_images',
      'list_members',
      'list_messages',
      'list_records',
      'save_data_type',
      'save_page',
      'update_record',
      'update_site',
    ])
    expect(client.getInstructions()).toContain('web team')
    const { prompts } = await client.listPrompts()
    expect(prompts.map((prompt) => prompt.name)).toContain('build_my_website')
  })

  test('hides a draft until it is published', async ({ request }) => {
    const draft = await call(client, 'save_page', { ...menu, published: false })
    expect(draft.isError).toBe(false)
    expect((await request.get('/menu')).status()).toBe(404)

    await call(client, 'save_page', menu)
    expect((await request.get('/menu')).status()).toBe(200)
  })

  test('builds a home page that visitors can see', async ({ page }) => {
    const saved = await call(client, 'save_page', home)
    expect(saved.isError).toBe(false)

    await page.goto('/')
    await expect(page.locator('h1')).toHaveText('Coffee roasted down the street.')
    await expect(page).toHaveTitle('Moonlight Coffee, Vienna')
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', home.description)
    await expect(page.locator('h1')).toHaveCount(1)
  })

  test('changes the design and navigation straight away', async ({ page }) => {
    const updated = await call(client, 'update_site', {
      accent: '#7a2e12',
      email: 'hello@example.test',
      style: 'editorial',
      language: 'de',
      name: 'Moonlight Coffee',
      nav: [{ href: '/menu', label: 'Menu' }],
    })
    expect(updated.isError).toBe(false)

    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'de')
    await expect(page.locator('.site-name')).toHaveText('Moonlight Coffee')
    await expect(page.locator('body')).toHaveAttribute('style', /--accent:#7a2e12/)
    await page.locator('.site-header nav a', { hasText: 'Menu' }).click()
    await expect(page.locator('h1')).toHaveText('Menu')
    await expect(page).toHaveTitle('Menu | Moonlight Coffee')
  })

  test('every style shows every block without overflowing a phone screen', async ({ browser }) => {
    const longWord = 'Donaudampfschifffahrtsgesellschaftskapitän'
    const blocks = [
      { type: 'hero', eyebrow: 'Wien', heading: `${longWord} grüßt`, text: 'Text', buttonLabel: 'Los', buttonHref: '/menu', layout: 'centered' },
      { type: 'text', heading: 'Text', body: 'One.\n\nTwo.', tone: 'tint' },
      { type: 'features', heading: longWord, intro: 'Intro', items: [{ title: longWord, text: 'A' }, { title: 'B' }] },
      { type: 'steps', heading: 'Steps', items: [{ title: 'First', text: 'A' }, { title: 'Second' }], tone: 'dark' },
      { type: 'stats', heading: 'Figures', items: [{ value: '1,250,000+', label: 'Things' }, { value: '98%', label: 'Others' }] },
      { type: 'pricing', heading: 'Prices', plans: [{ name: 'Small', price: '120 €', features: 'One\nTwo', buttonLabel: 'Buy', buttonHref: '/menu' }, { name: 'Large', price: '240 €', highlighted: true }], tone: 'tint' },
      { type: 'testimonials', heading: 'Words', items: [{ quote: 'Good.', name: 'Ana', role: 'Client' }] },
      { type: 'team', heading: 'Team', members: [{ name: 'Ana', role: 'Owner', text: 'Hello' }], tone: 'tint' },
      { type: 'info', heading: 'Hours', items: [{ label: 'Mon', value: '7–16\nClosed at lunch' }], buttonLabel: 'Map', buttonHref: 'https://example.test/map' },
      { type: 'faq', heading: 'FAQ', items: [{ question: 'Q?', answer: 'A.' }] },
      { type: 'cta', heading: 'Come by', text: 'Soon', buttonLabel: 'Go', buttonHref: '/menu' },
      { type: 'contact', heading: 'Hello' },
    ]
    const saved = await call(client, 'save_page', { ...menu, slug: 'all-blocks', blocks })
    expect(saved.text).toContain('"saved": true')

    const phone = await browser.newPage({ viewport: { height: 800, width: 360 } })
    for (const style of ['studio', 'editorial', 'warm', 'bold', 'calm']) {
      await call(client, 'update_site', { style })
      await phone.goto('/all-blocks')
      await expect(phone.locator('body')).toHaveAttribute('data-style', style)
      await expect(phone.locator('h1')).toHaveCount(1)
      const overflow = await phone.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `${style} scrolls sideways`).toBeLessThanOrEqual(0)
    }
    await phone.close()
    await call(client, 'delete_page', { slug: 'all-blocks' })
  })

  test('reads a page back in the same shape it was written', async () => {
    const { data } = await call(client, 'get_page', { slug: 'home' })
    expect(data.blocks[0]).toMatchObject({ heading: home.blocks[0].heading, type: 'hero' })
    expect(data.blocks).toHaveLength(home.blocks.length)
  })

  test('check_site reports problems, then a clean site', async () => {
    await call(client, 'save_page', { ...menu, slug: 'broken', blocks: [{ type: 'hero', heading: 'A', buttonLabel: 'Go', buttonHref: '/nowhere' }] })
    const bad = await call(client, 'check_site')
    expect(bad.data.ok).toBe(false)
    expect(bad.text).toContain('/nowhere')

    await call(client, 'delete_page', { slug: 'broken' })
    const good = await call(client, 'check_site')
    expect(good.data.problems).toEqual([])
    expect(good.data.ok).toBe(true)
  })

  test('rejects unsafe or invalid content', async ({ request }) => {
    const script = await call(client, 'save_page', {
      ...menu,
      blocks: [{ type: 'hero', heading: 'Hi', buttonLabel: 'Go', buttonHref: 'javascript:alert(1)' }],
    })
    expect(script.isError).toBe(true)

    const slug = await call(client, 'save_page', { ...menu, slug: 'admin' })
    expect(slug.isError).toBe(true)

    const color = await call(client, 'update_site', { accent: 'red;background:url(x)' })
    expect(color.isError).toBe(true)

    const image = await call(client, 'add_image', { url: 'https://localhost/x.png', alt: 'Local file' })
    expect(image.isError).toBe(true)

    expect((await request.get('/menu')).status()).toBe(200)
  })

  test('shows text with HTML in it as plain words', async ({ page }) => {
    await call(client, 'save_page', {
      ...menu,
      slug: 'escape',
      blocks: [{ type: 'text', body: '<img src=x onerror="window.hacked=1"> hello' }],
    })
    await page.goto('/escape')
    expect(await page.evaluate(() => (window as unknown as { hacked?: number }).hacked)).toBeUndefined()
    await expect(page.getByText('<img src=x', { exact: false })).toBeVisible()
    await call(client, 'delete_page', { slug: 'escape' })
  })

  test('collects contact messages for the owner only', async ({ page, request }) => {
    await page.goto('/')
    await page.locator('input[name="name"]').fill('Ana')
    await page.locator('input[name="email"]').fill('ana@example.test')
    await page.locator('textarea[name="message"]').fill('Do you open on Sundays?')
    await page.locator('.contact-form button').click()
    await expect(page.locator('[role="status"]')).toBeVisible()

    const trap = await request.post('/api/contact', {
      form: { email: 'bot@example.test', message: 'Buy now', name: 'Bot', website: 'https://spam.test' },
      maxRedirects: 0,
    })
    expect(trap.status()).toBe(303)

    const { data } = await call(client, 'list_messages', {})
    expect(data.messages.map((item: { email: string }) => item.email)).toContain('ana@example.test')
    expect(data.messages.map((item: { email: string }) => item.email)).not.toContain('bot@example.test')

    expect((await request.get('/api/messages')).status()).toBe(403)
    expect(
      (await request.post('/api/globals/site', { data: { name: 'Hacked' } })).status(),
    ).toBe(403)
    expect(
      (await request.post('/api/pages', { data: { slug: 'hacked', title: 'Hacked' } })).status(),
    ).toBe(403)
  })
})
