// Tests one running site from a fresh install, using the official MCP client as Claude would.
// Usage: BASE_URL=http://localhost:8799 node test/smoke.mjs [--load 30]
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const base = process.env.BASE_URL || 'http://localhost:8799'
const loadIndex = process.argv.indexOf('--load')
const loadCount = loadIndex > -1 ? Number(process.argv[loadIndex + 1]) : 0
let failed = 0

const check = (ok, name, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : `: ${detail}`}`)
  if (!ok) failed++
}

// First run
const welcome = await fetch(base)
check((await welcome.text()).includes('Get my Claude link'), 'a fresh install shows the setup page')
check((await fetch(`${base}/owner/aaaaaaaa-bbbbbbbb-cccccccc-dddddddd`)).status === 404, 'nothing else is open before setup')

const claimed = await fetch(`${base}/setup`, { method: 'POST', redirect: 'manual' })
const claimedBody = await claimed.text()
const code = claimedBody.match(/\/mcp\/([a-z0-9-]{20,60})/)?.[1]
check(Boolean(code), 'setup gives the owner a private link')
check(claimed.headers.get('referrer-policy') === 'no-referrer', 'the private page never sends its address to other sites')

const stranger = await fetch(`${base}/setup`, { method: 'POST', redirect: 'manual' })
check(stranger.status === 303 && !(await stranger.text()).includes('/mcp/'), 'nobody else can claim the site afterwards')

const client = new Client({ name: 'web-end-smoke', version: '1.0.0' })
await client.connect(new StreamableHTTPClientTransport(new URL(`/mcp/${code}`, base)))
const call = async (name, args = {}) => {
  const result = await client.callTool({ name, arguments: args })
  const text = result.content[0]?.text ?? ''
  let data = text
  try {
    data = JSON.parse(text)
  } catch {
    // Plain message.
  }
  return { data, isError: Boolean(result.isError), text }
}

// Access
const rpc = (path) =>
  fetch(`${base}${path}`, {
    body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'tools/list' }),
    headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
    method: 'POST',
  })
check((await rpc('/mcp')).status === 404, 'MCP without the secret link is refused')
check((await rpc('/mcp/aaaaaaaa-bbbbbbbb-cccccccc-dddddddd')).status === 404, 'MCP with a wrong link is refused')
check((await fetch(`${base}/owner/aaaaaaaa-bbbbbbbb-cccccccc-dddddddd`)).status === 404, 'the back office with a wrong link is refused')

const { tools } = await client.listTools()
check(tools.length === 8, 'lists the tools', tools.map((tool) => tool.name).join(','))
check(client.getInstructions()?.includes('web team'), 'gives Claude its working method')

// Building
const page = {
  slug: 'home',
  title: 'Smoke Test Cafe',
  description: 'A sample cafe used to test that web-end builds a working site from a conversation with Claude.',
  published: true,
  blocks: [
    { type: 'hero', heading: 'Fresh coffee <script>window.x=1</script>', text: 'Roasted here', buttonLabel: 'Book', buttonHref: '/book', layout: 'centered' },
    { type: 'features', tone: 'tint', heading: 'Why us', items: [{ title: 'Fresh', text: 'Every week' }] },
    { type: 'html', code: '<p id="custom">Custom code</p><script>parent.document.body.innerHTML="hacked"</script>', height: 100 },
  ],
}
check(!(await call('save_page', page)).isError, 'saves a page')
const book = await call('save_page', {
  slug: 'book',
  title: 'Book a table',
  description: 'Book a table at the sample cafe, choosing a day and the number of seats you would like.',
  published: true,
  blocks: [
    { type: 'hero', heading: 'Book a table' },
    {
      type: 'form',
      name: 'bookings',
      buttonLabel: 'Request',
      sentMessage: 'Booking received',
      fields: [
        { name: 'guest', label: 'Name', type: 'text', required: true },
        { name: 'contact', label: 'Email', type: 'email', required: true },
        { name: 'seats', label: 'Seats', type: 'number', required: true },
        { name: 'area', label: 'Area', type: 'select', options: ['Inside', 'Garden'] },
      ],
    },
  ],
})
check(!book.isError, 'saves a page with a form', book.text)
await call('update_site', { name: 'Smoke Test Cafe', style: 'warm', nav: [{ label: 'Book', href: '/book' }], accent: '#a4471a', customCss: '.site-name{letter-spacing:1px}</style><script>bad()</script>' })

const home = await fetch(base)
const body = await home.text()
check(home.status === 200, 'shows the page to anyone', `${home.status}`)
check(body.includes('Fresh coffee &lt;script&gt;'), 'shows HTML in text as plain words')
check(!/<script>window\.x/.test(body), 'does not run script tags from content')
check(body.includes('sandbox="allow-scripts allow-forms"') && !body.includes('allow-same-origin'), 'custom code runs in a sandbox')
check(!/<script>bad/.test(body), 'custom CSS cannot break out into a script')
check(body.includes('href="/book"'), 'links work at the site root')
check(!home.headers.get('x-robots-tag'), 'search engines can find the site')
check((home.headers.get('content-security-policy') ?? '').includes("script-src 'none'"), 'the page itself cannot run scripts')
check((await fetch(`${base}/site.css`)).status === 200, 'serves the site styles')
check((await fetch(`${base}/fonts/fonts.css`)).status === 200, 'serves the fonts')
check((await (await fetch(`${base}/sitemap.xml`)).text()).includes('/book'), 'has a sitemap')
check((await (await fetch(`${base}/robots.txt`)).text()).includes('Disallow: /owner/'), 'keeps private areas out of search')

for (const [name, block] of [
  ['a javascript: link', { type: 'hero', heading: 'x', buttonLabel: 'Go', buttonHref: 'javascript:alert(1)' }],
  ['an unsafe image link', { type: 'hero', heading: 'x', imageUrl: 'javascript:alert(1)' }],
]) {
  check((await call('save_page', { ...page, slug: 'bad', blocks: [block] })).isError, `rejects ${name}`)
}
check((await call('save_page', { ...page, slug: 'owner' })).isError, 'cannot take over the back office address')
check((await call('update_site', { accent: 'red;background:url(x)' })).isError, 'rejects unsafe colours')
check(!(await call('save_page', { ...page, slug: 'draft', published: false })).isError && (await fetch(`${base}/draft`)).status === 404, 'hides drafts from visitors')

// Back end
const send = (form) => fetch(`${base}/form/book/bookings`, { body: new URLSearchParams(form), method: 'POST', redirect: 'manual' })
const good = { contact: 'ana@example.test', guest: '<b>Ana</b>', seats: '4', area: 'Garden' }
check(((await send({ ...good, roles: 'admin', status: 'done' })).headers.get('location') ?? '').includes('sent=bookings'), 'accepts a good form entry')
for (const [name, form] of [
  ['a bad email', { ...good, contact: 'nope' }],
  ['a bad number', { ...good, seats: 'many' }],
  ['an unknown choice', { ...good, area: 'Roof' }],
  ['a missing field', { guest: 'Ana' }],
]) {
  check(((await send(form)).headers.get('location') ?? '').includes('error=bookings'), `rejects ${name}`)
}
await send({ ...good, website: 'https://spam.test' })
const entries = await call('list_entries', {})
check(entries.data.length === 1, 'keeps only the good entry', JSON.stringify(entries.data).slice(0, 200))
check(entries.data[0]?.status === 'new' && entries.data[0]?.data.roles === undefined, 'drops fields the form did not define')

const office = await fetch(`${base}/owner/${code}`)
const officeBody = await office.text()
check(office.status === 200 && officeBody.includes('Seats'), 'the back office shows entries with their labels')
check(officeBody.includes('&lt;b&gt;Ana&lt;/b&gt;'), 'the back office shows entries as plain text')
check(office.headers.get('x-robots-tag') === 'noindex' && office.headers.get('referrer-policy') === 'no-referrer', 'the back office stays private')

const id = entries.data[0].id
const noAccess = await fetch(`${base}/owner/aaaaaaaa-bbbbbbbb-cccccccc-dddddddd/entry/${id}`, { body: new URLSearchParams({ status: 'delete' }), method: 'POST', redirect: 'manual' })
check(noAccess.status === 404 && (await call('list_entries', {})).data.length === 1, 'a wrong link cannot delete an entry')
const confirm = await fetch(`${base}/owner/${code}/entry/${id}`, { body: new URLSearchParams({ status: 'confirmed' }), method: 'POST', redirect: 'manual' })
check(confirm.status === 303 && (await call('list_entries', {})).data[0].status === 'confirmed', 'the owner can confirm an entry in the back office')
check(!(await call('update_entry', { id, status: 'done' })).isError, 'the owner can update an entry through Claude')

const review = await call('check_site', {})
check(typeof review.data.ok === 'boolean', 'check_site runs')
console.log(`      check_site found: ${JSON.stringify(review.data.problems).slice(0, 300)}`)

if (loadCount) {
  const runs = [['view page', () => fetch(base)], ['list tools', () => client.listTools()], ['get_site', () => call('get_site')], ['check_site', () => call('check_site')], ['save_page', () => call('save_page', page)]]
  for (const [label, run] of runs) {
    const times = []
    let errors = 0
    for (let i = 0; i < loadCount; i++) {
      const started = Date.now()
      try {
        const result = await run()
        if (result?.status >= 500 || result?.isError) errors++
      } catch {
        errors++
      }
      times.push(Date.now() - started)
    }
    times.sort((a, b) => a - b)
    check(errors === 0, `${label}: ${loadCount} requests`, `${errors} errors`)
    console.log(`      median ${times[times.length >> 1]}ms, max ${times.at(-1)}ms`)
  }
}

await client.close()
console.log(failed ? `\n${failed} checks failed.` : '\nAll checks passed.')
process.exit(failed ? 1 : 0)
