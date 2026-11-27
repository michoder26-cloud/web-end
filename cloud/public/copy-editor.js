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
        box: 'กล่อง', fill: 'สีพื้นหลัง', none: 'ไม่มี', corners: 'มุมโค้ง', space: 'ระยะขอบใน', shadow: 'เงา', soft: 'อ่อน', strong: 'เข้ม', fade: 'ความชัด', width: 'กว้าง', reset: 'ล้างการแต่งของชิ้นนี้', more: 'สีอื่น', hide: 'ซ่อน', dashboard: 'กลับแดชบอร์ด', undoLabel: 'เลิกทำ', redoLabel: 'ทำซ้ำ', addLabel: 'เพิ่ม', dropBetween: 'วางแทรกระหว่างส่วน', shortcuts: 'คีย์ลัด', saveLabel: 'บันทึก', publishLabel: 'เผยแพร่', styleLabel: 'แต่งหน้าตา', copyStyle: 'คัดลอกสไตล์', pasteStyle: 'วางสไตล์', styleCopied: 'คัดลอกสไตล์แล้ว เลือกชิ้นอื่นแล้วกด วางสไตล์', show: 'แสดงบน', desktop: 'คอม', phone: 'มือถือ', position: 'ตำแหน่ง', middle: 'จัดกึ่งกลาง', addTitle: 'เพิ่มลงในหน้า', addHint: 'ชิ้นใหม่ใช้หน้าตาเดียวกับเว็บของคุณ และวางต่อจากชิ้นที่เลือกไว้', heading: 'หัวข้อ', paragraph: 'ข้อความ', buttonPart: 'ปุ่ม', image: 'รูป', divider: 'เส้นคั่น', spacer: 'ช่องว่าง', boxPart: 'กล่อง', newHeading: 'หัวข้อใหม่', newText: 'พิมพ์ข้อความของคุณตรงนี้', newButton: 'ปุ่มใหม่', nothingUndo: 'ไม่มีอะไรให้เลิกทำแล้ว', nothingRedo: 'ไม่มีอะไรให้ทำซ้ำแล้ว', helpTitle: 'คีย์ลัด', close: 'ปิด', ai: 'AI', aiTitle: 'บอก AI ว่าอยากให้ชิ้นนี้เป็นแบบไหน', aiPlaceholder: 'เช่น ทำให้ดูหรูขึ้น ใช้สีทอง', aiSend: 'ให้ AI ทำ', aiThree: 'ขอ 3 แบบให้เลือก', aiPick: 'แบบที่ {n} จาก {total}', aiKeep: 'ใช้แบบนี้', aiCancel: 'ไม่เอา', aiThreeHint: 'กด ◀ ▶ เพื่อดูทีละแบบบนหน้าจริง', aiWorking: 'AI กำลังทำ…', aiDone: 'AI แก้แล้ว ไม่ชอบกด Ctrl+Z ได้', aiOnlyHere: 'AI ใช้ได้เมื่อแก้เว็บในหน้า Edit with AI ของ tktf.at', aiTooBig: 'ชิ้นนี้ใหญ่เกินไป ลองเลือกชิ้นที่เล็กลง', aiSlow: 'AI ตอบช้าเกินไป ลองใหม่อีกครั้ง', aiNote: 'ใช้ 1 ข้อความ AI ต่อครั้ง', doctor: 'หมอเว็บ', doctorChecking: 'หมอกำลังตรวจทั้งเว็บ…', doctorScore: 'คะแนนเว็บ', doctorAllGood: 'ไม่พบปัญหา เว็บพร้อมเผยแพร่', doctorFix: 'แก้ให้', doctorFixAll: 'แก้ให้หมด', doctorFixed: 'แก้แล้ว {n} เรื่อง', doctorPage: 'หน้า', doctorPublishAsk: 'หมอเว็บพบปัญหาสำคัญ {n} เรื่อง\nกด OK เพื่อเผยแพร่เลย หรือ Cancel เพื่อดูและแก้ก่อน', doctorItems: { files: 'ฟอนต์และรูป {count} ไฟล์ยังโหลดจากเว็บเก่า ถ้าปิดเว็บเก่าจะหายไป', alt: 'รูป {count} รูปไม่มีคำอธิบาย Google และคนที่ใช้โปรแกรมอ่านหน้าจอจะไม่รู้ว่าเป็นรูปอะไร', links: 'ลิงก์ {count} อันพาไปหน้าที่ยังไม่มี: {sample}', description: 'ยังไม่มีคำอธิบายที่จะขึ้นในผลค้นหา Google', phone: 'บนมือถือมี {count} ชิ้นล้นจอหรือหลุดขอบ ต้องเลื่อนซ้ายขวา' }, doctorFixes: { files: 'คัดลอกมาไว้ที่นี่', alt: 'ใส่คำอธิบายให้', links: 'พาไปหน้าแรกก่อน', description: 'เขียนจากเนื้อหาในหน้า', phone: 'ปรับให้พอดีจอมือถือ' }, levels: { high: 'สำคัญ', medium: 'ควรแก้', low: 'เล็กน้อย' }, layers: 'เลเยอร์', layersHint: 'คลิกชื่อเพื่อเลือก แม้ชิ้นนั้นจะถูกทับอยู่', stacked: 'ชิ้นที่ซ้อนกันตรงนี้', kinds: { heading: 'หัวข้อ', text: 'ข้อความ', link: 'ลิงก์', button: 'ปุ่ม', image: 'รูป', drawing: 'รูปวาด', list: 'รายการ', item: 'ข้อในรายการ', band: 'แถบ', header: 'ส่วนหัว', footer: 'ส่วนท้าย', menu: 'เมนู', box: 'กล่อง', field: 'ช่องกรอก', page: 'หน้าเว็บ' }, chips: ['ดูหรูขึ้น', 'เขียนให้น่าซื้อขึ้น', 'ทำให้เด่นขึ้น', 'สั้นลง', 'เป็นกันเองขึ้น', 'แปลเป็นภาษาอังกฤษ', 'แปลเป็นภาษาไทย'],
      }
    : {
        saving: 'Saving…', saved: 'Saved. Publish when you are ready.', failed: 'That did not work', changed: 'Unsaved changes', leave: 'You have unsaved changes',
        publishing: 'Publishing…', published: 'Published. The live site looks like this now.', uploading: 'Uploading the photo…', photoUrl: 'Or paste a photo address (https://…):',
        bigger: 'Bigger frame', copy: 'Repeat', remove: 'Remove', photo: 'Change photo', link: 'Link', linkAsk: 'Where should it link to (such as /contact or https://…):', back: 'Put back', front: 'Bring to front', type: 'Type',
        hint: 'Click to select, drag to move, double-click to type', typing: 'Typing. Press Enter or click elsewhere when done.',
        panel: 'Style', text: 'Text', size: 'Size', bold: 'Bold', italic: 'Italic', underline: 'Underline', align: 'Align', left: 'Left', center: 'Centre', right: 'Right', color: 'Text colour',
        box: 'Box', fill: 'Background', none: 'None', corners: 'Corners', space: 'Inner space', shadow: 'Shadow', soft: 'Soft', strong: 'Strong', fade: 'Opacity', width: 'Width', reset: 'Clear this part’s styling', more: 'More colours', hide: 'Hide', dashboard: 'Back to the dashboard', undoLabel: 'Undo', redoLabel: 'Redo', addLabel: 'Add', dropBetween: 'Drop between parts', shortcuts: 'Shortcuts', saveLabel: 'Save', publishLabel: 'Publish', styleLabel: 'Style', copyStyle: 'Copy style', pasteStyle: 'Paste style', styleCopied: 'Style copied. Select another part and press Paste style.', show: 'Show on', desktop: 'Computer', phone: 'Phone', position: 'Position', middle: 'Centre it', addTitle: 'Add to the page', addHint: 'New parts take your site’s own look, and go after the part you selected.', heading: 'Heading', paragraph: 'Text', buttonPart: 'Button', image: 'Photo', divider: 'Divider', spacer: 'Space', boxPart: 'Box', newHeading: 'New heading', newText: 'Type your words here', newButton: 'New button', nothingUndo: 'Nothing left to undo', nothingRedo: 'Nothing left to redo', helpTitle: 'Shortcuts', close: 'Close', ai: 'AI', aiTitle: 'Tell the AI how this part should be', aiPlaceholder: 'Such as: make it look more premium, in gold', aiSend: 'Ask the AI', aiThree: 'Ask for 3 designs', aiPick: 'Design {n} of {total}', aiKeep: 'Use this one', aiCancel: 'None of these', aiThreeHint: 'Press ◀ ▶ to see each one on the page', aiWorking: 'The AI is working…', aiDone: 'Changed by the AI. Not right? Press Ctrl+Z.', aiOnlyHere: 'The AI works when you edit in Edit with AI on tktf.at', aiTooBig: 'This part is too big. Try a smaller one.', aiSlow: 'The AI took too long. Please try again.', aiNote: 'Uses 1 AI message each time', doctor: 'Site doctor', doctorChecking: 'The doctor is checking the whole site…', doctorScore: 'Site score', doctorAllGood: 'Nothing found. The site is ready to publish.', doctorFix: 'Fix it', doctorFixAll: 'Fix everything', doctorFixed: 'Fixed {n}', doctorPage: 'Page', doctorPublishAsk: 'The site doctor found {n} important problems.\nPress OK to publish anyway, or Cancel to look at them first.', doctorItems: { files: '{count} fonts and photos still load from the old site. They disappear when it closes.', alt: '{count} photos have no description, so Google and screen readers cannot tell what they show.', links: '{count} links lead to pages that do not exist yet: {sample}', description: 'No description for Google search results yet.', phone: 'On phones, {count} parts stick out past the screen, so the page scrolls sideways.' }, doctorFixes: { files: 'Copy them here', alt: 'Describe them', links: 'Lead them home for now', description: 'Write it from the page', phone: 'Fit them to phones' }, levels: { high: 'Important', medium: 'Should fix', low: 'Small' }, layers: 'Layers', layersHint: 'Click a name to select it, even when it is covered', stacked: 'Parts stacked here', kinds: { heading: 'Heading', text: 'Text', link: 'Link', button: 'Button', image: 'Photo', drawing: 'Drawing', list: 'List', item: 'List item', band: 'Section', header: 'Header', footer: 'Footer', menu: 'Menu', box: 'Box', field: 'Field', page: 'Page' }, chips: ['More premium', 'More persuasive', 'Stand out more', 'Shorter', 'Friendlier', 'Translate to English', 'Translate to Thai'],
      }

  Object.assign(say, th
    ? { phoneLabel: 'จัดหน้ามือถือ', phoneTitle: 'จัดหน้าสำหรับมือถือ', phoneHint: 'ตรวจหน้านี้ที่ความกว้างมือถือ แล้วเลือกได้ว่าจะจัดแค่ไหน ดูผลจริงในจอมือถือทางซ้ายก่อนใช้', phoneLoading: 'กำลังตรวจหน้านี้บนจอมือถือ…', phoneUse: 'ใช้แบบนี้', phoneCancel: 'ยกเลิก', phoneFits: 'พอดีจอ ไม่ต้องเลื่อนซ้ายขวา', phoneStill: 'ยังมีบางส่วนล้นจอ', phoneChanges: 'แก้ {n} จุด', phoneNone: 'ไม่ต้องแก้อะไร', phoneDone: 'จัดหน้ามือถือแล้ว ไม่ชอบกด Ctrl+Z ได้', phoneOnly: 'มีผลเฉพาะบนมือถือ หน้าบนคอมไม่เปลี่ยน', phoneOptions: { original: ['แบบที่ย้ายมา', 'ไม่จัดอะไรเพิ่ม'], light: ['จัดเบาๆ', 'แก้เฉพาะส่วนที่ล้นจอ'], tidy: ['จัดให้เรียบร้อย', 'ล้นจอ + คอลัมน์ที่เบียดกันเรียงลงมา + หัวข้อใหญ่เกินไป'], easy: ['อ่านง่ายที่สุด', 'ทั้งหมด + ตัวหนังสือใหญ่ขึ้น + ปุ่มกดง่ายขึ้น + มีระยะห่าง'] }, recommended: 'แนะนำ' }
    : { phoneLabel: 'Phone layout', phoneTitle: 'Lay this page out for phones', phoneHint: 'This page is checked at phone width. Choose how much to change, and see it on the phone screen before you use it.', phoneLoading: 'Checking this page on a phone screen…', phoneUse: 'Use this layout', phoneCancel: 'Cancel', phoneFits: 'Fits the screen, no sideways scrolling', phoneStill: 'Some parts still stick out', phoneChanges: '{n} changes', phoneNone: 'Nothing to change', phoneDone: 'Laid out for phones. Not right? Press Ctrl+Z.', phoneOnly: 'Only phones see this. The page on computers stays the same.', phoneOptions: { original: ['As moved', 'No extra changes'], light: ['Light', 'Only parts that stick out'], tidy: ['Tidy', 'Parts that stick out, cramped columns stacked, headings that are too big'], easy: ['Easiest to read', 'All of that, plus larger text, easier buttons and more space'] }, recommended: 'Recommended' })
  Object.assign(say, th
    ? { stateSaved: 'บันทึกแล้ว', stateUnsaved: 'ยังไม่บันทึก', stateSaving: 'กำลังบันทึก…', howTo: 'วิธีใช้', tipTitle: 'เริ่มแก้ได้เลย', gotIt: 'เข้าใจแล้ว' }
    : { stateSaved: 'Saved', stateUnsaved: 'Not saved', stateSaving: 'Saving…', howTo: 'How it works', tipTitle: 'Start editing', gotIt: 'Got it' })
  Object.assign(say, th
    ? { modeFree: 'ลากอิสระ', modeInsert: 'แทรกในลำดับ', modeTip: 'กดเพื่อสลับวิธีลาก\nลากอิสระ: วางตรงไหนก็ได้\nแทรกในลำดับ: แทรกระหว่างส่วน ส่วนอื่นเลื่อนหลบ' }
    : { modeFree: 'Free drag', modeInsert: 'Insert in order', modeTip: 'Click to switch how dragging works\nFree drag: put it anywhere\nInsert in order: slot it between parts, the rest moves aside' })
  Object.assign(say, th
    ? { historyLabel: 'ประวัติ', historyHint: 'ทุกครั้งที่บันทึกจะเก็บไว้ คลิกเพื่อดู แล้วกู้คืนได้ในคลิกเดียว', historyPage: 'หน้านี้', historySite: 'ทั้งเว็บ · ที่เคยเผยแพร่', historyNow: 'ตอนนี้', historyLive: 'ออนไลน์อยู่', historyHidden: 'ซ่อนอยู่', historyUnsaved: 'ยังไม่บันทึก', historyEmpty: 'ยังไม่มีประวัติ บันทึกครั้งแรกแล้วจะเริ่มเก็บ', historyLoading: 'กำลังโหลดประวัติ…', historyRestore: 'กู้คืนแบบนี้', historyBack: 'กลับไปแก้ต่อ', historySaved: 'บันทึกเมื่อ {when}', historyRestoring: 'กำลังกู้คืน…', historySiteAsk: 'ย้อนทั้งเว็บกลับไปเป็นแบบที่เผยแพร่เมื่อ {when}?\nคนที่เข้าเว็บจะเห็นแบบนั้นทันที ส่วนหน้าตอนนี้จะเก็บไว้ในประวัติของแต่ละหน้า', historyKept: 'หน้าตอนนี้จะเก็บไว้ในประวัติ ย้อนกลับได้เสมอ', justNow: 'เมื่อสักครู่', minutesAgo: '{n} นาทีที่แล้ว', today: 'วันนี้ {time}', yesterday: 'เมื่อวาน {time}' }
    : { historyLabel: 'History', historyHint: 'Every save is kept. Click one to see it, and put it back in one click.', historyPage: 'This page', historySite: 'Whole site · published versions', historyNow: 'Now', historyLive: 'Live', historyHidden: 'Hidden', historyUnsaved: 'Not saved', historyEmpty: 'No history yet. It starts with your first save.', historyLoading: 'Loading the history…', historyRestore: 'Restore this version', historyBack: 'Back to editing', historySaved: 'Saved {when}', historyRestoring: 'Restoring…', historySiteAsk: 'Put the whole site back to the version published {when}?\nVisitors see it at once. The pages as they are now are kept in each page’s history.', historyKept: 'The page as it is now stays in the history, so you can always go back.', justNow: 'just now', minutesAgo: '{n} min ago', today: 'Today {time}', yesterday: 'Yesterday {time}' })
  const ui = '#we-edit-bar, #we-tools, #we-panel, #we-panel-open, #we-add, #we-help, #we-ai, #we-layers, #we-stack, #we-doctor, #we-history, #we-history-view, #we-note, #we-tip, #we-phone-view, #we-phone-frame, .we-copy-menu, #we-file, #we-drop-line, .we-guide, .we-handle, #we-size'
  const ours = (element) => Boolean(element?.closest?.(ui))
  // The bar shows only how saving stands. Anything else is a short note over the page that goes away by itself;
  // a note for work still going on stays until the next one.
  let saveState = 'saved'
  let noteTimer
  const drawSaveState = () => {
    const place = document.getElementById('we-edit-status')
    if (!place) return
    place.dataset.state = saveState
    place.textContent = saveState === 'saving' ? say.stateSaving : saveState === 'unsaved' ? say.stateUnsaved : say.stateSaved
  }
  const note = (text, stay) => {
    const box = document.getElementById('we-note')
    if (!box) return
    clearTimeout(noteTimer)
    box.textContent = text
    box.hidden = !text
    if (text && !stay) noteTimer = setTimeout(() => { box.hidden = true }, 4000)
  }
  const status = (text) => {
    if (text === say.hint) return note('')
    if (text === say.changed) { saveState = 'unsaved'; return drawSaveState() }
    if (text === say.saving) { saveState = 'saving'; return drawSaveState() }
    if (text === say.saved) { saveState = 'saved'; drawSaveState(); return note('') }
    if (saveState === 'saving' && String(text).startsWith(say.failed)) { saveState = 'unsaved'; drawSaveState() }
    note(text, [say.typing, say.uploading, say.aiWorking, say.doctorChecking, say.publishing, say.historyRestoring].includes(text))
  }
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
    copy.querySelectorAll('[contenteditable], [data-we-selected], [data-we-hover]').forEach((node) => { node.removeAttribute('contenteditable'); node.removeAttribute('data-we-selected'); node.removeAttribute('data-we-hover') })
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
    if (typeof layersChanged === 'function') layersChanged()
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

  const iconPaths = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
    doctor: '<path d="M3 12h4l2.5-5 4 10 2.5-5H21"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.5"/><path d="M12 17h.01"/>',
    sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/>',
    frame: '<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
    type: '<path d="M5 7V5h14v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
    duplicate: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/>',
    brush: '<path d="M14.5 4.5l5 5L11 18H6v-5z"/><path d="M12 7l5 5"/>',
    paste: '<rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-9 9"/>',
    front: '<rect x="8" y="3" width="13" height="13" rx="2"/><path d="M5 8H4.5A1.5 1.5 0 0 0 3 9.5v10A1.5 1.5 0 0 0 4.5 21h10a1.5 1.5 0 0 0 1.5-1.5V19"/>',
    reset: '<path d="M3 12a9 9 0 1 0 2.6-6.4"/><path d="M3 4v5h5"/>',
    trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    left: '<path d="M15 18l-6-6 6-6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    heading: '<path d="M6 4v16M18 4v16M6 12h12"/>',
    text: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    button: '<rect x="3" y="7" width="18" height="10" rx="5"/><path d="M9 12h6"/>',
    divider: '<path d="M3 12h18"/><path d="M8 7h8M8 17h8" opacity=".4"/>',
    spacer: '<path d="M12 4v16"/><path d="M8 8l4-4 4 4M8 16l4 4 4-4"/>',
    box: '<rect x="4" y="4" width="16" height="16" rx="3"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
    center: '<path d="M12 3v18"/><path d="M6 8h12M8 16h8"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.9-.8-1.4-.8-2.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.5-4-8.3-9-8.3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
    drop: '<path d="M12 4v10"/><path d="M8 10l4 4 4-4"/><path d="M4 19h16"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    pen: '<path d="M4 20l4-1L19 8l-3-3L5 16z"/>',
    insert: '<path d="M4 6h16M4 18h16"/><path d="M8 12h12"/><path d="M4 9l3 3-3 3"/>',
    freeMove: '<path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
    history: '<path d="M3 12a9 9 0 1 0 2.6-6.4"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>',
  }
  const icon = (name) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('class', 'we-i')
    svg.setAttribute('aria-hidden', 'true')
    svg.innerHTML = iconPaths[name] ?? ''
    return svg
  }

  // The toolbar along the bottom, rebuilt here in the same order the server wrote it: back, undo and redo,
  // adding and the side panels, how saving stands, and Save and Publish.
  {
    const bar = document.getElementById('we-edit-bar')
    const canPublish = Boolean(document.getElementById('we-edit-publish'))
    const iconButton = (id, name, label, keys) => make('button', { type: 'button', id, class: 'we-icon-btn', 'aria-label': label, 'data-tip': keys ? `${label}  ${keys}` : label }, icon(name))
    const group = (...items) => make('div', { class: 'we-bar-group' }, ...items)
    const gap = () => make('span', { class: 'we-bar-sep', 'aria-hidden': 'true' })
    const undoButton = iconButton('we-edit-undo', 'undo', say.undoLabel, 'Ctrl+Z')
    const redoButton = iconButton('we-edit-redo', 'redo', say.redoLabel, 'Ctrl+Y')
    undoButton.disabled = true
    redoButton.disabled = true
    const saveButton = make('button', { type: 'button', id: 'we-edit-save', class: 'we-btn' }, make('span', { text: say.saveLabel }))
    saveButton.disabled = true
    bar.replaceChildren(
      group(make('a', { href: `${data.base}/dashboard`, target: '_top', class: 'we-icon-btn', 'aria-label': say.dashboard, 'data-tip': say.dashboard }, icon('back'))),
      gap(),
      group(undoButton, redoButton),
      gap(),
      group(
        make('button', { type: 'button', id: 'we-edit-add', class: 'we-btn we-btn-soft' }, icon('plus'), make('span', { text: say.addLabel })),
        iconButton('we-edit-layers', 'layers', say.layers),
        iconButton('we-edit-doctor', 'doctor', say.doctor),
        iconButton('we-edit-history', 'history', say.historyLabel),
        iconButton('we-edit-phone', 'phone', say.phoneLabel),
        make('label', { class: 'we-btn we-mode-btn', 'data-tip': say.modeTip }, make('input', { type: 'checkbox', id: 'we-edit-free', 'aria-label': say.modeTip.split('\n')[0] }), make('span', { id: 'we-edit-mode' })),
      ),
      gap(),
      make('span', { id: 'we-edit-status', class: 'we-status', role: 'status' }),
      group(iconButton('we-edit-help', 'help', say.shortcuts, '?')),
      group(saveButton, ...(canPublish ? [make('button', { type: 'button', id: 'we-edit-publish', class: 'we-btn we-btn-primary' }, make('span', { text: say.publishLabel }))] : [])),
    )
  }

  // The drag switch says which way dragging works now, in words, with its own icon.
  const showMode = () => {
    const on = document.getElementById('we-edit-free').checked
    document.getElementById('we-edit-mode').replaceChildren(icon(on ? 'insert' : 'freeMove'), make('span', { text: on ? say.modeInsert : say.modeFree }))
  }
  showMode()
  document.getElementById('we-edit-free').addEventListener('change', showMode)
  drawSaveState()
  document.body.append(make('div', { id: 'we-note', role: 'status', hidden: '' }))
  // The first time, how the editor works; afterwards it is under "?".
  {
    let seen = false
    try { seen = localStorage.getItem('we-copy-tip') === '1' } catch {}
    if (!seen) {
      const tip = make('div', { id: 'we-tip', role: 'note' },
        make('b', { text: say.tipTitle }),
        make('p', { text: say.hint }),
        make('button', { type: 'button', class: 'we-btn we-btn-primary', text: say.gotIt, onclick: () => { tip.remove(); try { localStorage.setItem('we-copy-tip', '1') } catch {} } }))
      document.body.append(tip)
    }
  }

  // ---- What the editor draws on top of the page ----------------------------------------------------------
  const tools = make('div', { id: 'we-tools', hidden: '' })
  const doctorPanel = () => document.getElementById('we-doctor')
  const panel = make('div', { id: 'we-panel', hidden: '' })
  let panelOpen = true
  const reopen = make('button', { type: 'button', id: 'we-panel-open', hidden: '', onclick: () => { panelOpen = true; buildPanel() } }, icon('palette'), make('span', { text: say.styleLabel }))
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
    // The bar stays clear of an open side panel, so none of its buttons hide behind it.
    const sidePanel = [panel, doctorPanel()].find((one) => one && !one.hidden)
    const rightEdge = sidePanel ? sidePanel.getBoundingClientRect().left - 8 : document.documentElement.clientWidth - 8
    const left = Math.min(scrollX + rightEdge - tools.offsetWidth, Math.max(scrollX + 4, scrollX + box.left))
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

  const button = (name, label, action, keys, withWord) => make('button', { type: 'button', 'data-action': action, 'aria-label': label, 'data-tip': keys ? `${label}  ${keys}` : label, ...(withWord ? { class: 'we-with-word' } : {}) }, icon(name), withWord ? make('span', { text: label }) : null)
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
    if (aiChooser.hidden) aiBox.hidden = true
    tools.replaceChildren(
      button('sparkles', say.ai, 'ai', '', true),
      make('span', { class: 'we-tools-sep', 'aria-hidden': 'true' }),
      ...(element.parentElement && element.parentElement !== document.body ? [button('frame', say.bigger, 'bigger')] : []),
      ...(hasWords(element) ? [button('type', say.type, 'type', 'Enter')] : []),
      ...(element instanceof HTMLImageElement ? [button('image', say.photo, 'photo')] : []),
      ...(element.closest('a') ? [button('link', say.link, 'link')] : []),
      button('duplicate', say.copy, 'copy', 'Ctrl+D'),
      button('brush', say.copyStyle, 'copyStyle', 'Ctrl+Alt+C'),
      ...(copiedStyle ? [button('paste', say.pasteStyle, 'pasteStyle', 'Ctrl+Alt+V')] : []),
      ...(element.style.translate ? [button('front', say.front, 'front'), button('reset', say.back, 'back')] : []),
      make('span', { class: 'we-tools-sep', 'aria-hidden': 'true' }),
      button('trash', say.remove, 'remove', 'Delete'),
    )
    buildPanel()
    place()
    if (!layers.hidden) showInLayers(element)
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
    // While the owner chooses between AI designs, the panel steps aside so the design can be seen whole.
    if (!selected || aiBox?.classList.contains('we-choosing')) { panel.hidden = true; reopen.hidden = true; return }
    reopen.hidden = panelOpen
    if (!panelOpen) { panel.hidden = true; return }
    const look = getComputedStyle(selected)
    const words = Boolean(flat(selected.textContent || ''))
    const size = px(look.fontSize)
    const bold = Number(look.fontWeight) >= 600
    const sections = [make('div', { class: 'we-panel-head' }, make('h2', { text: say.panel }), make('button', { type: 'button', class: 'we-close', 'aria-label': say.close, 'data-tip': say.close, onclick: () => { panelOpen = false; buildPanel() } }, icon('close')))]
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
      row(say.show, toggle(say.desktop, !selected.classList.contains('we-hide-desktop'), () => { selected.classList.toggle('we-hide-desktop') }, 'show'), toggle(say.phone, !selected.classList.contains('we-hide-phone'), () => { selected.classList.toggle('we-hide-phone') }, 'show')),
      row('', make('button', { type: 'button', text: say.middle, onclick: () => {
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
    if (event.button === 2) return
    // Alt+click: the part underneath the selected one at this spot, one layer deeper each time.
    if (event.altKey && target !== document.body) {
      event.preventDefault()
      const stack = stackAt(event.clientX, event.clientY)
      const at = stack.indexOf(selected)
      select(stack[(at + 1) % stack.length] ?? pick(target))
      return
    }
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
    else if (event.key === 'Tab') {
      // Tab and Shift+Tab: the next or previous part beside this one.
      event.preventDefault()
      const next = event.shiftKey ? selected.previousElementSibling : selected.nextElementSibling
      const usable = (node) => node && !ours(node) && !['SCRIPT', 'STYLE', 'LINK'].includes(node.tagName)
      let step = next
      while (step && !usable(step)) step = event.shiftKey ? step.previousElementSibling : step.nextElementSibling
      if (step) { select(step); step.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }
    }
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
  const icons = { heading: 'heading', paragraph: 'text', buttonPart: 'button', image: 'image', divider: 'divider', spacer: 'spacer', boxPart: 'box' }
  addMenu.append(
    make('h2', { text: say.addTitle }),
    make('p', { text: say.addHint }),
    make('div', { class: 'we-add-grid' }, ...Object.keys(parts).map((name) => make('button', { type: 'button', 'data-part': name }, make('span', { class: 'we-add-icon' }, icon(icons[name])), make('span', { text: say[name] })))),
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
  help.append(make('h2', { text: say.howTo }), make('p', { class: 'we-help-how', text: say.hint }), make('h2', { text: say.helpTitle }), make('dl', {}, ...shortcuts.flatMap(([keys, what]) => [make('dt', { text: keys }), make('dd', { text: what })])), make('button', { type: 'button', text: say.close, onclick: () => { help.hidden = true } }))
  document.body.append(help)
  function toggleHelp() { help.hidden = !help.hidden }

  // ---- Layers: every part of the page as a list, and the parts stacked under the pointer --------------------
  const kindOf = (element) => {
    const tag = element.tagName.toLowerCase()
    if (/^h[1-6]$/.test(tag)) return 'heading'
    if (tag === 'img' || tag === 'picture') return 'image'
    if (tag === 'svg' || element instanceof SVGElement) return 'drawing'
    if (tag === 'button' || (tag === 'a' && looksLikeButton(element))) return 'button'
    if (tag === 'a') return 'link'
    if (tag === 'ul' || tag === 'ol') return 'list'
    if (tag === 'li') return 'item'
    if (tag === 'header') return 'header'
    if (tag === 'footer') return 'footer'
    if (tag === 'nav') return 'menu'
    if (tag === 'section' || tag === 'main' || tag === 'article') return 'band'
    if (['input', 'textarea', 'select'].includes(tag)) return 'field'
    if (['p', 'span', 'strong', 'em', 'b', 'i', 'small', 'label', 'blockquote'].includes(tag)) return 'text'
    return 'box'
  }
  const kindIcons = { heading: 'heading', text: 'text', link: 'link', button: 'button', image: 'image', drawing: 'pen', list: 'text', item: 'text', band: 'frame', header: 'frame', footer: 'frame', menu: 'text', box: 'box', field: 'button', page: 'frame' }
  const nameOf = (element) => {
    // innerText keeps the gaps between words that sit in separate boxes.
    const all = flat(element.innerText ?? element.textContent ?? '')
    const words = all.slice(0, 28)
    const alt = element.getAttribute?.('alt')
    return `${say.kinds[kindOf(element)]}${words ? `: ${words}${all.length > 28 ? '…' : ''}` : alt ? `: ${alt.slice(0, 28)}` : ''}`
  }
  const shown = (element) => {
    if (ours(element) || ['SCRIPT', 'STYLE', 'LINK', 'META', 'TEMPLATE', 'BR'].includes(element.tagName)) return false
    const box = element.getBoundingClientRect()
    if (box.width > 0 && box.height > 0) return true
    // A wrapper can measure nothing while what it holds shows (display: contents, or parts placed outside it).
    return element.children.length > 0 && getComputedStyle(element).display !== 'none'
  }
  // A box that only wraps one other part, with nothing of its own, is looked through in the list.
  const partsOf = (element) => {
    let parts = [...element.children].filter(shown)
    for (let depth = 0; parts.length === 1 && depth < 12 && kindOf(parts[0]) === 'box' && !hasWords(parts[0]) && parts[0].children.length; depth++) {
      const inner = [...parts[0].children].filter(shown)
      if (!inner.length) break
      parts = inner
    }
    return parts
  }
  // All the parts at one spot on the page, the top one first.
  const stackAt = (x, y) => {
    const seen = new Set()
    return document.elementsFromPoint(x, y).filter((node) => node !== document.body && node !== document.documentElement && !ours(node)).map(pick).filter((node) => !seen.has(node) && seen.add(node)).slice(0, 12)
  }

  const layers = make('div', { id: 'we-layers', hidden: '' })
  const layerList = make('div', { class: 'we-layer-list', role: 'tree' })
  layers.append(make('div', { class: 'we-panel-head' }, make('h2', { text: say.layers }), make('button', { type: 'button', class: 'we-close', 'aria-label': say.close, 'data-tip': say.close, onclick: () => { layers.hidden = true } }, icon('close'))), make('p', { text: say.layersHint }), layerList)
  document.body.append(layers)
  const open = new Set([document.body])
  const rows = new Map()
  function drawLayers() {
    layerList.replaceChildren()
    rows.clear()
    const add = (element, depth) => {
      const children = partsOf(element)
      const row = make('div', { class: `we-layer${element === selected ? ' we-on' : ''}`, role: 'treeitem', style: `padding-left:${8 + depth * 12}px` },
        children.length ? make('button', { type: 'button', class: 'we-twist', 'aria-label': open.has(element) ? '−' : '+', 'data-twist': '' }, icon(open.has(element) ? 'down' : 'right')) : make('span', { class: 'we-twist' }),
        make('span', { class: 'we-kind' }, icon(kindIcons[kindOf(element)])),
        make('span', { class: 'we-name', text: nameOf(element) }))
      rows.set(row, element)
      layerList.append(row)
      if (open.has(element)) for (const child of children.slice(0, 200)) add(child, depth + 1)
    }
    for (const child of partsOf(document.body).slice(0, 200)) add(child, 0)
  }
  function showInLayers(element) {
    for (let up = element.parentElement; up; up = up.parentElement) {
      open.add(up)
      // A looked-through wrapper opens the row that stands for it.
      for (const [, node] of rows) if (node.contains(up)) open.add(node)
    }
    drawLayers()
    // Only the list scrolls: scrollIntoView would also move the page, and the page around the editor frame.
    for (const [row, node] of rows) {
      if (node !== element) continue
      const box = layerList.getBoundingClientRect()
      const at = row.getBoundingClientRect()
      if (at.top < box.top) layerList.scrollTop -= box.top - at.top
      else if (at.bottom > box.bottom) layerList.scrollTop += at.bottom - box.bottom
    }
  }
  layerList.addEventListener('click', (event) => {
    const row = event.target.closest('.we-layer')
    const element = row && rows.get(row)
    if (!element) return
    if (event.target.closest('[data-twist]')) {
      if (open.has(element)) open.delete(element)
      else open.add(element)
      drawLayers()
      return
    }
    select(element)
    element.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
  // Pointing at a name shows that part on the page.
  layerList.addEventListener('pointerover', (event) => {
    const element = rows.get(event.target.closest('.we-layer'))
    document.querySelectorAll('[data-we-hover]').forEach((node) => node.removeAttribute('data-we-hover'))
    if (element) element.setAttribute('data-we-hover', '')
  })
  layerList.addEventListener('pointerleave', () => document.querySelectorAll('[data-we-hover]').forEach((node) => node.removeAttribute('data-we-hover')))
  var layersChanged = () => { if (!layers.hidden) drawLayers() }
  const toggleLayers = () => {
    layers.hidden = !layers.hidden
    if (!layers.hidden) (selected ? showInLayers(selected) : drawLayers())
  }

  // Right click: every part stacked at that spot, to pick the one that is covered.
  const stackMenu = make('div', { id: 'we-stack', hidden: '' })
  document.body.append(stackMenu)
  document.addEventListener('contextmenu', (event) => {
    if (ours(event.target) || (editing && editing.contains(event.target))) return
    event.preventDefault()
    // Plain boxes with nothing in them to name are left out, unless they are near the top.
    const stack = stackAt(event.clientX, event.clientY).filter((element, index) => index < 2 || kindOf(element) !== 'box' || nameOf(element).includes(':')).slice(0, 8)
    if (!stack.length) return
    stackMenu.replaceChildren(make('h2', { text: say.stacked }), ...stack.map((element) => {
      const choice = make('button', { type: 'button' }, make('span', { class: 'we-kind' }, icon(kindIcons[kindOf(element)])), make('span', { text: nameOf(element) }))
      choice.addEventListener('click', () => { stackMenu.hidden = true; select(element) })
      choice.addEventListener('pointerenter', () => element.setAttribute('data-we-hover', ''))
      choice.addEventListener('pointerleave', () => element.removeAttribute('data-we-hover'))
      return choice
    }))
    stackMenu.hidden = false
    stackMenu.style.left = `${scrollX + Math.min(event.clientX, document.documentElement.clientWidth - stackMenu.offsetWidth - 8)}px`
    stackMenu.style.top = `${scrollY + Math.min(event.clientY, innerHeight - stackMenu.offsetHeight - 8)}px`
  }, true)
  document.addEventListener('pointerdown', (event) => { if (!stackMenu.hidden && !stackMenu.contains(event.target)) stackMenu.hidden = true }, true)

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
  const aiSend = make('button', { type: 'button', class: 'we-ai-send' }, icon('sparkles'), make('span', { text: say.aiSend }))
  const aiThree = make('button', { type: 'button', class: 'we-ai-three', text: say.aiThree })
  const aiChooser = make('div', { class: 'we-ai-chooser', hidden: '' })
  aiBox.append(
    make('h2', { text: say.aiTitle }),
    make('div', { class: 'we-ai-chips' }, ...say.chips.map((chip) => make('button', { type: 'button', text: chip, onclick: () => { aiInput.value = chip; askAi(1) } }))),
    aiInput,
    make('div', { class: 'we-ai-foot' }, make('span', { text: say.aiNote }), make('div', { class: 'we-ai-buttons' }, aiThree, aiSend)),
    aiChooser,
  )
  document.body.append(aiBox)
  function openAi() {
    if (!parentOrigin) { status(say.aiOnlyHere); return }
    aiBox.hidden = false
    placeAi()
    aiInput.focus({ preventScroll: true })
  }
  // The box sits below the selected part, or above it when there is no room below, so the part stays in sight.
  function placeAi() {
    if (aiBox.hidden || !selected) return
    let part = selected.getBoundingClientRect()
    const height = aiBox.offsetHeight
    // Without room above or below, the page scrolls so the part sits near the top, with the box under it.
    if (part.bottom + 10 + height > innerHeight && part.top - height - 10 - tools.offsetHeight < 8) {
      // A quarter of the way down: clear of the site's own sticky header.
      scrollBy(0, part.top - Math.round(innerHeight * 0.25))
      part = selected.getBoundingClientRect()
      place()
    }
    const below = part.bottom + 10 + height <= innerHeight
    const top = below ? part.bottom + 10 : Math.max(8, part.top - height - 10 - tools.offsetHeight)
    aiBox.style.top = `${scrollY + top}px`
    aiBox.style.left = `${Math.max(scrollX + 8, Math.min(scrollX + document.documentElement.clientWidth - aiBox.offsetWidth - 8, scrollX + part.left))}px`
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
  async function askAi(count = 1) {
    const wish = aiInput.value.trim() || (count === 3 ? say.chips[0] : '')
    if (!wish || !selected) return
    const part = selected.cloneNode(true)
    for (const node of [part, ...part.querySelectorAll('*')]) { node.removeAttribute?.('data-we-selected'); node.removeAttribute?.('contenteditable') }
    const html = part.outerHTML
    if (html.length > 30_000) { status(say.aiTooBig); return }
    const target = selected
    aiSend.disabled = true
    aiThree.disabled = true
    status(say.aiWorking)
    document.documentElement.classList.add('we-ai-busy')
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const reply = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ error: say.aiSlow }), 150_000)
      waiting.set(id, (answer) => { clearTimeout(timer); resolve(answer) })
      window.parent.postMessage({ type: 'we-ai', id, html, wish, look: lookOfPage(), ...(count === 3 ? { variants: 3 } : {}) }, parentOrigin)
    })
    waiting.delete(id)
    aiSend.disabled = false
    aiThree.disabled = false
    document.documentElement.classList.remove('we-ai-busy')
    if (reply.error || typeof reply.html !== 'string') { status(`${say.failed}: ${reply.error ?? ''}`); return }
    const versions = (Array.isArray(reply.variants) ? reply.variants : [reply.html]).map(inert).filter(Boolean)
    if (!versions.length || !target.isConnected) { status(say.failed); return }
    remember()
    target.replaceWith(versions[0])
    aiInput.value = ''
    changed()
    if (versions.length > 1) { choose(versions, target); return }
    aiBox.hidden = true
    select(versions[0])
    status(say.aiDone)
  }
  // Read as inert HTML: nothing in it runs here, and the server cleans the page again on saving.
  function inert(html) {
    const holder = document.createElement('template')
    holder.innerHTML = String(html ?? '')
    holder.content.querySelectorAll('script, iframe, object, embed, form, link, meta, style, base').forEach((node) => node.remove())
    for (const node of holder.content.querySelectorAll('*')) for (const name of node.getAttributeNames()) if (/^on/i.test(name)) node.removeAttribute(name)
    return holder.content.firstElementChild
  }
  // Several designs: each is shown on the page itself in turn, and the owner keeps one, or none.
  function choose(versions, original) {
    let at = 0
    const show = (next) => {
      versions[at].replaceWith(versions[next])
      at = next
      select(versions[at])
      aiBox.hidden = false
      label.textContent = fmt(say.aiPick, { n: at + 1, total: versions.length })
      placeAi()
    }
    const label = make('b', { text: fmt(say.aiPick, { n: 1, total: versions.length }) })
    aiChooser.replaceChildren(
      make('p', { text: say.aiThreeHint }),
      make('div', { class: 'we-ai-pick' },
        make('button', { type: 'button', 'aria-label': '◀', onclick: () => show((at + versions.length - 1) % versions.length) }, icon('left')),
        label,
        make('button', { type: 'button', 'aria-label': '▶', onclick: () => show((at + 1) % versions.length) }, icon('right'))),
      make('div', { class: 'we-ai-buttons' },
        make('button', { type: 'button', class: 'we-ai-send', text: say.aiKeep, onclick: () => { aiChooser.hidden = true; aiBox.classList.remove('we-choosing'); aiBox.hidden = true; select(versions[at]); status(say.aiDone) } }),
        make('button', { type: 'button', class: 'we-ai-three', text: say.aiCancel, onclick: () => { versions[at].replaceWith(original); aiChooser.hidden = true; aiBox.classList.remove('we-choosing'); aiBox.hidden = true; select(original); status(say.hint) } })),
    )
    aiChooser.hidden = false
    aiBox.classList.add('we-choosing')
    select(versions[0])
    aiBox.hidden = false
    placeAi()
  }
  aiSend.addEventListener('click', () => askAi(1))
  aiThree.addEventListener('click', () => askAi(3))
  aiInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); askAi(1) }
    if (event.key === 'Escape') aiBox.hidden = true
  })

  // ---- The site doctor ----------------------------------------------------------------------------------------
  // The server checks the whole site; this page checks how the saved page looks on a phone, in a hidden frame.
  const doctor = make('div', { id: 'we-doctor', hidden: '' })
  document.body.append(doctor)
  const pathTo = (element, root) => {
    const steps = []
    // The owner's preview adds a banner at the top of the page; the editor has none, so it is not counted.
    for (let node = element; node && node !== root.body; node = node.parentElement) steps.unshift([...node.parentElement.children].filter((child) => !child.classList.contains('preview-banner')).indexOf(node))
    return steps
  }
  const byPath = (steps) => steps.reduce((node, index) => node?.children[index], document.body)
  // Parts of the saved page that stick out past a 390 px wide phone screen.
  const phoneCheck = () => new Promise((resolve) => {
    const frame = make('iframe', { id: 'we-phone-frame', src: `${data.base}/preview/${data.slug}`, style: 'position:fixed;left:-10000px;top:0;width:390px;height:844px;border:0;visibility:hidden', 'aria-hidden': 'true', tabindex: '-1' })
    const done = (found) => { frame.remove(); resolve(found) }
    const timer = setTimeout(() => done([]), 15000)
    frame.addEventListener('load', () => setTimeout(() => {
      clearTimeout(timer)
      try {
        const doc = frame.contentDocument
        const width = doc.documentElement.clientWidth + 2
        const out = []
        // Parts placed freely in the editor that end up past the screen's edge, even where the site cuts them off.
        for (const node of doc.body.querySelectorAll('[style*="translate"]')) {
          const box = node.getBoundingClientRect()
          if (box.width && (box.right > width || box.left < -2)) out.push(pathTo(node, doc))
        }
        if (doc.documentElement.scrollWidth <= width) return done(out)
        for (const node of doc.body.querySelectorAll('*')) {
          if (out.length >= 40) break
          const box = node.getBoundingClientRect()
          if (!box.width || !box.height || box.right <= width || box.left >= width) continue
          const look = frame.contentWindow.getComputedStyle(node)
          if (look.position === 'fixed' || look.visibility === 'hidden') continue
          // Only the outermost part that sticks out: its box does not.
          const parent = node.parentElement?.getBoundingClientRect()
          if (parent && parent.right > width && node.parentElement !== doc.body) continue
          out.push(pathTo(node, doc))
        }
        done(out)
      } catch {
        done([])
      }
    }, 600))
    document.body.append(frame)
  })
  let lastFindings = []
  let phoneParts = []
  const describe = (finding) => {
    if (finding.code === 'general') return finding.text
    return fmt(say.doctorItems[finding.code], { count: finding.count ?? '', sample: (finding.sample ?? []).join(', ') })
  }
  const fmt = (text, values) => String(text).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '')
  function drawDoctor(score) {
    const items = [...lastFindings]
    if (phoneParts.length) items.unshift({ code: 'phone', level: 'high', count: phoneParts.length, page: data.slug, fix: true })
    const shownScore = Math.max(0, score - (phoneParts.length ? 12 : 0))
    doctor.replaceChildren(
      make('div', { class: 'we-panel-head' }, make('h2', { text: say.doctor }), make('button', { type: 'button', class: 'we-close', 'aria-label': say.close, 'data-tip': say.close, onclick: () => { doctor.hidden = true } }, icon('close'))),
      make('div', { class: `we-score ${shownScore >= 85 ? 'good' : shownScore >= 60 ? 'fair' : 'poor'}` }, make('b', { text: String(shownScore) }), make('span', { text: say.doctorScore })),
      items.length
        ? make('ul', { class: 'we-findings' }, ...items.map((finding) => make('li', { class: finding.level },
            make('span', { class: 'we-level', text: say.levels[finding.level] }),
            make('p', { text: describe(finding) }),
            finding.page && finding.code !== 'general' ? make('small', { text: `${say.doctorPage}: ${finding.page}` }) : null,
            finding.fix ? make('button', { type: 'button', text: `${say.doctorFix}: ${say.doctorFixes[finding.code]}`, onclick: () => fixFinding(finding) }) : null)))
        : make('p', { class: 'we-all-good', text: say.doctorAllGood }),
      ...(items.some((finding) => finding.fix) ? [make('button', { type: 'button', class: 'we-fix-all', text: say.doctorFixAll, onclick: () => fixFinding(null) })] : []),
    )
    doctor.hidden = false
    place()
  }
  const fitPhone = () => {
    if (!phoneParts.length) return 0
    remember()
    let fitted = 0
    for (const steps of phoneParts) {
      const node = byPath(steps)
      if (node && !ours(node)) { node.classList.add('we-phone-fit'); fitted++ }
    }
    phoneParts = []
    changed()
    return fitted
  }
  async function runDoctor() {
    status(say.doctorChecking)
    doctor.replaceChildren(make('p', { class: 'we-all-good', text: say.doctorChecking }))
    doctor.hidden = false
    try {
      if (dirty) await save()
      const [report, phone] = await Promise.all([fetch(`${data.base}/editor/${data.slug}/doctor`).then((response) => response.json()), phoneCheck()])
      lastFindings = report.findings ?? []
      phoneParts = phone
      drawDoctor(report.score ?? 100)
      status(say.hint)
      return lastFindings.filter((finding) => finding.level === 'high').length + (phoneParts.length ? 1 : 0)
    } catch (error) {
      status(`${say.failed}: ${error.message}`)
      return 0
    }
  }
  async function fixFinding(finding) {
    try {
      let fixed = 0
      if (!finding || finding.code === 'phone') {
        fixed += fitPhone() ? 1 : 0
        if (fixed) await save()
      }
      if (!finding || finding.code !== 'phone') {
        if (dirty) await save()
        const response = await fetch(`${data.base}/editor/${data.slug}/doctor`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(finding ? { code: finding.code, page: finding.page } : {}) })
        const answer = await response.json()
        if (!response.ok) throw new Error(answer.error || say.failed)
        fixed += answer.fixed ?? 0
        // This page's own changes (photo descriptions, files) show once it is read again.
        if (!finding || finding.page === data.slug) { dirty = false; location.reload(); return }
      }
      status(fmt(say.doctorFixed, { n: fixed }))
      await runDoctor()
    } catch (error) {
      status(`${say.failed}: ${error.message}`)
    }
  }

  // ---- History: every saved copy of this page, and the site's published versions -------------------------------
  // A copy is shown in a frame as visitors would see it; putting it back keeps the page as it is now in the history.
  const historyPanel = make('div', { id: 'we-history', hidden: '' })
  const historyView = make('div', { id: 'we-history-view', hidden: '' })
  document.body.append(historyPanel, historyView)
  const when = (at) => {
    const date = new Date(at)
    if (Number.isNaN(date.getTime())) return ''
    const minutes = Math.round((Date.now() - date.getTime()) / 60000)
    const time = date.toLocaleTimeString(th ? 'th-TH' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
    if (minutes < 1) return say.justNow
    if (minutes < 60) return fmt(say.minutesAgo, { n: minutes })
    const day = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
    const days = Math.round((day(new Date()) - day(date)) / 86400000)
    if (days === 0) return fmt(say.today, { time })
    if (days === 1) return fmt(say.yesterday, { time })
    return `${date.toLocaleDateString(th ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', ...(days > 300 ? { year: 'numeric' } : {}) })} ${time}`
  }
  const historyTag = (text, kind) => make('span', { class: `we-tag ${kind}`, text })
  const closeButton = (onclick) => make('button', { type: 'button', class: 'we-close', 'aria-label': say.close, 'data-tip': say.close, onclick }, icon('close'))
  async function openHistory() {
    historyPanel.replaceChildren(make('div', { class: 'we-panel-head' }, make('h2', { text: say.historyLabel }), closeButton(() => { historyPanel.hidden = true })), make('p', { class: 'we-all-good', text: say.historyLoading }))
    historyPanel.hidden = false
    doctor.hidden = true
    try {
      const response = await fetch(`${data.base}/editor/${data.slug}/history`)
      const list = await response.json()
      if (!response.ok) throw new Error(list.error || say.failed)
      drawHistory(list)
    } catch (error) {
      status(`${say.failed}: ${error.message}`)
    }
  }
  function drawHistory(list) {
    const rows = list.pages.map((copy) => make('li', {},
      make('button', { type: 'button', class: 'we-history-row', onclick: () => showCopy(copy) },
        make('span', { class: 'we-history-when', text: when(copy.at) }),
        copy.live ? historyTag(say.historyLive, 'live') : null,
        copy.published ? null : historyTag(say.historyHidden, 'quiet'))))
    const versions = list.site?.versions ?? []
    historyPanel.replaceChildren(
      make('div', { class: 'we-panel-head' }, make('h2', { text: say.historyLabel }), closeButton(() => { historyPanel.hidden = true })),
      make('p', { class: 'we-history-hint', text: say.historyHint }),
      make('h3', { text: say.historyPage }),
      make('ul', { class: 'we-history-list' },
        make('li', {}, make('div', { class: 'we-history-row now' }, make('span', { class: 'we-history-when', text: say.historyNow }), list.current?.live ? historyTag(say.historyLive, 'live') : null, dirty ? historyTag(say.historyUnsaved, 'quiet') : null)),
        ...rows),
      ...(rows.length ? [] : [make('p', { class: 'we-all-good', text: say.historyEmpty })]),
      ...(versions.length ? [
        make('h3', { text: say.historySite }),
        make('ul', { class: 'we-history-list' }, ...versions.map((version) => make('li', {},
          make('button', { type: 'button', class: 'we-history-row', onclick: () => restoreSite(version) },
            make('span', { class: 'we-history-when', text: when(version.created_at) }),
            version.id === list.site.live ? historyTag(say.historyLive, 'live') : null,
            version.note ? make('small', { text: version.note }) : null)))),
      ] : []),
    )
    historyPanel.hidden = false
  }
  function showCopy(copy) {
    const frame = make('iframe', { src: `${data.base}/editor/${data.slug}/history?show=${copy.id}`, title: say.historyLabel })
    historyView.replaceChildren(
      make('div', { class: 'we-history-bar' },
        make('button', { type: 'button', class: 'we-btn', onclick: closeCopy }, icon('left'), make('span', { text: say.historyBack })),
        make('span', { class: 'we-history-what' }, make('b', { text: fmt(say.historySaved, { when: when(copy.at) }) }), make('small', { text: say.historyKept })),
        make('button', { type: 'button', class: 'we-btn we-btn-primary', onclick: () => restoreCopy(copy) }, icon('reset'), make('span', { text: say.historyRestore }))),
      frame)
    historyView.hidden = false
  }
  function closeCopy() { historyView.hidden = true; historyView.replaceChildren() }
  async function putBack(body) {
    try {
      // Unsaved changes are saved first, so they land in the history too and nothing is lost.
      if (dirty) await save()
      status(say.historyRestoring)
      const response = await fetch(`${data.base}/editor/${data.slug}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const answer = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(answer.error || say.failed)
      dirty = false
      location.reload()
    } catch (error) {
      status(`${say.failed}: ${error.message}`)
    }
  }
  const restoreCopy = (copy) => putBack({ id: copy.id })
  const restoreSite = (version) => { if (confirm(fmt(say.historySiteAsk, { when: when(version.created_at) }))) putBack({ id: version.id, site: true }) }
  addEventListener('keydown', (event) => { if (event.key === 'Escape' && !historyView.hidden) closeCopy() })

  // ---- Phone layout: the page checked at phone width, and fixed by as much as the owner chooses ---------------
  // The saved page is opened in a phone-sized frame. What is found there is fixed with classes that only take
  // effect on phones (their rules come with every moved page), first in the frame to look at, then on the page.
  const phoneClasses = ['we-phone-fit', 'we-phone-stack', 'we-phone-roomy', 'we-phone-text', 'we-phone-tap', 'we-phone-head']
  const phoneView = make('div', { id: 'we-phone-view', hidden: '' })
  document.body.append(phoneView)
  const clearPhone = (root) => { for (const node of root.querySelectorAll(phoneClasses.map((name) => `.${name}`).join(','))) node.classList.remove(...phoneClasses) }
  function phoneFindings(frame) {
    const doc = frame.contentDocument
    const win = frame.contentWindow
    const width = doc.documentElement.clientWidth
    const found = { fit: [], stack: [], text: [], tap: [], head: [] }
    const skip = '.preview-banner, .we-copy-menu, script, style, noscript, template'
    const sticksOut = (box) => box.width > 0 && (box.right > width + 2 || box.left < -2)
    for (const node of doc.body.querySelectorAll('*')) {
      if (node.closest(skip) || node instanceof win.SVGElement && node.tagName.toLowerCase() !== 'svg') continue
      const box = node.getBoundingClientRect()
      if (!box.width || !box.height) continue
      const look = win.getComputedStyle(node)
      if (look.position === 'fixed' || look.visibility === 'hidden' || look.display === 'none') continue
      // Only the outermost part that sticks out.
      if (sticksOut(box) && !(node.parentElement && node.parentElement !== doc.body && sticksOut(node.parentElement.getBoundingClientRect()))) found.fit.push(node)
      // Columns side by side that are too narrow for their words or photos.
      const kids = [...node.children].filter((kid) => { const b = kid.getBoundingClientRect(); return b.width > 0 && b.height > 0 })
      const rowish = (look.display.includes('flex') && !look.flexDirection.startsWith('column')) || look.display.includes('grid')
      if (kids.length >= 2 && rowish) {
        const boxes = kids.map((kid) => kid.getBoundingClientRect())
        const sideBySide = boxes.some((b, index) => index && Math.abs(b.top - boxes[0].top) < 6 && b.left >= boxes[0].right - 4)
        const narrow = boxes.some((b) => b.width < width * 0.48)
        const wordy = kids.some((kid) => flat(kid.textContent || '').length > 40 || kid.querySelector('img, picture, video'))
        if (sideBySide && narrow && wordy) found.stack.push(node)
      }
      if (hasWords(node)) {
        const size = parseFloat(look.fontSize)
        if (size > 44) found.head.push(node)
        else if (size < 13 && flat(node.textContent || '').length > 12) found.text.push(node)
      }
      const tag = node.tagName.toLowerCase()
      if ((tag === 'a' || tag === 'button') && box.height < 36 && !node.closest('p') && flat(node.textContent || '')) found.tap.push(node)
    }
    return found
  }
  const phonePlans = (found) => ({
    original: {},
    light: { 'we-phone-fit': found.fit },
    tidy: { 'we-phone-fit': found.fit, 'we-phone-stack': found.stack, 'we-phone-head': found.head },
    easy: { 'we-phone-fit': found.fit, 'we-phone-stack': found.stack, 'we-phone-roomy': found.stack, 'we-phone-head': found.head, 'we-phone-text': found.text, 'we-phone-tap': found.tap },
  })
  const planSize = (plan) => new Set(Object.values(plan).flat()).size
  async function openPhone() {
    try { if (dirty) await save() } catch (error) { status(`${say.failed}: ${error.message}`); return }
    const frame = make('iframe', { src: `${data.base}/preview/${data.slug}`, title: say.phoneTitle })
    const side = make('div', { class: 'we-phone-side' },
      make('div', { class: 'we-panel-head' }, make('h2', { text: say.phoneTitle }), make('button', { type: 'button', class: 'we-close', 'aria-label': say.close, 'data-tip': say.close, onclick: closePhone }, icon('close'))),
      make('p', { class: 'we-phone-hint', text: say.phoneHint }),
      make('p', { class: 'we-all-good', text: say.phoneLoading }))
    phoneView.replaceChildren(make('div', { class: 'we-phone-stage' }, make('div', { class: 'we-phone-device' }, frame)), side)
    phoneView.hidden = false
    frame.addEventListener('load', () => setTimeout(() => {
      let doc
      try { doc = frame.contentDocument } catch { status(say.failed); return }
      // What the page is like as moved: earlier phone fixes come off before it is measured.
      clearPhone(doc.body)
      const found = phoneFindings(frame)
      const plans = phonePlans(found)
      let chosen = planSize(plans.tidy) ? 'tidy' : 'original'
      const fits = make('p', { class: 'we-phone-fits' })
      const show = () => {
        clearPhone(doc.body)
        for (const [name, nodes] of Object.entries(plans[chosen])) for (const node of nodes) node.classList.add(name)
        // Sites often hide what sticks out instead of scrolling, so parts past the edge count even when nothing scrolls.
        const ok = doc.documentElement.scrollWidth <= doc.documentElement.clientWidth + 2 && (!found.fit.length || Boolean(plans[chosen]['we-phone-fit']))
        fits.className = `we-phone-fits ${ok ? 'ok' : 'bad'}`
        fits.textContent = ok ? say.phoneFits : say.phoneStill
        for (const card of side.querySelectorAll('.we-phone-option')) card.setAttribute('aria-pressed', String(card.dataset.plan === chosen))
      }
      side.replaceChildren(
        side.firstChild, side.children[1],
        make('div', { class: 'we-phone-options', role: 'group' }, ...['original', 'light', 'tidy', 'easy'].map((key) => {
          const size = planSize(plans[key])
          return make('button', { type: 'button', class: 'we-phone-option', 'data-plan': key, onclick: () => { chosen = key; show() } },
            make('span', { class: 'we-phone-option__top' }, make('b', { text: say.phoneOptions[key][0] }), key === 'tidy' ? make('span', { class: 'we-tag live', text: say.recommended }) : null),
            make('small', { text: say.phoneOptions[key][1] }),
            key === 'original' ? null : make('small', { class: 'we-phone-count', text: size ? fmt(say.phoneChanges, { n: size }) : say.phoneNone }))
        })),
        fits,
        make('p', { class: 'we-phone-hint', text: say.phoneOnly }),
        make('div', { class: 'we-phone-acts' },
          make('button', { type: 'button', class: 'we-btn', text: say.phoneCancel, onclick: closePhone }),
          make('button', { type: 'button', class: 'we-btn we-btn-primary', text: say.phoneUse, onclick: () => usePhone(plans[chosen], doc) })),
      )
      show()
    }, 500))
  }
  function usePhone(plan, doc) {
    // The same parts on the page being edited, found by where they sit in the page.
    const marks = Object.entries(plan).map(([name, nodes]) => [name, nodes.map((node) => pathTo(node, doc))])
    remember()
    clearPhone(document.body)
    for (const [name, paths] of marks) for (const steps of paths) { const node = byPath(steps); if (node && !ours(node)) node.classList.add(name) }
    changed()
    closePhone()
    save().then(() => status(say.phoneDone)).catch((error) => status(`${say.failed}: ${error.message}`))
  }
  function closePhone() { phoneView.hidden = true; phoneView.replaceChildren() }
  addEventListener('keydown', (event) => { if (event.key === 'Escape' && !phoneView.hidden) closePhone() })

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
      else if (id === 'we-edit-layers') toggleLayers()
      else if (id === 'we-edit-doctor') { historyPanel.hidden = true; await runDoctor() }
      else if (id === 'we-edit-phone') await openPhone()
      else if (id === 'we-edit-history') { if (historyPanel.hidden) await openHistory(); else historyPanel.hidden = true }
      else if (id === 'we-edit-help') { toggleHelp(); addMenu.hidden = true }
      else if (id === 'we-edit-save') await save()
      else if (id === 'we-edit-publish') {
        if (dirty) await save()
        const important = await runDoctor()
        if (important && !confirm(fmt(say.doctorPublishAsk, { n: important }))) return
        doctor.hidden = true
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

  // ---- Inside tktf.at: the toolbar moves into its stage bar, so nothing covers the site ----------------------
  // The editor tells the page that holds it how its buttons stand; that page draws them and sends back which was
  // pressed. Only that page is told and heard. If it does not answer (an older tktf.at), the toolbar stays here.
  if (parentOrigin) {
    const bar = document.getElementById('we-edit-bar')
    const ids = { undo: 'we-edit-undo', redo: 'we-edit-redo', add: 'we-edit-add', layers: 'we-edit-layers', doctor: 'we-edit-doctor', history: 'we-edit-history', phone: 'we-edit-phone', help: 'we-edit-help', save: 'we-edit-save', publish: 'we-edit-publish' }
    const byId = (key) => document.getElementById(ids[key])
    const state = () => ({
      undo: !byId('undo').disabled,
      redo: !byId('redo').disabled,
      save: !byId('save').disabled,
      publish: Boolean(byId('publish')),
      free: document.getElementById('we-edit-free').checked,
      status: document.getElementById('we-edit-status').textContent,
      saveState,
      add: !addMenu.hidden,
      layers: !layers.hidden,
      doctor: !doctor.hidden,
      history: !historyPanel.hidden,
      phone: !phoneView.hidden,
      help: !help.hidden,
    })
    let timer
    const send = () => {
      clearTimeout(timer)
      timer = setTimeout(() => window.parent.postMessage({ type: 'we-bar', state: state() }, parentOrigin), 40)
    }
    const watch = new MutationObserver(send)
    watch.observe(bar, { subtree: true, attributes: true, attributeFilter: ['disabled'], childList: true, characterData: true })
    for (const part of [addMenu, layers, doctor, historyPanel, phoneView, help]) watch.observe(part, { attributes: true, attributeFilter: ['hidden'] })
    addEventListener('message', (event) => {
      if (event.source !== window.parent || event.origin !== parentOrigin) return
      const ask = event.data
      if (ask?.type === 'we-bar-ready') {
        bar.hidden = true
        document.documentElement.classList.add('we-embedded')
        return
      }
      if (ask?.type !== 'we-bar-do' || typeof ask.action !== 'string') return
      if (ask.action === 'free') {
        const box = document.getElementById('we-edit-free')
        box.checked = !box.checked
        showMode()
        send()
        return
      }
      const target = ids[ask.action] && byId(ask.action)
      if (target && !target.disabled) target.click()
    })
    send()
    // In case the page was not listening yet when the editor first spoke.
    for (const wait of [800, 2500]) setTimeout(() => { if (!bar.hidden) send() }, wait)
  }
})()
