// Tests one running site from a fresh install, using the official MCP client as Claude would.
// Usage: BASE_URL=http://localhost:8799 node tests/smoke.mjs [--load 30]
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
check(tools.length === 14, 'lists the tools', tools.map((tool) => tool.name).join(','))
check(client.getInstructions()?.includes('web team'), 'gives Claude its working method')
check(client.getInstructions()?.includes('2 to 4 short choices') && client.getInstructions()?.includes('Only offer choices these tools can really deliver'), 'tells Claude to ask with choices and only offer what works')

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
check(body.includes('src="/frame/home/2"') && !body.includes('srcdoc'), 'custom code loads from its own address so its scripts can run')
const frame = await fetch(`${base}/frame/home/2`)
check((await frame.text()).includes('<p id="custom">') && (frame.headers.get('content-security-policy') ?? '').startsWith('sandbox allow-scripts allow-forms;'), 'custom code gets a sandbox with no access to the site')
check(!(frame.headers.get('content-security-policy') ?? '').includes('allow-same-origin') && frame.headers.get('x-robots-tag') === 'noindex', 'custom code stays apart from the site and out of search')
check((await fetch(`${base}/frame/home/0`)).status === 404 && (await fetch(`${base}/frame/home/99`)).status === 404, 'only custom code blocks can load this way')
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
check((await fetch(`${base}/frame/draft/2`)).status === 404, 'hides custom code on drafts')

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

// Customer accounts
check((await fetch(`${base}/login`)).status === 404, 'login pages stay off until the owner turns accounts on')
await call('update_site', { accounts: true })
check((await (await fetch(base)).text()).includes('href="/login"'), 'turning accounts on adds a login link')
const postForm = (path, values, cookie) => fetch(`${base}${path}`, { body: new URLSearchParams(values), headers: cookie ? { Cookie: cookie } : {}, method: 'POST', redirect: 'manual' })
const sessionOf = (response) => (response.headers.get('set-cookie') ?? '').split(';')[0]
check((await (await postForm('/signup', { email: 'short@example.test', name: 'Short', password: '123' })).text()).includes('role="alert"'), 'rejects a short password')
check((await (await postForm('/signup', { email: 'not-an-email', name: 'Bad', password: 'password-123' })).text()).includes('role="alert"'), 'rejects a bad email')
const joined = await postForm('/signup', { email: 'Mali@Example.test', name: '<b>Mali</b>', password: 'correct-horse-1' })
const session = sessionOf(joined)
const setCookie = joined.headers.get('set-cookie') ?? ''
check(joined.status === 303 && /^session=[0-9a-f]{64}$/.test(session), 'a customer can sign up and is logged in')
check(setCookie.includes('HttpOnly') && setCookie.includes('SameSite=Lax'), 'the login cookie cannot be read by scripts or sent by other sites')
check((await (await postForm('/signup', { email: 'mali@example.test', name: 'Copy', password: 'another-pass-1' })).text()).includes('role="alert"'), 'one email cannot sign up twice')
const signedOut = await fetch(`${base}/account`, { redirect: 'manual' })
check(signedOut.status === 303 && (signedOut.headers.get('location') ?? '').includes('/login'), 'the account page needs a login')
const accountPage = await fetch(`${base}/account`, { headers: { Cookie: session } })
const accountBody = await accountPage.text()
check(accountBody.includes('mali@example.test') && accountBody.includes('&lt;b&gt;Mali&lt;/b&gt;'), 'the account page shows the customer safely')
check(accountPage.headers.get('x-robots-tag') === 'noindex' && accountBody.includes('href="/account"'), 'account pages stay out of search and the menu knows who is logged in')
check((await fetch(`${base}/account`, { headers: { Cookie: `session=${'a'.repeat(64)}` }, redirect: 'manual' })).status === 303, 'a made-up login cookie is refused')
const wrongPassword = await (await postForm('/login', { email: 'mali@example.test', password: 'wrong-password' })).text()
const unknownEmail = await (await postForm('/login', { email: 'nobody@example.test', password: 'wrong-password' })).text()
check(wrongPassword.includes('role="alert"') && wrongPassword.replace(/value="[^"]*"/g, '') === unknownEmail.replace(/value="[^"]*"/g, ''), 'a failed login does not reveal who has an account')
const loggedIn = await postForm('/login', { email: 'mali@example.test', next: '/book', password: 'correct-horse-1' })
check(loggedIn.status === 303 && (loggedIn.headers.get('location') ?? '').endsWith('/book') && sessionOf(loggedIn).startsWith('session='), 'a customer can log in')
const away = await postForm('/login', { email: 'mali@example.test', next: 'https://evil.test', password: 'correct-horse-1' })
check((away.headers.get('location') ?? '').endsWith(`${new URL(base).host}/`), 'login never sends people to another site')
const customers = await call('list_customers', {})
check(customers.data.length === 1 && !customers.text.includes('hash') && !customers.text.includes('salt'), 'Claude sees customers but never their passwords')

