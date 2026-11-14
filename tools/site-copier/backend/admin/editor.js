// Page editor for the owner: click text to change it, click a picture to replace it.
(function () {
  var th = /^th\b/i.test(navigator.language || '');
  var t = function (en, thai) { return th ? thai : en; };
  var page = location.pathname.replace(/^\/admin\/edit/, '') || '/';
  var edits = {};
  var bar = document.createElement('div');
  bar.id = 'we-editbar';
  bar.innerHTML = '<style>#we-editbar{position:fixed;z-index:2147483647;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 32px);background:#1d1d1b;color:#fff;padding:10px 12px;border-radius:12px;box-shadow:0 10px 30px #0005;font:14px/1.3 system-ui,"Noto Sans Thai",sans-serif}' +
    '#we-editbar button,#we-editbar a{font:inherit;border:0;border-radius:8px;padding:8px 12px;cursor:pointer;text-decoration:none;background:#3a3a37;color:#fff}#we-editbar .save{background:#7fb8a4;color:#0f1f1a}#we-editbar .save:disabled{opacity:.45;cursor:default}' +
    '[data-we]{cursor:text}[data-we]:hover{outline:2px dashed #7fb8a4;outline-offset:2px}[data-we][contenteditable]{outline:2px solid #2f5d50;outline-offset:2px}[data-we].we-changed{outline:2px solid #e8a33d}' +
    'img.we-img-hover{outline:3px dashed #e8a33d;outline-offset:-3px;cursor:pointer}</style>' +
    '<span class="we-status"></span><a class="back" href="/admin/"></a><button class="save" disabled></button>';
  document.body.appendChild(bar);
  var status = bar.querySelector('.we-status'), save = bar.querySelector('.save'), back = bar.querySelector('.back');
  back.textContent = t('Back', 'กลับ');
  function update(text) {
    var n = Object.keys(edits).length;
    save.textContent = n ? t('Save ' + n + ' change' + (n > 1 ? 's' : ''), 'บันทึก ' + n + ' จุด') : t('Save', 'บันทึก');
    save.disabled = !n;
    status.textContent = text || t('Click text to edit · click a picture to replace', 'คลิกข้อความเพื่อแก้ · คลิกรูปเพื่อเปลี่ยน');
  }
  update();

  function pictureAt(x, y) {
    var all = document.elementsFromPoint(x, y);
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      if (e.closest && e.closest('#we-editbar')) return null;
      if (e.tagName === 'IMG' && /^\/(assets|uploads)\//.test(e.getAttribute('src') || '')) return e;
    }
    return null;
  }
  var hovered = null;
  document.addEventListener('mousemove', function (e) {
    var text = e.target.closest && e.target.closest('[data-we]');
    var img = text ? null : pictureAt(e.clientX, e.clientY);
    if (hovered && hovered !== img) hovered.classList.remove('we-img-hover');
    hovered = img; if (img) img.classList.add('we-img-hover');
  }, true);

  // Inside the editor nothing navigates or submits.
  document.addEventListener('submit', function (e) { e.preventDefault(); e.stopPropagation(); }, true);
  document.addEventListener('click', function (e) {
    if (e.target.closest('#we-editbar')) return;
    e.preventDefault(); e.stopPropagation();
    var text = e.target.closest('[data-we]');
    if (text) return startText(text);
    var img = pictureAt(e.clientX, e.clientY);
    if (img) pickImage(img);
  }, true);

  function startText(el) {
    if (el.isContentEditable) return;
    el.setAttribute('contenteditable', 'plaintext-only');
    if (el.contentEditable !== 'plaintext-only') el.setAttribute('contenteditable', 'true');
    el.dataset.weBefore = el.dataset.weBefore || el.textContent;
    el.focus();
    el.addEventListener('keydown', function (k) { if (k.key === 'Enter' && !k.shiftKey) { k.preventDefault(); el.blur(); } });
    el.addEventListener('paste', function (p) { p.preventDefault(); document.execCommand('insertText', false, (p.clipboardData || window.clipboardData).getData('text/plain')); });
    el.addEventListener('blur', function () {
      el.removeAttribute('contenteditable');
      var now = el.textContent;
      // Same text in the same place on the page changes together (for example the phone menu).
      document.querySelectorAll('[data-we="' + el.dataset.we + '"]').forEach(function (other) { if (other !== el) other.textContent = now; });
      if (now !== el.dataset.weBefore) { edits[el.dataset.we] = now; el.classList.add('we-changed'); }
      else { delete edits[el.dataset.we]; el.classList.remove('we-changed'); }
      update();
    }, { once: true });
  }

  function pickImage(img) {
    var from = img.getAttribute('src');
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp,image/gif,image/avif';
    input.onchange = function () {
      var file = input.files[0]; if (!file) return;
      if (file.size > 8 * 1024 * 1024) { update(t('Picture is too big (max 8 MB).', 'รูปใหญ่เกินไป (ไม่เกิน 8 MB)')); return; }
      update(t('Uploading…', 'กำลังอัปโหลด…'));
      fetch('/admin/api/image?from=' + encodeURIComponent(from), { method: 'POST', headers: { 'content-type': file.type }, body: file })
        .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw Error(d.error); return d; }); })
        .then(function (d) {
          document.querySelectorAll('img').forEach(function (i) { if (i.getAttribute('src') === from) i.setAttribute('src', d.src); });
          update(t('Picture replaced and saved.', 'เปลี่ยนรูปและบันทึกแล้ว'));
        })
        .catch(function (err) { update(t('Could not replace the picture. ', 'เปลี่ยนรูปไม่สำเร็จ ') + (err.message || '')); });
    };
    input.click();
  }

  save.addEventListener('click', function () {
    save.disabled = true; update(t('Saving…', 'กำลังบันทึก…')); save.disabled = true;
    fetch('/admin/api/text', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ page: page, edits: edits }) })
      .then(function (r) { if (!r.ok) throw Error(); return r.json(); })
      .then(function () {
        document.querySelectorAll('.we-changed').forEach(function (e) { e.classList.remove('we-changed'); delete e.dataset.weBefore; });
        edits = {}; update(t('Saved. Your site is updated.', 'บันทึกแล้ว เว็บอัปเดตเรียบร้อย'));
      })
      .catch(function () { update(t('Could not save. Try again.', 'บันทึกไม่สำเร็จ ลองอีกครั้ง')); save.disabled = false; });
  });
  window.addEventListener('beforeunload', function (e) { if (Object.keys(edits).length) { e.preventDefault(); e.returnValue = ''; } });
})();
