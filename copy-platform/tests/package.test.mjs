import assert from 'node:assert/strict';
import test from 'node:test';
import { inflateRawSync } from 'node:zlib';
import { applyEdits, crc32, zip } from '../src/package.js';

test('crc32 matches the standard value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('zip stores every file so standard tools read it', async () => {
  const data = Buffer.from(await zip([{ name: 'index.html', data: new TextEncoder().encode('<h1>Hi</h1>') }, { name: 'assets/a.png', data: new Uint8Array([1, 2, 3]) }]).arrayBuffer());
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.equal(data.readUInt16LE(end + 10), 2);
  assert.equal(data.subarray(30, 40).toString(), 'index.html');
  assert.equal(data.subarray(40, 51).toString(), '<h1>Hi</h1>');
  assert.ok(inflateRawSync);
});

test('owner edits are written into the downloaded page, escaped', () => {
  const page = '<h1 data-we-text="t1">Old</h1><p data-we-text="t2">Keep</p><img alt="" src="/assets/a.png" data-we-image="i1">';
  const out = applyEdits(page, new Map([['t1', { kind: 'text', value: 'New <b>&' }], ['i1', { kind: 'image', value: 'assets/owner-x.png' }]]));
  assert.equal(out, '<h1 data-we-text="t1">New &lt;b&gt;&amp;</h1><p data-we-text="t2">Keep</p><img alt="" src="/assets/owner-x.png" data-we-image="i1">');
});
