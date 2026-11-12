import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSite, sitePort } from '../host/sites.mjs'
import { startServer } from '../host/server.mjs'
import { startLauncher } from '../host/launcher.mjs'

const sitesDir = mkdtempSync(join(tmpdir(), 'web-end-sites-'))
let passed = 0
const check = (ok, message) => {
  if (!ok) throw new Error(message)
  passed++
  console.log(`ok    ${message}`)
}
const first = await createSite('baan-coffee', sitesDir)
const second = await createSite('my-shop', sitesDir)
check(first.dataDir !== second.dataDir && first.port !== second.port, 'each new site gets its own folder and port')
check(sitePort('baan-coffee', sitesDir) === first.port && sitePort('my-shop', sitesDir) === second.port, 'each site keeps its address for reopening')
let duplicate = false
try { await createSite('baan-coffee', sitesDir) } catch { duplicate = true }
check(duplicate, 'an existing site cannot be replaced by a new one')
let invalid = false
try { await createSite('../other', sitesDir) } catch { invalid = true }
check(invalid, 'site names cannot escape the private sites folder')

const a = await startServer({ dataDir: first.dataDir, port: first.port, schedule: false, updateCheck: false })
const b = await startServer({ dataDir: second.dataDir, port: second.port, schedule: false, updateCheck: false })
try {
  const claimed = await fetch(`${a.url}/setup`, { method: 'POST', redirect: 'manual' })
  const privateLink = await claimed.text()
  check(claimed.status === 200 && /\/owner\/[a-z0-9-]{20,60}/.test(privateLink), 'the first site creates its own owner Dashboard')
  const other = await fetch(b.url)
  const otherPage = await other.text()
  check(other.status === 200 && otherPage.includes('id="first-prompt"') && otherPage.includes('action="/studio/claim"'), 'the second site still shows the fresh first-run experience')
  check((await fetch(`${b.url}/studio/api/state`)).status === 401, 'the second site does not grant unauthenticated Studio access')
  check((await fetch(`${b.url}/studio/claim`, { method: 'POST', headers: { Origin: 'https://evil.test' } })).status === 403, 'the second site rejects cross-origin claims')
  const secondClaim = await fetch(`${b.url}/studio/claim`, { method: 'POST', headers: { Origin: b.url } })
  const secondLink = await secondClaim.text()
  const firstOwner = privateLink.match(/\/owner\/[a-z0-9-]{20,60}/)?.[0]
  const secondOwner = secondLink.match(/\/owner\/[a-z0-9-]{20,60}/)?.[0]
  check(secondClaim.status === 200 && secondOwner && secondOwner !== firstOwner, 'the second site can be claimed independently with a different owner link')
  check((await fetch(`${b.url}/studio/claim`, { method: 'POST', headers: { Origin: b.url } })).status === 409, 'the second site cannot be claimed twice')
  check(a.db.file !== b.db.file, 'each running site has its own SQLite database')
} finally {
  await Promise.all([a.close(), b.close()])
}
console.log(`Sites: ${passed} passed, 0 failed`)

const launcher = await startLauncher({ port: 0, sitesDir, updateCheck: false })
try {
  const home = await (await fetch(launcher.url)).text()
  const englishResponse = await fetch(`${launcher.url}/?lang=en`)
  const english = await englishResponse.text()
  check(englishResponse.status === 200 && english.includes('<html lang="en">') && english.includes('Create your website') && english.includes('Your idea') && english.includes('Create a new site') && english.includes('baan-coffee'), 'English creator shows the real form and existing sites')
  check(home.includes('<html lang="th">') && home.includes('สร้างเว็บของคุณ'), 'Thai remains the default creator language')
  const token = /name="token" type="hidden" value="([a-f0-9]+)"/.exec(home)?.[1]
  check(Boolean(token) && home.includes('สร้างเว็บใหม่') && home.includes('baan-coffee'), 'the browser page shows a create button and existing sites')
  check(home.includes('id="creator-prompt"') && home.includes('postMessage'), 'creator accepts an idea and transfers it explicitly between browser windows')
  const post = (path, name, headers = {}) => fetch(`${launcher.url}${path}`, { method: 'POST', body: new URLSearchParams({ name, token }), headers, redirect: 'manual' })
  const emptyEnglish = await (await fetch(`${launcher.url}/?lang=en`)).text()
  check(emptyEnglish.includes('Your idea') && !/[\u0e00-\u0e7f]/.test(emptyEnglish), 'English creator contains no untranslated Thai')
  const englishError = await fetch(`${launcher.url}/new?lang=en`, { method: 'POST', body: new URLSearchParams({ name: 'baan-coffee', token }), redirect: 'manual' })
  check(englishError.status === 400 && (await englishError.text()).includes('<html lang="en">'), 'English form submission preserves language on errors')
  const foreign = await post('/new', 'evil-site', { Origin: 'https://another.test' })
  check(foreign.status === 403, 'another website cannot create a local site')
  const foreignHandoff = await post('/new', 'evil-handoff', { Origin: 'https://another.test', 'X-Creator-Handoff': '1' })
  check(foreignHandoff.status === 403, 'cross-origin handoff creation is rejected')
  const handoffResponse = await post('/new', 'handoff-site', { Origin: launcher.url, 'X-Creator-Handoff': '1' })
  const handoff = await handoffResponse.json()
  const handoffPage = await (await fetch(handoff.url)).text()
  check(handoffResponse.status === 200 && new URL(handoff.url).origin !== launcher.url && /^[a-f0-9]{48}$/.test(handoff.nonce), 'handoff targets a distinct site origin with a random handshake')
  check(handoffPage.includes(JSON.stringify(launcher.url)) && handoffPage.includes(JSON.stringify(handoff.nonce)) && handoffPage.includes('event.source !== window.opener') && handoffPage.includes('event.origin !== origin'), 'site accepts handoff only from its expected opener and origin')
  check(!handoff.url.includes(handoff.nonce), 'handoff URL contains no handshake secret')
  const made = await post('/new', 'third-site')
  check(made.status === 303 && made.headers.get('location')?.endsWith('/'), 'creating a site in the browser opens its first-run prompt')
  const siteUrl = made.headers.get('location').replace(/\/$/, '')
  const firstRun = await (await fetch(siteUrl + '/')).text()
  check(firstRun.includes('id="first-prompt"') && firstRun.includes('action="/studio/claim"'), 'creator directs a new site to the Studio first-run flow')
  const claimed = await fetch(`${siteUrl}/studio/claim`, { method: 'POST', headers: { Origin: siteUrl }, redirect: 'manual' })
  check(claimed.status === 200 && /\/owner\/[a-z0-9-]{35}/.test(await claimed.text()), 'the new site provides its recovery link when claimed')
  const reopened = await post('/open', 'third-site')
  check(reopened.status === 303 && reopened.headers.get('location') === `${siteUrl}/admin`, 'opening an existing site goes to its Dashboard')
  const repeated = await post('/new', 'third-site')
  check(repeated.status === 400 && (await repeated.text()).includes('already exists'), 'the browser cannot replace an existing site')
} finally {
  await launcher.close()
}
console.log(`Browser launcher: ${passed} passed, 0 failed`)
