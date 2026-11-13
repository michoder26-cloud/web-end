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
      panel.addEventListener('click', event => { if (event.target.closest('a[href]')) close(); });
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  }
})();
