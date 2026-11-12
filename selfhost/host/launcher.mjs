// Local-only page for creating independent sites without using the command line.
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createSite, defaultSitesDir, siteData, sitePort } from './sites.mjs'
import { startServer } from './server.mjs'

const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const title = 'เว็บของฉัน · web-end'
const css = `
:root{font-family:system-ui,"Noto Sans Thai",sans-serif;color:#17263a;background:#f4f8fc;font-synthesis:none}
*{box-sizing:border-box}body{margin:0;min-height:100vh}main{max-width:950px;margin:0 auto;padding:clamp(24px,6vw,72px) 24px 80px}
header{display:flex;align-items:center;gap:12px;margin-bottom:76px;font-size:18px;font-weight:750;letter-spacing:-.025em}
.mark{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:#245fe5;color:white;font-weight:800}
h1{font-size:clamp(38px,6vw,68px);line-height:1.13;letter-spacing:-.055em;margin:0 0 16px;max-width:700px}
.lead{font-size:clamp(17px,2vw,21px);line-height:1.6;color:#53647a;margin:0 0 38px;max-width:650px}
form.create{display:grid;gap:10px;align-items:end;max-width:660px;margin-bottom:18px}label{display:grid;gap:9px;flex:1;font-weight:650}
textarea{width:100%;border:1px solid #a8b9cf;border-radius:12px;padding:14px;font:inherit}input{height:54px;width:100%;border:1px solid #a8b9cf;border-radius:12px;background:white;padding:0 16px;font:inherit;color:#17263a}
button{font:inherit;cursor:pointer;border:0}button.primary{height:54px;border-radius:12px;background:#245fe5;color:white;padding:0 24px;font-weight:700;white-space:nowrap}
button.primary:hover{background:#174aca}button.open{background:transparent;color:#245fe5;font-weight:700;padding:10px 0}
:focus-visible{outline:3px solid #eea836;outline-offset:3px}.hint{color:#63748a;font-size:14px;margin:0 0 70px}.error{color:#9b1c22;background:#fff0ee;border:1px solid #e4b3b0;border-radius:10px;padding:13px 16px;max-width:660px}
h2{font-size:24px;letter-spacing:-.03em;margin:0 0 16px}.sites{border-top:1px solid #cad6e5}.site{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:17px 0;border-bottom:1px solid #cad6e5}.site strong{display:block;font-size:18px}.site small{color:#65758a}.empty{color:#65758a;padding:26px 0}
@media(max-width:600px){header{margin-bottom:54px}form.create{display:grid}button.primary{width:100%}.site{align-items:start}}
`

const readBody = async (request) => {
  let text = ''
  for await (const chunk of request) {
    text += chunk
    if (text.length > 4096) throw new Error('The form is too large.')
  }
  return new URLSearchParams(text)
}

