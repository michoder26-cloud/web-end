// Offline test of the back office on a tiny copied site.
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium, devices } = require('playwright');
const { addBackend } = require('./add-backend.cjs');

const site = fs.mkdtempSync(path.join(os.tmpdir(), 'web-end-backend-test-'));
const page = (title, img) => `<!doctype html><html lang="en"><head><title>T</title></head><body><h1><span class="x">${title}</span></h1><p>Same</p><p>Same</p><img src="/assets/${img}" alt=""><form aria-label="Contact"><input aria-label="Name" required><input aria-label="Email" type="email"><textarea aria-label="Message"></textarea><button type="button" data-hook="submit-button">Submit</button></form><script>var x='<p>not text</p>'</script></body></html>`;
fs.mkdirSync(path.join(site, 'assets'), { recursive: true });
fs.mkdirSync(path.join(site, 'm'), { recursive: true });
fs.mkdirSync(path.join(site, 'about'), { recursive: true });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
fs.writeFileSync(path.join(site, 'assets', 'a.png'), png);
fs.writeFileSync(path.join(site, 'index.html'), page('Hello', 'a.png'));
fs.writeFileSync(path.join(site, 'm', 'index.html'), page('Hello', 'a.png'));
fs.writeFileSync(path.join(site, 'about', 'index.html'), page('About', 'a.png'));

(async () => {
  const report = addBackend(site);
  assert.equal(report.pages, 3);
  const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
  assert.match(html, /<span class="x" data-we="t[a-f0-9]{10}-0">Hello<\/span>/);
  assert.match(html, /data-we="t[a-f0-9]{10}-1">Same/);
  assert.ok(html.includes("var x='<p>not text</p>'"), 'scripts untouched');
  const port = 8841;
  const server = spawn(process.execPath, ['server.cjs'], { cwd: site, env: { ...process.env, PORT: String(port), ADMIN_PASSWORD: 'first-pass' }, stdio: 'pipe' });
  await new Promise(r => server.stdout.once('data', r));
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();
  try {
    const visitor = await browser.newPage();
    await visitor.goto(base + '/about/');
    await visitor.click('[data-hook=submit-button]');
    await visitor.waitForSelector('.we-form-note:has-text("required")');
    await visitor.fill('input[aria-label=Name]', 'Ann');
    await visitor.fill('textarea', 'Hi there');
    await visitor.click('[data-hook=submit-button]');
    await visitor.waitForSelector('.we-form-note:has-text("sent")');
    assert.equal((await visitor.request.get(base + '/data/messages.json')).status(), 404);
    assert.equal((await visitor.request.get(base + '/admin/api/messages')).status(), 401);
    assert.equal((await visitor.request.post(base + '/api/forms', { headers: { origin: 'https://evil.example' }, data: { fields: [{ label: 'a', value: 'b' }] } })).status(), 403);

    const owner = await browser.newPage();
    await owner.goto(base + '/admin/');
    await owner.fill('#pw', 'first-pass');
    await owner.click('button');
    await owner.waitForSelector('.msg');
    const message = await owner.locator('.msg').innerText();
    assert.match(message, /Ann/); assert.match(message, /Hi there/); assert.match(message, /\/about\//);
    assert.doesNotMatch(message, /website/);

    await owner.goto(base + '/admin/edit/');
    await owner.click('h1 span');
    await owner.keyboard.press('Control+A');
    await owner.keyboard.type('Hi <b>&');
    await owner.keyboard.press('Enter');
    await owner.click('#we-editbar .save');
    await owner.waitForSelector('#we-editbar .we-status:has-text("Saved")');
    const box = await owner.locator('img').boundingBox();
    const [chooser] = await Promise.all([owner.waitForEvent('filechooser'), owner.mouse.click(box.x + 0.5, box.y + 0.5)]);
    const upload = path.join(site, '..', path.basename(site) + '-new.png'); fs.writeFileSync(upload, png);
    await chooser.setFiles(upload);
    await owner.waitForSelector('#we-editbar .we-status:has-text("replaced")');

    for (const file of ['index.html', 'm/index.html']) {
      const saved = fs.readFileSync(path.join(site, file), 'utf8');
      assert.match(saved, />Hi &lt;b&gt;&amp;<\/span>/, file);
      assert.ok(!saved.includes('/assets/a.png'), file);
    }
    assert.ok(fs.readFileSync(path.join(site, 'about/index.html'), 'utf8').includes('>About</span>'));
    const phone = await browser.newPage({ ...devices['iPhone 13'] });
    await phone.goto(base + '/m/');
    assert.equal(await phone.locator('h1').innerText(), 'Hi <b>&');
    assert.equal((await phone.request.get(base + (await phone.locator('img').getAttribute('src')))).status(), 200);

    const csv = await (await owner.request.get(base + '/admin/api/messages.csv')).text();
    assert.match(csv, /Ann/);
    console.log('Back office test passed.');
  } finally {
    await browser.close();
    server.kill();
    fs.rmSync(site, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
