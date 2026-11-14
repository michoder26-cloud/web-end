import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceUrl, safeFilePath, contentType } from '../src/core.js';

test('only public HTTPS source syntax is admitted', () => {
  assert.equal(sourceUrl('https://example.com/path#part'), 'https://example.com/path');
  for (const value of ['http://example.com', 'https://127.0.0.1/', 'https://localhost/', 'https://example.com:8443/', 'https://user:pass@example.com', 'file:///etc/passwd', 'https://api.internal/']) assert.equal(sourceUrl(value), null);
});

test('output paths cannot escape a project or expose internal reports', () => {
  assert.equal(safeFilePath('assets/a.png'), 'assets/a.png');
  for (const value of ['../secret', '/index.html', 'a/../../b', 'a\\b', '_shots/index/0.png', 'copy-report.json']) assert.equal(safeFilePath(value), null);
  assert.equal(contentType('index.html'), 'text/html; charset=utf-8');
});
