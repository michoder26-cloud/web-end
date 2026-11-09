// Checks the HTMLRewriter stand-in on what the engine uses it for: the test-mode banner (prepend to
// <body>) and reading an old website when moving it (text of elements, attributes, end tags, JSON-LD).
import { HTMLRewriter } from '../host/html-rewriter.mjs'

let failed = 0
let passed = 0
const check = (ok, name, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : `: ${detail}`}`)
  ok ? passed++ : failed++
}
const page = `<!doctype html><html><head><title>Old &amp; site</title><meta name="description" content="A bakery"><style id="css_masterPage">.a{color:red}</style>
<script type="application/ld+json">{"@type":"Product","name":"Bread"}</script><script>if (a < b) document.write("<p>not a paragraph</p>")</script></head>
<BODY class="x"><header><h1>Fresh <em>bread</em></h1><a href="/menu">Menu</a></header>
<section><p>Line one<br>line two</p><img src="/a.jpg" alt="A loaf"><button>Order now</button></section><!-- <p>hidden</p> -->
<footer><p>Bye</p></footer></body></html>`

const banner = await new HTMLRewriter().on('body', { element: (body) => void body.prepend('<div id="banner">Test</div>', { html: true }) }).transform(new Response(page, { headers: { 'content-type': 'text/html' } })).text()
check(/<BODY class="x"><div id="banner">Test<\/div><header>/.test(banner), 'prepend puts HTML right after the opening body tag')
check(banner.replace('<div id="banner">Test</div>', '') === page, 'nothing else in the page changes')
const escaped = await new HTMLRewriter().on('body', { element: (body) => void body.prepend('<b>', {}) }).transform(new Response(page)).text()
check(escaped.includes('<BODY class="x">&lt;b&gt;'), 'prepend without html:true inserts text, escaped')

const found = { headings: [], links: [], paragraphs: [], sections: [], title: '', images: [], json: '', buttons: [], description: '', styles: '' }
const collect = (done) => {
  let text = ''
  return {
    element(element) {
      text = ''
      const href = element.getAttribute('href')
      element.onEndTag(() => done(text.replace(/\s+/g, ' ').trim(), href))
    },
    text(chunk) {
      text += chunk.text
    },
  }
}
const reader = new HTMLRewriter()
  .on('title', collect((text) => (found.title = text)))
  .on('h1', collect((text) => found.headings.push(text)))
  .on('a[href]', collect((text, href) => found.links.push(`${text}→${href}`)))
  .on('p', collect((text) => found.paragraphs.push(text)))
  .on('br', { element: () => found.paragraphs.push('<br>') })
  .on('section, header, footer', { element: (element) => found.sections.push(element.tagName) })
  .on('img', { element: (element) => found.images.push(`${element.getAttribute('src')}|${element.getAttribute('alt')}`) })
  .on('meta', { element: (element) => element.getAttribute('name') === 'description' && (found.description = element.getAttribute('content')) })
  .on('style', { text: (chunk) => (found.styles += chunk.text) })
  .on('script[type="application/ld+json"]', { text: (chunk) => (found.json += chunk.text) })
  .on('button', collect((text) => found.buttons.push(text)))
await reader.transform(new Response(page)).text()
check(found.title === 'Old &amp; site', 'title text is given raw, as Cloudflare does', found.title)
check(found.headings.join() === 'Fresh bread', 'text inside nested elements reaches the outer handler', found.headings.join())
check(found.links.join() === 'Menu→/menu', 'attribute selectors and getAttribute work', found.links.join())
check(found.paragraphs.join('|') === '<br>|Line oneline two|Bye', 'void elements fire without an end tag; comments and script text are not paragraphs', found.paragraphs.join('|'))
check(found.sections.join() === 'header,section,footer', 'comma selectors match each tag, case-insensitively')
check(found.images.join() === '/a.jpg|A loaf' && found.description === 'A bakery' && found.buttons.join() === 'Order now', 'images, meta tags and buttons are read')
check(JSON.parse(found.json).name === 'Bread' && found.styles === '.a{color:red}', 'script and style contents are read whole')
let threw = false
try {
  new HTMLRewriter().on('br', { element: (element) => element.onEndTag(() => {}) }).rewrite('<p>a<br>b</p>')
} catch {
  threw = true
}
check(threw, 'asking for the end tag of a void element fails, as in Cloudflare')
check((await new HTMLRewriter().on('p', { text() {} }).transform(new Response('<p>unclosed <b>bold')).text()) === '<p>unclosed <b>bold', 'broken HTML passes through unchanged')

console.log(`\nHTMLRewriter stand-in: ${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
