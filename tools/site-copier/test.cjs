const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { createPreviewServer } = require('./server.cjs');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'web-end-copier-test-'));
const output = path.join(scratch, 'copy');
const server = http.createServer((req, res) => {
  if (req.url === '/style.css') { res.writeHead(200, { 'content-type': 'text/css' }).end('@import "/import.css";body{background:#eef}'); return; }
  if (req.url === '/import.css') { res.writeHead(200, { 'content-type': 'text/css' }).end('h1{color:#123}'); return; }
  if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html' }).end('<html><head><link rel="stylesheet" href="/style.css"></head><body><h1 id="home">Home</h1><button id="menu" aria-label="Open menu" aria-expanded="false">Menu</button><a href="/about" onclick="alert(1)">About</a><a href="/missing">Missing</a><a href="javascript:alert(2)">Unsafe</a><script>document.getElementById("menu").onclick=()=>{document.getElementById("menu").setAttribute("aria-expanded","true");const box=document.createElement("div");box.innerHTML="<a class=menu-link href=/about>About menu</a>";document.body.append(box)}</script></body></html>'); return; }
  if (req.url === '/about') { res.writeHead(200, { 'content-type': 'text/html' }).end('<html><body><h1>About</h1></body></html>'); return; }
  res.writeHead(404).end();
});

async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const source = `http://127.0.0.1:${server.address().port}/`;
  const child = spawn(process.execPath, [path.join(__dirname, 'run.cjs'), source, output, '--quick'], {
    env: { ...process.env, MAXP: '2', MOTION_MS: '0', SHOT_LIMIT: '1', UI_MAX_PAGES: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', data => { log += data; });
  child.stderr.on('data', data => { log += data; });
  const exit = await new Promise(resolve => child.on('exit', resolve));
  assert.equal(exit, 0, log);
  const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
  const report = JSON.parse(fs.readFileSync(path.join(output, 'copy-report.json'), 'utf8'));
  assert.match(html, /<link[^>]+href="\/assets\/[^"]+\.css"/);
  const stylesheet = html.match(/<link[^>]+href="(\/assets\/[^"]+\.css)"/)?.[1];
  assert.match(fs.readFileSync(path.join(output, stylesheet.slice(1)), 'utf8'), /@import "\/assets\/[^"]+\.css"/);
  assert.match(html, /<a href="\/about\/">About<\/a>/);
  assert.ok(!html.includes('onclick=') && !html.includes('javascript:'));
  assert.ok(html.includes(`<a href="${source}missing">Missing</a>`));
  assert.deepEqual(report.pages, ['index', 'about']);
  assert.ok(report.notCopied.includes('missing'));
  assert.ok(fs.existsSync(path.join(output, 'about', 'index.html')));
  assert.ok(html.includes('Math.min(screen.width,innerWidth)<768'));
  assert.ok(html.includes('/assets/ui-runtime.js'));
  const audit = JSON.parse(fs.readFileSync(path.join(output, 'front-end-audit.json'), 'utf8'));
  assert.equal(audit.status, 'needs-fixes');
  assert.equal(audit.uncopiedPages, 1);
  assert.equal(audit.issueCount, 0);
  assert.equal(audit.unverifiedControlCount, 0);
  const visual = JSON.parse(fs.readFileSync(path.join(output, 'visual-report.json'), 'utf8'));
  assert.equal(visual.pages.length, 4);
  assert.ok(visual.meanSimilarityPercent > 80);
  const preview = await createPreviewServer(output);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(preview.url);
    await page.locator('#menu').click();
    assert.equal(await page.locator('#menu').getAttribute('aria-expanded'), 'true');
    await page.locator('.menu-link').click();
    await page.waitForURL(preview.url + 'about/');
    assert.equal(await page.locator('h1').innerText(), 'About');
  } finally {
    await browser.close();
    await new Promise(resolve => preview.server.close(resolve));
  }
  console.log('Site copier smoke test passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  server.close();
  if (path.resolve(scratch).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(scratch, { recursive: true, force: true });
});