// Database items
const item = await call('save_item', { collection: 'products', title: 'Cold brew <script>x</script>', price: '$5', body: 'Slow and smooth', sort: 2 })
check(!item.isError, 'saves a product', item.text)
await call('save_item', { collection: 'products', title: 'Beans', price: '$12', sort: 1 })
await call('save_item', { collection: 'products', title: 'Secret menu', published: false })
check((await call('save_item', { collection: 'products', title: 'x', imageUrl: 'javascript:alert(1)' })).isError, 'rejects an unsafe product image')
check((await call('save_item', { id: 99999, collection: 'products', title: 'x' })).isError, 'cannot change an item that does not exist')
check((await call('list_items', {})).data.length === 3, 'lists products')
const shopPage = {
  slug: 'shop',
  title: 'Shop',
  description: 'Everything in the sample cafe shop, with a form so that customers can place an order.',
  published: true,
  blocks: [
    { type: 'hero', heading: 'Shop' },
    { type: 'collection', collection: 'products', heading: 'Products', buttonLabel: 'Order', buttonHref: '#form-order', orderField: 'product' },
    { type: 'form', name: 'order', membersOnly: true, fields: [{ name: 'phone', label: 'Phone', type: 'phone', required: true }, { name: 'product', label: 'Product', type: 'select', required: true, optionsFrom: 'products' }] },
  ],
}
const savedShop = await call('save_page', shopPage)
check(!savedShop.isError, 'saves a shop page', savedShop.text)
const anonShop = await (await fetch(`${base}/shop`)).text()
check(anonShop.includes('Cold brew &lt;script&gt;') && !anonShop.includes('<script>x'), 'shows products as plain text')
check(anonShop.indexOf('Beans') < anonShop.indexOf('Cold brew') && !anonShop.includes('Secret menu'), 'orders products and hides unpublished ones')
check(anonShop.includes('?product=Beans#form-order'), 'each product button fills in the order form')
check(!anonShop.includes('name="phone"') && anonShop.includes('/login?next='), 'a members-only form asks visitors to log in')
const memberShop = await (await fetch(`${base}/shop?product=Beans`, { headers: { Cookie: session } })).text()
check(memberShop.includes('name="phone"') && /<option value="Beans" selected>/.test(memberShop), 'a logged-in customer sees the form with the product chosen')
check(!memberShop.includes('Secret menu'), 'unpublished products cannot be chosen')
const anonOrder = await postForm('/form/shop/order', { phone: '0812345678', product: 'Beans' })
check((anonOrder.headers.get('location') ?? '').includes('/login'), 'visitors cannot send a members-only form')
check(((await postForm('/form/shop/order', { phone: '0812345678', product: 'Secret menu' }, session)).headers.get('location') ?? '').includes('error=order'), 'the server refuses a product that is not on sale')
check(((await postForm('/form/shop/order', { phone: '0812345678', product: 'Beans' }, session)).headers.get('location') ?? '').includes('sent=order'), 'a customer can place an order')
const history = await (await fetch(`${base}/account`, { headers: { Cookie: session } })).text()
check(history.includes('Beans') && history.includes('0812345678'), 'customers see their own orders')
const other = await postForm('/signup', { email: 'other@example.test', name: 'Other', password: 'other-pass-123' })
const otherHistory = await (await fetch(`${base}/account`, { headers: { Cookie: sessionOf(other) } })).text()
check(!otherHistory.includes('0812345678'), "customers cannot see each other's orders")
check((await call('check_site', {})).data.problems.every((problem) => !problem.includes('collection')), 'check_site accepts a working collection')
const emptyShop = await call('save_page', { ...shopPage, slug: 'empty', blocks: [{ type: 'hero', heading: 'x' }, { type: 'collection', collection: 'nothing' }] })
check(!emptyShop.isError && (await call('check_site', {})).data.problems.some((problem) => problem.includes('nothing')), 'check_site finds a collection with no items')
await call('delete_page', { slug: 'empty' })

// Back office CMS
const owner = `${base}/owner/${code}`
for (const area of ['', '/pages', '/page/home', '/items', '/media', '/customers', '/settings', '/updates']) {
  const response = await fetch(`${owner}${area}`)
  check(response.status === 200 && response.headers.get('x-robots-tag') === 'noindex', `the back office opens: ${area || 'overview'}`)
}
for (const [method, area] of [['GET', '/settings'], ['POST', '/settings'], ['POST', '/pages'], ['POST', '/items'], ['POST', '/customers/1/reset']]) {
  check((await fetch(`${base}/owner/aaaaaaaa-bbbbbbbb-cccccccc-dddddddd${area}`, { method, redirect: 'manual' })).status === 404, `a wrong link cannot reach: ${method} ${area}`)
}

// Reads a form as a browser would, so the test saves exactly what the owner's editor would send.
const decode = (value) => value.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&')
const formValues = (body) => {
  const form = body.slice(body.indexOf('cms-form'))
  const values = new URLSearchParams()
  for (const match of form.matchAll(/<input ([^>]*)>|<textarea ([^>]*)>([\s\S]*?)<\/textarea>|<select ([^>]*)>([\s\S]*?)<\/select>/g)) {
    const attributes = match[1] ?? match[2] ?? match[4]
    const name = attributes.match(/name="([^"]*)"/)?.[1]
    if (!name) continue
    if (match[1] !== undefined) {
      if (attributes.includes('type="checkbox"')) {
        if (attributes.includes(' checked')) values.append(decode(name), 'on')
      } else values.append(decode(name), decode(attributes.match(/value="([^"]*)"/)?.[1] ?? ''))
    } else if (match[2] !== undefined) values.append(decode(name), decode(match[3]))
    else values.append(decode(name), decode(match[5].match(/<option value="([^"]*)" selected>/)?.[1] ?? match[5].match(/<option value="([^"]*)"/)?.[1] ?? ''))
  }
  return values
}
const everyBlock = [
  { type: 'hero', eyebrow: 'Eyebrow', heading: 'All blocks', text: 'Text', buttonLabel: 'Go', buttonHref: '/book', imageUrl: 'https://example.test/a.jpg', imageAlt: 'Photo', layout: 'split', tone: 'tint' },
  { type: 'text', heading: 'Heading', body: 'First\n\nSecond', tone: 'dark' },
  { type: 'split', heading: 'Split', body: 'Body', imageUrl: 'https://example.test/b.jpg', imageAlt: 'Alt', imageSide: 'left', buttonLabel: 'Go', buttonHref: '/book' },
  { type: 'features', heading: 'F', intro: 'I', items: [{ title: 'A', text: 'B' }, { title: 'C' }] },
  { type: 'steps', items: [{ title: 'One', text: 'Two' }] },
  { type: 'stats', items: [{ value: '1', label: 'One' }] },
  { type: 'pricing', plans: [{ name: 'P', price: '$1', note: 'N', features: 'A\nB', buttonLabel: 'Buy', buttonHref: '/book', highlighted: true }] },
  { type: 'testimonials', items: [{ quote: 'Q', name: 'N', role: 'R' }] },
  { type: 'team', members: [{ name: 'N', role: 'R', text: 'T', imageUrl: 'https://example.test/c.jpg' }] },
  { type: 'gallery', images: [{ imageUrl: 'https://example.test/d.jpg', imageAlt: 'A', caption: 'C' }] },
  { type: 'info', id: 'hours', heading: 'H', items: [{ label: 'L', value: 'V' }], buttonLabel: 'B', buttonHref: '/book' },
  { type: 'faq', items: [{ question: 'Q', answer: 'A' }] },
  { type: 'cta', heading: 'C', text: 'T', buttonLabel: 'B', buttonHref: '/book' },
  { type: 'form', name: 'all', heading: 'H', intro: 'I', buttonLabel: 'B', sentMessage: 'S', errorMessage: 'E', membersOnly: true, fields: [{ name: 'phone', label: 'P', type: 'phone', required: true }, { name: 'choice', label: 'C', type: 'select', options: ['A', 'B'] }, { name: 'item', label: 'I', type: 'select', optionsFrom: 'products' }] },
  { type: 'collection', id: 'list', collection: 'products', heading: 'H', intro: 'I', buttonLabel: 'B', buttonHref: '#form-all', orderField: 'item', limit: 3, filters: true },
  { type: 'html', code: '<p class="x">Custom "code" & more</p>', height: 120, title: 'T' },
]
await call('save_page', { slug: 'all-blocks', title: 'All blocks', description: 'A page with every kind of section, used to test that the back office editor keeps them all.', published: true, blocks: everyBlock })
const sortKeys = (value) => (Array.isArray(value) ? value.map(sortKeys) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort().map(([key, item]) => [key, sortKeys(item)])) : value)
const editorBody = await (await fetch(`${owner}/page/all-blocks`)).text()
const unchanged = formValues(editorBody)
unchanged.set('op', 'save')
const saveResult = await fetch(`${owner}/page/all-blocks`, { body: unchanged, method: 'POST', redirect: 'manual' })
const afterSave = (await call('get_page', { slug: 'all-blocks' })).data
check(saveResult.status === 303, 'the editor saves a page with every kind of section', saveResult.status === 303 ? '' : (await saveResult.text()).match(/role="alert">([^<]*)/)?.[1])
check(JSON.stringify(sortKeys(afterSave.blocks)) === JSON.stringify(sortKeys(everyBlock)), 'saving in the editor changes nothing by accident', JSON.stringify(afterSave.blocks).slice(0, 400))

