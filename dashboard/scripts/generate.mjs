// Writes the HTML entry pages Vite builds: / and /login (sign in), /register (sign up)
// and /research (the Thai research report rendered from docs/research-report-th.md).
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { Marked } from 'marked'
import { siGoogle } from 'simple-icons'

const root = resolve(import.meta.dirname, '..')
const write = (path, text) => {
  const file = resolve(root, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}

const brand = 'web-end'
const icon = (glyph, size) =>
  `<svg class="provider-icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${glyph.path}"/></svg>`
const providers = {
  google: icon(siGoogle, 14),
}

const markIcon = `<svg class="mark" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="20" fill="var(--brand)"/><path d="M9 21h22a11 11 0 0 1-22 0z" fill="#fff"/></svg>`
const wordmark = `<a class="logo" href="/" aria-label="${brand} home">${markIcon.replace('class="mark"', 'class="mark mark-small"')}<span class="wordmark">${brand}</span></a>`

const showcase = `
<div class="showcase" role="img" aria-label="Illustration: an app you own, with its data and servers">
  <div class="sc-grid"></div>
  <div class="sc-card">
    <p class="sc-big">100%</p>
    <p class="sc-label">Data you own</p>
    <ul class="sc-legend"><li><i class="d d1"></i>Local</li><li><i class="d d2"></i>Server</li><li><i class="d d3"></i>Backup</li></ul>
    <div class="sc-dots">${Array.from({ length: 24 }, (_, i) => `<i class="d ${i % 6 === 3 || i % 6 === 5 ? 'd3' : i > 11 && i % 2 ? 'd2' : 'd1'}"></i>`).join('')}</div>
  </div>
  <p class="sc-line">Your app, your server <span class="sc-cursor"></span></p>
  <img class="sc-photo" src="/art/meadow.svg" alt="Abstract picture of a hill at sunset" width="226" height="340" /><div class="sc-glass"></div>
  <div class="sc-halftone"></div>
  <div class="sc-orange"><span class="sc-figure"></span></div>
</div>`

// Only the sign-in session cookie is used, which needs no consent banner.
const cookie = ''

function page({ mode, title, inner, legal, script = '/src/auth.js' }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${brand}</title>
    <meta name="description" content="Build useful apps you own, on your own server." />
    <link rel="icon" href="data:image/svg+xml,${encodeURIComponent(markIcon.replace('var(--brand)', '#ff6a00').replace('class="mark" ', 'xmlns="http://www.w3.org/2000/svg" '))}" />
    <script type="module" src="${script}"></script>
  </head>
  <body class="auth ${mode}">
    <div class="shell">
      <section class="side">
        <header class="side-head">${wordmark}</header>
        <main class="main">
          <div class="panel">
            <div class="panel-mark">${markIcon}</div>
            <h1 class="title">${title}</h1>
            ${inner}
            <p class="status" role="status" aria-live="polite" hidden></p>
          </div>
        </main>
        <footer class="legal"><p>${legal}</p></footer>
      </section>
      <aside class="art" aria-hidden="false">${showcase}</aside>
    </div>
    ${cookie}
  </body>
</html>
`
}

// Sign-in is Google only. The Pages Functions in functions/ handle /auth/google and /api/*.
function authPage(mode) {
  const login = mode === 'login'
  const verb = login ? 'Log in' : 'Sign up'
  const inner = `<div class="providers">
              <a class="btn outline" href="/auth/google" data-provider="google">${providers.google}<span>${verb} with Google</span></a>
            </div>
            <p class="swap">${login ? `New here? <a class="text-link" href="/register">Sign up</a>` : `Already have a ${brand} account? <a class="text-link" href="/login">Log in</a>`}</p>`
  const legal = login
    ? `See what we store in our <a href="/privacy/">Privacy notice</a>.`
    : `By signing up, you agree that we store what our <a href="/privacy/">Privacy notice</a> describes.`
  return page({ mode, title: login ? `Welcome to ${brand}` : 'Create your account', inner, legal })
}

write('index.html', authPage('login'))
write('login/index.html', authPage('login'))
write('register/index.html', authPage('register'))

// account/index.html (the Apps dashboard) is written by hand, not generated.

write(
  'privacy/index.html',
  page({
    mode: 'privacy',
    title: 'Privacy notice',
    script: '/src/privacy.js',
    inner: `<div class="notice">
              <p>When you sign in with Google, we receive and store your Google account ID, email address and name. We also store a sign-in session for up to 7 days.</p>
              <p>When you add an app, we store its name and web address, and we visit that address to read its page title and preview image and to check that it is online.</p>
              <p>We use one cookie, which keeps you signed in. We don't use tracking or advertising cookies.</p>
              <p>The data is stored in a Cloudflare D1 database and is used only to sign you in and to show your apps. You can delete your account and all its data at any time from your account page.</p>
            </div>
            <p class="swap"><a class="text-link" href="/login">Back to log in</a></p>`,
    legal: `${brand}`,
  }),
)

// The research report.
const source = readFileSync(resolve(root, 'docs/research-report-th.md'), 'utf8')
const slug = (text) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-')
const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const toc = []
const marked = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth, text }) {
      const id = slug(text)
      const inner = this.parser.parseInline(tokens)
      if (depth === 2) toc.push({ id, text: inner })
      return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${inner}</h${depth}>\n`
    },
    code({ text, lang }) {
      if (lang === 'mermaid') return `<pre class="mermaid">${escape(text)}</pre>\n`
      return `<pre><code>${escape(text)}</code></pre>\n`
    },
  },
})
const body = marked.parse(source).replace(/<table>/g, `<div class="table-wrap"><table>`).replaceAll('</table>', '</table></div>')
const reportTitle = 'รายงานวิจัย: แพลตฟอร์มสร้างเว็บแอปด้วย AI แบบ Open Source ที่ผู้ใช้เป็นเจ้าของ'
write(
  'research/index.html',
  `<!doctype html>
<html lang="th">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${reportTitle}</title>
    <meta name="description" content="Product, business and architecture research for an open-source, self-hosted alternative to AI app builders." />
    <script type="module" src="/src/report.js"></script>
  </head>
  <body class="report">
    <header class="report-bar">
      ${wordmark}
      <nav><a href="/login">Log in</a><a href="/register">Sign up</a><a href="/research/research-report-th.md" download>ดาวน์โหลด Markdown</a></nav>
    </header>
    <div class="report-layout">
      <nav class="toc" aria-label="สารบัญ"><p>สารบัญ</p><ol>${toc.map((t) => `<li><a href="#${t.id}">${t.text}</a></li>`).join('')}</ol></nav>
      <article class="doc">${body}</article>
    </div>
  </body>
</html>
`,
)
mkdirSync(resolve(root, 'public/research'), { recursive: true })
copyFileSync(resolve(root, 'docs/research-report-th.md'), resolve(root, 'public/research/research-report-th.md'))
console.log(`Generated 6 pages; report has ${toc.length} sections.`)
