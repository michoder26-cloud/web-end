import test from 'node:test';
import assert from 'node:assert/strict';
import network from '../../tools/site-copier/public-network.cjs';

test('runner refuses private and metadata destinations before browsing', async () => {
  for (const address of [
    'http://127.0.0.1/', 'http://10.0.0.1/', 'http://169.254.169.254/',
    'http://100.100.100.200/', 'http://192.168.1.1/', 'http://[::1]/',
    'file:///etc/passwd', 'http://user:password@example.com/'
  ]) assert.equal(await network.publicUrl(address), false, address);
});
