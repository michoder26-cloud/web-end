import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.HTMLRewriter ??= class {};
const { download } = await import('../src/worker.js');

test('the download holds every file with edits applied and a guide', async () => {
  const files = { 'p1/index.html': '<h1 data-we-text="t1">Old</h1>', 'p1/m/index.html': '<h1 data-we-text="t1">Old</h1>', 'p1/assets/a.png': new Uint8Array([9, 9]).buffer };
  const env = {
    FILES: { get: async (key, type) => { const v = files[key]; return v === undefined ? null : type === 'arrayBuffer' ? (typeof v === 'string' ? new TextEncoder().encode(v).buffer : v) : v; } },
    DB: { prepare: (sql) => ({ bind: () => ({ all: async () => ({ results: sql.includes('project_files') ? [{ path: 'assets/a.png' }, { path: 'index.html' }, { path: 'm/index.html' }] : [{ key: 't1', kind: 'text', value: 'New' }] }) }) }) },
  };
  const response = await download(env, { id: 'p1', title: 'My Shop.com', source_url: 'https://example.com/' });
  assert.equal(response.headers.get('content-type'), 'application/zip');
  assert.match(response.headers.get('content-disposition'), /my-shop-com-web-end\.zip/);
  const text = Buffer.from(await response.arrayBuffer()).toString('latin1');
  assert.ok(text.includes('<h1 data-we-text="t1">New</h1>'));
  assert.ok(!text.includes('>Old<'));
  assert.ok(text.includes('README-web-end.txt') && text.includes('import-copy'));
});