const editing = formValues(await (await fetch(`${owner}/page/all-blocks`)).text())
editing.set('b0.heading', 'Edited in the back office')
editing.set('op', 'save')
await fetch(`${owner}/page/all-blocks`, { body: editing, method: 'POST', redirect: 'manual' })
check((await (await fetch(`${base}/all-blocks`, { headers: { Cookie: session } })).text()).includes('Edited in the back office'), 'text edited in the back office appears on the website')
const moving = formValues(await (await fetch(`${owner}/page/all-blocks`)).text())
moving.set('op', 'down:0')
await fetch(`${owner}/page/all-blocks`, { body: moving, method: 'POST', redirect: 'manual' })
check((await call('get_page', { slug: 'all-blocks' })).data.blocks[1].type === 'hero', 'sections can be moved')
const adding = formValues(await (await fetch(`${owner}/page/all-blocks`)).text())
adding.set('op', 'add:cta')
await fetch(`${owner}/page/all-blocks`, { body: adding, method: 'POST', redirect: 'manual' })
check((await call('get_page', { slug: 'all-blocks' })).data.blocks.length === everyBlock.length + 1, 'sections can be added')
const bad = formValues(await (await fetch(`${owner}/page/all-blocks`)).text())
bad.set('b1.buttonHref', 'javascript:alert(1)')
bad.set('op', 'save')
const badSave = await fetch(`${owner}/page/all-blocks`, { body: bad, method: 'POST', redirect: 'manual' })
check(badSave.status === 200 && (await badSave.text()).includes('Not saved') && (await call('get_page', { slug: 'all-blocks' })).data.blocks.every((block) => block.buttonHref !== 'javascript:alert(1)'), 'the editor refuses an unsafe link')

const created = await fetch(`${owner}/pages`, { body: new URLSearchParams({ slug: 'about', title: 'About us' }), method: 'POST', redirect: 'manual' })
check(created.status === 303 && !(await call('get_page', { slug: 'about' })).isError, 'the owner can add a page')
check((await fetch(`${owner}/pages`, { body: new URLSearchParams({ slug: 'login', title: 'Taken' }), method: 'POST', redirect: 'manual' })).status === 200 && (await call('get_page', { slug: 'login' })).isError, 'pages cannot take over system addresses')
const keep = await fetch(`${owner}/page/about/delete`, { method: 'POST', body: new URLSearchParams({}), redirect: 'manual' })
check(keep.status === 303 && !(await call('get_page', { slug: 'about' })).isError, 'deleting a page needs confirmation')
await fetch(`${owner}/page/about/delete`, { method: 'POST', body: new URLSearchParams({ confirm: 'on' }), redirect: 'manual' })
check((await call('get_page', { slug: 'about' })).isError, 'the owner can delete a page')

const settingsForm = formValues(await (await fetch(`${owner}/settings`)).text())
settingsForm.set('tagline', 'Edited tagline')
settingsForm.set('nav', 'Shop | /shop\nBook | /book')
const savedSettings = await fetch(`${owner}/settings`, { body: settingsForm, method: 'POST', redirect: 'manual' })
const siteAfter = (await call('get_site')).data
check(savedSettings.status === 303 && siteAfter.settings.tagline === 'Edited tagline' && siteAfter.settings.nav.length === 2 && siteAfter.settings.accounts === true, 'the owner can change settings in the back office')
const badColour = formValues(await (await fetch(`${owner}/settings`)).text())
badColour.set('accent', 'red;background:url(x)')
check((await (await fetch(`${owner}/settings`, { body: badColour, method: 'POST' })).text()).includes('Not saved'), 'the settings page refuses an unsafe colour')

