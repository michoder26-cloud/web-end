// Replays UI-only menu transitions captured from aria-expanded controls.
(async () => {
  const data = await fetch('/assets/ui-data.json').then(response => response.json()).catch(() => null);
  if (!data?.pages) return;
  const mobile = location.pathname.startsWith('/m/');
  const route = (mobile ? location.pathname.slice(2) : location.pathname).replace(/^\/+|\/+$/g, '') || 'index';
  const entry = data.pages.find(page => page.slug === route && page.view === (mobile ? 'phone' : 'desktop'));
  if (!entry) return;
  const buttons = [...document.querySelectorAll('button[aria-expanded]')];
  for (const toggle of entry.toggles) {
    const button = buttons[toggle.index];
    if (!button || (button.getAttribute('aria-label') || button.textContent.trim()) !== toggle.label) continue;
    if (toggle.kind === 'controlled-panel') {
      const target = document.getElementById(toggle.targetId);
      if (!target) continue;
      const original = { display: target.style.getPropertyValue('display'), priority: target.style.getPropertyPriority('display'), hidden: target.hidden, ariaHidden: target.getAttribute('aria-hidden') };
      const close = () => {
        if (original.display) target.style.setProperty('display', original.display, original.priority);
        else target.style.removeProperty('display');
        target.hidden = original.hidden;
        if (original.ariaHidden === null) target.removeAttribute('aria-hidden');
        else target.setAttribute('aria-hidden', original.ariaHidden);
        button.setAttribute('aria-expanded', 'false');
      };
      button.addEventListener('click', () => {
        if (button.getAttribute('aria-expanded') === 'true') { close(); return; }
        target.hidden = false;
        target.style.setProperty('display', 'block', 'important');
        target.setAttribute('aria-hidden', 'false');
        button.setAttribute('aria-expanded', 'true');
      });
      document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
      continue;
    }
    let panel;
    const close = () => { panel?.remove(); panel = null; button.setAttribute('aria-expanded', 'false'); };
    button.addEventListener('click', () => {
      if (panel) { close(); return; }
      const host = toggle.into === 'header' ? button.closest('header') : toggle.into === 'nav' ? button.closest('nav') : document.querySelector(toggle.into);
      if (!host) return;
      const template = document.createElement('template');
      template.innerHTML = toggle.fragment;
      panel = template.content.firstElementChild;
      if (!panel) return;
      host.append(panel);
      button.setAttribute('aria-expanded', 'true');
      panel.addEventListener('click', event => { if (event.target.closest('a[href],button[aria-label="Close"]')) close(); });
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  }
  for (const carousel of entry.carousels || []) {
    const target = document.getElementById(carousel.targetId);
    const next = document.getElementById(carousel.nextParentId)?.querySelector('button');
    const back = document.getElementById(carousel.backParentId)?.querySelector('button');
    if (!target || !next || !back || carousel.states.length < 2) continue;
    let index = 0;
    const render = () => {
      target.innerHTML = carousel.states[index].html;
      for (const [button, disabled] of [[back, index === 0], [next, index === carousel.states.length - 1]]) {
        button.disabled = disabled;
        button.classList.toggle('disabled', disabled);
      }
    };
    next.addEventListener('click', () => { if (index < carousel.states.length - 1) { index++; render(); } });
    back.addEventListener('click', () => { if (index > 0) { index--; render(); } });
    render();
  }
})();
