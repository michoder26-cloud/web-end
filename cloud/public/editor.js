// The visual page editor of the back office. The page is shown with the site's own styles. Text is typed in
// place, sections are dragged into order, and photos are changed with a click. Changes save by themselves to
// the working copy; Publish makes them live. Every text is put in with textContent, never as HTML.
;(() => {
  'use strict'
  const data = JSON.parse(document.getElementById('editor-data').textContent)
  const root = document.getElementById('editor')
  const TH = data.lang === 'th'
  const W = TH
    ? {
        edit: 'แก้ไขเว็บ', page: 'หน้า', saved: 'บันทึกแล้ว', saving: 'กำลังบันทึก…', unsaved: 'ยังไม่ได้บันทึก', notSaved: 'บันทึกไม่ได้', retry: 'ลองอีกครั้ง',
        undo: 'เลิกทำ', publish: 'เผยแพร่', templates: 'แม่แบบ', back: 'หลังบ้าน', view: 'ดูหน้าเว็บ', library: 'เพิ่มส่วน', libraryHelp: 'ลากไปวางบนหน้า หรือกดเพื่อเพิ่มต่อท้าย',
        hint: 'คลิกข้อความเพื่อพิมพ์ทับ · จับปุ่ม ⠿ เพื่อลากสลับ · กดรูปเพื่อเปลี่ยน', gotIt: 'เข้าใจแล้ว',
        move: 'ลากเพื่อย้าย', up: 'เลื่อนขึ้น', down: 'เลื่อนลง', settings: 'ตั้งค่า', duplicate: 'ทำซ้ำ', remove: 'ลบ', addHere: 'เพิ่มส่วนตรงนี้', addSection: 'เพิ่มส่วน',
        addItem: 'เพิ่ม', removeItem: 'ลบรายการนี้', link: 'ลิงก์', linkHelp: 'ลิงก์ เช่น /about หรือ https://…', done: 'เสร็จ', close: 'ปิด',
        deleted: (n) => `ลบส่วน "${n}" แล้ว`, choosePhoto: 'เลือกรูป', upload: 'อัปโหลดรูปจากเครื่อง', uploading: 'กำลังอัปโหลด…', removePhoto: 'เอารูปออก', noPhotos: 'ยังไม่มีรูปในเว็บ อัปโหลดรูปแรกได้เลย',
        photoTooBig: 'รูปใหญ่เกิน 1 MB ระบบจะย่อให้อัตโนมัติ', addPhoto: 'เพิ่มรูป', photoAlt: 'คำอธิบายรูป (สำหรับคนที่มองไม่เห็นรูป)',
        locked: 'ส่วนนี้แก้ด้วยฟอร์ม', lockedHelp: 'ส่วนที่ต่อกับข้อมูล (ฟอร์ม สินค้า ตาราง โค้ด) ย้ายตำแหน่งได้ที่นี่ แก้รายละเอียดที่ปุ่มตั้งค่าหรือฟอร์มเดิม', openForm: 'เปิดฟอร์มแก้ไข',
        publishing: 'กำลังเผยแพร่…', leave: 'ยังมีการแก้ที่ไม่ได้บันทึก', hidden: 'หน้านี้ซ่อนอยู่', empty: 'หน้านี้ยังว่าง เพิ่มส่วนแรกได้เลย',
        type: 'พิมพ์ข้อความ', last: 'หน้าต้องมีอย่างน้อย 1 ส่วน', yes: 'ใช่', no: 'ไม่',
        needs: (n) => `ส่วน "${n}" ยังมีช่องที่ว่างอยู่ พิมพ์ข้อความลงไปก่อน แล้วระบบจะบันทึกเอง`,
      }
    : {
        edit: 'Edit site', page: 'Page', saved: 'Saved', saving: 'Saving…', unsaved: 'Not saved yet', notSaved: 'Not saved', retry: 'Try again',
        undo: 'Undo', publish: 'Publish', templates: 'Templates', back: 'Dashboard', view: 'Preview', library: 'Add a section', libraryHelp: 'Drag onto the page, or click to add at the end',
        hint: 'Click any text to type over it · drag ⠿ to reorder · click a photo to change it', gotIt: 'Got it',
        move: 'Drag to move', up: 'Move up', down: 'Move down', settings: 'Settings', duplicate: 'Duplicate', remove: 'Delete', addHere: 'Add a section here', addSection: 'Add a section',
        addItem: 'Add', removeItem: 'Remove this item', link: 'Link', linkHelp: 'Link, such as /about or https://…', done: 'Done', close: 'Close',
        deleted: (n) => `Deleted "${n}"`, choosePhoto: 'Choose a photo', upload: 'Upload a photo', uploading: 'Uploading…', removePhoto: 'Remove photo', noPhotos: 'No photos yet. Upload the first one.',
        photoTooBig: 'Photos over 1 MB are made smaller for you', addPhoto: 'Add a photo', photoAlt: 'Photo description (for people who can’t see it)',
        locked: 'Edited with a form', lockedHelp: 'Sections tied to data (forms, products, tables, code) can be moved here. Change their details in Settings or the form editor.', openForm: 'Open the form editor',
        publishing: 'Publishing…', leave: 'You have unsaved changes', hidden: 'This page is hidden', empty: 'This page is empty. Add the first section.',
        type: 'Type here', last: 'A page needs at least one section', yes: 'Yes', no: 'No',
        needs: (n) => `The "${n}" section has an empty box that needs text. Type something and it saves by itself.`,
      }
  const NAMES_TH = { hero: 'หัวเว็บ', text: 'ข้อความ', split: 'ข้อความคู่รูป', features: 'จุดเด่น', steps: 'ขั้นตอน', stats: 'ตัวเลข', pricing: 'ราคา', testimonials: 'คำชมจากลูกค้า', team: 'ทีมงาน', gallery: 'แกลเลอรี', info: 'ข้อมูล เช่น เวลาเปิด', faq: 'คำถามที่พบบ่อย', links: 'ลิงก์', cta: 'แถบเชิญชวน', form: 'ฟอร์ม', collection: 'สินค้าหรือรายการ', records: 'ข้อมูลจากตาราง', table: 'ตาราง', 'record-form': 'ฟอร์มเพิ่มข้อมูล', record: 'แก้ข้อมูลของตัวเอง', html: 'โค้ดเอง' }
  const DESC_TH = { hero: 'หัวข้อใหญ่ รูป และปุ่ม', text: 'ย่อหน้าข้อความ', split: 'รูปด้านหนึ่ง ข้อความอีกด้าน', features: 'การ์ดหลายช่อง', steps: 'ลำดับ 1 2 3', stats: 'ตัวเลขเด่น', pricing: 'แพ็กเกจและราคา', testimonials: 'คำพูดจริงของลูกค้า', team: 'รูปและชื่อคนในทีม', gallery: 'รูปหลายรูป', info: 'เวลาเปิด ที่อยู่ เบอร์โทร', faq: 'คำถามกับคำตอบ', links: 'ลิงก์ไปหน้าอื่น', cta: 'ข้อความเด่นกับปุ่ม', form: 'ติดต่อ จองคิว สมัคร' }
  const DESC_EN = { hero: 'Big heading, photo and button', text: 'Paragraphs of text', split: 'Photo beside text', features: 'Cards in a row', steps: 'Numbered steps', stats: 'Key numbers', pricing: 'Plans and prices', testimonials: 'Real customer quotes', team: 'People with photos', gallery: 'A set of photos', info: 'Hours, address, phone', faq: 'Questions and answers', links: 'Links to other pages', cta: 'A strong line and a button', form: 'Contact, booking, sign-up' }
  const nameOf = (type) => (TH ? NAMES_TH[type] : data.catalog[type]?.label) || type
  // The sections the editor shows as the site does and edits in place. The rest can be moved and set up, but not typed into.
  const INLINE = ['hero', 'text', 'split', 'features', 'steps', 'stats', 'pricing', 'testimonials', 'team', 'gallery', 'info', 'faq', 'links', 'cta']
  const LIBRARY = ['hero', 'split', 'features', 'gallery', 'info', 'pricing', 'testimonials', 'faq', 'steps', 'stats', 'team', 'text', 'cta', 'links', 'form']
  // New items for each list, and the field that holds an item's link, if any.
  const LISTS = {
    features: ['items', () => ({ title: TH ? 'หัวข้อใหม่' : 'New item', text: TH ? 'รายละเอียดสั้น ๆ' : 'A short description' })],
    steps: ['items', () => ({ title: TH ? 'ขั้นตอนใหม่' : 'New step' })],
    stats: ['items', () => ({ value: '1', label: TH ? 'คำอธิบาย' : 'Label' })],
    pricing: ['plans', () => ({ name: TH ? 'แพ็กเกจใหม่' : 'New plan', price: '0' }), 'buttonHref'],
    testimonials: ['items', () => ({ quote: TH ? 'คำพูดจริงของลูกค้า' : 'A real quote', name: TH ? 'ชื่อ' : 'Name' })],
    team: ['members', () => ({ name: TH ? 'ชื่อ' : 'Name' })],
    gallery: ['images', () => ({ imageUrl: 'https://', imageAlt: TH ? 'รูป' : 'Photo' })],
    info: ['items', () => ({ label: TH ? 'หัวข้อ' : 'Label', value: TH ? 'ข้อมูล' : 'Value' })],
    faq: ['items', () => ({ question: TH ? 'คำถาม' : 'Question', answer: TH ? 'คำตอบ' : 'Answer' })],
    links: ['items', () => ({ label: TH ? 'ลิงก์ใหม่' : 'New link', href: '/' }), 'href'],
  }
  const STARTS = {
    hero: { type: 'hero', eyebrow: TH ? 'คำโปรยสั้น ๆ' : 'A short line', heading: TH ? 'หัวข้อหลัก' : 'Your main heading', text: TH ? 'อธิบายสั้น ๆ ว่าคุณทำอะไร' : 'Say in a sentence what you do.', buttonLabel: TH ? 'ติดต่อเรา' : 'Contact us', buttonHref: '#contact' },
    text: { type: 'text', heading: TH ? 'หัวข้อ' : 'Heading', body: TH ? 'พิมพ์ข้อความของคุณที่นี่' : 'Write your text here.' },
    split: { type: 'split', heading: TH ? 'เรื่องราวของเรา' : 'Our story', body: TH ? 'เล่าที่มาของร้านด้วยคำของคุณเอง' : 'Tell your story in your own words.', imageUrl: 'https://', imageAlt: TH ? 'รูป' : 'Photo' },
    features: { type: 'features', heading: TH ? 'สิ่งที่เรามีให้' : 'What we offer', items: [1, 2, 3].map(() => LISTS.features[1]()) },
    steps: { type: 'steps', heading: TH ? 'ขั้นตอน' : 'How it works', items: [1, 2, 3].map((n) => ({ title: TH ? `ขั้นตอนที่ ${n}` : `Step ${n}` })) },
    stats: { type: 'stats', heading: TH ? 'ตัวเลขของเรา' : 'In numbers', items: [LISTS.stats[1]()] },
    pricing: { type: 'pricing', heading: TH ? 'ราคา' : 'Prices', plans: [LISTS.pricing[1](), LISTS.pricing[1]()] },
    testimonials: { type: 'testimonials', heading: TH ? 'ลูกค้าพูดถึงเรา' : 'What customers say', items: [LISTS.testimonials[1]()] },
    team: { type: 'team', heading: TH ? 'ทีมของเรา' : 'Our team', members: [LISTS.team[1](), LISTS.team[1]()] },
    gallery: { type: 'gallery', heading: TH ? 'แกลเลอรี' : 'Gallery', images: [1, 2, 3].map(() => LISTS.gallery[1]()) },
    info: { type: 'info', id: 'hours', heading: TH ? 'เวลาเปิด' : 'Opening hours', items: [{ label: TH ? 'จันทร์–ศุกร์' : 'Mon–Fri', value: '09:00–18:00' }, { label: TH ? 'เสาร์–อาทิตย์' : 'Sat–Sun', value: '10:00–16:00' }] },
    faq: { type: 'faq', heading: TH ? 'คำถามที่พบบ่อย' : 'Questions', items: [LISTS.faq[1]()] },
    links: { type: 'links', heading: TH ? 'ลิงก์' : 'Links', items: [LISTS.links[1]()] },
    cta: { type: 'cta', heading: TH ? 'ข้อความเชิญชวน' : 'Ready to start?', buttonLabel: TH ? 'เริ่มเลย' : 'Get started', buttonHref: '#contact' },
  }
  const startFor = (type) => structuredClone(STARTS[type] || data.catalog[type]?.start || { type })

  // ---- state ----------------------------------------------------------------------------------
  let blocks = data.blocks
  const history = []
  let selected = -1
  let dirty = false
  let saving = false
  let saveTimer = null

  const snapshot = () => JSON.stringify(blocks)
  function changed(before) {
    history.push(before)
    if (history.length > 50) history.shift()
    els.undo.disabled = false
    dirty = true
    setStatus('unsaved')
    clearTimeout(saveTimer)
    saveTimer = setTimeout(save, 1200)
  }
  function edit(fn, { rerender = true } = {}) {
    const before = snapshot()
    fn()
    if (snapshot() === before) return
    changed(before)
    if (rerender) render()
  }
  function undo() {
    const last = history.pop()
    if (!last) return
    blocks = JSON.parse(last)
    els.undo.disabled = history.length === 0
    dirty = true
    setStatus('unsaved')
    clearTimeout(saveTimer)
    saveTimer = setTimeout(save, 800)
    render()
    hideToast()
  }

  // ---- saving ---------------------------------------------------------------------------------
  function setStatus(state, message) {
    els.status.dataset.state = state
    els.status.textContent = state === 'saved' ? W.saved : state === 'saving' ? W.saving : state === 'error' ? `${W.notSaved}: ${message}` : W.unsaved
  }
  async function save() {
    clearTimeout(saveTimer)
    if (saving) { saveTimer = setTimeout(save, 600); return false }
    if (!dirty) return true
    saving = true
    setStatus('saving')
    const sent = snapshot()
    try {
      const response = await fetch(`${data.base}/editor/${data.slug}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blocks }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        // A section with an empty required box: say which one in plain words and show it.
        if (typeof body.block === 'number' && blocks[body.block]) {
          select(body.block, true)
          throw new Error(W.needs(nameOf(blocks[body.block].type)))
        }
        throw new Error(body.error || `${response.status}`)
      }
      if (snapshot() === sent) { dirty = false; setStatus('saved') } else saveTimer = setTimeout(save, 600)
      return true
    } catch (error) {
      setStatus('error', String(error.message || error))
      return false
    } finally {
      saving = false
    }
  }
  addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = W.leave } })

  // ---- small DOM helpers ----------------------------------------------------------------------------
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag)
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value == null || value === false) continue
      if (key === 'class') el.className = value
      else if (key === 'text') el.textContent = value
      else if (key.startsWith('on')) el.addEventListener(key.slice(2), value)
      else el.setAttribute(key, value === true ? '' : value)
    }
    for (const child of children.flat()) if (child != null && child !== false) el.append(child)
    return el
  }
  const ICONS = {
    grip: 'M9 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm9 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM9 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm9 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM9 18.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm9 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z',
    up: 'M12 19V5M5 12l7-7 7 7', down: 'M12 5v14M5 12l7 7 7-7', gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
    dup: 'M9 9h11v11H9zM5 15V4h11', del: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3', plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6 6 18', link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  }
  const icon = (name) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('class', `ed-i${name === 'grip' ? ' ed-i--fill' : ''}`)
    svg.setAttribute('aria-hidden', 'true')
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', ICONS[name])
    svg.append(path)
    return svg
  }
  const getPath = (obj, path) => path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), obj)
  function setPath(obj, path, value) {
    const keys = path.split('.')
    const last = keys.pop()
    const target = keys.reduce((value, key) => value[key], obj)
    if (value === '' || value == null) delete target[last]
    else target[last] = value
  }
  // Uploaded photos are shown through the back office, so they appear before the site's first publish too.
  const shown = (url) => (/^\/media\/\d+$/.test(url) ? `${data.base}/editor/${data.slug}/media/${url.split('/')[2]}` : url)
  const goodImage = (url) => typeof url === 'string' && (/^\/media\/\d+$/.test(url) || (url.startsWith('https://') && url.length > 8))

  // ---- rendering one section as the site does, with editable text ---------------------------------
  // f(): an editable text. Empty optional texts show only while their section is selected.
  function f(tag, cls, block, path, { multi = false } = {}) {
    const value = getPath(block, path)
    const el = h(tag, { class: `${cls || ''} ed-text${value ? '' : ' ed-empty'}`.trim(), contenteditable: 'true', spellcheck: 'false', 'data-f': path, 'data-ph': W.type })
    if (multi) el.dataset.multi = ''
    el.textContent = value == null ? '' : String(value)
    return el
  }
  function photo(block, path, altPath, cls) {
    const url = getPath(block, path)
    const has = goodImage(url)
    const el = h('div', { class: `ed-photo ${cls || ''}${has ? '' : ' ed-photo--empty'}`, role: 'button', tabindex: '0', 'data-img': path, 'data-alt': altPath, 'aria-label': W.choosePhoto })
    if (has) el.append(h('img', { src: shown(url), alt: getPath(block, altPath) || '', loading: 'lazy', referrerpolicy: 'no-referrer' }))
    else el.append(h('span', { text: W.addPhoto }))
    return el
  }
  const btn = (block, path = 'buttonLabel') => f('span', 'button', block, path)
  const sec = (name, tone, ...inner) => h('section', { class: `block block--${name} tone-${['tint', 'dark'].includes(tone) ? tone : 'plain'}` }, ...inner)
  const headOf = (block) => h('div', { class: 'section-head' }, f('h2', '', block, 'heading'), 'intro' in (data.catalog[block.type]?.fields.reduce((all, field) => ({ ...all, [field.key]: 1 }), {}) || {}) ? f('p', 'intro', block, 'intro', { multi: true }) : null)
  function list(block, make, wrap) {
    const [key] = LISTS[block.type]
    const items = Array.isArray(block[key]) ? block[key] : []
    const children = items.map((item, index) => {
      const el = make(item, `${key}.${index}`, index)
      el.classList.add('ed-item')
      el.dataset.item = `${key}.${index}`
      return el
    })
    wrap.append(...children, h('button', { type: 'button', class: 'ed-add-item', 'data-act': 'add-item', 'data-list': key }, icon('plus'), W.addItem))
    return wrap
  }
  const R = {
    hero(b, first) {
      const layout = goodImage(b.imageUrl) ? b.layout || 'split' : b.layout === 'centered' ? 'centered' : 'plain'
      const copy = h('div', { class: 'hero__copy' }, f('p', 'eyebrow', b, 'eyebrow'), f(first ? 'h1' : 'h2', '', b, 'heading'), f('p', 'lead', b, 'text', { multi: true }), btn(b))
      const image = photo(b, 'imageUrl', 'imageAlt', layout === 'cover' ? 'hero__media' : 'hero__image')
      return h('section', { class: `block block--hero hero--${layout} tone-${b.tone || 'plain'}` }, layout === 'cover' ? image : null, h('div', { class: 'wrap hero' }, copy, layout === 'cover' ? null : image))
    },
    text: (b) => sec('text', b.tone, h('div', { class: 'wrap prose' }, f('h2', '', b, 'heading'), f('div', 'pre-line ed-paras', b, 'body', { multi: true }))),
    split: (b) => sec('split', b.tone, h('div', { class: `wrap split split--image-${b.imageSide === 'left' ? 'left' : 'right'}` }, h('div', { class: 'split__copy' }, f('h2', '', b, 'heading'), f('div', 'pre-line ed-paras', b, 'body', { multi: true }), btn(b)), photo(b, 'imageUrl', 'imageAlt', 'split__image'))),
    features: (b) => sec('features', b.tone, h('div', { class: 'wrap' }, headOf(b), list(b, (item, p) => h('article', { class: 'card' }, f('h3', '', b, `${p}.title`), f('p', 'pre-line', b, `${p}.text`, { multi: true })), h('div', { class: 'grid features' })))),
    steps: (b) => sec('steps', b.tone, h('div', { class: 'wrap' }, headOf(b), list(b, (item, p) => h('li', {}, f('h3', '', b, `${p}.title`), f('p', 'pre-line', b, `${p}.text`, { multi: true })), h('ol', { class: 'steps' })))),
    stats: (b) => sec('stats', b.tone, h('div', { class: 'wrap' }, headOf(b), list(b, (item, p) => h('div', {}, f('dd', '', b, `${p}.value`), f('dt', '', b, `${p}.label`)), h('dl', { class: 'stats' })))),
    pricing: (b) => sec('pricing', b.tone, h('div', { class: 'wrap' }, headOf(b), list(b, (item, p) => h('article', { class: `card plan${item.highlighted ? ' plan--highlighted' : ''}` }, f('h3', '', b, `${p}.name`), f('p', 'plan__price', b, `${p}.price`), f('p', 'plan__note', b, `${p}.note`), f('div', 'pre-line ed-lines', b, `${p}.features`, { multi: true }), f('span', 'button', b, `${p}.buttonLabel`)), h('div', { class: 'grid pricing' })))),
    testimonials: (b) => sec('testimonials', b.tone, h('div', { class: 'wrap' }, headOf(b), list(b, (item, p) => h('figure', { class: 'card quote' }, f('blockquote', '', b, `${p}.quote`, { multi: true }), h('figcaption', {}, f('strong', '', b, `${p}.name`), f('span', '', b, `${p}.role`))), h('div', { class: 'grid testimonials' })))),
    team: (b) => sec('team', b.tone, h('div', { class: 'wrap' }, headOf(b), list(b, (item, p) => h('article', {}, photo(b, `${p}.imageUrl`, `${p}.name`, 'team__photo'), f('h3', '', b, `${p}.name`), f('p', 'team__role', b, `${p}.role`), f('p', 'pre-line', b, `${p}.text`, { multi: true })), h('div', { class: 'grid team' })))),
    gallery: (b) => sec('gallery', b.tone, h('div', { class: 'wrap' }, headOf(b), list(b, (item, p) => h('figure', {}, photo(b, `${p}.imageUrl`, `${p}.imageAlt`), f('figcaption', '', b, `${p}.caption`)), h('div', { class: 'gallery' })))),
    info: (b) => sec('info', b.tone, h('div', { class: 'wrap info' }, f('h2', '', b, 'heading'), h('div', {}, list(b, (item, p) => h('div', {}, f('dt', '', b, `${p}.label`), f('dd', 'pre-line', b, `${p}.value`, { multi: true })), h('dl', {})), btn(b)))),
    faq: (b) => sec('faq', b.tone, h('div', { class: 'wrap info' }, f('h2', '', b, 'heading'), list(b, (item, p) => h('div', { class: 'ed-faq' }, f('p', 'ed-faq__q', b, `${p}.question`), f('div', 'pre-line', b, `${p}.answer`, { multi: true })), h('div', {})))),
    links: (b) => sec('links', b.tone, h('div', { class: 'wrap' }, headOf(b), list(b, (item, p) => h('div', { class: 'card link-card' }, f('h3', '', b, `${p}.label`), f('p', 'pre-line', b, `${p}.text`, { multi: true })), h('div', { class: 'grid' })))),
    cta: (b) => sec('cta', b.tone || 'dark', h('div', { class: 'wrap cta' }, h('div', {}, f('h2', '', b, 'heading'), f('p', 'pre-line', b, 'text', { multi: true })), btn(b))),
  }
  function locked(b) {
    const title = b.heading || b.title || b.name || b.collection || b.table || ''
    return sec('ed-locked', 'plain', h('div', { class: 'wrap ed-locked' }, h('p', { class: 'ed-locked__kind', text: `${nameOf(b.type)} · ${W.locked}` }), title ? h('h2', { text: title }) : null, h('p', { class: 'ed-locked__help', text: W.lockedHelp }), h('a', { class: 'button button--ghost', href: `${data.base}/page/${data.slug}` , text: W.openForm })))
  }

  function blockTools(index, type) {
    const tb = (act, name, label, extra = {}) => h('button', { type: 'button', 'data-act': act, title: label, 'aria-label': label, ...extra }, icon(name))
    return h('div', { class: 'ed-tools', contenteditable: 'false' },
      h('button', { type: 'button', class: 'ed-grip', 'data-drag': String(index), title: W.move, 'aria-label': `${W.move}: ${nameOf(type)}` }, icon('grip')),
      h('span', { class: 'ed-tools__name', text: nameOf(type) }),
      tb('up', 'up', W.up), tb('down', 'down', W.down), tb('settings', 'gear', W.settings), tb('dup', 'dup', W.duplicate), tb('del', 'del', W.remove))
  }
  function render() {
    const scroll = els.stage.scrollTop
    const nodes = blocks.map((block, index) => {
      const inner = INLINE.includes(block.type) ? R[block.type](block, index === blocks.findIndex((b) => b.type === 'hero')) : locked(block)
      const wrap = h('div', { class: `ed-blk${index === selected ? ' is-sel' : ''}`, 'data-i': String(index), 'data-type': block.type }, blockTools(index, block.type), inner,
        h('button', { type: 'button', class: 'ed-add-between', 'data-act': 'add-after', title: W.addHere }, icon('plus'), W.addSection))
      return wrap
    })
    els.page.replaceChildren(...nodes)
    if (!blocks.length) els.page.append(h('p', { class: 'ed-empty-page', text: W.empty }))
    els.stage.scrollTop = scroll
  }

  // ---- the frame: top bar, library, stage --------------------------------------------------------
  const els = {}
  function frame() {
    els.status = h('span', { class: 'ed-status', role: 'status', 'data-state': 'saved', text: W.saved })
    els.undo = h('button', { type: 'button', class: 'ed-btn', disabled: true, onclick: undo, text: W.undo })
    const pagePick = h('select', { class: 'ed-select', 'aria-label': W.page, onchange: async (event) => { if (await save()) location.href = `${data.base}/editor/${event.target.value}` } },
      data.pages.map((page) => h('option', { value: page.slug, selected: page.slug === data.slug || null, text: `${page.title} (/${page.slug === 'home' ? '' : page.slug})` })))
    els.publish = data.canPublish ? h('button', { type: 'button', class: 'ed-btn ed-btn--primary', onclick: publish, text: W.publish }) : null
    const bar = h('header', { class: 'ed-bar' },
      h('a', { class: 'ed-mark', href: data.base, title: W.back, text: 'WE' }),
      h('div', { class: 'ed-bar__site' }, h('strong', { text: data.siteName }), h('span', { class: 'ed-bar__page' }, pagePick, data.published ? null : h('em', { text: W.hidden }))),
      els.status,
      h('div', { class: 'ed-bar__acts' }, els.undo,
        h('a', { class: 'ed-btn', href: `${data.base}/preview${data.slug === 'home' ? '' : `/${data.slug}`}`, target: '_blank', rel: 'noopener', text: W.view }),
        h('a', { class: 'ed-btn ed-btn--wide', href: `${data.base}/starters`, text: W.templates }), els.publish))
    els.lib = h('aside', { class: 'ed-lib', 'aria-label': W.library }, h('h2', { text: W.library }), h('p', { text: W.libraryHelp }),
      h('ul', {}, LIBRARY.filter((type) => data.catalog[type]).map((type) => h('li', {}, libCard(type)))))
    els.page = h('div', { class: 'ed-page', id: 'ed-page' })
    let hintSeen = false
    try { hintSeen = localStorage.getItem('we-editor-hint') === '1' } catch {}
    const hint = hintSeen ? null : h('p', { class: 'ed-hint' }, h('span', { text: W.hint }), h('button', { type: 'button', text: W.gotIt, onclick: (event) => { event.target.parentElement.remove(); try { localStorage.setItem('we-editor-hint', '1') } catch {} } }))
    els.stage = h('main', { class: 'ed-stage' }, hint, h('div', { class: 'ed-site' }, els.page),
      h('button', { type: 'button', class: 'ed-add-end', 'data-act': 'add-end' }, icon('plus'), W.addSection))
    els.toast = h('div', { class: 'ed-toast', role: 'status', hidden: true }, h('span'), h('button', { type: 'button', text: W.undo, onclick: undo }))
    root.replaceChildren(bar, h('div', { class: 'ed-work' }, els.lib, els.stage), els.toast)
  }
  function libCard(type, asButton = false) {
    const desc = (TH ? DESC_TH : DESC_EN)[type] || ''
    return h(asButton ? 'button' : 'div', { class: 'ed-card', 'data-new': type, ...(asButton ? { type: 'button' } : { role: 'button', tabindex: '0' }) }, h('b', { text: nameOf(type) }), h('small', { text: desc }))
  }

  // ---- toast ----------------------------------------------------------------------------------------
  let toastTimer
  function toast(text, withUndo = false) {
    els.toast.firstChild.textContent = text
    els.toast.lastChild.hidden = !withUndo
    els.toast.hidden = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(hideToast, 6000)
  }
  const hideToast = () => { els.toast.hidden = true }

  // ---- sheets: add a section, photos, settings, links ---------------------------------------------
  let sheet = null
  function openSheet(title, body, onClose) {
    closeSheet()
    const close = h('button', { type: 'button', class: 'ed-x', 'aria-label': W.close, onclick: closeSheet }, icon('x'))
    sheet = h('div', { class: 'ed-veil', onclick: (event) => { if (event.target === sheet) closeSheet() } },
      h('div', { class: 'ed-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('header', {}, h('h2', { text: title }), close), h('div', { class: 'ed-sheet__body' }, body)))
    sheet.onClose = onClose
    sheet.returnTo = document.activeElement
    document.body.append(sheet)
    close.focus()
  }
  function closeSheet() {
    if (!sheet) return
    const was = sheet
    sheet = null
    was.remove()
    was.onClose?.()
    was.returnTo?.focus?.()
  }
  addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sheet) closeSheet()
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey && !event.target.closest?.('[contenteditable="true"], input, textarea')) { event.preventDefault(); undo() }
  })

  function insertAt(index, type) {
    edit(() => blocks.splice(index, 0, startFor(type)))
    select(index, true)
  }
  function openAdd(index) {
    const grid = h('div', { class: 'ed-cards' }, LIBRARY.filter((type) => data.catalog[type]).map((type) => libCard(type, true)))
    grid.addEventListener('click', (event) => {
      const card = event.target.closest('[data-new]')
      if (!card) return
      closeSheet()
      insertAt(index, card.dataset.new)
    })
    openSheet(W.addSection, grid)
  }

  function openPhotos(path, altPath) {
    const index = selected
    const status = h('p', { class: 'ed-note', text: W.photoTooBig })
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true })
    const choose = (url) => { closeSheet(); edit(() => setPath(blocks[index], path, url)) }
    const grid = h('div', { class: 'ed-photos' }, data.media.length ? data.media.map((image) => h('button', { type: 'button', class: 'ed-photo-pick', title: image.name, onclick: () => choose(image.url) }, h('img', { src: shown(image.url), alt: image.name, loading: 'lazy' }))) : h('p', { class: 'ed-note', text: W.noPhotos }))
    const alt = h('input', { class: 'ed-input', value: getPath(blocks[index], altPath) || '', maxlength: '200' })
    const upload = h('button', { type: 'button', class: 'ed-btn ed-btn--primary', text: W.upload, onclick: () => file.click() })
    file.addEventListener('change', async () => {
      const chosen = file.files?.[0]
      if (!chosen) return
      upload.disabled = true
      status.textContent = W.uploading
      try {
        const body = new FormData()
        body.append('file', await shrink(chosen), chosen.name.replace(/\.[^.]+$/, '') + '.jpg')
        const response = await fetch(`${data.base}/editor/${data.slug}/image`, { method: 'POST', body })
        const result = await response.json().catch(() => ({}))
        if (!response.ok || !result.url) throw new Error(result.error || `${response.status}`)
        data.media.unshift({ name: chosen.name, url: result.url })
        choose(result.url)
      } catch (error) {
        status.textContent = String(error.message || error)
        upload.disabled = false
      }
    })
    const hasPhoto = goodImage(getPath(blocks[index], path))
    openSheet(W.choosePhoto, [grid, h('div', { class: 'ed-row' }, upload, file, hasPhoto ? h('button', { type: 'button', class: 'ed-btn', text: W.removePhoto, onclick: () => choose(required(blocks[index].type, path) ? 'https://' : '') }) : null), status,
      altPath ? h('label', { class: 'ed-field' }, h('span', { text: W.photoAlt }), alt) : null], () => {
      if (altPath && blocks[index] && alt.value.trim() !== (getPath(blocks[index], altPath) || '')) edit(() => setPath(blocks[index], altPath, alt.value.trim()))
    })
  }
  // A photo these sections can't be without: removing it leaves an empty link, which shows no picture.
  const required = (type, path) => (type === 'split' && path === 'imageUrl') || (type === 'gallery' && /^images\.\d+\.imageUrl$/.test(path))
  // Photos are made at most 1600px wide as JPEG, so a phone photo fits the 1 MB limit.
  function shrink(file) {
    return new Promise((resolve) => {
      if (file.type === 'image/gif' || file.size < 400_000) return resolve(file)
      const image = new Image()
      const url = URL.createObjectURL(file)
      image.onload = () => {
        URL.revokeObjectURL(url)
        const scale = Math.min(1, 1600 / Math.max(image.width, image.height))
        const canvas = h('canvas', { width: String(Math.round(image.width * scale)), height: String(Math.round(image.height * scale)) })
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', 0.84)
      }
      image.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
      image.src = url
    })
  }

  function openSettings(index) {
    const block = blocks[index]
    const fields = data.catalog[block.type]?.fields || []
    const inputs = fields.map((field) => {
      const value = block[field.key]
      let input
      if (field.kind === 'bool') input = h('input', { type: 'checkbox', checked: value ? true : null })
      else if (field.kind === 'select') input = h('select', { class: 'ed-input' }, (field.options || []).map((option) => h('option', { value: option.value, selected: option.value === (value ?? '') || null, text: option.label || '—' })))
      else if (field.kind === 'long' || field.kind === 'lines') input = h('textarea', { class: 'ed-input', rows: '3' })
      else input = h('input', { class: 'ed-input', type: field.kind === 'number' ? 'number' : 'text' })
      if (field.kind === 'lines') input.value = Array.isArray(value) ? value.join('\n') : ''
      else if (field.kind !== 'bool' && field.kind !== 'select') input.value = value ?? ''
      input.dataset.key = field.key
      input.dataset.kind = field.kind
      return h('label', { class: field.kind === 'bool' ? 'ed-check' : 'ed-field' }, field.kind === 'bool' ? [input, h('span', { text: field.label })] : [h('span', { text: field.label }), input])
    })
    const apply = h('button', { type: 'button', class: 'ed-btn ed-btn--primary', text: W.done, onclick: () => closeSheet() })
    const extra = INLINE.includes(block.type) ? null : h('a', { class: 'ed-btn', href: `${data.base}/page/${data.slug}`, text: W.openForm })
    openSheet(`${W.settings}: ${nameOf(block.type)}`, [h('div', { class: 'ed-form' }, inputs), h('div', { class: 'ed-row' }, apply, extra)], () => {
      if (!blocks[index]) return
      edit(() => {
        for (const input of sheetInputs(inputs)) {
          const { key, kind } = input.dataset
          let value = kind === 'bool' ? (input.checked ? true : undefined) : input.value.trim()
          if (kind === 'number') value = value === '' ? undefined : Number(value)
          if (kind === 'lines') value = value ? value.split('\n').map((line) => line.trim()).filter(Boolean) : undefined
          if (value === undefined || value === '' || (Array.isArray(value) && !value.length)) delete blocks[index][key]
          else blocks[index][key] = value
        }
      })
    })
  }
  const sheetInputs = (labels) => labels.map((label) => label.querySelector('[data-key]')).filter(Boolean)

  function openLink(index, path) {
    const input = h('input', { class: 'ed-input', value: getPath(blocks[index], path) || '', placeholder: '/about' })
    openSheet(W.link, [h('label', { class: 'ed-field' }, h('span', { text: W.linkHelp }), input), h('div', { class: 'ed-row' }, h('button', { type: 'button', class: 'ed-btn ed-btn--primary', text: W.done, onclick: closeSheet }))], () => {
      if (blocks[index]) edit(() => setPath(blocks[index], path, input.value.trim()))
    })
    input.focus()
  }

  // ---- clicks, typing ---------------------------------------------------------------------------------
  function select(index, scroll = false) {
    selected = index
    for (const el of els.page.querySelectorAll('.ed-blk')) el.classList.toggle('is-sel', Number(el.dataset.i) === index)
    const el = els.page.querySelector(`.ed-blk[data-i="${index}"]`)
    if (el && scroll) {
      el.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      el.classList.add('ed-flash')
      setTimeout(() => el.classList.remove('ed-flash'), 900)
    }
  }
  let ignoreClick = false
  function onClick(event) {
    if (ignoreClick) { ignoreClick = false; return }
    const add = event.target.closest('[data-act="add-end"]')
    if (add) return openAdd(blocks.length)
    const card = event.target.closest('.ed-lib [data-new]')
    if (card) return insertAt(blocks.length, card.dataset.new)
    const wrap = event.target.closest('.ed-blk')
    if (!wrap) { if (!event.target.closest('.ed-veil, .ed-bar, .ed-toast')) select(-1); return }
    const index = Number(wrap.dataset.i)
    const act = event.target.closest('[data-act]')?.dataset.act
    if (act === 'up' && index > 0) { edit(() => blocks.splice(index - 1, 0, ...blocks.splice(index, 1))); return select(index - 1, true) }
    if (act === 'down' && index < blocks.length - 1) { edit(() => blocks.splice(index + 1, 0, ...blocks.splice(index, 1))); return select(index + 1, true) }
    if (act === 'dup') { edit(() => blocks.splice(index + 1, 0, structuredClone(blocks[index]))); return select(index + 1, true) }
    if (act === 'del') {
      if (blocks.length === 1) return toast(W.last)
      const name = nameOf(blocks[index].type)
      edit(() => blocks.splice(index, 1))
      select(-1)
      return toast(W.deleted(name), true)
    }
    if (act === 'settings') return openSettings(index)
    if (act === 'add-after') return openAdd(index + 1)
    if (act === 'add-item') {
      const [key, make] = LISTS[blocks[index].type]
      edit(() => { blocks[index][key] = [...(blocks[index][key] || []), make()] })
      return select(index)
    }
    if (act === 'remove-item' || act === 'item-link') {
      const path = event.target.closest('[data-item]').dataset.item
      if (act === 'item-link') return openLink(index, `${path}.${LISTS[blocks[index].type][2]}`)
      const [key, at] = path.split('.')
      edit(() => blocks[index][key].splice(Number(at), 1))
      return select(index)
    }
    const pic = event.target.closest('[data-img]')
    if (pic) { select(index); return openPhotos(pic.dataset.img, pic.dataset.alt) }
    if (event.target.closest('.button[data-f]') && !event.target.closest('[data-item]')) select(index)
    if (index !== selected) select(index)
  }
  function onKey(event) {
    const text = event.target.closest?.('[data-f]')
    if (text && event.key === 'Enter' && !('multi' in text.dataset)) { event.preventDefault(); text.blur() }
    const pic = event.target.closest?.('[data-img]')
    if (!text && pic && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); select(Number(pic.closest('.ed-blk').dataset.i)); openPhotos(pic.dataset.img, pic.dataset.alt) }
    const card = event.target.closest?.('.ed-lib [data-new]')
    if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); insertAt(blocks.length, card.dataset.new) }
  }
  let typingBefore = null
  function onFocusIn(event) {
    const text = event.target.closest?.('[data-f]')
    if (!text) return
    typingBefore = snapshot()
    const wrap = text.closest('.ed-blk')
    if (wrap && Number(wrap.dataset.i) !== selected) select(Number(wrap.dataset.i))
  }
  function onInput(event) {
    const text = event.target.closest?.('[data-f]')
    const wrap = text?.closest('.ed-blk')
    if (!text || !wrap) return
    const value = ('multi' in text.dataset ? text.innerText : text.textContent).replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim()
    setPath(blocks[Number(wrap.dataset.i)], text.dataset.f, value)
    text.classList.toggle('ed-empty', !value)
    dirty = true
    setStatus('unsaved')
    clearTimeout(saveTimer)
    saveTimer = setTimeout(save, 1500)
  }
  function onFocusOut(event) {
    const text = event.target.closest?.('[data-f]')
    if (!text || typingBefore == null) return
    if (snapshot() !== typingBefore) { history.push(typingBefore); els.undo.disabled = false }
    typingBefore = null
  }
  function onPaste(event) {
    const text = event.target.closest?.('[data-f]')
    if (!text) return
    event.preventDefault()
    let pasted = event.clipboardData?.getData('text/plain') || ''
    if (!('multi' in text.dataset)) pasted = pasted.replace(/\s*\n\s*/g, ' ')
    document.execCommand('insertText', false, pasted)
  }

  // ---- dragging sections, from the page or the library ------------------------------------------------
  let drag = null
  function onPointerDown(event) {
    if (event.button !== 0) return
    const grip = event.target.closest('.ed-grip')
    const card = event.target.closest('.ed-lib [data-new]')
    if (!grip && !card) return
    event.preventDefault()
    const from = grip ? Number(grip.dataset.drag) : null
    const type = card ? card.dataset.new : blocks[from].type
    drag = { from, type, startX: event.clientX, startY: event.clientY, moved: false, pointer: event.pointerId, card }
    ;(grip || card).setPointerCapture?.(event.pointerId)
  }
  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointer) return
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return
      drag.moved = true
      document.body.classList.add('ed-dragging')
      drag.ghost = h('div', { class: 'ed-ghost', text: nameOf(drag.type) })
      drag.line = h('div', { class: 'ed-drop-line' })
      document.body.append(drag.ghost)
      if (drag.from != null) els.page.querySelector(`.ed-blk[data-i="${drag.from}"]`)?.classList.add('is-dragged')
    }
    drag.ghost.style.transform = `translate(${event.clientX + 12}px, ${event.clientY + 12}px)`
    const rect = els.stage.getBoundingClientRect()
    const overPage = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
    drag.to = null
    if (overPage) {
      const wraps = [...els.page.querySelectorAll('.ed-blk')]
      let to = wraps.length
      for (const wrap of wraps) {
        const box = wrap.getBoundingClientRect()
        if (event.clientY < box.top + box.height / 2) { to = Number(wrap.dataset.i); break }
      }
      drag.to = to
      const anchor = wraps.find((wrap) => Number(wrap.dataset.i) === to)
      if (anchor) anchor.before(drag.line)
      else els.page.append(drag.line)
    } else drag.line.remove()
    // Scrolling while near the top or bottom of the page area.
    const edge = 70
    drag.scroll = event.clientY < rect.top + edge ? -1 : event.clientY > rect.bottom - edge ? 1 : 0
    if (drag.scroll && !drag.scrolling) {
      drag.scrolling = true
      const step = () => { if (!drag || !drag.scroll) { if (drag) drag.scrolling = false; return } els.stage.scrollTop += drag.scroll * 14; requestAnimationFrame(step) }
      requestAnimationFrame(step)
    }
  }
  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.pointer) return
    const done = drag
    drag = null
    document.body.classList.remove('ed-dragging')
    done.ghost?.remove()
    done.line?.remove()
    els.page.querySelector('.is-dragged')?.classList.remove('is-dragged')
    // A plain click on a library card is handled by the click that follows. After a drag that click is ignored.
    if (!done.moved) return
    ignoreClick = true
    setTimeout(() => { ignoreClick = false }, 0)
    if (done.to == null) return
    if (done.from == null) return insertAt(done.to, done.type)
    let to = done.to > done.from ? done.to - 1 : done.to
    if (to === done.from) return
    edit(() => blocks.splice(to, 0, ...blocks.splice(done.from, 1)))
    select(to, true)
  }

  // ---- publish --------------------------------------------------------------------------------------
  async function publish() {
    els.publish.disabled = true
    els.publish.textContent = W.publishing
    if (!(await save())) { els.publish.disabled = false; els.publish.textContent = W.publish; return }
    // The publish page does the release and shows what went live.
    const form = h('form', { method: 'post', action: `${data.base}/publish` }, h('input', { type: 'hidden', name: 'note', value: TH ? 'แก้ด้วยตัวแก้เว็บ' : 'Visual editor' }))
    document.body.append(form)
    dirty = false
    form.submit()
  }

  // ---- list item tools, added after each render ---------------------------------------------------------
  const baseRender = render
  render = function () {
    baseRender()
    for (const item of els.page.querySelectorAll('[data-item]')) {
      const wrap = item.closest('.ed-blk')
      const type = blocks[Number(wrap.dataset.i)]?.type
      const linkKey = LISTS[type]?.[2]
      item.prepend(h('span', { class: 'ed-item-tools', contenteditable: 'false' },
        linkKey ? h('button', { type: 'button', 'data-act': 'item-link', title: W.link, 'aria-label': W.link }, icon('link')) : null,
        h('button', { type: 'button', 'data-act': 'remove-item', title: W.removeItem, 'aria-label': W.removeItem }, icon('x'))))
    }
    for (const button of els.page.querySelectorAll('.ed-blk > section .button[data-f]:not([data-item] *)')) {
      const wrap = button.closest('.ed-blk')
      if (!('buttonHref' in (data.catalog[wrap.dataset.type]?.fields.reduce((all, field) => ({ ...all, [field.key]: 1 }), {}) || {}))) continue
      button.after(h('button', { type: 'button', class: 'ed-link-chip', contenteditable: 'false', title: W.link, onclick: (event) => { event.stopPropagation(); openLink(Number(wrap.dataset.i), 'buttonHref') } }, icon('link'), String(blocks[Number(wrap.dataset.i)].buttonHref || W.link)))
    }
  }

  frame()
  render()
  root.addEventListener('click', onClick)
  root.addEventListener('keydown', onKey)
  root.addEventListener('focusin', onFocusIn)
  root.addEventListener('focusout', onFocusOut)
  root.addEventListener('input', onInput)
  root.addEventListener('paste', onPaste)
  root.addEventListener('pointerdown', onPointerDown)
  addEventListener('pointermove', onPointerMove)
  addEventListener('pointerup', onPointerUp)
  addEventListener('pointercancel', onPointerUp)
})()