// Images and products in the back office
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (char) => char.charCodeAt(0))
const upload = (bytes, name, type) => {
  const data = new FormData()
  data.append('file', new File([bytes], name, { type }))
  return fetch(`${owner}/media`, { body: data, method: 'POST', redirect: 'manual' })
}
check((await upload(png, 'pixel.png', 'image/png')).status === 303, 'the owner can upload an image')
const mediaBody = await (await fetch(`${owner}/media`)).text()
const mediaId = mediaBody.match(/\/media\/(\d+)/)?.[1]
const image = await fetch(`${base}/media/${mediaId}`)
const imageBytes = new Uint8Array(await image.arrayBuffer())
check(image.status === 200 && image.headers.get('content-type') === 'image/png' && image.headers.get('x-content-type-options') === 'nosniff' && imageBytes.length === png.length && imageBytes[0] === png[0] && imageBytes.at(-1) === png.at(-1), 'an uploaded image is served back intact')
check((await (await upload(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>'), 'bad.png', 'image/png')).text()).includes('Use a PNG'), 'a script disguised as an image is refused')
check((await (await upload(new Uint8Array(1_000_001), 'big.png', 'image/png')).text()).includes('larger than 1 MB'), 'an oversized image is refused')
const itemData = new FormData()
itemData.append('title', 'From the office')
itemData.append('collection', 'products')
itemData.append('price', '$9')
itemData.append('published', 'on')
itemData.append('file', new File([png], 'pixel.png', { type: 'image/png' }))
check((await fetch(`${owner}/items`, { body: itemData, method: 'POST', redirect: 'manual' })).status === 303, 'the owner can add a product with a photo')
const officeItem = (await call('list_items', {})).data.find((row) => row.title === 'From the office')
check(/^\/media\/\d+$/.test(officeItem?.image_url ?? ''), 'the uploaded photo is linked to the product')
check(/<img[^>]*src="\/media\/\d+"/.test(await (await fetch(`${base}/shop`)).text()), 'the product photo shows on the website')
const noConfirm = await fetch(`${owner}/items/${officeItem.id}/delete`, { method: 'POST', body: new URLSearchParams({}), redirect: 'manual' })
check(noConfirm.status === 303 && (await call('list_items', {})).data.some((row) => row.id === officeItem.id), 'deleting a product needs confirmation')
await fetch(`${owner}/items/${officeItem.id}/delete`, { method: 'POST', body: new URLSearchParams({ confirm: 'on' }), redirect: 'manual' })
check(!(await call('list_items', {})).data.some((row) => row.id === officeItem.id), 'the owner can delete a product')

// Forgotten passwords and logging out
const customerId = customers.data[0].id
const officeCustomers = await (await fetch(`${owner}/customers`)).text()
check(officeCustomers.includes('mali@example.test') && !/password_hash|salt/.test(officeCustomers), 'the back office lists customers with no passwords')
const resetPage = await (await fetch(`${owner}/customers/${customerId}/reset`, { method: 'POST' })).text()
const resetPath = resetPage.match(/\/reset\/[0-9a-f]{64}/)?.[0]
check(Boolean(resetPath), 'the owner can make a password reset link')
check((await (await postForm(resetPath, { password: 'short' })).text()).includes('role="alert"'), 'a reset still needs a good password')
const changed = await postForm(resetPath, { password: 'brand-new-pass-1' })
check(changed.status === 303, 'a customer can set a new password')
check((await fetch(`${base}/account`, { headers: { Cookie: session }, redirect: 'manual' })).status === 303, 'a new password logs out old sessions')
check((await (await fetch(`${base}${resetPath}`)).text()).includes('role="alert"'), 'a reset link works only once')
const again = await postForm('/login', { email: 'mali@example.test', password: 'brand-new-pass-1' })
const newSession = sessionOf(again)
check(again.status === 303 && newSession.startsWith('session='), 'the new password works')
const leaving = await postForm('/logout', {}, newSession)
check(leaving.status === 303 && (leaving.headers.get('set-cookie') ?? '').includes('Max-Age=0'), 'a customer can log out')
check((await fetch(`${base}/account`, { headers: { Cookie: newSession }, redirect: 'manual' })).status === 303, 'logging out ends the session on the server')
const mcpInBrowser = await fetch(`${base}/mcp/${code}`, { headers: { Accept: 'text/html' } })
check(mcpInBrowser.status === 405 && (await mcpInBrowser.text()).includes('for Claude'), 'opening the Claude link in a browser explains what it is')
const deleted = await fetch(`${owner}/customers/${customerId}/delete`, { body: new URLSearchParams({ confirm: 'on' }), method: 'POST', redirect: 'manual' })
check(deleted.status === 303 && !(await call('list_customers', {})).data.some((row) => row.id === customerId), 'the owner can delete a customer account')

// Cart and checkout
check((await fetch(`${base}/cart`)).status === 404 && (await fetch(`${base}/checkout`)).status === 404, 'the cart stays off until the owner turns it on')
const storePage = { slug: 'store', title: 'Store', description: 'Every product in the sample cafe store, ready to add to the cart and order for delivery.', published: true, blocks: [{ type: 'hero', heading: 'Store' }, { type: 'collection', collection: 'store', heading: 'Products' }] }
const coffee = (await call('save_item', { collection: 'store', title: 'Coffee <b>box</b>', price: '฿1,290', sort: 1 })).data.id
const mug = (await call('save_item', { collection: 'store', title: 'Mug', price: '฿250.50', sort: 2 })).data.id
const hiddenItem = (await call('save_item', { collection: 'store', title: 'Hidden', price: '฿1', published: false })).data.id
await call('save_item', { collection: 'store', title: 'Ask us', price: 'Call for price', sort: 3 })
await call('save_page', storePage)
await call('update_site', { cart: true, shippingFee: 50 })
check((await call('check_site', {})).data.problems.some((problem) => problem.includes('no payment method')), 'check_site finds a cart with no way to pay')
await call('update_site', { payTransfer: true, payCod: true })
check((await call('check_site', {})).data.problems.some((problem) => problem.includes('no transfer instructions')), 'check_site finds bank transfer with no instructions')
await call('update_site', { transferDetails: 'Test Bank 123-4-56789 <script>x</script>' })
check((await call('check_site', {})).data.problems.some((problem) => problem.includes('Ask us')), 'check_site finds a product with no usable price')
const store = await (await fetch(`${base}/store`)).text()
check(store.includes('action="/cart/add"') && store.includes(`name="item" type="hidden" value="${coffee}"`), 'priced products get an add to cart button')
check(!store.includes(`value="${hiddenItem}"`) && store.split('action="/cart/add"').length === 3, 'hidden products and products with no price cannot be added')
const addToCart = (id, cookie) => postForm('/cart/add', { item: String(id) }, cookie)
const cartCookieOf = (response) => (response.headers.get('set-cookie') ?? '').split(';')[0]
const added = await addToCart(coffee)
let cart = cartCookieOf(added)
check(added.status === 303 && cart === `cart=${coffee}:1` && (added.headers.get('set-cookie') ?? '').includes('HttpOnly'), 'adding to the cart works and the cookie holds no price')
cart = cartCookieOf(await addToCart(coffee, cart))
cart = cartCookieOf(await addToCart(mug, cart))
const cartBody = await (await fetch(`${base}/cart`, { headers: { Cookie: cart } })).text()
check(cartBody.includes('Coffee &lt;b&gt;box&lt;/b&gt;') && !cartBody.includes('<b>box'), 'the cart shows product names as plain text')
check(cartBody.includes('฿2,580') && cartBody.includes('฿250.50') && cartBody.includes('฿2,880.50'), 'the cart adds up prices and the delivery fee exactly')
check((await (await fetch(`${base}/store`, { headers: { Cookie: cart } })).text()).includes('(3)'), 'the menu shows how many items are in the cart')
await call('update_site', { nav: [{ label: 'Products', href: '#products' }] })
check((await (await fetch(`${base}/cart`, { headers: { Cookie: cart } })).text()).includes('href="/#products"') && (await (await fetch(base)).text()).includes('href="#products"'), 'menu links to a home page section work from every page')
cart = cartCookieOf(await postForm('/cart/update', { key: String(mug), quantity: '3' }, cart))
check(cart.includes(`${mug}:3`), 'the quantity can be changed')
check(cartCookieOf(await postForm('/cart/update', { key: String(mug), quantity: '100000' }, cart)).includes(`${mug}:99`), 'the quantity has a limit')
const withoutMug = cartCookieOf(await postForm('/cart/update', { key: String(mug), quantity: '0' }, cart))
check(!withoutMug.includes(`${mug}:`), 'a product can be removed')
const negative = cartCookieOf(await postForm('/cart/update', { key: String(mug), quantity: '-5' }, cart))
check(!negative.includes(`${mug}:`) && !negative.includes('-'), 'a negative quantity cannot reduce the price')
const forged = await (await fetch(`${base}/cart`, { headers: { Cookie: `cart=${hiddenItem}:5.999999:2.abc.${coffee}:1;price=1` } })).text()
check(!forged.includes('Hidden') && forged.includes('฿1,290') && forged.includes('role="alert"'), 'a changed cookie cannot add hidden products or change prices')
check((await fetch(`${base}/checkout`, { redirect: 'manual' })).status === 303, 'checkout needs something in the cart')
const checkoutBody = await (await fetch(`${base}/checkout`, { headers: { Cookie: cart } })).text()
check(checkoutBody.includes('value="transfer"') && checkoutBody.includes('value="cod"'), 'checkout offers both payment methods')
const order = { address: '1 Test Road <i>x</i>', name: 'Guest <b>Buyer</b>', payment: 'transfer', phone: '0812345678', note: '' }
const refused = async (values) => (await (await postForm('/checkout', values, cart)).text()).includes('role="alert"')
check((await refused({ ...order, phone: 'nope' })) && (await refused({ ...order, address: '' })) && (await refused({ ...order, payment: 'free' })), 'checkout refuses bad details and unknown payment methods')
await call('update_site', { payCod: false })
check(await refused({ ...order, payment: 'cod' }), 'a payment method the owner turned off cannot be used')
await call('update_site', { payCod: true })
check((await call('list_orders', {})).data.length === 0, 'refused checkouts save no orders')
const placed = await postForm('/checkout', order, cart)
const orderPath = new URL(placed.headers.get('location') ?? '', base).pathname
check(placed.status === 303 && /^\/order\/[0-9a-f]{64}$/.test(orderPath) && (placed.headers.get('set-cookie') ?? '').includes('Max-Age=0'), 'placing an order empties the cart and gives a private link')
const orderBody = await (await fetch(`${base}${orderPath}`)).text()
const orderResponse = await fetch(`${base}${orderPath}`)
check(orderBody.includes('฿2,580') && orderBody.includes('Mug × 3') && orderBody.includes('Test Bank 123-4-56789 &lt;script&gt;'), 'the order page shows the items and how to pay, safely')
check(orderBody.includes('Guest &lt;b&gt;Buyer&lt;/b&gt;') && orderBody.includes('1 Test Road &lt;i&gt;') && orderResponse.headers.get('x-robots-tag') === 'noindex' && orderResponse.headers.get('referrer-policy') === 'no-referrer', 'the order page shows details as plain text and stays private')
check((await fetch(`${base}/order/${'0'.repeat(64)}`)).status === 404 && (await fetch(`${base}/order/1`)).status === 404, 'orders cannot be found by guessing')
const orders = await call('list_orders', {})
check(orders.data.length === 1 && orders.data[0].total === 258000 + 75150 + 5000 && orders.data[0].lines.length === 2, 'Claude sees the order with the exact total', JSON.stringify(orders.data[0]?.total))
check(!orders.text.includes('token'), 'the order list never shows private links')
const orderId = orders.data[0].id
await call('save_item', { id: coffee, collection: 'store', title: 'Coffee renamed', price: '฿9,999' })
const afterChange = await (await fetch(`${base}${orderPath}`)).text()
check(afterChange.includes('Coffee &lt;b&gt;box&lt;/b&gt;') && afterChange.includes('฿2,580') && !afterChange.includes('9,999'), 'changing a product does not rewrite old orders')
const orderOffice = await (await fetch(`${owner}/orders`)).text()
check(orderOffice.includes('Guest &lt;b&gt;Buyer&lt;/b&gt;') && orderOffice.includes('0812345678') && !orderOffice.includes('<b>Buyer'), 'the back office shows orders as plain text')
const shipped = await fetch(`${owner}/orders/${orderId}`, { body: new URLSearchParams({ status: 'paid' }), method: 'POST', redirect: 'manual' })
check(shipped.status === 303 && (await call('list_orders', {})).data[0].status === 'paid', 'the owner can confirm a payment')
check(!(await (await fetch(`${base}${orderPath}`)).text()).includes('Test Bank'), 'payment instructions go away once the payment is confirmed')
await fetch(`${owner}/orders/${orderId}`, { body: new URLSearchParams({ status: 'free-stuff' }), method: 'POST', redirect: 'manual' })
check((await call('list_orders', {})).data[0].status === 'paid', 'an unknown order status is refused')
check((await fetch(`${base}/owner/aaaaaaaa-bbbbbbbb-cccccccc-dddddddd/orders/${orderId}`, { body: new URLSearchParams({ status: 'done' }), method: 'POST', redirect: 'manual' })).status === 404, 'a wrong link cannot change an order')
check(!(await call('update_order', { id: orderId, status: 'shipped' })).isError && (await call('list_orders', { status: 'shipped' })).data.length === 1, 'Claude can update an order')
check((await call('update_order', { id: 99999, status: 'done' })).isError, 'Claude cannot update an order that does not exist')
const buyer = sessionOf(await postForm('/signup', { email: 'buyer@example.test', name: 'Buyer', password: 'buyer-pass-123' }))
const memberCart = cartCookieOf(await addToCart(mug))
const memberOrder = await postForm('/checkout', { ...order, name: 'Buyer', payment: 'cod' }, `${buyer}; ${memberCart}`)
check(memberOrder.status === 303, 'a logged-in customer can place an order')
const buyerAccount = await (await fetch(`${base}/account`, { headers: { Cookie: buyer } })).text()
check(buyerAccount.includes('Mug × 1') && !buyerAccount.includes('Coffee'), 'customers see only their own orders in their account')
const strangerAccount = await (await fetch(`${base}/account`, { headers: { Cookie: sessionOf(other) } })).text()
check(!strangerAccount.includes('Mug ×'), "customers cannot see each other's cart orders")
await call('update_site', { cartMembersOnly: true })
check(((await fetch(`${base}/checkout`, { headers: { Cookie: memberCart }, redirect: 'manual' })).headers.get('location') ?? '').includes('/login?next=/checkout'), 'the owner can limit checkout to members')
await call('update_site', { cartMembersOnly: false })
check((await call('save_page', { ...storePage, slug: 'cart' })).isError && (await call('save_page', { ...storePage, slug: 'order' })).isError, 'pages cannot take over cart addresses')
const shopSettings = formValues(await (await fetch(`${owner}/settings`)).text())
shopSettings.set('shippingFee', '75')
await fetch(`${owner}/settings`, { body: shopSettings, method: 'POST', redirect: 'manual' })
const shopAfter = (await call('get_site')).data.settings
check(shopAfter.shippingFee === 75 && shopAfter.cart === true && shopAfter.payTransfer === true && shopAfter.transferDetails.includes('Test Bank'), 'the owner can change shop settings without losing others')
await call('update_site', { cart: false })
check((await fetch(`${base}${orderPath}`)).status === 200 && (await fetch(`${base}/cart`)).status === 404, 'old order links keep working when the cart is turned off')
await call('update_site', { cart: true })

// Storefront: product pages, options, stock, sales and free delivery
const shirt = (await call('save_item', { collection: 'catalog', title: 'Shirt', price: '฿500', comparePrice: '฿700', category: 'Clothes', body: 'Soft cotton <b>shirt</b>.', variants: [{ name: 'Size M', stock: 2 }, { name: 'Size L', price: '฿600', stock: 0 }] })).data.id
const candle = (await call('save_item', { collection: 'catalog', title: 'Candle', price: '฿100', category: 'Home', stock: 3 })).data.id
const goneItem = (await call('save_item', { collection: 'catalog', title: 'Gone', price: '฿50', category: 'Home', stock: 0 })).data.id
await call('save_page', { slug: 'catalog', title: 'Catalog', description: 'A catalog page used to test categories, options, stock and sale prices in the sample shop.', published: true, blocks: [{ type: 'hero', heading: 'Catalog' }, { type: 'collection', id: 'list', collection: 'catalog', filters: true }] })
await call('update_site', { freeShippingOver: 1000, currency: 'thb', shippingFee: 50 })
const catalog = await (await fetch(`${base}/catalog`)).text()
check(catalog.includes(`href="/product/${shirt}"`) && catalog.includes('<s>฿700</s>') && catalog.includes('Sale'), 'product cards link to their page and show sale prices')
check(catalog.includes('?category=Clothes#list') && catalog.includes('?category=Home#list'), 'the catalog shows category filters')
const clothes = await (await fetch(`${base}/catalog?category=Clothes`)).text()
check(clothes.includes('Shirt') && !clothes.includes('>Candle<'), 'a category filter shows only that category')
check(catalog.includes('Sold out') && !catalog.includes(`name="item" type="hidden" value="${goneItem}"`), 'sold out products cannot be added')
check(!catalog.includes(`name="item" type="hidden" value="${shirt}"`) && catalog.includes(`href="/product/${shirt}">`), 'products with options send people to choose first')
check(catalog.includes('class="tab-bar"') && catalog.includes('class="has-tabs"'), 'shops have a phone tab bar')
const productResponse = await fetch(`${base}/product/${shirt}`)
const productBody = await productResponse.text()
const sizeM = productBody.match(/value="(\d+)"><span>Size M/)?.[1] ?? productBody.match(/name="variant" required type="radio" value="(\d+)"><span>Size M/)?.[1]
const sizeL = productBody.match(/value="(\d+)"><span>Size L/)?.[1]
check(productResponse.status === 200 && productBody.includes('Soft cotton &lt;b&gt;shirt') && Boolean(sizeM) && Boolean(sizeL), 'every product has its own safe page with options', productBody.slice(0, 0))
check(/ disabled[^>]*value="\d+"><span>Size L/.test(productBody), 'a sold out option cannot be chosen')
check(productBody.includes('"@type":"Product"') && productBody.includes('"priceCurrency":"THB"'), 'product pages have search data')
check((await fetch(`${base}/product/99999`)).status === 404 && (await fetch(`${base}/product/abc`)).status === 404, 'unknown products are not found')
check((await (await fetch(`${base}/sitemap.xml`)).text()).includes(`/product/${shirt}`), 'product pages are in the sitemap')
const noChoice = await postForm('/cart/add', { item: String(shirt) })
check((noChoice.headers.get('location') ?? '').includes(`/product/${shirt}?choose=1`) && !noChoice.headers.get('set-cookie'), 'a product with options needs one chosen')
const soldOption = cartCookieOf(await postForm('/cart/add', { item: String(shirt), variant: sizeL }))
check((await (await fetch(`${base}/checkout`, { headers: { Cookie: soldOption }, redirect: 'manual' })).status) === 303, 'a sold out option cannot reach checkout')
const wrongOption = await postForm('/cart/add', { item: String(candle), variant: sizeM })
check((await (await fetch(`${base}/cart`, { headers: { Cookie: cartCookieOf(wrongOption) } })).text()).includes('role="alert"'), "another product's option is refused")

const stockOf = async (title) => (await call('list_items', { collection: 'catalog' })).data.find((row) => row.title === title)?.stock
let shirtCart = cartCookieOf(await postForm('/cart/add', { item: String(shirt), quantity: '5', variant: sizeM }))
check(shirtCart === `cart=${shirt}_${sizeM}:5`, 'the cart remembers the chosen option')
const capped = await fetch(`${base}/cart`, { headers: { Cookie: shirtCart } })
const cappedBody = await capped.text()
check(cappedBody.includes('value="2"') && cappedBody.includes('Size M') && cappedBody.includes('role="alert"') && (capped.headers.get('set-cookie') ?? '').includes(`${shirt}_${sizeM}:2`), 'the cart cannot hold more than the stock')
shirtCart = cartCookieOf(capped)
const buyOption = await postForm('/checkout', { ...order, payment: 'cod' }, shirtCart)
const optionOrder = new URL(buyOption.headers.get('location') ?? '', base).pathname
check((await (await fetch(`${base}${optionOrder}`)).text()).includes('Shirt · Size M × 2'), 'orders record the chosen option')
const variantStock = await (await fetch(`${base}/product/${shirt}`)).text()
check(variantStock.includes('product-page__sold-out') && !variantStock.includes('action="/cart/add"'), 'buying the last ones sells out the product')
const lostRace = await postForm('/checkout', { ...order, payment: 'cod' }, shirtCart)
check(lostRace.status === 303 && (lostRace.headers.get('location') ?? '').includes('/cart') && !(await call('list_orders', {})).data.some((row, index, all) => all.filter((other) => other.total === row.total && other.name === row.name).length > 5), 'a second buyer cannot buy what is already gone')

const candleCart = cartCookieOf(await postForm('/cart/add', { item: String(candle), quantity: '2' }))
const candlesBefore = await stockOf('Candle')
const nearFree = await (await fetch(`${base}/cart`, { headers: { Cookie: candleCart } })).text()
check(nearFree.includes('more for free delivery') && !nearFree.includes('free-shipping--done'), 'the cart shows how much more is needed for free delivery')
const candleBuy = await postForm('/checkout', { ...order, payment: 'cod' }, candleCart)
const candleOrderPath = new URL(candleBuy.headers.get('location') ?? '', base).pathname
check(candlesBefore === 3 && (await stockOf('Candle')) === 1, 'an order takes items out of stock')
const candleId = (await call('list_orders', {})).data[0].id
const candleTotal = (await call('list_orders', {})).data[0].total
check(candleTotal === 20000 + 5000, 'orders under the free delivery amount pay for delivery')
check((await (await fetch(`${base}/product/${candle}`)).text()).includes('Only 1 left'), 'low stock is shown')
check(!(await call('update_order', { id: candleId, status: 'cancelled' })).isError && (await stockOf('Candle')) === 3, 'cancelling an order puts items back in stock')
await call('update_order', { id: candleId, status: 'cancelled' })
check((await stockOf('Candle')) === 3, 'cancelling twice does not add stock twice')
await call('save_item', { id: candle, collection: 'catalog', title: 'Candle', price: '฿100', category: 'Home', stock: 0 })
check((await call('update_order', { id: candleId, status: 'pending' })).isError && (await call('list_orders', {})).data[0].status === 'cancelled', 'a cancelled order cannot return if the stock is gone')
await call('save_item', { id: candle, collection: 'catalog', title: 'Candle', price: '฿1,000', category: 'Home', stock: 5 })
const freeCart = cartCookieOf(await postForm('/cart/add', { item: String(candle) }))
const freeBody = await (await fetch(`${base}/cart`, { headers: { Cookie: freeCart } })).text()
check(freeBody.includes('free-shipping--done') && freeBody.includes('>Free<'), 'orders over the free delivery amount pay no delivery')
check(candleOrderPath.startsWith('/order/'), 'stock orders have private links')
await call('save_item', { id: shirt, collection: 'catalog', title: 'Shirt', price: '฿500', comparePrice: '฿700', category: 'Clothes', body: 'Soft cotton.', variants: [{ name: 'Size M', stock: 9 }] })
const afterEdit = (await call('list_items', { collection: 'catalog' })).data.find((row) => row.title === 'Shirt')
check(afterEdit.id === shirt && (await (await fetch(`${base}/product/${shirt}`)).text()).includes('Size M') && !(await (await fetch(`${base}/product/${shirt}`)).text()).includes('Size L'), 'options can be changed and removed')
const itemPage = formValues((await (await fetch(`${owner}/items`)).text()).split('</details>').find((part) => part.includes('>Shirt') || part.includes('Shirt ·')) ?? '')
check(itemPage.get('variants')?.includes('Size M') && itemPage.get('comparePrice') === '฿700' && itemPage.get('category') === 'Clothes', 'the back office shows options, sale price and category')

// Card payments, tested against a stand-in for Stripe
const hasStripe = process.env.STRIPE_TEST === '1'
if (hasStripe) {
  const { createServer } = await import('node:http')
  const { createHmac } = await import('node:crypto')
  const seen = []
  const stripe = createServer((request, response) => {
    let body = ''
    request.on('data', (part) => (body += part))
    request.on('end', () => {
      seen.push({ auth: request.headers.authorization, body: new URLSearchParams(body), path: request.url })
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ id: 'cs_test', url: 'https://checkout.stripe.test/pay' }))
    })
  })
  await new Promise((done) => stripe.listen(8797, done))
  await call('update_site', { payCard: true })
  const cardCart = cartCookieOf(await postForm('/cart/add', { item: String(candle), quantity: '2' }))
  check((await (await fetch(`${base}/checkout`, { headers: { Cookie: cardCart } })).text()).includes('value="card"'), 'checkout offers cards when Stripe is set up')
  const cardBuy = await postForm('/checkout', { ...order, payment: 'card' }, cardCart)
  check(cardBuy.status === 303 && cardBuy.headers.get('location') === 'https://checkout.stripe.test/pay', 'paying by card goes to the Stripe page')
  const sent = seen[0]
  check(sent?.auth === 'Bearer sk_test_fake' && sent.path === '/v1/checkout/sessions' && sent.body.get('line_items[0][price_data][unit_amount]') === '100000' && sent.body.get('line_items[0][quantity]') === '2' && sent.body.get('line_items[0][price_data][currency]') === 'thb', 'Stripe receives the prices from the server', JSON.stringify(sent?.path))
  const paying = (await call('list_orders', {})).data[0]
  check(paying.payment === 'card' && paying.status === 'pending' && paying.total === 200000, 'a card order waits for payment and gets free delivery')
  const signed = (payload, secret = 'whsec_test', time = Math.floor(Date.now() / 1000)) => `t=${time},v1=${createHmac('sha256', secret).update(`${time}.${payload}`).digest('hex')}`
  const webhook = (payload, signature) => fetch(`${base}/stripe/webhook`, { body: payload, headers: { 'Stripe-Signature': signature }, method: 'POST' })
  const paidEvent = (total, status = 'paid', id = paying.id) => JSON.stringify({ type: 'checkout.session.completed', data: { object: { amount_total: total, currency: 'thb', metadata: { order_id: String(id) }, payment_status: status } } })
  const statusNow = async () => (await call('list_orders', {})).data.find((row) => row.id === paying.id).status
  check((await webhook(paidEvent(200000), signed(paidEvent(200000), 'whsec_wrong'))).status === 400 && (await statusNow()) === 'pending', 'a forged payment message is refused')
  check((await webhook(paidEvent(200000), signed(paidEvent(200000), 'whsec_test', Math.floor(Date.now() / 1000) - 3600))).status === 400 && (await statusNow()) === 'pending', 'an old payment message is refused')
  await webhook(paidEvent(1), signed(paidEvent(1)))
  check((await statusNow()) === 'pending', 'a payment for the wrong amount does not confirm the order')
  await webhook(paidEvent(200000, 'unpaid'), signed(paidEvent(200000, 'unpaid')))
  check((await statusNow()) === 'pending', 'an unpaid session does not confirm the order')
  const good = await webhook(paidEvent(200000), signed(paidEvent(200000)))
  check(good.status === 200 && (await statusNow()) === 'paid', 'a real payment message confirms the order')
  await new Promise((done) => stripe.close(done))
  await call('update_site', { payCard: false })
} else {
  await call('update_site', { payCard: true })
  const noKeys = cartCookieOf(await postForm('/cart/add', { item: String(candle) }))
  check(!(await (await fetch(`${base}/checkout`, { headers: { Cookie: noKeys } })).text()).includes('value="card"') && (await call('check_site', {})).data.problems.some((problem) => problem.includes('Stripe')), 'cards stay hidden until Stripe is set up')
  check((await fetch(`${base}/stripe/webhook`, { body: '{}', method: 'POST' })).status === 404, 'the payment address is off without Stripe')
  await call('update_site', { payCard: false })
}

// Updates
const updatesBefore = await (await fetch(`${owner}/updates`)).text()
check(updatesBefore.includes('Set up updates') && !updatesBefore.includes('/new/main'), 'the updates page asks for the repository first')
check((await (await fetch(`${owner}/updates`, { body: new URLSearchParams({ repo: 'not a repo"><script>' }), method: 'POST' })).text()).includes('Enter it like this'), 'a bad repository name is refused')
check((await fetch(`${owner}/updates`, { body: new URLSearchParams({ repo: 'someone/my-shop' }), method: 'POST', redirect: 'manual' })).status === 303, 'the owner can save the repository')
const updatesPage = await (await fetch(`${owner}/updates`)).text()
const addLink = decode(updatesPage.match(/href="(https:\/\/github\.com\/someone\/my-shop\/new\/main[^"]*)"/)?.[1] ?? '')
const prefilled = new URL(addLink || 'https://x.test')
check(prefilled.searchParams.get('filename') === '.github/workflows/update-web-end.yml' && prefilled.searchParams.get('value')?.includes('workflow_dispatch') && prefilled.searchParams.get('value')?.includes('--branch "v$latest"'), 'the page gives a ready-made updater that uses only releases')
check(updatesPage.includes('https://github.com/someone/my-shop/actions/workflows/update-web-end.yml'), 'the page links to where the owner runs the update')
const repoSettings = formValues(await (await fetch(`${owner}/settings`)).text())
await fetch(`${owner}/settings`, { body: repoSettings, method: 'POST', redirect: 'manual' })
check((await call('get_site')).data.settings.githubRepo === 'someone/my-shop' && /^\d+\.\d+\.\d+$/.test((await call('get_site')).data.version), 'saving settings keeps the repository, and Claude can see the version')
check((await fetch(`${base}/owner/aaaaaaaa-bbbbbbbb-cccccccc-dddddddd/updates`)).status === 404, 'a wrong link cannot open the updates page')

let attempts = 0
let limited = false
while (attempts < 15 && !limited) {
  limited = (await (await postForm('/login', { email: 'x@example.test', password: 'nope-nope-nope' })).text()).includes('Too many')
  attempts++
}
check(limited, 'repeated login attempts are slowed down', `after ${attempts}`)


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
