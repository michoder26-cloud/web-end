// Adds independent catalog, product detail and local cart interactions to this
// Base44 storefront pattern. The original app's JavaScript is never copied.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const source = process.argv[2];
const output = path.resolve(process.argv[3] || 'site');
if (!source || !fs.existsSync(path.join(output, 'index.html'))) {
  console.error('Usage: node enhance-base44-shop.cjs <source URL> <copied site directory>');
  process.exit(1);
}
if (fs.readFileSync(path.join(output, 'index.html'), 'utf8').includes('/assets/shop-runtime.js')) {
  console.error('This copied site already has the shop runtime.');
  process.exit(1);
}
let url;
try { url = new URL(source); if (url.protocol !== 'https:') throw Error(); }
catch { console.error('Use a public HTTPS source URL.'); process.exit(1); }

function safeDialog(element, image) {
  const copy = element.cloneNode(true);
  copy.querySelectorAll('script, style, iframe, form').forEach(node => node.remove());
  for (const node of [copy, ...copy.querySelectorAll('*')]) {
    for (const attr of [...node.attributes]) if (/^on/i.test(attr.name) || attr.name.startsWith('data-base44-') || (['href', 'src', 'action', 'xlink:href'].includes(attr.name) && /^\s*javascript:/i.test(attr.value))) node.removeAttribute(attr.name);
  }
  copy.querySelectorAll('img').forEach(img => {
    img.setAttribute('src', image);
    img.removeAttribute('srcset');
    img.removeAttribute('loading');
    img.style.filter = '';
    img.style.transform = '';
  });
  copy.querySelectorAll('source').forEach(node => node.remove());
  return copy.outerHTML;
}

(async () => {
  const browser = await chromium.launch();
  try {
    const localContext = await browser.newContext({ javaScriptEnabled: false });
    const local = await localContext.newPage();
    await local.goto(pathToFileURL(path.join(output, 'index.html')).href);
    const localProducts = await local.locator('#products button:has(h3)').evaluateAll(cards =>
      cards.map(card => ({ title: card.querySelector('h3')?.textContent?.trim() || '', image: card.querySelector('img')?.getAttribute('src') || '' })));
    await localContext.close();

    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await page.goto(url.href, { waitUntil: 'load', timeout: 90000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    const cards = page.locator('#products button:has(h3)');
    const count = await cards.count();
    if (!count || count !== localProducts.length || localProducts.some(product => !product.image.startsWith('/assets/'))) {
      throw Error('The source and copied catalog do not have matching product cards.');
    }
    const products = [];
    for (let index = 0; index < count; index++) {
      const sale = await cards.nth(index).locator('.line-through').count() > 0;
      await cards.nth(index).click();
      const dialog = page.getByRole('dialog');
      if (!await dialog.isVisible()) { await page.waitForTimeout(500); if (!await dialog.isVisible()) await cards.nth(index).click(); }
      await dialog.waitFor({ timeout: 15000 });
      const text = await dialog.innerText();
      const title = await dialog.locator('h2').first().innerText();
      if (title.trim() !== localProducts[index].title) throw Error(`Product ${index + 1} changed since the copy was made.`);
      const variantNames = await dialog.locator('button').evaluateAll(buttons => buttons
        .filter(button => button.innerText.trim() && !/ใส่ตะกร้า|^Close$/.test(button.innerText.trim()))
        .map(button => button.innerText.trim()));
      const priceLabel = await dialog.getByRole('button', { name: /ใส่ตะกร้า/ }).innerText();
      const price = Number(priceLabel.match(/฿([\d,]+)/)?.[1].replaceAll(',', ''));
      const stock = Number(text.match(/คงเหลือ\s*([\d,]+)/)?.[1].replaceAll(',', ''));
      if (!title || !Number.isFinite(price) || !Number.isFinite(stock) || !variantNames.length) {
        throw Error(`Could not read product ${index + 1}`);
      }
      const templates = [];
      for (const name of variantNames) {
        await dialog.getByRole('button', { name, exact: true }).click();
        templates.push(await dialog.evaluate(safeDialog, localProducts[index].image));
      }
      products.push({ title, category: text.split('\n').find(line => line.trim())?.trim() || '', price, stock, sale, image: localProducts[index].image, variants: variantNames, templates });
      await dialog.getByRole('button', { name: 'Close' }).click();
      console.log('product', index + 1, title);
    }
    await page.close();

    const assets = path.join(output, 'assets');
    fs.writeFileSync(path.join(assets, 'shop-data.json'), JSON.stringify({ source: url.href, products }));
    fs.copyFileSync(path.join(__dirname, 'shop-runtime.js'), path.join(assets, 'shop-runtime.js'));
    for (const file of [path.join(output, 'index.html'), path.join(output, 'm', 'index.html')]) {
      let html = fs.readFileSync(file, 'utf8');
      if (html.includes('/assets/shop-runtime.js')) throw Error('Shop runtime has already been added.');
      html = html.replace('</body>', '<script src="/assets/shop-runtime.js" defer></script></body>');
      fs.writeFileSync(file, html);
    }
    const reportFile = path.join(output, 'copy-report.json');
    if (fs.existsSync(reportFile)) {
      const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
      report.interactions = { catalogProducts: products.length, filters: true, productOptions: true, cart: 'browser_only', customerAccounts: false, payments: false };
      fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    }
    console.log('interactive catalog', products.length, 'products');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
