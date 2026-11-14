// Sends the copied site's forms to the web-end back office (/api/forms).
(function () {
  var thai = /^th\b/i.test(document.documentElement.lang || navigator.language || '');
  var words = thai
    ? { sent: 'ส่งข้อความแล้ว ขอบคุณครับ', fail: 'ส่งไม่สำเร็จ ลองใหม่อีกครั้ง', fill: 'กรุณากรอกช่องที่จำเป็น', sending: 'กำลังส่ง…' }
    : { sent: 'Thanks, your message was sent.', fail: 'Could not send. Please try again.', fill: 'Please fill in the required fields.', sending: 'Sending…' };

  function labelOf(input, index) {
    var label = input.getAttribute('aria-label') || input.placeholder || '';
    if (!label && input.id) { var l = document.querySelector('label[for="' + CSS.escape(input.id) + '"]'); if (l) label = l.textContent; }
    if (!label) { var parent = input.closest('label'); if (parent) label = parent.textContent; }
    return (label || input.name || 'Field ' + (index + 1)).replace(/\s+/g, ' ').replace(/\.\s.*$/, '').trim();
  }
  function fieldsOf(form) {
    var list = [], seenRadio = {};
    form.querySelectorAll('input, textarea, select').forEach(function (input, index) {
      var type = (input.type || '').toLowerCase();
      if (input.name === 'website' && input.getAttribute('aria-hidden')) return;
      if (['submit', 'button', 'hidden', 'file', 'password', 'reset', 'image'].indexOf(type) >= 0) return;
      if (type === 'radio') { if (seenRadio[input.name] || !input.checked) return; seenRadio[input.name] = 1; }
      var value = type === 'checkbox' ? (input.checked ? 'yes' : 'no') : input.value;
      list.push({ label: labelOf(input, index), value: value, required: input.required, input: input });
    });
    return list;
  }
  function note(form, text, ok) {
    var box = form.querySelector('.we-form-note');
    if (!box) { box = document.createElement('p'); box.className = 'we-form-note'; box.setAttribute('role', 'status'); form.appendChild(box); }
    box.textContent = text;
    box.style.cssText = 'margin:12px 0 0;padding:10px 14px;border-radius:6px;font:14px/1.4 system-ui,sans-serif;' + (ok ? 'background:#e8f6ec;color:#14532d' : 'background:#fdecec;color:#7f1d1d');
  }
  function send(form, button) {
    if (form.dataset.weBusy) return;
    var fields = fieldsOf(form);
    var missing = fields.filter(function (f) { return f.required && !String(f.value).trim(); });
    if (missing.length) { note(form, words.fill, false); missing[0].input.focus(); return; }
    var bad = fields.filter(function (f) { return f.input.type === 'email' && f.value && !f.input.checkValidity(); });
    if (bad.length) { note(form, words.fill, false); bad[0].input.focus(); return; }
    form.dataset.weBusy = '1';
    note(form, words.sending, true);
    fetch('/api/forms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        form: form.getAttribute('aria-label') || form.getAttribute('name') || document.title,
        page: location.pathname.replace(/^\/m\//, '/'),
        website: (form.querySelector('input[name=website]') || {}).value || '',
        fields: fields.map(function (f) { return { label: f.label, value: f.value }; })
      })
    }).then(function (r) { if (!r.ok) throw Error(); return r.json(); }).then(function () {
      form.reset && form.reset();
      note(form, words.sent, true);
    }).catch(function () { note(form, words.fail, false); }).then(function () { delete form.dataset.weBusy; });
  }
  function trap(form) {
    if (form.querySelector('input[name=website]')) return;
    var input = document.createElement('input');
    input.name = 'website'; input.tabIndex = -1; input.autocomplete = 'off'; input.setAttribute('aria-hidden', 'true');
    input.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0';
    form.appendChild(input);
  }
  document.querySelectorAll('form').forEach(trap);
  document.addEventListener('submit', function (event) {
    var form = event.target.closest('form'); if (!form) return;
    event.preventDefault(); send(form);
  }, true);
  document.addEventListener('click', function (event) {
    var button = event.target.closest('form button, form [role=button], form input[type=submit]');
    if (!button) return;
    var form = button.closest('form');
    var isSubmit = button.type === 'submit' || button.getAttribute('data-hook') === 'submit-button' || /submit|send|ส่ง/i.test(button.getAttribute('aria-label') || button.textContent || '');
    if (!isSubmit) return;
    event.preventDefault(); send(form, button);
  }, true);
})();
