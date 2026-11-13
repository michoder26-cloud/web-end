// Independent browser-side shop interactions for a captured Base44 storefront.
// Orders, customer accounts and payments need a real web-end backend.
(async () => {
  const catalog = await fetch('/assets/shop-data.json').then(response => response.json()).catch(() => null);
  if (!catalog?.products?.length) return;
  const products = catalog.products;
  const cards = [...document.querySelectorAll('#products button')].filter(button => button.querySelector('h3'));
  if (cards.length !== products.length) return;
  const root = document.createElement('div');
  root.id = 'web-end-shop-root';
  document.body.append(root);
  const style = document.createElement('style');
  style.textContent = `
    #web-end-shop-root .we-overlay{position:fixed;inset:0;z-index:49;background:rgba(0,0,0,.78)}
    #web-end-shop-root [role=dialog]{z-index:50}
    #web-end-shop-root .we-cart{position:fixed;z-index:50;right:0;top:0;bottom:0;width:min(100vw,430px);background:#fafafa;color:#111;box-shadow:-8px 0 30px #0002;display:flex;flex-direction:column;font-family:inherit}
    #web-end-shop-root .we-cart-head,#web-end-shop-root .we-cart-foot{padding:22px 24px;border-bottom:1px solid #ddd}
    #web-end-shop-root .we-cart-foot{margin-top:auto;border-top:1px solid #ddd;border-bottom:0}
    #web-end-shop-root .we-cart-body{padding:24px;overflow:auto;flex:1}
    #web-end-shop-root .we-cart-row{display:grid;grid-template-columns:72px 1fr auto;gap:14px;margin:18px 0;align-items:start}
    #web-end-shop-root .we-cart-row img{width:72px;height:88px;object-fit:cover;border-radius:8px}
    #web-end-shop-root .we-cart-row small,#web-end-shop-root .we-muted{color:#666}
    #web-end-shop-root .we-cart button{cursor:pointer}
    #web-end-shop-root .we-cart .we-round{border:1px solid #ddd;border-radius:999px;padding:5px 10px;background:white}
    #web-end-shop-root .we-cart .we-checkout{width:100%;border:0;border-radius:999px;background:#333;color:white;padding:15px;margin-top:16px;opacity:.6;cursor:not-allowed}
    #web-end-shop-root .we-cart .we-close{float:right;border:0;background:transparent;font-size:22px}
    #web-end-shop-root .we-count{position:absolute;top:-2px;right:-2px;background:#111;color:white;border-radius:99px;font-size:10px;min-width:16px;height:16px;display:grid;place-items:center}
    #web-end-shop-root .we-toast{position:fixed;z-index:60;bottom:30px;left:50%;transform:translateX(-50%);background:#111;color:white;padding:12px 18px;border-radius:8px;box-shadow:0 8px 30px #0003;text-align:center}
  `;
  document.head.append(style);
  const key = `web-end-cart:${location.origin}`;
  const money = amount => '฿' + Number(amount).toLocaleString('th-TH');
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  let cart;
  try { cart = JSON.parse(localStorage.getItem(key) || '[]'); } catch { cart = []; }
  if (!Array.isArray(cart)) cart = [];
  cart = cart.filter(item => Number.isInteger(item.product) && item.product >= 0 && item.product < products.length && Number.isInteger(item.variant) && item.variant >= 0 && item.variant < products[item.product].variants.length && Number.isInteger(item.qty) && item.qty > 0).map(item => ({ ...item, qty: Math.min(item.qty, products[item.product].stock) }));
  let active = null;
  let toastTimer;
  const save = () => { localStorage.setItem(key, JSON.stringify(cart)); updateBadge(); };
  const count = () => cart.reduce((sum, item) => sum + item.qty, 0);
  function updateBadge() {
    for (const button of document.querySelectorAll('button[aria-label="ตะกร้าสินค้า"]')) {
      let badge = button.querySelector('.we-count');
      if (!badge) { badge = document.createElement('span'); badge.className = 'we-count'; button.append(badge); }
      badge.textContent = String(count());
      badge.hidden = count() === 0;
      button.style.position = 'relative';
    }
  }
  function toast(message) {
    document.querySelector('#web-end-shop-root .we-toast')?.remove();
    const note = document.createElement('div'); note.className = 'we-toast'; note.textContent = message; root.append(note);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => note.remove(), 3500);
  }
  const clearPanel = () => { root.querySelector('.we-overlay')?.remove(); root.querySelector('[role=dialog]')?.remove(); root.querySelector('.we-cart')?.remove(); active = null; document.body.style.overflow = ''; };

  function renderProduct(index, variant = 0, qty = 1) {
    clearPanel();
    const product = products[index];
    active = { index, variant, qty };
    root.insertAdjacentHTML('afterbegin', `<div class="we-overlay" data-action="close"></div>${product.templates[variant]}`);
    document.body.style.overflow = 'hidden';
    const dialog = root.querySelector('[role=dialog]');
    dialog.setAttribute('aria-modal', 'true');
    dialog.querySelectorAll('img').forEach(img => { img.src = product.image; img.removeAttribute('srcset'); });
    const quantity = dialog.querySelector('button[aria-label="เพิ่มจำนวน"]')?.parentElement?.querySelector('span');
    if (quantity) quantity.textContent = String(qty);
    const add = [...dialog.querySelectorAll('button')].find(button => button.textContent.includes('ใส่ตะกร้า'));
    if (add) add.innerHTML = `ใส่ตะกร้า · ${money(product.price * qty)}`;
    dialog.focus();
  }

  function renderCart() {
    clearPanel();
    const subtotal = cart.reduce((sum, item) => sum + products[item.product].price * item.qty, 0);
    const rows = cart.map((item, index) => {
      const product = products[item.product];
      return `<div class="we-cart-row"><img src="${escape(product.image)}" alt=""><div><strong>${escape(product.title)}</strong><br><small>${escape(product.variants[item.variant])}</small><div style="margin-top:12px;display:flex;gap:6px;align-items:center"><button class="we-round" data-action="decrease" data-index="${index}" aria-label="ลดจำนวน">−</button><span>${item.qty}</span><button class="we-round" data-action="increase" data-index="${index}" aria-label="เพิ่มจำนวน">+</button><button class="we-round" data-action="remove" data-index="${index}">ลบ</button></div></div><strong>${money(product.price * item.qty)}</strong></div>`;
    }).join('');
    root.insertAdjacentHTML('afterbegin', `<div class="we-overlay" data-action="close"></div><aside class="we-cart" role="dialog" aria-modal="true" aria-label="ตะกร้าของคุณ"><div class="we-cart-head"><button class="we-close" data-action="close" aria-label="ปิด">×</button><strong>ตะกร้าของคุณ (${count()})</strong></div><div class="we-cart-body">${subtotal && subtotal < 1500 ? `<p class="we-muted">อีก ${money(1500 - subtotal)} ก็ได้ส่งฟรี</p>` : subtotal ? '<p class="we-muted">ส่งฟรีทั่วประเทศ</p>' : '<p class="we-muted">ตะกร้ายังว่าง</p>'}${rows}</div><div class="we-cart-foot"><div style="display:flex;justify-content:space-between"><strong>ยอดรวมสินค้า</strong><strong>${money(subtotal)}</strong></div><button class="we-checkout" disabled>ยังไม่เชื่อมระบบชำระเงิน</button><p class="we-muted" style="font-size:12px;text-align:center;margin-top:10px">ตะกร้าตัวอย่างเก็บข้อมูลในเบราว์เซอร์นี้เท่านั้น</p></div></aside>`);
    document.body.style.overflow = 'hidden';
  }

  cards.forEach((card, index) => card.addEventListener('click', () => renderProduct(index)));
  const filters = [...document.querySelectorAll('#products button')].filter(button => !button.querySelector('h3') && button.parentElement?.className.includes('overflow-x-auto'));
  const initialClasses = filters.map(button => button.className);
  filters.forEach((button, index) => button.addEventListener('click', () => {
    const label = button.textContent.trim();
    cards.forEach((card, productIndex) => { card.style.display = index === 0 || (label === 'ลดราคา' ? products[productIndex].sale : products[productIndex].category === label) ? '' : 'none'; });
    filters.forEach((filter, filterIndex) => {
      filter.className = filterIndex === index ? initialClasses[0] : initialClasses[Math.min(filterIndex || 1, initialClasses.length - 1)];
      filter.setAttribute('aria-pressed', String(filterIndex === index));
    });
  }));
  for (const button of document.querySelectorAll('button[aria-label="ตะกร้าสินค้า"]')) button.addEventListener('click', renderCart);
  for (const button of document.querySelectorAll('button')) {
    if (button.textContent.trim() === 'ตะกร้า') button.addEventListener('click', renderCart);
    if (button.textContent.trim() === 'เข้าสู่ระบบ') button.addEventListener('click', () => toast('การเข้าสู่ระบบยังไม่ได้เชื่อมกับ web-end'));
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'close' || button?.textContent.trim() === 'Close') { clearPanel(); return; }
    if (active && button) {
      const product = products[active.index];
      const label = button.textContent.trim();
      const variant = product.variants.indexOf(label);
      if (variant !== -1) { renderProduct(active.index, variant, active.qty); return; }
      if (button.getAttribute('aria-label') === 'ลดจำนวน') { renderProduct(active.index, active.variant, Math.max(1, active.qty - 1)); return; }
      if (button.getAttribute('aria-label') === 'เพิ่มจำนวน') { renderProduct(active.index, active.variant, Math.min(product.stock, active.qty + 1)); return; }
      if (label.includes('ใส่ตะกร้า')) {
        const found = cart.find(item => item.product === active.index && item.variant === active.variant);
        if (found) found.qty = Math.min(product.stock, found.qty + active.qty);
        else cart.push({ product: active.index, variant: active.variant, qty: Math.min(product.stock, active.qty) });
        save(); clearPanel(); toast('เพิ่มสินค้าลงตะกร้าแล้ว'); return;
      }
    }
    if (!action || !button) return;
    const index = Number(button.dataset.index);
    const item = cart[index];
    if (!item) return;
    if (action === 'increase') item.qty = Math.min(products[item.product].stock, item.qty + 1);
    if (action === 'decrease') item.qty = Math.max(1, item.qty - 1);
    if (action === 'remove') cart.splice(index, 1);
    save(); renderCart();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') clearPanel(); });
  updateBadge();
})();