export async function startLauncher({ port = 8798, sitesDir = defaultSitesDir, updateCheck = true } = {}) {
  const token = randomBytes(24).toString('hex')
  const running = new Map()
  const names = () => existsSync(sitesDir) ? readdirSync(sitesDir, { withFileTypes: true }).filter((item) => item.isDirectory()).map((item) => item.name).filter((name) => {
    try { sitePort(name, sitesDir); return true } catch { return false }
  }).sort() : []
  const open = async (name, handoff = null) => {
    const current = running.get(name)
    if (current) return current
    const server = await startServer({ dataDir: siteData(name, sitesDir), port: sitePort(name, sitesDir), updateCheck, handoff })
    running.set(name, server)
    return server
  }
  const page = (error = '', language = 'th') => {
    const translations = { 'เว็บของฉัน · web-end': 'My sites · web-end', 'สร้างเว็บของคุณ': 'Create your website', 'ตั้งชื่อเว็บ แล้วเริ่มสร้างได้เลย แต่ละเว็บมีหน้าแก้ไขและข้อมูลของตัวเอง': 'Name your site and start building. Each site has its own dashboard and data.', 'ชื่อเว็บ': 'Site name', 'เช่น baan-coffee': 'e.g. baan-coffee', 'ไอเดียของคุณ': 'Your idea', 'อธิบายเว็บไซต์ที่อยากสร้าง': 'Describe the website you want to create', 'อย่าใส่รหัสผ่านหรือข้อมูลลับ': 'Do not include passwords or secrets.', 'สร้างเว็บใหม่': 'Create a new site', 'ใช้ตัวอักษรภาษาอังกฤษตัวเล็ก ตัวเลข และขีดกลางเป็นชื่อสำหรับเก็บเว็บในเครื่องนี้': 'Use lowercase English letters, numbers, and hyphens for the name stored on this computer.', 'เว็บของคุณ': 'Your sites', 'Dashboard และข้อมูลแยกเฉพาะเว็บนี้': 'Separate dashboard and data for this site', 'เปิด Dashboard': 'Open dashboard', 'ยังไม่มีเว็บ เริ่มจากตั้งชื่อเว็บด้านบน': 'No sites yet. Start by naming your site above.' }
    const html = `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css}</style><main><header><span class="mark">w</span> web-end</header><h1>สร้างเว็บของคุณ</h1><p class="lead">ตั้งชื่อเว็บ แล้วเริ่มสร้างได้เลย แต่ละเว็บมีหน้าแก้ไขและข้อมูลของตัวเอง</p>${error ? `<p class="error" role="alert">${escape(error)}</p>` : ''}<form class="create" action="/new" method="post"><input name="token" type="hidden" value="${token}"><label>ชื่อเว็บ<input name="name" required minlength="3" maxlength="56" pattern="[a-z][a-z0-9-]*[a-z0-9]" placeholder="เช่น baan-coffee" autocomplete="off"></label><label>ไอเดียของคุณ<textarea id="creator-prompt" maxlength="20000" rows="6" placeholder="อธิบายเว็บไซต์ที่อยากสร้าง"></textarea></label><p>อย่าใส่รหัสผ่านหรือข้อมูลลับ</p><button class="primary" type="submit">สร้างเว็บใหม่</button></form><p class="hint">ใช้ตัวอักษรภาษาอังกฤษตัวเล็ก ตัวเลข และขีดกลางเป็นชื่อสำหรับเก็บเว็บในเครื่องนี้</p><h2>เว็บของคุณ</h2><div class="sites">${names().length ? names().map((name) => `<div class="site"><div><strong>${escape(name)}</strong><small>Dashboard และข้อมูลแยกเฉพาะเว็บนี้</small></div><form action="/open" method="post"><input name="token" type="hidden" value="${token}"><input name="name" type="hidden" value="${escape(name)}"><button class="open" type="submit">เปิด Dashboard</button></form></div>`).join('') : '<p class="empty">ยังไม่มีเว็บ เริ่มจากตั้งชื่อเว็บด้านบน</p>'}</div></main><script>
const form=document.querySelector('form.create'), idea=document.getElementById('creator-prompt');
form.addEventListener('submit', async (event) => {
  if (!idea.value) return;
  event.preventDefault();
  const child=window.open('about:blank', '_blank');
  if (!child) { alert('Please allow pop-ups to open your new site.'); return; }
  const draft=idea.value;
  try {
    const result=await fetch('/new', {method:'POST', headers:{'X-Creator-Handoff':'1'}, body:new URLSearchParams(new FormData(form))});
    if (!result.ok) throw new Error('Please check the site name and try again.');
    const {url, nonce}=await result.json(), origin=new URL(url).origin;
    const timer=setTimeout(() => { window.removeEventListener('message', receive); alert('The idea could not be transferred. Copy it from this page.'); }, 60000);
    function receive(event) {
      if (event.source !== child || event.origin !== origin || event.data?.type !== 'creator-ready' || event.data?.nonce !== nonce) return;
      child.postMessage({type:'creator-idea', nonce, idea:draft}, origin);
      clearTimeout(timer); window.removeEventListener('message', receive);
    }
    window.addEventListener('message', receive);
    child.location.href=url;
  } catch (error) { child.close(); alert('Could not create site. Your idea is still here. ' + error.message); }
});
</script></html>`
    if (language !== 'en') return html
    let translated = html.replace('<html lang="th">', '<html lang="en">')
    for (const [thai, english] of Object.entries(translations).sort(([a], [b]) => b.length - a.length)) translated = translated.replaceAll(thai, english)
    return translated.replace('action="/new"', 'action="/new?lang=en"').replaceAll('action="/open"', 'action="/open?lang=en"').replace("fetch('/new',", "fetch('/new?lang=en',")
  }
  const server = createServer(async (request, response) => {
    const host = request.headers.host
    const local = `http://${host}`
    const send = (status, body, extra = {}) => {
      response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff', ...extra })
      response.end(body)
    }
    if (!/^((127\.0\.0\.1)|(localhost)):\d+$/.test(host ?? '')) return send(403, 'Local access only')
    const url = new URL(request.url, local)
    const language = url.searchParams.get('lang') === 'en' ? 'en' : 'th'
    if (request.method === 'GET' && url.pathname === '/') return send(200, page('', language))
    if (request.method !== 'POST' || !['/new', '/open'].includes(url.pathname)) return send(404, 'Not found')
    if (request.headers.origin && request.headers.origin !== local) return send(403, 'Wrong origin')
    try {
      const form = await readBody(request)
      if (form.get('token') !== token) return send(403, 'Wrong form token')
      const name = form.get('name') ?? ''
      const transfer = url.pathname === '/new' && request.headers['x-creator-handoff'] === '1'
      if (transfer && request.headers.origin !== local) return send(403, 'Wrong origin')
      const handoff = transfer ? { origin: local, nonce: randomBytes(24).toString('hex') } : null
      if (url.pathname === '/new') await createSite(name, sitesDir)
      const site = await open(name, handoff)
      const claimed = await site.db.prepare('SELECT id FROM sites LIMIT 1').first()
      if (transfer) return send(200, JSON.stringify({ url: site.url + '/', nonce: handoff.nonce }), { 'Content-Type': 'application/json; charset=utf-8' })
      return send(303, '', { Location: `${site.url}${claimed ? '/admin' : '/'}` })
    } catch (error) {
      return send(400, page(error.message, language))
    }
  })
  await new Promise((done, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', done) })
  const url = `http://127.0.0.1:${server.address().port}`
  return { url, running, async close() {
    await new Promise((done) => server.close(done))
    await Promise.all([...running.values()].map((site) => site.close()))
  } }
}
