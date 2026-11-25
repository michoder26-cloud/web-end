// The same marking the page reader at render.tktf.at runs inside each page (moving.ts reads data-we-* and we-design).
// Runs inside the page, after it loaded and was scrolled through. Works for any site, whatever built it:
// it writes down what a visitor's browser actually shows.
//  - data-we-y/x/w/h on elements: where each thing showed, and how big
//  - data-we-bg (+ data-we-bgimg) on full-width bands with their own background
//  - <meta name="we-design">: the page's real colours, fonts and button look
//  - data-we-t on plain boxes and table cells that hold words of their own
//  - <script id="we-products">: a Shopify shop's own product list
//  - elements a visitor can't see are removed
async () => {
  window.scrollTo(0, 0)
  const hex = (color) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(color || '')
    if (!m || (m[4] !== undefined && Number(m[4]) < 0.5)) return null
    return '#' + [1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, '0')).join('')
  }
  const mode = (values) => {
    const counts = new Map()
    for (const value of values) if (value) counts.set(value, (counts.get(value) || 0) + 1)
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
  }
  const font = (el) => getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '')
  const viewport = document.documentElement.clientWidth
  const pageHeight = document.documentElement.scrollHeight

  const marked = 'img,picture,svg,video,h1,h2,h3,h4,h5,h6,p,li,dt,dd,blockquote,a,button,form,input,textarea,select,label,section,header,footer,nav,main,article,aside,figure,figcaption,span,div,td,th'
  const hidden = []
  const buttons = []
  for (const el of document.body.querySelectorAll('*')) {
    const style = getComputedStyle(el)
    const box = el.getBoundingClientRect()
    if (style.display === 'none' || style.visibility === 'hidden' || (box.width === 0 && box.height === 0 && !el.children.length)) {
      if (!['SCRIPT', 'STYLE', 'TEMPLATE', 'BR'].includes(el.tagName)) hidden.push(el)
      continue
    }
    // A full-width band with its own background colour or photo.
    const bg = hex(style.backgroundColor)
    const photo = /url\(["']?(https?:[^"')]+)/.exec(style.backgroundImage || '')?.[1]
    if ((bg || photo) && box.width >= viewport * 0.9 && box.height >= 120 && box.height < pageHeight * 0.8) {
      el.setAttribute('data-we-bg', bg || '')
      if (photo) el.setAttribute('data-we-bgimg', photo)
    }
    // Something that looks like a button: a filled, short, not too wide link or button with a few words.
    const words = (el.textContent || '').trim()
    if ((el.tagName === 'A' || el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') && bg && box.height >= 28 && box.height <= 80 && box.width >= 60 && box.width <= 420 && words.length > 0 && words.length <= 40) {
      const radius = parseFloat(style.borderTopLeftRadius) || 0
      buttons.push({ bg, color: hex(style.color), radius: radius >= box.height / 2 - 1 ? 999 : Math.round(radius) })
    }
    // Words that sit straight in a plain box or table cell, outside any paragraph, heading, list, link or button.
    if (['DIV', 'SPAN', 'TD', 'TH', 'LABEL', 'STRONG', 'SMALL', 'EM', 'B'].includes(el.tagName)
      && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length >= 2)
      && !el.closest('p,h1,h2,h3,h4,h5,h6,li,a,button,dt,dd,blockquote,option,select,textarea,figcaption,[data-we-t]')) el.setAttribute('data-we-t', '1')
    if (!el.matches(marked)) continue
    if ((el.tagName === 'DIV' || el.tagName === 'SPAN') && ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
    el.setAttribute('data-we-y', String(Math.round(box.top + window.scrollY)))
    el.setAttribute('data-we-x', String(Math.round(box.left + window.scrollX)))
    el.setAttribute('data-we-w', String(Math.round(box.width)))
    el.setAttribute('data-we-h', String(Math.round(box.height)))
  }

  // The page's own background: what shows at the left edge, down the page.
  const edge = []
  for (let y = 60; y < Math.min(pageHeight, 6000); y += 150) {
    window.scrollTo(0, Math.max(0, y - 300))
    const stack = document.elementsFromPoint(6, y - window.scrollY)
    edge.push(stack.map((el) => hex(getComputedStyle(el).backgroundColor)).find(Boolean) || '#ffffff')
  }
  window.scrollTo(0, 0)
  const background = mode(edge) || '#ffffff'
  // The main button stands out from the page: chips and tabs in the page's own colour or white don't count.
  const far = (a, b) => [1, 3, 5].reduce((sum, i) => sum + Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)), 0) > 60
  const standing = buttons.filter((b) => far(b.bg, background) && far(b.bg, '#ffffff'))
  const button = { bg: mode(standing.map((b) => b.bg)) }
  const sample = standing.find((b) => b.bg === button.bg)
  const design = {
    background,
    text: mode([...document.querySelectorAll('p')].slice(0, 80).map((el) => hex(getComputedStyle(el).color))),
    headingColor: mode([...document.querySelectorAll('h1,h2')].slice(0, 30).map((el) => hex(getComputedStyle(el).color))),
    headingFont: mode([...document.querySelectorAll('h1,h2,h3')].slice(0, 40).map(font)),
    bodyFont: mode([...document.querySelectorAll('p')].slice(0, 80).map(font)),
    buttonColor: button.bg,
    buttonText: sample?.color,
    buttonRadius: sample?.radius,
  }
  const meta = document.createElement('meta')
  meta.setAttribute('name', 'we-design')
  meta.setAttribute('content', JSON.stringify(design))
  document.head.appendChild(meta)
  // A Shopify shop lists its own products; asked from inside its page, the shop answers.
  if (window.Shopify) {
    try {
      const answer = await fetch('/products.json?limit=60', { headers: { accept: 'application/json' } })
      const list = answer.ok ? (await answer.json()).products : null
      if (Array.isArray(list) && list.length) {
        const slim = list.slice(0, 60).map((p) => ({ title: p.title, body_html: String(p.body_html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800), product_type: p.product_type, image: p.images && p.images[0] && p.images[0].src, variants: (p.variants || []).slice(0, 30).map((v) => ({ title: v.title, price: v.price, compare_at_price: v.compare_at_price })) }))
        const holder = document.createElement('script')
        holder.type = 'application/json'
        holder.id = 'we-products'
        holder.textContent = JSON.stringify(slim).replace(/</g, '\u003c')
        document.head.appendChild(holder)
      }
    } catch (error) { /* the cards on the page are read instead */ }
  }
  // Remove hidden things last (after links were collected, if the caller collects them from the page).
  for (const el of hidden) el.remove()
  return design
}
