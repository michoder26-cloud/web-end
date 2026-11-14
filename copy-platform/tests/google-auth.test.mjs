import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyIdToken } from '../src/auth.js';

const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'test-key', alg: 'RS256' }] }), { headers: { 'cache-control': 'max-age=60' } });

async function sign(claims) {
  const input = `${encode({ alg: 'RS256', kid: 'test-key' })}.${encode(claims)}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(input));
  return `${input}.${Buffer.from(signature).toString('base64url')}`;
}

test('Google identity requires signature, audience, issuer, nonce and verified email', async () => {
  try {
    const claims = { iss: 'https://accounts.google.com', aud: 'web-end-client', sub: '123', email: 'owner@example.com', email_verified: true, nonce: 'right', exp: Math.floor(Date.now() / 1000) + 600 };
    const valid = await sign(claims);
    assert.equal((await verifyIdToken(valid, { GOOGLE_CLIENT_ID: 'web-end-client' }, 'right')).email, 'owner@example.com');
    assert.equal(await verifyIdToken(valid, { GOOGLE_CLIENT_ID: 'different-client' }, 'right'), null);
    assert.equal(await verifyIdToken(valid, { GOOGLE_CLIENT_ID: 'web-end-client' }, 'wrong'), null);
    assert.equal(await verifyIdToken(await sign({ ...claims, email_verified: false }), { GOOGLE_CLIENT_ID: 'web-end-client' }, 'right'), null);
    assert.equal(await verifyIdToken(valid.slice(0, -2) + 'xx', { GOOGLE_CLIENT_ID: 'web-end-client' }, 'right'), null);
    assert.equal(await verifyIdToken('not.a.jwt', { GOOGLE_CLIENT_ID: 'web-end-client' }, 'right'), null);
  } finally { globalThis.fetch = originalFetch; }
});
