// The editor for a page moved with its own look. Click any part of the page to select it: move it up or down,
// repeat it, remove it, or pick the bigger frame around it. Click words to type over them, and change photos.
// Saving sends the page as arranged; the server cleans it again, so nothing in it can run.
;(() => {
  const data = JSON.parse(document.getElementById('copy-edit-data').textContent)
  const th = data.lang === 'th'
  const say = th
    ? { saving: 'กำลังบันทึก…', saved: 'บันทึกแล้ว กดเผยแพร่เมื่อพร้อม', failed: 'ทำไม่สำเร็จ', changed: 'มีการแก้ไขที่ยังไม่บันทึก', photoUrl: 'หรือวางที่อยู่รูป (https://…):', leave: 'มีการแก้ไขที่ยังไม่บันทึก', publishing: 'กำลังเผยแพร่…', published: 'เผยแพร่แล้ว เว็บจริงเป็นแบบนี้แล้ว', uploading: 'กำลังอัปโหลดรูป…', up: 'ขึ้น', down: 'ลง', bigger: 'กรอบใหญ่ขึ้น', copy: 'ทำซ้ำ', remove: 'ลบ', photo: 'เปลี่ยนรูป', link: 'ลิงก์', linkAsk: 'ลิงก์ไปที่ไหน (เช่น /contact หรือ https://…):', top: 'ส่วนนี้อยู่บนสุดแล้ว', bottom: 'ส่วนนี้อยู่ล่างสุดแล้ว', drag: 'ลาก', back: 'คืนที่เดิม', front: 'ไว้หน้าสุด' }
    : { saving: 'Saving…', saved: 'Saved. Publish when you are ready.', failed: 'That did not work', changed: 'Unsaved changes', photoUrl: 'Or paste a photo address (https://…):', leave: 'You have unsaved changes', publishing: 'Publishing…', published: 'Published. The live site looks like this now.', uploading: 'Uploading the photo…', up: 'Up', down: 'Down', bigger: 'Bigger frame', copy: 'Repeat', remove: 'Remove', photo: 'Change photo', link: 'Link', linkAsk: 'Where should it link to (such as /contact or https://…):', top: 'This part is already at the top', bottom: 'This part is already at the bottom', drag: 'Drag', back: 'Put back', front: 'Bring to front' }

  const ui = '#we-edit-bar, #we-tools, .we-copy-menu, #we-file, #we-drop-line'
  const ours = (element) => Boolean(element?.closest?.(ui))
  const status = (text) => { document.getElementById('we-edit-status').textContent = text }
  const flat = (value) => value.replace(/\s+/g, ' ').trim()
  let dirty = false
  let selected = null
  const history = []

  // The page's own parts, without the editor's buttons.
  const content = () => {
    const copy = document.body.cloneNode(true)
    copy.querySelectorAll(`${ui}, script, link, #copy-edit-data`).forEach((node) => node.remove())
    copy.querySelectorAll('[contenteditable], [data-we-selected]').forEach((node) => { node.removeAttribute('contenteditable'); node.removeAttribute('data-we-selected') })
    copy.querySelectorAll('.we-ghost').forEach((node) => { node.classList.remove('we-ghost'); if (!node.classList.length) node.removeAttribute('class') })
    return copy.innerHTML
  }
  const remember = () => {
    history.push(content())
    if (history.length > 40) history.shift()
    document.getElementById('we-edit-undo').disabled = false
  }
  const changed = () => {
    dirty = true
    document.getElementById('we-edit-save').disabled = false
    status(say.changed)
  }

  // The floating buttons for the selected part.
  const tools = document.createElement('div')
  tools.id = 'we-tools'
  tools.hidden = true
  const button = (label, action) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.dataset.action = action
    return b
  }
  const file = document.createElement('input')
  file.type = 'file'
  file.accept = 'image/png,image/jpeg,image/webp,image/gif'
  file.id = 'we-file'
  file.hidden = true
  document.body.append(tools, file)

  const place = () => {
    if (!selected || !selected.isConnected) { tools.hidden = true; return }
    const box = selected.getBoundingClientRect()
    tools.hidden = false
    const top = Math.max(window.scrollY + 4, window.scrollY + box.top - tools.offsetHeight - 6)
    const left = Math.min(window.scrollX + document.documentElement.clientWidth - tools.offsetWidth - 8, Math.max(window.scrollX + 4, window.scrollX + box.left))
    tools.style.top = `${top}px`
    tools.style.left = `${left}px`
  }
  const select = (element) => {
    if (selected) selected.removeAttribute('data-we-selected')
    selected = element
    if (!element) { tools.hidden = true; return }
    element.setAttribute('data-we-selected', '')
    const handle = button(`✥ ${say.drag}`, 'drag')
    handle.classList.add('we-drag')
    tools.replaceChildren(
      handle,
      ...(element.parentElement && element.parentElement !== document.body ? [button(`⬚ ${say.bigger}`, 'bigger')] : []),
      button(`↑ ${say.up}`, 'up'),
      button(`↓ ${say.down}`, 'down'),
      button(`⧉ ${say.copy}`, 'copy'),
      ...(element instanceof HTMLImageElement ? [button(`🖼 ${say.photo}`, 'photo')] : []),
      ...(element.closest('a') ? [button(`🔗 ${say.link}`, 'link')] : []),
      ...(element.style.translate ? [button(`▲ ${say.front}`, 'front'), button(`↺ ${say.back}`, 'back')] : []),
      button(`✕ ${say.remove}`, 'remove'),
    )
    place()
  }
  const sibling = (element, direction) => {
    let next = direction < 0 ? element.previousElementSibling : element.nextElementSibling
    while (next && (ours(next) || ['SCRIPT', 'STYLE', 'LINK'].includes(next.tagName))) next = direction < 0 ? next.previousElementSibling : next.nextElementSibling
    return next
  }

  // Dragging: by default the part goes between other parts wherever it is dropped, shown by a blue line.
  // With free placing on, it is moved by exactly as far as it was dragged, anywhere on the page.
  const line = document.createElement('div')
  line.id = 'we-drop-line'
  line.hidden = true
  document.body.append(line)
  const freeMode = () => document.getElementById('we-edit-free')?.checked
  let drag = null
  let justDragged = false
  const rowLike = (element) => {
    const style = getComputedStyle(element)
    return (style.display.includes('flex') && !style.flexDirection.startsWith('column')) || style.display.includes('grid') || style.display.startsWith('inline')
  }
  const dropAt = (x, y) => {
    let target = document.elementFromPoint(x, y)
    if (!target || ours(target) || target === document.body || target === document.documentElement) return null
    if (drag.element.contains(target)) return null
    const box = target.getBoundingClientRect()
    // An empty box takes the part inside it; anything else gets it before or after, by which half is nearer.
    const empty = !target.children.length && !flat(target.textContent || '') && !['IMG', 'INPUT', 'HR', 'BR', 'SVG', 'VIDEO'].includes(target.tagName.toUpperCase())
    if (empty && box.width > 40 && box.height > 20) return { target, where: 'inside', box }
    const across = target.parentElement && rowLike(target.parentElement)
    const after = across ? x > box.left + box.width / 2 : y > box.top + box.height / 2
    return { target, where: after ? 'after' : 'before', box, across }
  }
  const showLine = (spot) => {
    if (!spot) { line.hidden = true; return }
    const { box, where, across } = spot
    line.hidden = false
    if (where === 'inside') Object.assign(line.style, { left: `${box.left + scrollX}px`, top: `${box.top + scrollY}px`, width: `${box.width}px`, height: `${box.height}px` })
    else if (across) Object.assign(line.style, { left: `${(where === 'after' ? box.right : box.left) + scrollX - 2}px`, top: `${box.top + scrollY}px`, width: '4px', height: `${box.height}px` })
    else Object.assign(line.style, { left: `${box.left + scrollX}px`, top: `${(where === 'after' ? box.bottom : box.top) + scrollY - 2}px`, width: `${box.width}px`, height: '4px' })
    line.classList.toggle('we-drop-inside', where === 'inside')
  }
  const startDrag = (event) => {
    if (!selected || drag) return
    event.preventDefault()
    // Where a part already sits after earlier free placing ("none" or "12px 30px").
    const [x = 0, y = 0] = (getComputedStyle(selected).translate || '').split(' ').map((value) => parseFloat(value) || 0)
    drag = { element: selected, free: freeMode(), x: event.clientX, y: event.clientY, from: [x, y], before: content(), spot: null, moved: false }
    document.documentElement.classList.add('we-dragging')
    getSelection()?.removeAllRanges()
  }
  // Mouse and touch both drag; whichever arrives first starts it.
  for (const kind of ['pointerdown', 'mousedown']) {
    tools.addEventListener(kind, (event) => {
      if (event.target.closest('button')?.dataset.action === 'drag') startDrag(event)
    })
  }
  const moveDrag = (event) => {
    if (!drag) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < 4) return
    drag.moved = true
    if (drag.free) {
      drag.element.style.translate = `${Math.round(drag.from[0] + dx)}px ${Math.round(drag.from[1] + dy)}px`
      place()
      return
    }
    drag.element.classList.add('we-ghost')
    drag.spot = dropAt(event.clientX, event.clientY)
    showLine(drag.spot)
    // Near the top or bottom of the window, the page scrolls along.
    if (event.clientY < 60) scrollBy(0, -20)
    else if (event.clientY > innerHeight - 60) scrollBy(0, 20)
  }
  document.addEventListener('pointermove', moveDrag)
  document.addEventListener('mousemove', moveDrag)
  const endDrag = () => {
    if (!drag) return
    const { element, spot, moved, before } = drag
    element.classList.remove('we-ghost')
    if (!element.classList.length) element.removeAttribute('class')
    document.documentElement.classList.remove('we-dragging')
    line.hidden = true
    drag = null
    if (!moved) return
    // The click that ends a drag must not select something else.
    justDragged = true
    setTimeout(() => { justDragged = false }, 300)
    if (!freeMode() && !spot) return
    history.push(before)
    if (history.length > 40) history.shift()
    document.getElementById('we-edit-undo').disabled = false
    if (spot && !freeMode()) {
      if (spot.where === 'inside') spot.target.append(element)
      else spot.target[spot.where](element)
    }
    changed()
    select(element)
  }
  document.addEventListener('pointerup', endDrag)
  document.addEventListener('mouseup', endDrag)
  document.addEventListener('pointercancel', endDrag)

  tools.addEventListener('click', (event) => {
    const action = event.target.closest('button')?.dataset.action
    if (!action || !selected || action === 'drag') return
    event.preventDefault()
    event.stopPropagation()
    if (action === 'bigger') return select(selected.parentElement)
    if (action === 'photo') return file.click()
    if (action === 'up' || action === 'down') {
      const other = sibling(selected, action === 'up' ? -1 : 1)
      if (!other) return status(action === 'up' ? say.top : say.bottom)
      remember()
      if (action === 'up') other.before(selected)
      else other.after(selected)
      selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    } else if (action === 'copy') {
      remember()
      const twin = selected.cloneNode(true)
      twin.removeAttribute('data-we-selected')
      twin.removeAttribute('id')
      selected.after(twin)
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
  })

  // A photo from the computer goes into the site's own storage; an address can be pasted instead.
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
  tools.addEventListener('dblclick', (event) => event.stopPropagation())
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

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target
      if (justDragged) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      if (!(target instanceof Element) || ours(target)) return
      // Links and buttons stay put while editing.
      event.preventDefault()
      if (target !== selected) select(target)
      const holder = [...target.childNodes].some((child) => child.nodeType === 3 && flat(child.data)) ? target : null
      if (!holder || holder.isContentEditable) return
      holder.contentEditable = 'true'
      holder.addEventListener('focus', remember, { once: true })
      holder.focus()
    },
    true,
  )
  document.addEventListener('input', (event) => { if (!ours(event.target)) { changed(); place() } })
  // A new line would split the words in two; Enter finishes the edit instead.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target instanceof HTMLElement && event.target.isContentEditable) {
      event.preventDefault()
      event.target.blur()
    }
    if (event.key === 'Escape') select(null)
  })
  document.addEventListener('submit', (event) => event.preventDefault(), true)
  window.addEventListener('scroll', place, { passive: true })
  window.addEventListener('resize', place)
  window.addEventListener('beforeunload', (event) => {
    if (dirty) {
      event.preventDefault()
      event.returnValue = say.leave
    }
  })

  // The editor's own bar: undo, save and publish.
  const bar = document.getElementById('we-edit-bar')
  const replaceContent = (html) => {
    const keep = [...document.body.children].filter((node) => ours(node) || node.id === 'copy-edit-data' || node.tagName === 'SCRIPT' || node.tagName === 'LINK')
    document.body.innerHTML = html
    document.body.append(...keep)
  }
  const save = async () => {
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
  bar.addEventListener('click', async (event) => {
    const id = event.target.closest('button')?.id
    if (!id) return
    try {
      if (id === 'we-edit-undo' && history.length) {
        select(null)
        replaceContent(history.pop())
        document.getElementById('we-edit-undo').disabled = !history.length
        changed()
      } else if (id === 'we-edit-save') await save()
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
