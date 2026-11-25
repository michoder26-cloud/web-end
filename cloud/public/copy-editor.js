// The editor for a page moved with its own look: click words to type over them, click a photo to change it.
// It sends only what changed, as "this text, the nth time it appears, now reads that".
;(() => {
  const data = JSON.parse(document.getElementById('copy-edit-data').textContent)
  const th = data.lang === 'th'
  const say = th
    ? { saving: 'กำลังบันทึก…', saved: 'บันทึกแล้ว กดเผยแพร่เมื่อพร้อม', failed: 'บันทึกไม่สำเร็จ', changed: 'มีการแก้ไขที่ยังไม่บันทึก', photo: 'วางที่อยู่รูปใหม่ (https://… หรือ /media/ตัวเลข):', leave: 'มีการแก้ไขที่ยังไม่บันทึก', some: (n) => `บันทึกแล้ว แต่ ${n} จุดหาไม่เจอ` }
    : { saving: 'Saving…', saved: 'Saved. Publish when you are ready.', failed: 'Could not save', changed: 'Unsaved changes', photo: 'Paste the new photo address (https://… or /media/number):', leave: 'You have unsaved changes', some: (n) => `Saved, but ${n} changes were not found` }
  const bar = document.getElementById('we-edit-bar')
  const status = document.getElementById('we-edit-status')
  const save = document.getElementById('we-edit-save')
  const flat = (value) => value.replace(/\s+/g, ' ').trim()
  const ours = (node) => Boolean(node.parentElement?.closest('#we-edit-bar, .we-copy-menu, script, style'))

  // Every piece of text as it was, and which time that exact text appears on the page.
  const originals = []
  const counts = new Map()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (ours(node) || !flat(node.data)) continue
    const text = flat(node.data)
    const nth = counts.get(text) ?? 0
    counts.set(text, nth + 1)
    originals.push({ node, nth, text })
  }
  const photos = []
  const holders = new Map()
  let dirty = false
  const changed = () => {
    dirty = true
    save.disabled = false
    status.textContent = say.changed
  }

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target
      if (!(target instanceof Element) || target.closest('#we-edit-bar')) return
      if (target.closest('.we-copy-menu')) return
      // Links and buttons stay put while editing.
      event.preventDefault()
      if (target instanceof HTMLImageElement) {
        const next = prompt(say.photo, target.getAttribute('src') ?? '')
        if (!next || !/^(https:\/\/|\/media\/\d+$)/.test(next.trim())) return
        const before = target.dataset.weFrom ?? target.getAttribute('src')
        target.dataset.weFrom = before
        target.setAttribute('src', next.trim())
        const known = photos.find((photo) => photo.from === before)
        if (known) known.to = next.trim()
        else photos.push({ from: before, to: next.trim() })
        changed()
        return
      }
      const holder = [...target.childNodes].some((child) => child.nodeType === 3 && flat(child.data)) ? target : null
      if (!holder || holder.isContentEditable) return
      // Typing can replace the text pieces themselves, so the whole element is what gets compared on saving.
      if (!holders.has(holder)) holders.set(holder, originals.filter((original) => holder.contains(original.node)))
      holder.contentEditable = 'true'
      holder.focus()
    },
    true,
  )
  document.addEventListener('input', changed)
  // A new line would split the text in two; Enter finishes the edit instead.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target instanceof HTMLElement && event.target.isContentEditable) {
      event.preventDefault()
      event.target.blur()
    }
  })
  document.addEventListener('submit', (event) => event.preventDefault(), true)
  window.addEventListener('beforeunload', (event) => {
    if (dirty) {
      event.preventDefault()
      event.returnValue = say.leave
    }
  })

  save.addEventListener('click', async () => {
    // An edited element's words go where its first piece of text was; its other pieces are emptied.
    const texts = []
    const inHolders = new Set()
    for (const [holder, inside] of holders) {
      if (!inside.length) continue
      const now = flat(holder.textContent)
      const before = inside.map((original) => original.text).join(' ')
      inside.forEach((original) => inHolders.add(original))
      if (now === flat(before)) continue
      inside.forEach((original, index) => texts.push({ from: original.text, nth: original.nth, to: index ? '' : now }))
    }
    for (const original of originals) {
      if (inHolders.has(original) || (original.node.isConnected && flat(original.node.data) === original.text)) continue
      texts.push({ from: original.text, nth: original.nth, to: original.node.isConnected ? flat(original.node.data) : '' })
    }
    save.disabled = true
    status.textContent = say.saving
    try {
      const response = await fetch(`${data.base}/editor/${data.slug}/copy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texts, images: photos }) })
      const answer = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(answer.error || say.failed)
      // What was saved is the new starting point: the page is read again, as the server now has it.
      if (texts.length) {
        dirty = false
        location.reload()
        return
      }
      photos.length = 0
      dirty = false
      status.textContent = answer.notFound ? say.some(answer.notFound) : say.saved
    } catch (error) {
      save.disabled = false
      status.textContent = `${say.failed}: ${error.message}`
    }
  })
  bar.hidden = false
})()
