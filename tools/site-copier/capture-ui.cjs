// Capture safe, visible aria-expanded menus as independent HTML transitions.
// This is deliberately bounded: it never presses submit, buy, delete or checkout.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const directory = path.resolve(process.argv[2] || 'site');
const reportFile = path.join(directory, 'copy-report.json');
if (!fs.existsSync(reportFile)) { console.error('Run copy.cjs before capture-ui.cjs.'); process.exit(1); }
const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
const root = new URL(report.source);
const base = root.pathname.replace(/\/$/, '');
const copied = new Set(report.pages || []);
const sourceFor = slug => slug === 'index' ? root.href : root.origin + base + '/' + slug;
const localFor = (slug, view) => path.join(directory, view === 'phone' ? 'm' : '', slug === 'index' ? '' : slug, 'index.html');

(async () => {
  const browser = await chromium.launch();
  const pages = [];
  try {
    for (const slug of [...copied].slice(0, Number(process.env.UI_MAX_PAGES || copied.size))) for (const view of ['desktop', 'phone']) {
      if (!fs.existsSync(localFor(slug, view))) continue;
      const context = await browser.newContext(view === 'phone' ? devices['iPhone 13'] : { viewport: { width: 1366, height: 900 } });
      const page = await context.newPage();
      const source = sourceFor(slug);
      try {
        await page.goto(source, { waitUntil: 'load', timeout: 90000 });
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        const controls = await page.locator('button[aria-expanded="false"]:visible').evaluateAll(buttons => {
          const all = [...document.querySelectorAll('button[aria-expanded]')];
          return buttons.slice(0, 12).map(button => ({ index: all.indexOf(button), label: button.getAttribute('aria-label') || button.textContent.trim() }));
        });
        const toggles = [];
        for (const control of controls) {
          const button = page.locator('button[aria-expanded]').nth(control.index);
          const before = await page.locator('a[href]').evaluateAll(anchors => anchors.map(anchor => anchor.outerHTML));
          const closedIcon = await button.innerHTML();
          await button.click();
          await page.waitForTimeout(250);
          const expanded = await button.getAttribute('aria-expanded') === 'true';
          const transition = expanded ? await page.evaluate(({ old, source, rootHref, paths }) => {
            const added = [...document.querySelectorAll('a[href]')].filter(anchor => !old.includes(anchor.outerHTML));
            if (!added.length) return null;
            const parent = added[0].parentElement;
            if (!parent || !added.every(anchor => anchor.parentElement === parent)) return null;
            const host = parent.parentElement;
            const into = host?.closest('header') ? 'header' : host?.closest('nav') ? 'nav' : host?.id ? '#' + CSS.escape(host.id) : 'body';
            const clone = parent.cloneNode(true);
            clone.querySelectorAll('script,style,iframe,form').forEach(node => node.remove());
            for (const node of [clone, ...clone.querySelectorAll('*')]) for (const attr of [...node.attributes]) {
              if (/^on/i.test(attr.name) || (['href', 'src', 'action', 'xlink:href'].includes(attr.name) && /^\s*javascript:/i.test(attr.value))) node.removeAttribute(attr.name);
            }
            const site = new URL(rootHref), prefix = site.pathname.replace(/\/$/, '');
            for (const anchor of clone.querySelectorAll('a[href]')) {
              const target = new URL(anchor.getAttribute('href'), source);
              if (target.origin !== site.origin || (target.pathname !== prefix && !target.pathname.startsWith(prefix + '/'))) continue;
              const slug = target.pathname.slice(prefix.length).replace(/^\/+|\/+$/g, '') || 'index';
              anchor.setAttribute('href', paths.includes(slug) ? '/' + (slug === 'index' ? '' : slug + '/') + target.search + target.hash : target.href);
            }
            return { into, fragment: clone.outerHTML };
          }, { old: before, source, rootHref: root.href, paths: [...copied] }).catch(() => null) : null;
          if (transition) toggles.push({ ...control, ...transition, closedIcon, openIcon: await button.innerHTML() });
          await page.reload({ waitUntil: 'load' });
          await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        }
        if (toggles.length) pages.push({ slug, view, toggles });
        console.log(slug, view, 'captured toggles', toggles.length);
      } catch (error) { console.error('UI capture failed', slug, view, error.message.split('\n')[0]); }
      await context.close();
    }
    if (pages.length) {
      fs.writeFileSync(path.join(directory, 'assets', 'ui-data.json'), JSON.stringify({ pages }));
      fs.copyFileSync(path.join(__dirname, 'ui-runtime.js'), path.join(directory, 'assets', 'ui-runtime.js'));
      for (const entry of pages) {
        const file = localFor(entry.slug, entry.view);
        let html = fs.readFileSync(file, 'utf8');
        if (!html.includes('/assets/ui-runtime.js')) html = html.replace('</body>', '<script src="/assets/ui-runtime.js" defer></script></body>');
        fs.writeFileSync(file, html);
      }
    }
    report.interactions ||= {};
    report.interactions.genericToggles = pages.reduce((sum, page) => sum + page.toggles.length, 0);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log('captured UI toggles', report.interactions.genericToggles);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
