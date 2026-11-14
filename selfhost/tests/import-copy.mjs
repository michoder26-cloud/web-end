// A site made by tools/site-copier loads into web-end and runs on its back office.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { importCopy } from '../host/import-copy.mjs'
import { startServer } from '../host/server.mjs'
import { applyEdits, zip } from '../../copy-platform/src/package.js'
import { readFileSync, readdirSync, statSync } from 'node:fs'

let passed = 0
const check = (ok, message) => {
  if (!ok) throw new Error(message)
  passed++
  console.log(`ok    ${message}`)
}
const copy = mkdtempSync(join(tmpdir(), 'web-end-copy-'))
const page = (title, link) => `<!doctype html><html lang="en"><head><title>${title} | Old</title><script>(function(){var m=Math.min(screen.width,innerWidth)<768;})();</script><link rel="stylesheet" href="/assets/s.css"></head><body><h1><span class="x">${title}</span></h1><p>Same</p><p>Same</p><img src="/assets/a.png" alt=""><a href="${link}">Next</a><form aria-label="Contact Us"><input aria-label="Name" required><input aria-label="Email" type="email"><input aria-label="Phone. Phone" type="phone"><textarea aria-label="Message"></textarea><button type="button" data-hook="submit-button">Submit</button></form><script>window.__M={"a":"/assets/a.png"}</script><script src="/assets/motion.js"></script></body></html>`
mkdirSync(join(copy, 'assets'))
mkdirSync(join(copy, 'about'))
mkdirSync(join(copy, 'm', 'about'), { recursive: true })
writeFileSync(join(copy, 'assets', 's.css'), '@import "/assets/t.css";h1{color:#123}')
writeFileSync(join(copy, 'assets', 'motion.js'), 'fetch("/assets/x.json")')
writeFileSync(join(copy, 'assets', 'a.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
writeFileSync(join(copy, 'index.html'), page('Hello', '/about/'))
writeFileSync(join(copy, 'about', 'index.html'), page('About', '/'))
writeFileSync(join(copy, 'm', 'index.html'), page('Hello', '/m/about/'))
writeFileSync(join(copy, 'm', 'about', 'index.html'), page('About', '/m/'))
writeFileSync(join(copy, 'copy-report.json'), JSON.stringify({ pages: ['index', 'about'] }))

const dataDir = mkdtempSync(join(tmpdir(), 'web-end-import-'))
const server = await startServer({ dataDir, port: 0, schedule: false, updateCheck: false, studio: false })
try {
  let refused = false
  try { importCopy({ copyDir: copy, dataDir }) } catch { refused = true }
  check(refused, 'a site that has not been set up is refused')
  const owner = (await (await fetch(`${server.url}/setup`, { method: 'POST' })).text()).match(/\/owner\/[a-z0-9-]{20,60}/)[0]
  const result = importCopy({ copyDir: copy, dataDir, replace: true })
  check(result.pages.length === 2 && result.forms === 2 && result.assets === 3, 'pages, forms and files are loaded')
  refused = false
  try { importCopy({ copyDir: copy, dataDir }) } catch { refused = true }
  check(refused, 'existing pages are only replaced when asked')

  const publish = await fetch(`${server.url}${owner}/publish`, { method: 'POST', body: new URLSearchParams({ note: 'copied' }), redirect: 'manual' })
  check(publish.status === 303, 'the owner publishes the copied pages')
  const home = await fetch(server.url)
  const body = await home.text()
  check(home.status === 200 && body.includes('data-we-view="desktop"') && body.includes('href="/copied/assets/s.css"') && body.includes('href="/about"'), 'visitors get the copied page with files and links under web-end')
  check(/script-src 'self';/.test(home.headers.get('content-security-policy')) && !/<script>[^<]/.test(body) && !body.includes('Math.min(screen.width'), 'copied pages run without inline scripts')
  const phone = await (await fetch(`${server.url}/about`, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; Mobile)' } })).text()
  check(phone.includes('data-we-view="phone"') && phone.includes('href="/"'), 'phones get the phone version')
  check((await (await fetch(`${server.url}/copied/assets/s.css`)).text()).includes('@import "/copied/assets/t.css"'), 'styles point to their files under /copied/')
  const inline = body.match(/src="\/copied\/(inline\/[a-f0-9]+\.js)"/)[1]
  check((await (await fetch(`${server.url}/copied/${inline}`)).text()).includes('/copied/assets/a.png'), 'inline scripts became files')
  check((await fetch(`${server.url}/copied/..%2Fsite.sqlite`)).status === 404, 'nothing outside the copied files is served')

  const form = body.match(/<form data-we-form="([a-z0-9-]+)"/)[1]
  check(form === 'contact-us' && /name="f1"[^>]*aria-label="Name"|aria-label="Name"[^>]*name="f1"/.test(body) && body.includes('type="tel"'), 'forms and fields get names')
  const bad = await fetch(`${server.url}/form/home/${form}`, { method: 'POST', body: new URLSearchParams({ f2: 'a@b.co' }), redirect: 'manual' })
  check(/error=/.test(bad.headers.get('location')), 'a form without its required field is refused')
  const sent = await fetch(`${server.url}/form/home/${form}`, { method: 'POST', body: new URLSearchParams({ f1: 'Ann', f2: 'ann@example.com', f4: 'Hi there' }), redirect: 'manual' })
  check(/sent=/.test(sent.headers.get('location')), 'a filled-in form is accepted')
  const overview = await (await fetch(`${server.url}${owner}`)).text()
  check(overview.includes('Ann') && overview.includes('Hi there') && overview.includes('Name') && overview.includes('Message'), 'the message appears in the back office with its field names')

  const editor = await (await fetch(`${server.url}${owner}/page/home/visual`)).text()
  check(editor.includes('/copied/_we/editor.js') && editor.includes(`data-we-save="${owner}/page/home"`), 'the owner opens the page editor')
  const key = editor.match(/<span class="x" data-we="(t[a-f0-9]{10}-0)">Hello/)[1]
  const save = await fetch(`${server.url}${owner}/page/home/visual-text`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ edits: { [key]: 'Hi <b>&' } }) })
  check(save.status === 200, 'changed words are saved')
  check((await (await fetch(server.url)).text()).includes('>Hello</span>'), 'visitors keep seeing the published words until the owner publishes')
  const picture = new FormData()
  picture.append('from', '/copied/assets/a.png')
  picture.append('file', new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')], 'new.png', { type: 'image/png' }))
  const replaced = await (await fetch(`${server.url}${owner}/page/home/visual-image`, { method: 'POST', body: picture })).json()
  check(replaced.pages === 2 && /^\/media\/\d+$/.test(replaced.url), 'a new picture replaces the old one on every page')
  await fetch(`${server.url}${owner}/publish`, { method: 'POST', body: new URLSearchParams({ note: 'edits' }), redirect: 'manual' })
  const after = await (await fetch(server.url)).text()
  const afterPhone = await (await fetch(server.url, { headers: { 'user-agent': 'iPhone Mobile' } })).text()
  check(after.includes('>Hi &lt;b&gt;&amp;</span>') && afterPhone.includes('>Hi &lt;b&gt;&amp;</span>'), 'after publishing, the new words show on desktop and phone')
  check(after.includes(replaced.url) && !after.includes('/copied/assets/a.png'), 'after publishing, the new picture shows')
  check((await (await fetch(`${server.url}${owner}/page/home`)).text()).includes('/page/home/restore/'), 'earlier versions of the page can be restored')
  check((await fetch(`${server.url}/owner/not-the-owner-link-at-all-1234/page/home/visual`)).status === 404, 'strangers cannot open the editor')

  // The download from the copy service: the same files in a ZIP, with the owner's edits written in.
  const list = (folder, prefix = '') => readdirSync(folder).flatMap((name) => statSync(join(folder, name)).isDirectory() ? list(join(folder, name), `${prefix}${name}/`) : [`${prefix}${name}`])
  const entries = list(copy).filter((name) => name !== 'copy-report.json').map((name) => {
    let data = readFileSync(join(copy, name))
    if (name === 'index.html') data = Buffer.from(applyEdits(data.toString().replace('<span class="x">', '<span class="x" data-we-text="t1">'), new Map([['t1', { kind: 'text', value: 'From the copy service' }]])))
    return { name, data: new Uint8Array(data) }
  })
  const download = join(copy, '..', `download-${Date.now()}.zip`)
  writeFileSync(download, Buffer.from(await zip(entries).arrayBuffer()))
  const fromZip = importCopy({ copyDir: download, dataDir, replace: true })
  check(fromZip.pages.length === 2 && fromZip.forms === 2, 'the ZIP download from the copy service loads directly')
  await fetch(`${server.url}${owner}/publish`, { method: 'POST', body: new URLSearchParams({ note: 'zip' }), redirect: 'manual' })
  check((await (await fetch(server.url)).text()).includes('>From the copy service</span>'), 'edits made on the copy service come along')
  const evil = join(copy, '..', `evil-${Date.now()}.zip`)
  writeFileSync(evil, Buffer.from(await zip([{ name: '../escape.txt', data: new Uint8Array([1]) }]).arrayBuffer()))
  refused = false
  try { importCopy({ copyDir: evil, dataDir, replace: true }) } catch { refused = true }
  check(refused, 'a ZIP with a file outside its folder is refused')
} finally {
  await server.close()
}
console.log(`${passed} checks passed`)
