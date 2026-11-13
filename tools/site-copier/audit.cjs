// Measures what the copied front end actually contains and loads. Controls that
// cannot be verified are reported instead of being called "working".
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const { createPreviewServer } = require('./server.cjs');

const directory = path.resolve(process.argv[2] || 'site');
const reportFile = path.join(directory, 'copy-report.json');
if (!fs.existsSync(reportFile)) { console.error('No copy-report.json found. Run copy.cjs first.'); process.exit(1); }
const copy = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
const pages = copy.pages || [];
const uiFile = path.join(directory, 'assets', 'ui-data.json');
const ui = fs.existsSync(uiFile) ? JSON.parse(fs.readFileSync(uiFile, 'utf8')) : { pages: [] };

const fileFor = (slug, mobile) => path.join(directory, mobile ? 'm' : '', slug === 'index' ? '' : slug, 'index.html');
const visibleControls = () => [...document.querySelectorAll('button,[role="button"]')]
  .filter(element => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  })
  .map(element => ({
    label: (element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100),
    form: Boolean(element.closest('form')),
    shop: Boolean(element.closest('#products')),
    cart: element.getAttribute('aria-label') === 'ตะกร้าสินค้า' || element.textContent?.trim() === 'ตะกร้า',
    login: element.textContent?.trim() === 'เข้าสู่ระบบ',
  }));

(async () => {
  const { server, url } = await createPreviewServer(directory);
  const browser = await chromium.launch();
  const audited = [];
  try {
    for (const slug of pages) {
      for (const [view, mobile] of [['desktop', false], ['phone', true]]) {
        const file = fileFor(slug, mobile);
        if (!fs.existsSync(file)) { audited.push({ slug, view, error: 'Missing captured page' }); continue; }
        const context = await browser.newContext(mobile ? devices['iPhone 13'] : { viewport: { width: 1366, height: 900 } });
        const page = await context.newPage();
        const external = new Set(), localErrors = [], pageErrors = [];
        await page.route('**/*', route => {
          if (new URL(route.request().url()).origin === new URL(url).origin) return route.continue();
          external.add(route.request().url()); return route.abort();
        });
        page.on('response', response => { if (response.url().startsWith(url) && response.status() >= 400) localErrors.push(`${response.status()} ${response.url()}`); });
        page.on('pageerror', error => pageErrors.push(error.message));
        const target = url + (mobile ? 'm/' : '') + (slug === 'index' ? '' : slug + '/');
        await page.goto(target, { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(350);
        const dom = await page.evaluate(() => ({
          title: document.title,
          images: [...document.images].filter(image => image.complete && image.naturalWidth === 0).map(image => image.getAttribute('src')).slice(0, 20),
          forms: document.querySelectorAll('form').length,
          links: [...document.querySelectorAll('a[href]')].map(anchor => ({ href: anchor.getAttribute('href'), text: anchor.textContent.trim().slice(0, 80) })),
        }));
        const controls = await page.evaluate(visibleControls);
        const handledShop = Boolean(copy.interactions?.catalogProducts);
        const capturedToggles = ui.pages.find(entry => entry.slug === slug && entry.view === view)?.toggles || [];
        const uiFailures = [];
        for (const toggle of capturedToggles) {
          const button = page.locator('button[aria-expanded]').nth(toggle.index);
          await button.click();
          if (await button.getAttribute('aria-expanded') !== 'true') uiFailures.push(toggle.label);
          await button.click();
        }
        const handledLabels = new Set(capturedToggles.map(toggle => toggle.label));
        const unverified = [...new Set(controls.filter(control => !control.form && !handledLabels.has(control.label) && !(handledShop && (control.shop || control.cart || control.login))).map(control => control.label || '(unlabelled button)'))];
        const shopFailures = [];
        if (handledShop && slug === 'index') {
          try {
            const cards = page.locator('#products button:has(h3)');
            if (await cards.count() !== copy.interactions.catalogProducts) throw Error('Product count changed');
            await cards.first().click();
            const dialog = page.getByRole('dialog');
            await dialog.waitFor({ timeout: 3000 });
            await dialog.locator('button').filter({ hasText: /ใส่ตะกร้า/ }).click();
            await page.locator('button[aria-label="ตะกร้าสินค้า"]').first().click();
            if (!(await page.getByRole('dialog').innerText()).includes('ยอดรวมสินค้า')) throw Error('Cart did not show the item');
          } catch (error) { shopFailures.push(error.message.split('\n')[0]); }
        }
        const missingLinks = dom.links.filter(link => {
          const href = link.href || '';
          if (!href.startsWith('/')) return false;
          let pathname;
          try { pathname = decodeURIComponent(href.split(/[?#]/)[0]); } catch { return true; }
          const file = path.resolve(directory, '.' + pathname, pathname.endsWith('/') ? 'index.html' : '');
          return !file.startsWith(directory + path.sep) || !fs.existsSync(file);
        });
        audited.push({ slug, view, title: dom.title, brokenImages: dom.images, missingLinks, externalRequests: [...external], localErrors, pageErrors, formsDeferred: dom.forms, verifiedToggles: capturedToggles.length - uiFailures.length, failedToggles: uiFailures, shopFailures, unverifiedButtons: unverified });
        await context.close();
      }
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
  const issues = audited.reduce((sum, page) => sum + (page.brokenImages?.length || 0) + (page.missingLinks?.length || 0) + (page.externalRequests?.length || 0) + (page.localErrors?.length || 0) + (page.pageErrors?.length || 0) + (page.failedToggles?.length || 0) + (page.shopFailures?.length || 0), 0);
  const unknown = audited.reduce((sum, page) => sum + (page.unverifiedButtons?.length || 0), 0);
  const uncopiedPages = copy.notCopied?.length || 0;
  const result = { source: copy.source, copiedPages: pages.length, uncopiedPages, status: issues || uncopiedPages ? 'needs-fixes' : unknown ? 'needs-interaction-review' : 'front-end-checks-passed', issueCount: issues, unverifiedControlCount: unknown, backendDeferred: { forms: audited.reduce((sum, page) => sum + (page.formsDeferred || 0), 0), customerAccounts: copy.interactions?.customerAccounts === false, payments: copy.interactions?.payments === false }, pages: audited };
  fs.writeFileSync(path.join(directory, 'front-end-audit.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: result.status, copiedPages: result.copiedPages, uncopiedPages: result.uncopiedPages, issueCount: issues, unverifiedControls: unknown }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
