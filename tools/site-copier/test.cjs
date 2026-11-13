const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'web-end-copier-test-'));
const output = path.join(scratch, 'copy');
const server = http.createServer((req, res) => {
  if (req.url === '/style.css') { res.writeHead(200, { 'content-type': 'text/css' }).end('body{background:#eef}'); return; }
  if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html' }).end('<html><head><link rel="stylesheet" href="/style.css"></head><body><h1>Home</h1><a href="/about">About</a><a href="/missing">Missing</a></body></html>'); return; }
  if (req.url === '/about') { res.writeHead(200, { 'content-type': 'text/html' }).end('<html><body><h1>About</h1></body></html>'); return; }
  res.writeHead(404).end();
});

async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const source = `http://127.0.0.1:${server.address().port}/`;
  const child = spawn(process.execPath, [path.join(__dirname, 'copy.cjs'), source, output], {
    env: { ...process.env, MAXP: '2', MOTION_MS: '0', SHOT_LIMIT: '1' },
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
  assert.match(html, /<a href="\/about\/">About<\/a>/);
  assert.ok(html.includes(`<a href="${source}missing">Missing</a>`));
  assert.deepEqual(report.pages, ['index', 'about']);
  assert.ok(report.notCopied.includes('missing'));
  assert.ok(fs.existsSync(path.join(output, 'about', 'index.html')));
  assert.ok(html.includes('Math.min(screen.width,innerWidth)<768'));
  console.log('Site copier smoke test passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  server.close();
  if (path.resolve(scratch).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(scratch, { recursive: true, force: true });
});
