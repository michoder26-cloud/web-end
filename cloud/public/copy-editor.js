// The editor for a page moved with its own look, made to be easy:
// - click a part to select it, drag it to move it (pink guides line it up with other parts), drag its corner to resize it
// - double-click words to type over them
// - the panel on the right changes text size, bold, colours, background, corners, spacing, shadow and fading
// - arrow keys nudge, Delete removes, Ctrl+Z undoes, Ctrl+D repeats
// Saving sends the page as arranged; the server cleans it again, so nothing in it can run.
;(() => {
  const data = JSON.parse(document.getElementById('copy-edit-data').textContent)
  const th = data.lang === 'th'
  const say = th
    ? {
        saving: 'กำลังบันทึก…', saved: 'บันทึกแล้ว กดเผยแพร่เมื่อพร้อม', failed: 'ทำไม่สำเร็จ', changed: 'มีการแก้ไขที่ยังไม่บันทึก', leave: 'มีการแก้ไขที่ยังไม่บันทึก',
        publishing: 'กำลังเผยแพร่…', published: 'เผยแพร่แล้ว เว็บจริงเป็นแบบนี้แล้ว', uploading: 'กำลังอัปโหลดรูป…', photoUrl: 'หรือวางที่อยู่รูป (https://…):',
        bigger: 'กรอบใหญ่ขึ้น', copy: 'ทำซ้ำ', remove: 'ลบ', photo: 'เปลี่ยนรูป', link: 'ลิงก์', linkAsk: 'ลิงก์ไปที่ไหน (เช่น /contact หรือ https://…):', back: 'คืนที่เดิม', front: 'ไว้หน้าสุด', type: 'พิมพ์แก้',
        hint: 'คลิกเพื่อเลือก ลากเพื่อย้าย ดับเบิลคลิกเพื่อพิมพ์', typing: 'กำลังพิมพ์ กด Enter หรือคลิกที่อื่นเมื่อเสร็จ',
        panel: 'แต่งหน้าตา', text: 'ตัวอักษร', size: 'ขนาด', bold: 'หนา', italic: 'เอียง', underline: 'ขีดเส้นใต้', align: 'จัดวาง', left: 'ซ้าย', center: 'กลาง', right: 'ขวา', color: 'สีตัวอักษร',
        box: 'กล่อง', fill: 'สีพื้นหลัง', none: 'ไม่มี', corners: 'มุมโค้ง', space: 'ระยะขอบใน', shadow: 'เงา', soft: 'อ่อน', strong: 'เข้ม', fade: 'ความชัด', width: 'กว้าง', reset: 'ล้างการแต่งของชิ้นนี้', more: 'สีอื่น', hide: 'ซ่อน', copyStyle: 'คัดลอกสไตล์', pasteStyle: 'วางสไตล์', styleCopied: 'คัดลอกสไตล์แล้ว เลือกชิ้นอื่นแล้วกด วางสไตล์', show: 'แสดงบน', desktop: 'คอม', phone: 'มือถือ', position: 'ตำแหน่ง', middle: 'จัดกึ่งกลาง', addTitle: 'เพิ่มลงในหน้า', addHint: 'ชิ้นใหม่ใช้หน้าตาเดียวกับเว็บของคุณ และวางต่อจากชิ้นที่เลือกไว้', heading: 'หัวข้อ', paragraph: 'ข้อความ', buttonPart: 'ปุ่ม', image: 'รูป', divider: 'เส้นคั่น', spacer: 'ช่องว่าง', boxPart: 'กล่อง', newHeading: 'หัวข้อใหม่', newText: 'พิมพ์ข้อความของคุณตรงนี้', newButton: 'ปุ่มใหม่', nothingUndo: 'ไม่มีอะไรให้เลิกทำแล้ว', nothingRedo: 'ไม่มีอะไรให้ทำซ้ำแล้ว', helpTitle: 'คีย์ลัด', close: 'ปิด', ai: 'AI', aiTitle: 'บอก AI ว่าอยากให้ชิ้นนี้เป็นแบบไหน', aiPlaceholder: 'เช่น ทำให้ดูหรูขึ้น ใช้สีทอง', aiSend: 'ให้ AI ทำ', aiWorking: 'AI กำลังทำ…', aiDone: 'AI แก้แล้ว ไม่ชอบกด Ctrl+Z ได้', aiOnlyHere: 'AI ใช้ได้เมื่อแก้เว็บในหน้า Edit with AI ของ tktf.at', aiTooBig: 'ชิ้นนี้ใหญ่เกินไป ลองเลือกชิ้นที่เล็กลง', aiSlow: 'AI ตอบช้าเกินไป ลองใหม่อีกครั้ง', aiNote: 'ใช้ 1 ข้อความ AI ต่อครั้ง', chips: ['ดูหรูขึ้น', 'เขียนให้น่าซื้อขึ้น', 'ทำให้เด่นขึ้น', 'สั้นลง', 'เป็นกันเองขึ้น', 'แปลเป็นภาษาอังกฤษ', 'แปลเป็นภาษาไทย'],
      }
    : {
        saving: 'Saving…', saved: 'Saved. Publish when you are ready.', failed: 'That did not work', changed: 'Unsaved changes', leave: 'You have unsaved changes',
        publishing: 'Publishing…', published: 'Published. The live site looks like this now.', uploading: 'Uploading the photo…', photoUrl: 'Or paste a photo address (https://…):',
        bigger: 'Bigger frame', copy: 'Repeat', remove: 'Remove', photo: 'Change photo', link: 'Link', linkAsk: 'Where should it link to (such as /contact or https://…):', back: 'Put back', front: 'Bring to front', type: 'Type',
        hint: 'Click to select, drag to move, double-click to type', typing: 'Typing. Press Enter or click elsewhere when done.',
        panel: 'Style', text: 'Text', size: 'Size', bold: 'Bold', italic: 'Italic', underline: 'Underline', align: 'Align', left: 'Left', center: 'Centre', right: 'Right', color: 'Text colour',
        box: 'Box', fill: 'Background', none: 'None', corners: 'Corners', space: 'Inner space', shadow: 'Shadow', soft: 'Soft', strong: 'Strong', fade: 'Opacity', width: 'Width', reset: 'Clear this part’s styling', more: 'More colours', hide: 'Hide', copyStyle: 'Copy style', pasteStyle: 'Paste style', styleCopied: 'Style copied. Select another part and press Paste style.', show: 'Show on', desktop: 'Computer', phone: 'Phone', position: 'Position', middle: 'Centre it', addTitle: 'Add to the page', addHint: 'New parts take your site’s own look, and go after the part you selected.', heading: 'Heading', paragraph: 'Text', buttonPart: 'Button', image: 'Photo', divider: 'Divider', spacer: 'Space', boxPart: 'Box', newHeading: 'New heading', newText: 'Type your words here', newButton: 'New button', nothingUndo: 'Nothing left to undo', nothingRedo: 'Nothing left to redo', helpTitle: 'Shortcuts', close: 'Close', ai: 'AI', aiTitle: 'Tell the AI how this part should be', aiPlaceholder: 'Such as: make it look more premium, in gold', aiSend: 'Ask the AI', aiWorking: 'The AI is working…', aiDone: 'Changed by the AI. Not right? Press Ctrl+Z.', aiOnlyHere: 'The AI works when you edit in Edit with AI on tktf.at', aiTooBig: 'This part is too big. Try a smaller one.', aiSlow: 'The AI took too long. Please try again.', aiNote: 'Uses 1 AI message each time', chips: ['More premium', 'More persuasive', 'Stand out more', 'Shorter', 'Friendlier', 'Translate to English', 'Translate to Thai'],
      }

  const ui = '#we-edit-bar, #we-tools, #we-panel, #we-panel-open, #we-add, #we-help, #we-ai, .we-copy-menu, #we-file, #we-drop-line, .we-guide, .we-handle, #we-size'
  const ours = (element) => Boolean(element?.closest?.(ui))
  const status = (text) => { document.getElementById('we-edit-status').textContent = text }
  const flat = (value) => value.replace(/\s+/g, ' ').trim()
  const hasWords = (element) => [...element.childNodes].some((child) => child.nodeType === 3 && flat(child.data))
  const insertMode = () => document.getElementById('we-edit-free')?.checked
  let dirty = false
  let selected = null
  let editing = null
  const history = []
  const future = []
  const historyButtons = () => {
    document.getElementById('we-edit-undo').disabled = !history.length
    document.getElementById('we-edit-redo').disabled = !future.length
  }

  // The page's own parts, without the editor's buttons and marks.
  const content = () => {
    const copy = document.body.cloneNode(true)
    copy.querySelectorAll(`${ui}, script, link, #copy-edit-data`).forEach((node) => node.remove())
    copy.querySelectorAll('[contenteditable], [data-we-selected]').forEach((node) => { node.removeAttribute('contenteditable'); node.removeAttribute('data-we-selected') })
    copy.querySelectorAll('.we-ghost').forEach((node) => { node.classList.remove('we-ghost'); if (!node.classList.length) node.removeAttribute('class') })
    return copy.innerHTML
  }
  const remember = () => {
    history.push(content())
    if (history.length > 60) history.shift()
    future.length = 0
    historyButtons()
  }
  const changed = () => {
    dirty = true
    document.getElementById('we-edit-save').disabled = false
    status(say.changed)
  }

  const make = (tag, props = {}, ...children) => {
    const element = document.createElement(tag)
    for (const [key, value] of Object.entries(props)) {
      if (key === 'class') element.className = value
      else if (key === 'text') element.textContent = value
      else if (key.startsWith('on')) element.addEventListener(key.slice(2), value)
      else if (key === 'style') element.style.cssText = value
      else element.setAttribute(key, value)
    }
    element.append(...children.filter(Boolean))
    return element
  }

  // ---- What the editor draws on top of the page ----------------------------------------------------------
  const tools = make('div', { id: 'we-tools', hidden: '' })
  const panel = make('div', { id: 'we-panel', hidden: '' })
  let panelOpen = true
  const reopen = make('button', { type: 'button', id: 'we-panel-open', hidden: '', text: `🎨 ${say.panel}`, onclick: () => { panelOpen = true; buildPanel() } })
  const file = make('input', { id: 'we-file', type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: '' })
  const line = make('div', { id: 'we-drop-line', hidden: '' })
  const guideX = make('div', { class: 'we-guide we-guide-x', hidden: '' })
  const guideY = make('div', { class: 'we-guide we-guide-y', hidden: '' })
  const sizeTip = make('div', { id: 'we-size', hidden: '' })
  const handles = ['e', 's', 'se'].map((side) => make('div', { class: `we-handle we-handle-${side}`, 'data-side': side, hidden: '' }))
  document.body.append(tools, panel, reopen, file, line, guideX, guideY, sizeTip, ...handles)
  status(say.hint)

  const place = () => {
    if (!selected || !selected.isConnected) {
      tools.hidden = true
      handles.forEach((handle) => { handle.hidden = true })
      return
    }
    const box = selected.getBoundingClientRect()
    tools.hidden = false
    const top = Math.max(scrollY + 4, scrollY + box.top - tools.offsetHeight - 8)
    const left = Math.min(scrollX + document.documentElement.clientWidth - tools.offsetWidth - 8, Math.max(scrollX + 4, scrollX + box.left))
    tools.style.top = `${top}px`
    tools.style.left = `${left}px`
    const spots = { e: [box.right, box.top + box.height / 2], s: [box.left + box.width / 2, box.bottom], se: [box.right, box.bottom] }
    for (const handle of handles) {
      const [x, y] = spots[handle.dataset.side]
      handle.hidden = Boolean(editing)
      handle.style.left = `${scrollX + x - 6}px`
      handle.style.top = `${scrollY + y - 6}px`
    }
  }

  const button = (label, action, title) => make('button', { type: 'button', 'data-action': action, text: label, ...(title ? { title } : {}) })
  const stopEditing = () => {
    if (!editing) return
    editing.removeAttribute('contenteditable')
    editing = null
    status(say.hint)
    place()
  }
  const select = (element) => {
    if (element !== editing) stopEditing()
    if (selected) selected.removeAttribute('data-we-selected')
    selected = element
    if (!element) {
      tools.hidden = true
      panel.hidden = true
      reopen.hidden = true
      place()
      return
    }
    element.setAttribute('data-we-selected', '')
    aiBox.hidden = true
    tools.replaceChildren(
      button(`✨ ${say.ai}`, 'ai'),
      ...(element.parentElement && element.parentElement !== document.body ? [button(`⬚ ${say.bigger}`, 'bigger')] : []),
      ...(hasWords(element) ? [button(`✎ ${say.type}`, 'type')] : []),
      ...(element instanceof HTMLImageElement ? [button(`🖼 ${say.photo}`, 'photo')] : []),
      ...(element.closest('a') ? [button(`🔗 ${say.link}`, 'link')] : []),
      button(`⧉ ${say.copy}`, 'copy', 'Ctrl+D'),
      button(`🖌 ${say.copyStyle}`, 'copyStyle', 'Ctrl+Alt+C'),
      ...(copiedStyle ? [button(`🖌 ${say.pasteStyle}`, 'pasteStyle', 'Ctrl+Alt+V')] : []),
      ...(element.style.translate ? [button(`▲ ${say.front}`, 'front'), button(`↺ ${say.back}`, 'back')] : []),
      button(`✕ ${say.remove}`, 'remove', 'Delete'),
    )
    buildPanel()
    place()
  }
  const startEditing = (element, x, y) => {
    select(element)
    editing = element
    element.contentEditable = 'true'
    remember()
    element.focus()
    // The caret goes where the owner double-clicked.
    const range = x !== undefined && document.caretRangeFromPoint?.(x, y)
    if (range && element.contains(range.startContainer)) {
      const selection = getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
    }
    status(say.typing)
    place()
  }

  // ---- The style panel ----------------------------------------------------------------------------------
  // The page's own colours come first, so choices fit the look the site already has.
  const palette = (() => {
    const counts = new Map()
    const add = (value) => {
      const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(value)
      if (!match || (match[4] !== undefined && Number(match[4]) < 0.5)) return
      const hex = `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`
      counts.set(hex, (counts.get(hex) ?? 0) + 1)
    }
    for (const element of [...document.body.querySelectorAll('*')].slice(0, 1500)) {
      if (ours(element)) continue
      const style = getComputedStyle(element)
      add(style.color)
      add(style.backgroundColor)
    }
    const found = [...counts].sort((a, b) => b[1] - a[1]).map(([hex]) => hex)
    return [...new Set([...found.slice(0, 10), '#000000', '#ffffff'])].slice(0, 12)
  })()

  // Each change made in the panel can be undone; one undo step per control, however long it is dragged.
  let touching = null
  const styleChange = (key, apply) => {
    if (!selected) return
    if (touching !== key) {
      remember()
      touching = key
    }
    apply(selected.style)
    changed()
    place()
  }
  panel.addEventListener('pointerup', () => { touching = null })
  panel.addEventListener('change', () => { touching = null })

  const px = (value) => Math.round(parseFloat(value) || 0)
  const row = (label, ...controls) => make('div', { class: 'we-row' }, make('span', { class: 'we-label', text: label }), make('div', { class: 'we-controls' }, ...controls))
  const swatches = (key, property, current, withNone) =>
    make(
      'div',
      { class: 'we-swatches' },
      ...(withNone ? [make('button', { type: 'button', class: 'we-swatch we-swatch-none', title: say.none, onclick: () => styleChange(key, (style) => { style[property] = 'transparent' }) })] : []),
      ...palette.map((hex) => make('button', { type: 'button', class: `we-swatch${current === hex ? ' we-on' : ''}`, title: hex, style: `background:${hex}`, onclick: () => styleChange(key, (style) => { style[property] = hex }) })),
      make('label', { class: 'we-swatch we-swatch-more', title: say.more }, make('input', { type: 'color', value: current || '#000000', oninput: (event) => styleChange(key, (style) => { style[property] = event.target.value }) })),
    )
  const slider = (key, min, max, value, apply, unit = 'px') => {
    const out = make('output', { text: `${value}${unit}` })
    const input = make('input', { type: 'range', min: String(min), max: String(max), value: String(value), oninput: (event) => { out.textContent = `${event.target.value}${unit}`; styleChange(key, (style) => apply(style, Number(event.target.value))) } })
    return make('div', { class: 'we-slider' }, input, out)
  }
  const toggle = (label, on, apply, key) => make('button', { type: 'button', class: `we-toggle${on ? ' we-on' : ''}`, text: label, onclick: () => { styleChange(key, apply); buildPanel() } })
  const hexOf = (value) => {
    const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(value)
    if (!match || (match[4] !== undefined && Number(match[4]) === 0)) return ''
    return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`
  }

  function buildPanel() {
    if (!selected) { panel.hidden = true; reopen.hidden = true; return }
    reopen.hidden = panelOpen
    if (!panelOpen) { panel.hidden = true; return }
    const look = getComputedStyle(selected)
    const words = Boolean(flat(selected.textContent || ''))
    const size = px(look.fontSize)
    const bold = Number(look.fontWeight) >= 600
    const sections = [make('div', { class: 'we-panel-head' }, make('h2', { text: say.panel }), make('button', { type: 'button', class: 'we-close', text: say.hide, onclick: () => { panelOpen = false; buildPanel() } }))]
    if (words) {
      sections.push(
        make('h3', { text: say.text }),
        row(say.size, make('div', { class: 'we-stepper' },
          make('button', { type: 'button', text: 'A−', onclick: () => { styleChange('size', (style) => { style.fontSize = `${Math.max(8, px(getComputedStyle(selected).fontSize) - 2)}px` }); buildPanel() } }),
          make('span', { text: `${size}px` }),
          make('button', { type: 'button', text: 'A+', onclick: () => { styleChange('size', (style) => { style.fontSize = `${Math.min(160, px(getComputedStyle(selected).fontSize) + 2)}px` }); buildPanel() } }))),
        row('', toggle(`B ${say.bold}`, bold, (style) => { style.fontWeight = bold ? '400' : '700' }, 'bold'), toggle(`I ${say.italic}`, look.fontStyle === 'italic', (style) => { style.fontStyle = look.fontStyle === 'italic' ? 'normal' : 'italic' }, 'italic'), toggle(`U ${say.underline}`, look.textDecorationLine.includes('underline'), (style) => { style.textDecoration = look.textDecorationLine.includes('underline') ? 'none' : 'underline' }, 'underline')),
        row(say.align, ...['left', 'center', 'right'].map((side) => toggle(say[side], look.textAlign === side || (side === 'left' && look.textAlign === 'start'), (style) => { style.textAlign = side }, 'align'))),
        row(say.color, swatches('color', 'color', hexOf(look.color), false)),
      )
    }
    const radius = px(look.borderTopLeftRadius)
    const padding = px(look.paddingTop)
    const shadow = look.boxShadow && look.boxShadow !== 'none'
    sections.push(
      make('h3', { text: say.box }),
      row(say.fill, swatches('fill', 'backgroundColor', hexOf(look.backgroundColor), true)),
      row(say.corners, slider('corners', 0, 60, Math.min(60, radius), (style, value) => { style.borderRadius = `${value}px` })),
      row(say.space, slider('space', 0, 120, Math.min(120, padding), (style, value) => { style.padding = `${value}px` })),
      row(say.shadow, toggle(say.none, !shadow, (style) => { style.boxShadow = 'none' }, 'shadow'), toggle(say.soft, shadow && look.boxShadow.includes('24px'), (style) => { style.boxShadow = '0 6px 24px rgba(0,0,0,.12)' }, 'shadow'), toggle(say.strong, shadow && look.boxShadow.includes('40px'), (style) => { style.boxShadow = '0 14px 40px rgba(0,0,0,.28)' }, 'shadow')),
      row(say.fade, slider('fade', 10, 100, Math.round(Number(look.opacity) * 100), (style, value) => { style.opacity = String(value / 100) }, '%')),
      make('h3', { text: say.position }),
      row(say.show, toggle(`🖥 ${say.desktop}`, !selected.classList.contains('we-hide-desktop'), () => { selected.classList.toggle('we-hide-desktop') }, 'show'), toggle(`📱 ${say.phone}`, !selected.classList.contains('we-hide-phone'), () => { selected.classList.toggle('we-hide-phone') }, 'show')),
      row('', make('button', { type: 'button', text: `↔ ${say.middle}`, onclick: () => {
        // Moves the part so its middle meets the middle of the box it sits in.
        const box = selected.getBoundingClientRect()
        const outer = (selected.parentElement ?? document.body).getBoundingClientRect()
        const [x, y] = translateOf(selected)
        styleChange('middle', (style) => { style.translate = `${Math.round(x + outer.left + outer.width / 2 - (box.left + box.width / 2))}px ${y}px` })
      } })),
      make('button', { type: 'button', class: 'we-reset', text: say.reset, onclick: () => { styleChange('reset', () => { selected.removeAttribute('style') }); buildPanel() } }),
    )
    panel.replaceChildren(...sections)
    panel.hidden = false
  }

  // ---- Toolbar actions ------------------------------------------------------------------------------------
  // A copied style: the look a part shows, without where it sits or how big it is.
  let copiedStyle = null
  const styleKeys = ['color', 'background-color', 'background-image', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration-line', 'text-align', 'letter-spacing', 'line-height', 'border-radius', 'border', 'padding', 'box-shadow', 'opacity']
  const act = (action) => {
    if (!selected) return
    if (action === 'copyStyle') {
      const look = getComputedStyle(selected)
      copiedStyle = Object.fromEntries(styleKeys.map((key) => [key, look.getPropertyValue(key)]))
      select(selected)
      status(say.styleCopied)
      return
    }
    if (action === 'pasteStyle') {
      if (!copiedStyle) return
      remember()
      for (const [key, value] of Object.entries(copiedStyle)) if (value) selected.style.setProperty(key, value)
      changed()
      buildPanel()
      place()
      return
    }
    if (action === 'ai') return openAi()
    if (action === 'bigger') return select(selected.parentElement)
    if (action === 'type') return startEditing(selected)
    if (action === 'photo') return file.click()
    if (action === 'copy') {
      remember()
      // The twin sits next to the original and keeps its marks, so the site's own styles still reach it.
      const twin = selected.cloneNode(true)
      twin.removeAttribute('data-we-selected')
      selected.after(twin)
      select(twin)
    } else if (action === 'link') {
      const anchor = selected.closest('a')
      const next = prompt(say.linkAsk, anchor.getAttribute('href') ?? '')
      if (next === null || !/^(\/|#|https?:\/\/|mailto:|tel:)/.test(next.trim())) return
      remember()
      anchor.setAttribute('href', next.trim())
    } else if (action === 'front') {
      // Above what it now overlaps: the highest layer among the page's own parts, plus one.
      remember()
      if (getComputedStyle(selected).position === 'static') selected.style.position = 'relative'
      const highest = Math.max(0, ...[...document.querySelectorAll('body *')].filter((node) => !ours(node)).map((node) => parseInt(getComputedStyle(node).zIndex) || 0).filter((value) => value < 1_000_000))
      selected.style.zIndex = String(highest + 1)
    } else if (action === 'back') {
      remember()
      selected.style.translate = ''
      selected.style.zIndex = ''
      if (selected.style.position === 'relative') selected.style.position = ''
      if (!selected.getAttribute('style')) selected.removeAttribute('style')
      select(selected)
    } else if (action === 'remove') {
      remember()
      const gone = selected
      select(null)
      gone.remove()
    }
    changed()
    place()
  }
  tools.addEventListener('pointerdown', (event) => event.stopPropagation())
  tools.addEventListener('click', (event) => {
    const action = event.target.closest('button')?.dataset.action
    if (!action) return
    event.preventDefault()
    event.stopPropagation()
    act(action)
  })
  tools.addEventListener('contextmenu', (event) => {
    // A right click on the photo button asks for an address instead of a file.
    if (event.target.closest('button')?.dataset.action !== 'photo' || !(selected instanceof HTMLImageElement)) return
    event.preventDefault()
    const next = prompt(say.photoUrl, selected.getAttribute('src') ?? '')
    if (!next || !/^(https:\/\/|\/media\/\d+$)/.test(next.trim())) return
    remember()
    selected.setAttribute('src', next.trim())
    changed()
  })

  // A photo from the computer goes into the site's own storage.
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0]
    file.value = ''
    if (!chosen || !(selected instanceof HTMLImageElement)) return
    status(say.uploading)
    const body = new FormData()
    body.append('file', chosen)
    try {
      const response = await fetch(`${data.base}/editor/${data.slug}/image`, { method: 'POST', body })
      const answer = await response.json().catch(() => ({}))
      if (!response.ok || !answer.url) throw new Error(answer.error || say.failed)
      remember()
      selected.setAttribute('src', answer.url)
      selected.removeAttribute('srcset')
      changed()
    } catch (error) {
      status(`${say.failed}: ${error.message}`)
    }
  })

  // ---- Moving: press on a part and drag it ----------------------------------------------------------------
  // It moves by exactly as far as it is dragged, and snaps to the edges and middles of the parts around it and
  // of the page, shown by pink lines. With "between parts" on, it goes between other parts instead (blue line).
  let drag = null
  let justDragged = false
  const snapDistance = 6
  const rowLike = (element) => {
    const style = getComputedStyle(element)
    return (style.display.includes('flex') && !style.flexDirection.startsWith('column')) || style.display.includes('grid')
  }
  const dropAt = (x, y) => {
    const target = document.elementFromPoint(x, y)
    if (!target || ours(target) || target === document.body || target === document.documentElement || drag.element.contains(target)) return null
    const box = target.getBoundingClientRect()
    const empty = !target.children.length && !flat(target.textContent || '') && !['IMG', 'INPUT', 'HR', 'BR', 'VIDEO'].includes(target.tagName) && !(target instanceof SVGElement)
    if (empty && box.width > 40 && box.height > 20) return { target, where: 'inside', box }
    const across = target.parentElement && rowLike(target.parentElement)
    const after = across ? x > box.left + box.width / 2 : y > box.top + box.height / 2
    return { target, where: after ? 'after' : 'before', box, across }
  }
  const showLine = (spot) => {
    if (!spot) { line.hidden = true; return }
    const { box, where, across } = spot
    line.hidden = false
    line.classList.toggle('we-drop-inside', where === 'inside')
    if (where === 'inside') Object.assign(line.style, { left: `${box.left + scrollX}px`, top: `${box.top + scrollY}px`, width: `${box.width}px`, height: `${box.height}px` })
    else if (across) Object.assign(line.style, { left: `${(where === 'after' ? box.right : box.left) + scrollX - 2}px`, top: `${box.top + scrollY}px`, width: '4px', height: `${box.height}px` })
    else Object.assign(line.style, { left: `${box.left + scrollX}px`, top: `${(where === 'after' ? box.bottom : box.top) + scrollY - 2}px`, width: `${box.width}px`, height: '4px' })
  }
  // Lines to snap to: the page's middle, and the edges and middles of the parts near the one being moved.
  const snapLines = (element) => {
    const xs = [document.documentElement.clientWidth / 2]
    const ys = []
    const near = new Set()
    for (let level = element.parentElement, depth = 0; level && level !== document.body && depth < 3; level = level.parentElement, depth++) {
      near.add(level)
      for (const child of level.children) near.add(child)
    }
    for (const other of near) {
      if (other === element || element.contains(other) || other.contains(element) || ours(other)) continue
      const box = other.getBoundingClientRect()
      if (!box.width || !box.height) continue
      xs.push(box.left, box.left + box.width / 2, box.right)
      ys.push(box.top, box.top + box.height / 2, box.bottom)
    }
    const parent = element.parentElement?.getBoundingClientRect()
    if (parent) { xs.push(parent.left, parent.left + parent.width / 2, parent.right); ys.push(parent.top, parent.top + parent.height / 2, parent.bottom) }
    return { xs, ys }
  }
  const nearest = (values, targets) => {
    let best = null
    for (const value of values) for (const target of targets) {
      const gap = target - value
      if (Math.abs(gap) <= snapDistance && (!best || Math.abs(gap) < Math.abs(best.gap))) best = { gap, at: target }
    }
    return best
  }

  const translateOf = (element) => {
    // "none" or "12px 30px": where a part already sits after earlier moves.
    const [x = 0, y = 0] = (getComputedStyle(element).translate || '').split(' ').map((value) => parseFloat(value) || 0)
    return [x, y]
  }
  // What a press picks: a whole button or link rather than the words inside it, a whole drawing rather than one
  // of its lines, and a block rather than a run of text inside it.
  const pick = (target) => {
    let element = target instanceof SVGElement && !(target instanceof SVGSVGElement) ? target.closest('svg') ?? target : target
    const clickable = element.closest('a, button, label')
    if (clickable && !ours(clickable) && clickable.getBoundingClientRect().width < innerWidth * 0.6) return clickable
    while (element.parentElement && element.parentElement !== document.body && !(element instanceof HTMLImageElement) && getComputedStyle(element).display === 'inline') element = element.parentElement
    return element
  }
  const beginPress = (event, element, kind, side) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    const box = element.getBoundingClientRect()
    drag = { kind, side, element, pressed: event.target, x: event.clientX, y: event.clientY, from: translateOf(element), box, before: content(), moved: false, spot: null, lines: kind === 'move' ? snapLines(element) : null, width: box.width, height: box.height }
  }
  document.addEventListener('pointerdown', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const handle = target.closest('.we-handle')
    if (handle && selected) {
      event.preventDefault()
      beginPress(event, selected, 'resize', handle.dataset.side)
      return
    }
    if (ours(target) || (editing && editing.contains(target))) return
    // A press on the page selects that part at once, so it can be dragged straight away.
    if (target !== document.body && target !== document.documentElement) {
      event.preventDefault()
      // Pressing the page normally gives it the keyboard; preventing that press is undone here, so Ctrl+Z,
      // Delete and the arrows reach the editor, also when it sits in a frame of another page.
      if (document.activeElement && document.activeElement !== document.body && document.activeElement !== editing) document.activeElement.blur()
      window.focus()
      if (!selected || !selected.contains(target) || selected === document.body) select(pick(target))
      beginPress(event, selected, 'move')
    }
  }, true)

  document.addEventListener('pointermove', (event) => {
    if (!drag) return
    let dx = event.clientX - drag.x
    let dy = event.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < 4) return
    if (!drag.moved) {
      drag.moved = true
      // The site's own animations would make the part slide behind the pointer.
      drag.transition = drag.element.style.getPropertyValue('transition')
      drag.element.style.setProperty('transition', 'none', 'important')
      document.documentElement.classList.add('we-dragging')
      getSelection()?.removeAllRanges()
    }
    const { element, box } = drag
    if (drag.kind === 'resize') {
      if (getComputedStyle(element).display === 'inline') element.style.display = 'inline-block'
      const width = Math.max(16, Math.round(drag.width + (drag.side === 's' ? 0 : dx)))
      const height = Math.max(12, Math.round(drag.height + (drag.side === 'e' ? 0 : dy)))
      if (drag.side !== 's') { element.style.width = `${width}px`; element.style.maxWidth = 'none' }
      if (drag.side !== 'e') element.style.height = `${height}px`
      if (element instanceof HTMLImageElement) element.style.objectFit = 'cover'
      sizeTip.hidden = false
      sizeTip.textContent = `${Math.round(element.getBoundingClientRect().width)} × ${Math.round(element.getBoundingClientRect().height)}`
      Object.assign(sizeTip.style, { left: `${event.clientX + scrollX + 14}px`, top: `${event.clientY + scrollY + 14}px` })
      place()
      return
    }
    if (insertMode()) {
      element.classList.add('we-ghost')
      drag.spot = dropAt(event.clientX, event.clientY)
      showLine(drag.spot)
      if (event.clientY < 60) scrollBy(0, -20)
      else if (event.clientY > innerHeight - 60) scrollBy(0, 20)
      return
    }
    // Snap to the nearest guide, unless Alt is held.
    guideX.hidden = true
    guideY.hidden = true
    if (!event.altKey) {
      const snapX = nearest([box.left + dx, box.left + box.width / 2 + dx, box.right + dx], drag.lines.xs)
      const snapY = nearest([box.top + dy, box.top + box.height / 2 + dy, box.bottom + dy], drag.lines.ys)
      if (snapX) { dx += snapX.gap; guideX.hidden = false; guideX.style.left = `${snapX.at}px` }
      if (snapY) { dy += snapY.gap; guideY.hidden = false; guideY.style.top = `${snapY.at}px` }
    }
    element.style.translate = `${Math.round(drag.from[0] + dx)}px ${Math.round(drag.from[1] + dy)}px`
    place()
  })

  const endPress = () => {
    if (!drag) return
    const { element, spot, moved, before, kind, pressed, transition } = drag
    drag = null
    if (moved) {
      element.style.removeProperty('transition')
      if (transition) element.style.setProperty('transition', transition)
    }
    element.classList.remove('we-ghost')
    if (!element.classList.length) element.removeAttribute('class')
    document.documentElement.classList.remove('we-dragging')
    line.hidden = true
    guideX.hidden = true
    guideY.hidden = true
    sizeTip.hidden = true
    // A click without dragging, inside the selected frame, picks the smaller part that was clicked.
    if (!moved) {
      if (kind === 'move' && pressed !== element && element.contains(pressed) && !ours(pressed) && pick(pressed) !== element) select(pick(pressed))
      return
    }
    // The click that ends a drag must not select something else.
    justDragged = true
    setTimeout(() => { justDragged = false }, 300)
    if (kind === 'move' && insertMode()) {
      if (!spot) return
      if (spot.where === 'inside') spot.target.append(element)
      else spot.target[spot.where](element)
    }
    history.push(before)
    if (history.length > 60) history.shift()
    future.length = 0
    historyButtons()
    changed()
    select(element)
  }
  document.addEventListener('pointerup', endPress)
  document.addEventListener('pointercancel', endPress)

  // Clicks never follow the page's links or send its forms while editing.
  document.addEventListener('click', (event) => {
    if (ours(event.target) || (editing && editing.contains(event.target))) return
    event.preventDefault()
    if (justDragged) event.stopPropagation()
  }, true)
  document.addEventListener('dblclick', (event) => {
    const target = event.target
    if (!(target instanceof Element) || ours(target)) return
    event.preventDefault()
    const holder = hasWords(target) ? target : [target, ...target.querySelectorAll('*')].find(hasWords)
    if (holder && holder !== editing) startEditing(holder, event.clientX, event.clientY)
  }, true)
  document.addEventListener('submit', (event) => event.preventDefault(), true)
  document.addEventListener('dragstart', (event) => { if (!ours(event.target)) event.preventDefault() }, true)
  document.addEventListener('input', (event) => { if (!ours(event.target)) { changed(); place() } })
  document.addEventListener('focusout', (event) => { if (event.target === editing) setTimeout(() => { if (document.activeElement !== editing) stopEditing() }, 0) })

  // Keys: Enter finishes typing, Escape lets go, arrows nudge, Delete removes, Ctrl+Z undoes, Ctrl+D repeats.
  document.addEventListener('keydown', (event) => {
    if (ours(event.target) && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return
    const mod = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()
    if (editing) {
      if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); editing.blur(); stopEditing() }
      // While typing, Ctrl+Z first undoes the typing itself; once that is all gone, the page's own steps.
      return
    }
    if (mod && key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); return }
    if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) { event.preventDefault(); redo(); return }
    if (event.key === '?' ) { event.preventDefault(); toggleHelp(); return }
    if (!selected) return
    if (mod && event.altKey && key === 'c') { event.preventDefault(); act('copyStyle'); return }
    if (mod && event.altKey && key === 'v') { event.preventDefault(); act('pasteStyle'); return }
    if (event.key === 'Escape') select(null)
    else if (event.key === 'Delete') { event.preventDefault(); act('remove') }
    else if (mod && event.key.toLowerCase() === 'd') { event.preventDefault(); act('copy') }
    else if (event.key === 'Enter' && hasWords(selected)) { event.preventDefault(); startEditing(selected) }
    else if (event.key.startsWith('Arrow')) {
      event.preventDefault()
      const step = event.shiftKey ? 10 : 1
      const [x, y] = translateOf(selected)
      const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key]
      if (!event.repeat) remember()
      selected.style.translate = `${x + move[0]}px ${y + move[1]}px`
      changed()
      place()
    }
  })
  document.addEventListener('transitionend', () => place())
  addEventListener('scroll', place, { passive: true })
  addEventListener('resize', place)
  addEventListener('beforeunload', (event) => {
    if (dirty) {
      event.preventDefault()
      event.returnValue = say.leave
    }
  })

  // ---- Adding parts that match the site ---------------------------------------------------------------------
  // A new part copies the look of one the page already has (its first heading, paragraph or button), so it fits
  // the site at once. Without one to copy, it gets a plain look in the site's own colours.
  const visible = (element) => { const box = element.getBoundingClientRect(); return box.width > 20 && box.height > 8 && getComputedStyle(element).visibility !== 'hidden' }
  const sample = (selector, test = () => true) => [...document.querySelectorAll(selector)].find((element) => !ours(element) && visible(element) && test(element))
  const looksLikeButton = (element) => {
    const look = getComputedStyle(element)
    return look.backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(look.paddingLeft) >= 8 && flat(element.textContent || '').length < 40
  }
  // Many sites style a part by where it sits (its id, or the boxes around it). A new part is put somewhere else,
  // so it takes the look it showed, written on itself.
  const bakedKeys = ['display', 'color', 'background-color', 'background-image', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration-line', 'text-transform', 'text-align', 'letter-spacing', 'line-height', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-radius', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'box-shadow', 'justify-content', 'align-items', 'gap']
  const bake = (model, copy) => {
    const models = [model, ...model.querySelectorAll('*')].slice(0, 60)
    const copies = [copy, ...copy.querySelectorAll('*')].slice(0, 60)
    models.forEach((from, index) => {
      const to = copies[index]
      if (!to || !(to instanceof HTMLElement || to instanceof SVGElement)) return
      const look = getComputedStyle(from)
      for (const key of bakedKeys) {
        let value = look.getPropertyValue(key)
        if (key === 'display' && value === 'inline' && index === 0) value = 'inline-block'
        if (value) to.style.setProperty(key, value)
      }
      to.style.setProperty('position', 'static')
      to.style.removeProperty('translate')
    })
  }
  const fresh = (element, words) => {
    const copy = element.cloneNode(true)
    if (element.isConnected) {
      bake(element, copy)
      // Its look is now written on it, so the site's rules for the original (sizes, places) are let go.
      for (const node of [copy, ...copy.querySelectorAll('[class]')]) node.removeAttribute('class')
    }
    copy.removeAttribute('id')
    copy.removeAttribute('data-we-selected')
    copy.style.translate = ''
    copy.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'))
    if (words !== undefined) {
      // The words go into the innermost element that held words, so the copied styling stays.
      const holder = [copy, ...copy.querySelectorAll('*')].reverse().find((node) => hasWords(node)) ?? copy
      holder.textContent = words
      if (holder !== copy) [...copy.querySelectorAll('*')].filter((node) => node !== holder && !node.contains(holder) && hasWords(node)).forEach((node) => node.remove())
    }
    return copy
  }
  const placeholder = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#e8ecea"/><path d="M300 330l80-100 60 70 40-45 80 75z" fill="#b9c4be"/><circle cx="330" cy="200" r="28" fill="#b9c4be"/></svg>')}`
  const parts = {
    heading: () => fresh(sample('h2') ?? sample('h3') ?? sample('h1') ?? make('h2', { style: 'font-size:32px;margin:16px 0' }), say.newHeading),
    paragraph: () => fresh(sample('p', (element) => flat(element.textContent || '').length > 20) ?? make('p', { style: 'font-size:16px;line-height:1.6;margin:12px 0' }), say.newText),
    buttonPart: () => {
      const model = sample('a, button', looksLikeButton)
      const made = model ? fresh(model, say.newButton) : make('a', { style: `display:inline-block;padding:12px 22px;border-radius:999px;background:${palette[0] ?? '#16201b'};color:#fff;text-decoration:none;font-weight:700` })
      if (!model) made.textContent = say.newButton
      if (made.tagName === 'A') made.setAttribute('href', '#')
      if (model) {
        // As wide as its words, with the colour its words had.
        const words = [model, ...model.querySelectorAll('*')].reverse().find(hasWords) ?? model
        const ink = getComputedStyle(words).color
        made.style.setProperty('color', ink)
        made.querySelectorAll('*').forEach((node) => node.style?.setProperty('color', ink))
        if (/^(block|flex|grid)$/.test(made.style.display)) made.style.display = made.style.display === 'block' ? 'inline-block' : `inline-${made.style.display}`
        made.style.width = 'fit-content'
        made.style.textDecoration = 'none'
      }
      return made
    },
    image: () => make('img', { src: placeholder, alt: '', style: 'display:block;width:100%;max-width:640px;height:auto;border-radius:12px;margin:16px 0' }),
    divider: () => make('hr', { style: 'border:0;border-top:1px solid currentColor;opacity:.2;margin:28px 0;width:100%' }),
    spacer: () => make('div', { style: 'height:56px' }),
    boxPart: () => {
      const box = make('div', { style: `padding:28px;border-radius:16px;background:${palette.find((hex) => hex !== '#000000' && hex !== '#ffffff') ?? '#f3f4f4'};margin:16px 0` })
      box.append(parts.heading(), parts.paragraph())
      return box
    },
  }
  const addMenu = make('div', { id: 'we-add', hidden: '' })
  const icons = { heading: 'H', paragraph: '¶', buttonPart: '▭', image: '🖼', divider: '—', spacer: '↕', boxPart: '▢' }
  addMenu.append(
    make('h2', { text: say.addTitle }),
    make('p', { text: say.addHint }),
    make('div', { class: 'we-add-grid' }, ...Object.keys(parts).map((name) => make('button', { type: 'button', 'data-part': name }, make('span', { class: 'we-add-icon', text: icons[name] }), make('span', { text: say[name] })))),
  )
  document.body.append(addMenu)
  // Where a new part goes: after the selected part, or after the part in the middle of the window.
  const anchor = () => {
    if (selected && selected !== document.body) return selected
    const middle = document.elementFromPoint(innerWidth / 2, innerHeight / 2)
    return middle && !ours(middle) && middle !== document.body ? pick(middle) : null
  }
  addMenu.addEventListener('click', (event) => {
    const name = event.target.closest('button')?.dataset.part
    if (!name) return
    addMenu.hidden = true
    remember()
    const made = parts[name]()
    const after = anchor()
    if (after && after.parentElement) after.after(made)
    else (document.querySelector('main') ?? document.body).prepend(made)
    changed()
    select(made)
    made.scrollIntoView({ block: 'center', behavior: 'smooth' })
    if (name === 'image') file.click()
  })

  const help = make('div', { id: 'we-help', hidden: '' })
  const shortcuts = th
    ? [['คลิก', 'เลือก'], ['ลาก', 'ย้าย (เส้นชมพูช่วยจัดแนว, กด Alt ค้างเพื่อไม่ให้ดูด)'], ['ลากจุดที่มุม', 'ย่อขยาย'], ['ดับเบิลคลิก หรือ Enter', 'พิมพ์แก้ข้อความ'], ['ลูกศร / Shift+ลูกศร', 'ขยับทีละ 1 / 10'], ['Ctrl+Z', 'เลิกทำ'], ['Ctrl+Y', 'ทำซ้ำ'], ['Ctrl+D', 'ทำซ้ำชิ้นนี้'], ['Ctrl+Alt+C / V', 'คัดลอก / วางสไตล์'], ['Delete', 'ลบ'], ['Esc', 'เลิกเลือก'], ['?', 'เปิดหน้านี้']]
    : [['Click', 'Select'], ['Drag', 'Move (pink guides line it up; hold Alt to stop snapping)'], ['Drag a corner dot', 'Resize'], ['Double-click or Enter', 'Type'], ['Arrows / Shift+arrows', 'Nudge by 1 / 10'], ['Ctrl+Z', 'Undo'], ['Ctrl+Y', 'Redo'], ['Ctrl+D', 'Repeat this part'], ['Ctrl+Alt+C / V', 'Copy / paste style'], ['Delete', 'Remove'], ['Esc', 'Let go'], ['?', 'Show this']]
  help.append(make('h2', { text: say.helpTitle }), make('dl', {}, ...shortcuts.flatMap(([keys, what]) => [make('dt', { text: keys }), make('dd', { text: what })])), make('button', { type: 'button', text: say.close, onclick: () => { help.hidden = true } }))
  document.body.append(help)
  function toggleHelp() { help.hidden = !help.hidden }

  // ---- ✨ AI on the selected part --------------------------------------------------------------------------
  // The editor sits in a frame of tktf.at's "Edit with AI" page. It sends the selected part and the owner's wish
  // up to that page, which asks its AI (counting one message) and sends the changed part back. Only the page
  // that holds this frame is asked, and only its answer is taken.
  const parentOrigin = (() => {
    if (window.parent === window) return ''
    try {
      const origin = location.ancestorOrigins?.[0] ?? new URL(document.referrer).origin
      return /^https:\/\//.test(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin) ? origin : ''
    } catch {
      return ''
    }
  })()
  const aiBox = make('div', { id: 'we-ai', hidden: '' })
  const aiInput = make('textarea', { rows: '2', maxlength: '500', placeholder: say.aiPlaceholder })
  const aiSend = make('button', { type: 'button', class: 'we-ai-send', text: `✨ ${say.aiSend}` })
  aiBox.append(
    make('h2', { text: say.aiTitle }),
    make('div', { class: 'we-ai-chips' }, ...say.chips.map((chip) => make('button', { type: 'button', text: chip, onclick: () => { aiInput.value = chip; askAi() } }))),
    aiInput,
    make('div', { class: 'we-ai-foot' }, make('span', { text: say.aiNote }), aiSend),
  )
  document.body.append(aiBox)
  function openAi() {
    if (!parentOrigin) { status(say.aiOnlyHere); return }
    aiBox.hidden = false
    const box = tools.getBoundingClientRect()
    aiBox.style.top = `${scrollY + box.bottom + 6}px`
    aiBox.style.left = `${Math.max(scrollX + 8, Math.min(scrollX + document.documentElement.clientWidth - aiBox.offsetWidth - 8, scrollX + box.left))}px`
    aiInput.focus()
  }
  const waiting = new Map()
  addEventListener('message', (event) => {
    const reply = event.data
    if (event.source !== window.parent || event.origin !== parentOrigin || reply?.type !== 'we-ai-result') return
    waiting.get(reply.id)?.(reply)
  })
  const lookOfPage = () => {
    const look = getComputedStyle(document.body)
    const heading = document.querySelector('h1, h2')
    return `fonts: ${look.fontFamily}${heading ? `; headings: ${getComputedStyle(heading).fontFamily}` : ''}; colours: ${palette.slice(0, 6).join(', ')}; language: ${document.documentElement.lang || 'unknown'}`
  }
  async function askAi() {
    const wish = aiInput.value.trim()
    if (!wish || !selected) return
    const part = selected.cloneNode(true)
    for (const node of [part, ...part.querySelectorAll('*')]) { node.removeAttribute?.('data-we-selected'); node.removeAttribute?.('contenteditable') }
    const html = part.outerHTML
    if (html.length > 30_000) { status(say.aiTooBig); return }
    const target = selected
    aiSend.disabled = true
    status(say.aiWorking)
    document.documentElement.classList.add('we-ai-busy')
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const reply = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ error: say.aiSlow }), 150_000)
      waiting.set(id, (answer) => { clearTimeout(timer); resolve(answer) })
      window.parent.postMessage({ type: 'we-ai', id, html, wish, look: lookOfPage() }, parentOrigin)
    })
    waiting.delete(id)
    aiSend.disabled = false
    document.documentElement.classList.remove('we-ai-busy')
    if (reply.error || typeof reply.html !== 'string') { status(`${say.failed}: ${reply.error ?? ''}`); return }
    // Read as inert HTML: nothing in it runs here, and the server cleans the page again on saving.
    const holder = document.createElement('template')
    holder.innerHTML = reply.html
    holder.content.querySelectorAll('script, iframe, object, embed, form, link, meta, style, base').forEach((node) => node.remove())
    for (const node of holder.content.querySelectorAll('*')) for (const name of node.getAttributeNames()) if (/^on/i.test(name)) node.removeAttribute(name)
    const made = holder.content.firstElementChild
    if (!made || !target.isConnected) { status(say.failed); return }
    remember()
    target.replaceWith(made)
    aiBox.hidden = true
    aiInput.value = ''
    changed()
    select(made)
    status(say.aiDone)
  }
  aiSend.addEventListener('click', askAi)
  aiInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); askAi() }
    if (event.key === 'Escape') aiBox.hidden = true
  })

  // ---- The bar: undo, save and publish --------------------------------------------------------------------
  const replaceContent = (html) => {
    const keep = [...document.body.children].filter((node) => ours(node) || node.id === 'copy-edit-data' || node.tagName === 'SCRIPT' || node.tagName === 'LINK')
    document.body.innerHTML = html
    document.body.append(...keep)
  }
  function undo() {
    stopEditing()
    if (!history.length) { status(say.nothingUndo); return }
    select(null)
    future.push(content())
    replaceContent(history.pop())
    historyButtons()
    changed()
  }
  function redo() {
    stopEditing()
    if (!future.length) { status(say.nothingRedo); return }
    select(null)
    history.push(content())
    replaceContent(future.pop())
    historyButtons()
    changed()
  }
  const save = async () => {
    stopEditing()
    status(say.saving)
    document.getElementById('we-edit-save').disabled = true
    const response = await fetch(`${data.base}/editor/${data.slug}/copy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html: content() }) })
    const answer = await response.json().catch(() => ({}))
    if (!response.ok) {
      document.getElementById('we-edit-save').disabled = false
      throw new Error(answer.error || say.failed)
    }
    dirty = false
    status(say.saved)
  }
  document.getElementById('we-edit-bar').addEventListener('click', async (event) => {
    const id = event.target.closest('button')?.id
    if (!id) return
    try {
      if (id === 'we-edit-undo') undo()
      else if (id === 'we-edit-redo') redo()
      else if (id === 'we-edit-add') { addMenu.hidden = !addMenu.hidden; help.hidden = true }
      else if (id === 'we-edit-help') { toggleHelp(); addMenu.hidden = true }
      else if (id === 'we-edit-save') await save()
      else if (id === 'we-edit-publish') {
        if (dirty) await save()
        status(say.publishing)
        const response = await fetch(`${data.base}/editor/${data.slug}/publish`, { method: 'POST' })
        const answer = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(answer.error || say.failed)
        status(say.published)
      }
    } catch (error) {
      status(`${say.failed}: ${error.message}`)
    }
  })
})()
