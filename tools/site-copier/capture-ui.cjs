// Capture safe, visible aria-expanded menus as independent HTML transitions.
// This is deliberately bounded: it never presses submit, buy, delete or checkout.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const { guardContext } = require('./public-network.cjs');

const directory = path.resolve(process.argv[2] || 'site');
const reportFile = path.join(directory, 'copy-report.json');
if (!fs.existsSync(reportFile)) { console.error('Run copy.cjs before capture-ui.cjs.'); process.exit(1); }
const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
const root = new URL(report.source);
const base = root.pathname.replace(/\/$/, '');
const copied = new Set(report.pages || []);
const sourceFor = slug => slug === 'index' ? root.href : root.origin + base + '/' + slug;
const localFor = (slug, view) => path.join(directory, view === 'phone' ? 'm' : '', slug === 'index' ? '' : slug, 'index.html');
const assetCache = new Map();
const checkedHosts = new Map();
function privateAddress(address) {
  if (net.isIP(address) === 6) return /^(::1|::|f[cd]|fe[89ab]|ff|::ffff:)/i.test(address);
  const [first, second] = address.split('.').map(Number);
  return first === 0 || first === 10 || first === 127 || first >= 224 || first === 169 && second === 254 || first === 172 && second >= 16 && second <= 31 || first === 192 && second === 168;
}
async function safeAssetUrl(raw) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
  if (url.origin === root.origin) return true;
  if (!checkedHosts.has(url.hostname)) checkedHosts.set(url.hostname, dns.lookup(url.hostname, { all: true }).then(addresses => addresses.length > 0 && addresses.every(({ address }) => !privateAddress(address))).catch(() => false));
  return checkedHosts.get(url.hostname);
}
async function localizeFragment(fragment, request) {
  const urls = [...new Set([...fragment.matchAll(/(?:src|poster)="(https?:[^\"]+)"/g)].map(match => match[1]))].slice(0, 60);
  for (const htmlUrl of urls) {
    if (assetCache.has(htmlUrl)) continue;
    try {
      const url = htmlUrl.replace(/&amp;/g, '&');
      if (!await safeAssetUrl(url)) continue;
      const response = await request.get(url, { timeout: 15000, maxRedirects: 0 });
      if (!response.ok()) continue;
      const body = await response.body();
      if (body.length > 5_000_000) continue;
      const type = response.headers()['content-type'] || '';
      if (!/^image\//.test(type)) continue;
      const extension = type.includes('avif') ? '.avif' : type.includes('webp') ? '.webp' : type.includes('svg') ? '.svg' : type.includes('png') ? '.png' : type.includes('gif') ? '.gif' : '.jpg';
      const name = crypto.createHash('md5').update(url).digest('hex').slice(0, 12) + extension;
      fs.writeFileSync(path.join(directory, 'assets', name), body);
      assetCache.set(htmlUrl, '/assets/' + name);
    } catch (error) { console.error('UI asset unavailable:', error.message.split('\n')[0]); }
  }
  return fragment.replace(/(src|poster)="(https?:[^\"]+)"/g, (match, attribute, url) => assetCache.has(url) ? `${attribute}="${assetCache.get(url)}"` : match);
}
async function captureCarousels(page, context) {
  const next = page.locator('button[aria-label="Next"]').first();
  const back = page.locator('button[aria-label="BACK"],button[aria-label="Back"]').first();
  if (!await next.count() || !await back.count()) return [];
  await page.waitForTimeout(4000);
  const before = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[id]')].map(element => [element.id, element.innerText?.trim() || ''])));
  try { await next.click({ timeout: 5000 }); } catch (error) { console.error('Carousel next unavailable:', error.message.split('\n')[0]); return []; }
  await page.waitForTimeout(500);
  const findTarget = () => page.evaluate(previous => {
    const choices = [...document.querySelectorAll('[id]')].filter(element => {
      const text = element.innerText?.trim() || '';
      return previous[element.id]?.length > 20 && text.length > 20 && text.length < 1500 && previous[element.id] !== text;
    });
    choices.sort((left, right) => left.querySelectorAll('*').length - right.querySelectorAll('*').length);
    return choices[0]?.id || null;
  }, before);
  let targetId = await findTarget();
  if (!targetId) { await page.waitForTimeout(3000); targetId = await findTarget(); }
  if (!targetId) { await next.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(500); targetId = await findTarget(); }
  if (!targetId) { console.error('Carousel content did not change after Next'); return []; }
  const nextParentId = await next.evaluate(element => element.closest('[id]')?.id || null);
  const backParentId = await back.evaluate(element => element.closest('[id]')?.id || null);
  if (!nextParentId || !backParentId) { console.error('Carousel controls have no stable parent'); return []; }
  await back.click({ timeout: 5000 });
  await page.waitForTimeout(350);
  const snapshot = async () => {
    const state = await page.evaluate(id => {
      const element = document.getElementById(id);
      if (!element) return null;
      const clone = element.cloneNode(true);
      const images = [...element.querySelectorAll('img')];
      [...clone.querySelectorAll('img')].forEach((image, index) => { if (images[index]?.currentSrc) image.src = images[index].currentSrc; image.removeAttribute('srcset'); });
      clone.querySelectorAll('script,style,iframe,form').forEach(node => node.remove());
      for (const node of [clone, ...clone.querySelectorAll('*')]) for (const attribute of [...node.attributes]) {
        if (/^on/i.test(attribute.name) || attribute.name === 'srcset' || (['href', 'src', 'action', 'xlink:href'].includes(attribute.name) && /^\s*javascript:/i.test(attribute.value))) node.removeAttribute(attribute.name);
      }
      return { html: clone.innerHTML, text: element.innerText.trim() };
    }, targetId);
    if (!state) return null;
    state.html = await localizeFragment(state.html, context.request);
    return state;
  };
  const states = [];
  const initial = await snapshot();
  if (!initial) { console.error('Carousel first state unavailable'); return []; }
  states.push(initial);
  for (let i = 0; i < 7 && !await next.isDisabled(); i++) {
    await next.click({ timeout: 5000 });
    await page.waitForTimeout(400);
    const state = await snapshot();
    if (!state || state.text === states.at(-1).text) break;
    states.push(state);
  }
  if (states.length < 2) console.error('Carousel states did not advance');
  return states.length > 1 ? [{ targetId, nextParentId, backParentId, states }] : [];
}

(async () => {
  const browser = await chromium.launch();
  const pages = [];
  try {
    for (const slug of [...copied].slice(0, Number(process.env.UI_MAX_PAGES || copied.size))) for (const view of ['desktop', 'phone']) {
      if (!fs.existsSync(localFor(slug, view))) continue;
      const context = await browser.newContext(view === 'phone' ? devices['iPhone 13'] : { viewport: { width: 1366, height: 900 } });
      await guardContext(context);
      const page = await context.newPage();
      const source = sourceFor(slug);
      try {
        await page.goto(source, { waitUntil: 'load', timeout: 90000 });
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        if (await page.locator('button[aria-haspopup="dialog"]:visible').count()) await page.waitForTimeout(5000);
        const controls = await page.locator('button[aria-expanded="false"]:visible').evaluateAll(buttons => {
          const all = [...document.querySelectorAll('button[aria-expanded]')];
          return buttons.slice(0, 12).map(button => ({ index: all.indexOf(button), label: button.getAttribute('aria-label') || button.textContent.trim() }));
        });
        const toggles = [];
        for (const control of controls) {
          const button = page.locator('button[aria-expanded]').nth(control.index);
          const controlled = await button.evaluate(element => {
            const targetId = element.getAttribute('aria-controls');
            const target = targetId && document.getElementById(targetId);
            if (!target) return null;
            const style = getComputedStyle(target);
            if (style.display !== 'none' && style.visibility !== 'hidden' && !target.hidden) return null;
            return { kind: 'controlled-panel', targetId };
          });
          if (controlled) { toggles.push({ ...control, ...controlled }); continue; }
          const before = await page.locator('a[href]').evaluateAll(anchors => anchors.filter(anchor => {
            const box = anchor.getBoundingClientRect(), style = getComputedStyle(anchor);
            return box.width && box.height && style.visibility !== 'hidden';
          }).map(anchor => anchor.outerHTML));
          const closedIcon = await button.innerHTML();
          try { await button.click({ timeout: 5000 }); }
          catch { continue; }
          await page.waitForTimeout(250);
          let expanded = await button.getAttribute('aria-expanded') === 'true';
          if (!expanded) {
            await page.waitForTimeout(3500);
            expanded = await button.getAttribute('aria-expanded') === 'true';
            if (!expanded) {
              await button.click({ timeout: 5000 }).catch(() => {});
              await page.waitForTimeout(250);
              expanded = await button.getAttribute('aria-expanded') === 'true';
            }
          }
          const transition = expanded ? await page.evaluate(({ old, source, rootHref, paths }) => {
            const added = [...document.querySelectorAll('a[href]')].filter(anchor => {
              const box = anchor.getBoundingClientRect(), style = getComputedStyle(anchor);
              return box.width && box.height && style.visibility !== 'hidden' && !old.includes(anchor.outerHTML);
            });
            if (!added.length) return null;
            let parent = added[0].closest('[role="dialog"]') || added[0].parentElement;
            while (parent && !added.every(anchor => parent.contains(anchor))) parent = parent.parentElement;
            if (!parent || parent === document.body || parent === document.documentElement) return null;
            const host = parent.parentElement;
            const into = parent.matches('[role="dialog"]') ? 'body' : host?.closest('header') ? 'header' : host?.closest('nav') ? 'nav' : host?.id ? '#' + CSS.escape(host.id) : 'body';
            const clone = parent.cloneNode(true);
            const originalImages = [...parent.querySelectorAll('img')];
            [...clone.querySelectorAll('img')].forEach((image, index) => { if (originalImages[index]?.currentSrc) image.src = originalImages[index].currentSrc; image.removeAttribute('srcset'); });
            clone.querySelectorAll('script,style,iframe,form').forEach(node => node.remove());
            for (const node of [clone, ...clone.querySelectorAll('*')]) for (const attr of [...node.attributes]) {
              if (/^on/i.test(attr.name) || attr.name === 'srcset' || (['href', 'src', 'action', 'xlink:href'].includes(attr.name) && /^\s*javascript:/i.test(attr.value))) node.removeAttribute(attr.name);
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
          if (transition) toggles.push({ ...control, ...transition, fragment: await localizeFragment(transition.fragment, context.request), closedIcon, openIcon: await button.innerHTML() });
          await page.reload({ waitUntil: 'load' });
          await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        }
        const carousels = await captureCarousels(page, context).catch(error => { console.error('Carousel capture:', error.message.split('\n')[0]); return []; });
        if (toggles.length || carousels.length) pages.push({ slug, view, toggles, carousels });
        console.log(slug, view, 'captured toggles', toggles.length, 'carousels', carousels.length);
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
    report.interactions.genericCarousels = pages.reduce((sum, page) => sum + page.carousels.length, 0);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log('captured UI toggles', report.interactions.genericToggles);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
