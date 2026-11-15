import '@fontsource-variable/wix-madefor-text'
import './apps.css'

const $ = (selector, root = document) => root.querySelector(selector)
const main = $('.wrap')
const list = $('.apps')
const status = $('.status')
const empty = $('.empty')
const nothing = $('.nothing')
const search = $('.search input')
const statusFilter = $('[data-filter="status"]')
const sortFilter = $('[data-filter="sort"]')
const dialog = $('.create-dialog')
const sheetStatus = $('.sheet-status')
let apps = []

const say = (text) => { status.textContent = text; status.hidden = !text }
const escape = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...options }).catch(() => null)
  if (!response) throw new Error('No connection. Please try again.')
  if (response.status === 401) { location.replace('/login/'); throw new Error('Please log in again.') }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'That did not work. Please try again.')
  return body
}

function ago(ms) {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000))
  const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]]
  for (const [unit, size] of units) if (s >= size) { const n = Math.floor(s / size); return `${n} ${unit}${n === 1 ? '' : 's'} ago` }
  return 'just now'
}

const colours = ['#4b1d8f', '#0b5c4a', '#7a2e12', '#1d3f8f', '#6b1d5c', '#3d5c0b']
const colourFor = (text) => colours[[...text].reduce((sum, c) => sum + c.codePointAt(0), 0) % colours.length]
const initial = (name) => escape([...name.trim()][0]?.toUpperCase() || '?')
const tile = (name) => `<div class="tile"><b style="background:${colourFor(name)}">${initial(name)}</b></div>`
const chip = { live: ['live', 'Online'], down: ['down', 'Not reachable'], unknown: ['unknown', 'Not checked'] }
const globe = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>'

