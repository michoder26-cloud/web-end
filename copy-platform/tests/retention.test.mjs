import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { runRetention } from '../src/retention.js';

const DAY = 86400000;
const now = Date.UTC(2026, 10, 14);

test('retention sends advance notice and deletes only after 14 days', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    for (const name of ['0001_init.sql', '0002_global_usage.sql', '0003_retention.sql', '0004_rights.sql']) sqlite.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
    sqlite.prepare("INSERT INTO users (id,google_sub,email,name) VALUES ('u','google-u','u@example.com','User')").run();
    sqlite.prepare("INSERT INTO projects (id,owner_id,source_url,title,status,created_at,updated_at,last_active_at) VALUES ('p','u','https://example.com','Example','ready',?,?,?)").run(now - 90 * DAY, now - 90 * DAY, now - 90 * DAY);
    sqlite.prepare("INSERT INTO project_files (project_id,path,content_type,bytes) VALUES ('p','index.html','text/html',3)").run();
    const deleted = [], sent = [];
    const env = {
      DB: { prepare(sql) { const query = sqlite.prepare(sql); const bound = args => ({ all: async () => ({ results: query.all(...args) }), first: async () => query.get(...args) || null, run: async () => ({ meta: { changes: Number(query.run(...args).changes) } }) }); return { ...bound([]), bind: (...args) => bound(args) }; } },
      FILES: { delete: async key => deleted.push(key) },
      RESEND_API_KEY: 'test-key', EMAIL_FROM: 'notify@example.com', APP_HOST: 'copy.example.com'
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url, options) => { sent.push(JSON.parse(options.body)); return new Response('{}', { status: 200 }); };
    try {
      assert.deepEqual(await runRetention({ DB: env.DB, FILES: env.FILES }, now), { warnings: 0, filesDeleted: 0, skipped: 'email-not-configured' });
      assert.deepEqual(await runRetention({ ...env, APP_HOST: undefined }, now), { warnings: 0, filesDeleted: 0, skipped: 'email-not-configured' });
      assert.deepEqual(await runRetention(env, now), { warnings: 1, filesDeleted: 0 });
      assert.equal(sent.length, 1);
      assert.match(sent[0].text, /https:\/\/copy\.example\.com\/projects\/p /);
      assert.equal(sqlite.prepare("SELECT warned_at FROM projects WHERE id='p'").get().warned_at, now);
      assert.deepEqual(await runRetention(env, now + 13 * DAY), { warnings: 0, filesDeleted: 0 });
      assert.deepEqual(await runRetention(env, now + 15 * DAY), { warnings: 0, filesDeleted: 1 });
      assert.deepEqual(deleted, ['p/index.html']);
      assert.equal(sqlite.prepare("SELECT count(*) AS n FROM projects").get().n, 0);
    } finally { globalThis.fetch = originalFetch; }
  } finally { sqlite.close(); }
});
