// Run with COPY_PREVIEW_DIR=<runner output/site> node copy-platform/tests/browser-preview.integration.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.env.COPY_PREVIEW_DIR;
if (!root) throw Error('Set COPY_PREVIEW_DIR to a copied site output directory');
const prefix = '/p/77777777-7777-7777-7777-777777777777';
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
  if (!pathname.startsWith(prefix + '/')) return response.writeHead(404).end();
  const name = pathname.slice(prefix.length + 1) || 'index.html';
  const file = path.resolve(root, name.endsWith('/') ? name + 'index.html' : name);
  if (!file.startsWith(path.resolve(root) + path.sep)) return response.writeHead(403).end();
  try {
    let body = await readFile(file);
    const ext = path.extname(file);
    const type = ({ '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json' })[ext] || 'application/octet-stream';
    if (['.html', '.css'].includes(ext)) body = Buffer.from(body.toString().replace(/(["'(])\/(?!\/|p\/)/g, `$1${prefix}/`));
    response.writeHead(200, { 'Content-Type': type, 'Content-Security-Policy': "default-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'" }).end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 840 }, screen: { width, height: 840 } });
    const page = await context.newPage(), errors = [], missing = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && response.url().startsWith(`http://127.0.0.1:${server.address().port}`)) missing.push(`${response.status()} ${response.url()}`); });
    const response = await page.goto(`http://127.0.0.1:${server.address().port}${prefix}/`);
    await page.waitForTimeout(1500);
    assert.equal(response.status(), 200);
    assert.ok((await page.title()).length > 0);
    assert.equal(new URL(page.url()).pathname.startsWith(prefix + (width < 768 ? '/m/' : '/')), true);
    assert.deepEqual(errors, []);
    assert.deepEqual(missing, []);
    console.log(`Preview ${width}px: ${new URL(page.url()).pathname}, ${await page.title()}`);
    await context.close();
  }
} finally { await browser.close(); server.close(); }
