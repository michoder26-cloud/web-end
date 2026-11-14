import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import worker from '../src/worker.js';
import { hash } from '../src/auth.js';

const origin = 'https://copy.example.com';
const session = 'a'.repeat(64);

async function setup() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of ['0001_init.sql', '0002_global_usage.sql', '0003_retention.sql', '0004_rights.sql']) sqlite.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  sqlite.prepare("INSERT INTO users (id,google_sub,email,name) VALUES ('u','google-u','u@example.com','User')").run();
  sqlite.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').run(await hash(session), 'u', Date.now() + 3600000);
  const bound = (query, args) => ({ all: async () => ({ results: query.all(...args) }), first: async () => query.get(...args) || null, run: async () => ({ meta: { changes: Number(query.run(...args).changes) } }) });
  const DB = { prepare(sql) { const query = sqlite.prepare(sql); return { ...bound(query, []), bind: (...args) => bound(query, args) }; }, batch: async statements => { for (const statement of statements) await statement.run(); } };
  const env = { DB, APP_HOST: 'copy.example.com', PREVIEW_HOST: 'preview.example.com', PUBLISHED_HOST: 'sites.example.com', GITHUB_DISPATCH_TOKEN: 'token', GITHUB_REPOSITORY: 'owner/repo' };
  return { sqlite, env };
}

const post = (path, fields) => new Request(`${origin}${path}`, { method: 'POST', body: new URLSearchParams(fields), headers: { Origin: origin, Cookie: `we_session=${session}` } });

test('copying needs the owner to confirm their right to the site', async () => {
  const { sqlite, env } = await setup();
  const originalFetch = globalThis.fetch;
  const dispatched = [];
  globalThis.fetch = async url => { dispatched.push(String(url)); return new Response(null, { status: 204 }); };
  try {
    const refused = await worker.fetch(post('/projects', { url: 'https://example.com/' }), env);
    assert.equal(refused.status, 400);
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM projects').get().n, 0);
    assert.equal(dispatched.length, 0);
    const accepted = await worker.fetch(post('/projects', { url: 'https://example.com/', rights: 'yes' }), env);
    assert.equal(accepted.status, 303);
    const row = sqlite.prepare('SELECT status, rights_confirmed_at FROM projects').get();
    assert.equal(row.status, 'queued');
    assert.ok(row.rights_confirmed_at > 0);
    assert.equal(dispatched.length, 1);
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});

test('publishing needs confirmation, and a published copy can be taken down', async () => {
  const { sqlite, env } = await setup();
  const id = '11111111-2222-3333-4444-555555555555';
  sqlite.prepare("INSERT INTO projects (id,owner_id,source_url,title,status,created_at,updated_at,last_active_at) VALUES (?,'u','https://example.com/','example.com','ready',1,1,1)").run(id);
  try {
    assert.equal((await worker.fetch(post(`/projects/${id}/publish`, {}), env)).status, 400);
    assert.equal(sqlite.prepare('SELECT public FROM projects').get().public, 0);
    assert.equal((await worker.fetch(post(`/projects/${id}/publish`, { rights: 'yes' }), env)).status, 303);
    const published = sqlite.prepare('SELECT public, publish_confirmed_at FROM projects').get();
    assert.equal(published.public, 1);
    assert.ok(published.publish_confirmed_at > 0);
    const page = await (await worker.fetch(new Request(`${origin}/projects/${id}`, { headers: { Cookie: `we_session=${session}` } }), env)).text();
    assert.match(page, /\/unpublish/);
    assert.match(page, /https:\/\/sites\.example\.com\/p\//);
    assert.equal((await worker.fetch(post(`/projects/${id}/unpublish`, {}), env)).status, 303);
    assert.equal(sqlite.prepare('SELECT public FROM projects').get().public, 0);
    const gone = await worker.fetch(new Request(`https://sites.example.com/p/${id}/`), env);
    assert.equal(gone.status, 404);
  } finally { sqlite.close(); }
});

test('missing hosts refuse instead of linking to undefined', async () => {
  const { sqlite, env } = await setup();
  const id = '11111111-2222-3333-4444-555555555555';
  sqlite.prepare("INSERT INTO projects (id,owner_id,source_url,title,status,created_at,updated_at,last_active_at) VALUES (?,'u','https://example.com/','example.com','ready',1,1,1)").run(id);
  const bare = { ...env, PREVIEW_HOST: undefined, PUBLISHED_HOST: undefined };
  try {
    const preview = await worker.fetch(new Request(`${origin}/projects/${id}/preview`, { headers: { Cookie: `we_session=${session}` } }), bare);
    assert.equal(preview.status, 503);
    assert.equal((await worker.fetch(post(`/projects/${id}/publish`, { rights: 'yes' }), bare)).status, 503);
    const page = await (await worker.fetch(new Request(`${origin}/projects/${id}`, { headers: { Cookie: `we_session=${session}` } }), bare)).text();
    assert.doesNotMatch(page, /undefined/);
  } finally { sqlite.close(); }
});