function card(app) {
  const [kind, label] = chip[app.status] || chip.unknown
  const host = new URL(app.url).hostname
  const thumb = app.imageUrl ? `<img src="${escape(app.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : tile(app.name)
  return `<article class="card" data-id="${escape(app.id)}">
    <a class="thumb" href="${escape(app.url)}" target="_blank" rel="noopener" aria-label="Open ${escape(app.name)}">${thumb}</a>
    <span class="chip ${kind}">${label}</span>
    <div class="title-row">
      <h2><a href="${escape(app.url)}" target="_blank" rel="noopener">${escape(app.name)}</a>${globe}</h2>
      <button type="button" class="more" data-action="more" aria-haspopup="menu" aria-expanded="false" aria-label="More for ${escape(app.name)}">···</button>
    </div>
    <p class="addr">${escape(host)}</p>
    <p class="when">Updated ${ago(app.updatedAt)}</p>
    <div class="menu" role="menu" hidden>
      <a role="menuitem" href="${escape(app.url)}" target="_blank" rel="noopener">Open app</a>
      <a role="menuitem" href="${escape(app.url)}/admin" target="_blank" rel="noopener">Open back office</a>
      <a role="menuitem" href="https://github.com/michoder26-cloud/web-end/blob/main/docs/connect-claude.md" target="_blank" rel="noopener">Connect Claude</a>
      <button type="button" role="menuitem" data-action="check">Check again</button>
      <button type="button" role="menuitem" data-action="rename">Rename</button>
      <button type="button" role="menuitem" class="danger" data-action="remove">Remove from list</button>
    </div>
  </article>`
}

function render() {
  const words = search.value.trim().toLowerCase()
  const wanted = statusFilter.value
  const sort = sortFilter.value
  const shown = apps
    .filter((app) => (wanted === 'all' || app.status === wanted) && (!words || `${app.name} ${app.url} ${app.title || ''}`.toLowerCase().includes(words)))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt))
  list.innerHTML = shown.map(card).join('')
  empty.hidden = apps.length > 0
  nothing.hidden = !apps.length || shown.length > 0
  for (const img of list.querySelectorAll('.thumb img')) {
    img.addEventListener('error', () => {
      const app = apps.find((a) => a.id === img.closest('.card').dataset.id)
      img.outerHTML = tile(app.name)
    }, { once: true })
  }
}

function closeMenus(keep) {
  for (const menu of document.querySelectorAll('.menu')) {
    if (menu === keep) continue
    menu.hidden = true
  }
  for (const button of document.querySelectorAll('[data-action="me"], [data-action="more"]')) {
    const menu = button.dataset.action === 'me' ? $('.me-menu') : $('.menu', button.closest('.card'))
    if (menu !== keep) button.setAttribute('aria-expanded', 'false')
  }
}

function replace(app) {
  apps = apps.some((a) => a.id === app.id) ? apps.map((a) => (a.id === app.id ? app : a)) : [app, ...apps]
  render()
}

document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]')
  if (!target) { if (!event.target.closest('.menu')) closeMenus(); return }
  const action = target.dataset.action
  const cardEl = target.closest('.card')
  const app = cardEl && apps.find((a) => a.id === cardEl.dataset.id)

  if (action === 'me' || action === 'more') {
    const menu = action === 'me' ? $('.me-menu') : $('.menu', cardEl)
    const open = menu.hidden
    closeMenus(menu)
    menu.hidden = !open
    target.setAttribute('aria-expanded', String(open))
    return
  }
  closeMenus()
  try {
    if (action === 'create') { sheetStatus.hidden = true; dialog.showModal(); $('input[name="url"]', dialog).focus() }
    if (action === 'close') dialog.close()
    if (action === 'check') { say(`Checking ${app.name}…`); replace((await api(`/api/apps/${app.id}/check`, { method: 'POST' })).app); say('') }
    if (action === 'rename') {
      const name = prompt('New name for this app', app.name)
      if (name && name.trim() && name.trim() !== app.name) replace((await api(`/api/apps/${app.id}`, { method: 'PATCH', body: JSON.stringify({ name }) })).app)
    }
    if (action === 'remove' && confirm(`Remove ${app.name} from this list? The app itself keeps running on your Cloudflare account.`)) {
      await api(`/api/apps/${app.id}`, { method: 'DELETE' })
      apps = apps.filter((a) => a.id !== app.id)
      render()
    }
    if (action === 'logout') { await api('/api/logout', { method: 'POST' }); location.replace('/login/') }
    if (action === 'delete-account' && confirm('Delete your account, your app list and everything stored about you? Your apps keep running on your own Cloudflare account. This cannot be undone.')) {
      await api('/api/account/delete', { method: 'POST' })
      location.replace('/login/')
    }
  } catch (error) {
    say(error.message)
  }
})

document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenus() })

dialog.querySelector('form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.currentTarget
  const save = $('[data-action="save"]', form)
  save.disabled = true
  save.textContent = 'Checking the app…'
  sheetStatus.hidden = true
  try {
    let url = form.elements.url.value.trim()
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`
    const { app } = await api('/api/apps', { method: 'POST', body: JSON.stringify({ url, name: form.elements.name.value }) })
    replace(app)
    form.reset()
    dialog.close()
    if (app.status === 'down') say(`${app.name} was added, but it did not answer. If you just installed it, wait a minute, then choose Check again.`)
  } catch (error) {
    sheetStatus.textContent = error.message
    sheetStatus.hidden = false
  } finally {
    save.disabled = false
    save.textContent = 'Add app'
  }
})

for (const input of [search, statusFilter, sortFilter]) input.addEventListener('input', render)
for (const button of document.querySelectorAll('.view')) {
  button.addEventListener('click', () => {
    for (const b of document.querySelectorAll('.view')) { b.classList.toggle('on', b === button); b.setAttribute('aria-pressed', String(b === button)) }
    list.className = `apps ${button.dataset.view}`
    try { localStorage.setItem('apps-view', button.dataset.view) } catch {}
  })
}
try { if (localStorage.getItem('apps-view') === 'list') $('.view[data-view="list"]').click() } catch {}

try {
  const me = await api('/api/me')
  $('.avatar').textContent = [...(me.name || me.email)][0].toUpperCase()
  $('.me-name').textContent = me.name
  $('.me-email').textContent = me.email
  apps = (await api('/api/apps')).apps
  main.hidden = false
  render()
} catch (error) {
  main.hidden = false
  say(error.message)
}
