import { beginGoogle, currentUser, finishGoogle, hash, logout } from './auth.js';
import { DAILY_JOBS, MAX_FILE_BYTES, MAX_JOB_BYTES, MAX_PAGES, contentType, escapeHtml, safeFilePath, sourceUrl } from './core.js';

const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const html = body => new Response(`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>web-end Copy</title><style>body{margin:0;background:#f4f5f7;color:#17191c;font:16px system-ui,sans-serif}header{background:#16181d;color:white;padding:18px 5vw;display:flex;justify-content:space-between}header a{color:white}main{max-width:980px;margin:40px auto;padding:0 20px}.card{background:white;border:1px solid #dfe3e8;border-radius:18px;padding:24px;margin:18px 0;box-shadow:0 8px 30px #16203a0c}h1{font-size:clamp(30px,5vw,54px);line-height:1.06}input{font:inherit;padding:15px;border:1px solid #b8c0c9;border-radius:10px;width:min(100%,590px);box-sizing:border-box}button,.button{font:inherit;display:inline-block;background:#2359e8;color:white;border:0;border-radius:10px;padding:15px 22px;text-decoration:none;cursor:pointer}button:hover,.button:hover{background:#1748c7}.muted{color:#5f6673}li{margin:12px 0}a{color:#2359e8}</style><header><strong>web-end / Copy</strong><a href="/dashboard">Dashboard</a></header><main>${body}</main></html>`, { headers });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const go = path => new Response(null, { status: 303, headers: { Location: path, 'Cache-Control': 'no-store' } });
const forbidden = () => new Response('Not found', { status: 404 });
const token = () => [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join('');
const sameOrigin = request => request.headers.get('Origin') === new URL(request.url).origin;
const csrf = request => request.method === 'GET' || (request.headers.get('Sec-Fetch-Site') !== 'cross-site' && sameOrigin(request));

async function project(env, id, userId) {
  return env.DB.prepare('SELECT * FROM projects WHERE id = ? AND owner_id = ?').bind(id, userId).first();
}
async function expireStale(env) {
  const now = Date.now();
  await env.DB.prepare("UPDATE projects SET status = 'failed', error = 'Copy timed out', updated_at = ? WHERE (status = 'queued' AND created_at < ?) OR (status = 'running' AND updated_at < ?)").bind(now, now - 75 * 60000, now - 20 * 60000).run();
}
async function dashboard(env, user) {
  await expireStale(env);
  const rows = (await env.DB.prepare('SELECT id, title, source_url, status, public, error, created_at FROM projects WHERE owner_id = ? ORDER BY created_at DESC LIMIT 100').bind(user.id).all()).results;
  const items = rows.map(row => `<li><a href="/projects/${row.id}">${escapeHtml(row.title)}</a> <span class="muted">${escapeHtml(row.status)} · ${new Date(row.created_at).toLocaleDateString('th-TH')}</span></li>`).join('');
  return html(`<h1>เว็บไซต์ของคุณ</h1><p class="muted">สวัสดี ${escapeHtml(user.name)} · แต่ละเว็บเป็นส่วนตัวจนกว่าคุณจะเผยแพร่</p><section class="card"><h2>คัดลอกเว็บ</h2><p>ใส่ URL ของเว็บสาธารณะ เครื่องมือจะคัดลอกหน้าเว็บและตรวจผลให้ คุณแก้ไขก่อนเผยแพร่ได้</p><form method="post" action="/projects"><input name="url" type="url" placeholder="https://example.com" required><button>เริ่มคัดลอก</button></form><p class="muted">สูงสุด ${DAILY_JOBS} เว็บต่อวัน บัญชีละหนึ่งงานในคิว และ ${MAX_PAGES} หน้าต่อเว็บ · ฟอร์มและ backend ของเว็บเดิมไม่ถูกคัดลอก</p></section><section class="card"><h2>โปรเจกต์</h2>${items ? `<ul>${items}</ul>` : '<p>ยังไม่มีเว็บที่คัดลอก</p>'}</section><form method="post" action="/logout"><button>ออกจากระบบ</button></form>`);
}
async function createProject(request, env, user) {
  if (!env.GITHUB_DISPATCH_TOKEN || !env.GITHUB_REPOSITORY) return new Response('Copy runner is not configured', { status: 503 });
  await expireStale(env);
  const form = await request.formData();
  const source = sourceUrl(String(form.get('url') || ''));
  if (!source) return html('<h1>URL ใช้ไม่ได้</h1><p>ใช้ลิงก์ HTTPS ของเว็บสาธารณะเท่านั้น</p><a href="/dashboard">กลับไป Dashboard</a>');
  const now = Date.now(), today = new Date().toISOString().slice(0, 10);
  const active = await env.DB.prepare("SELECT count(*) AS n FROM projects WHERE status IN ('queued','running')").first();
  if (active.n >= 20) return new Response('The copy queue is full; try later', { status: 503 });
  const storage = await env.DB.prepare('SELECT coalesce(sum(bytes),0) AS n FROM projects').first();
  if (storage.n > 500 * 1024 * 1024) return new Response('Storage is full; new jobs are paused', { status: 503 });
  const shared = await env.DB.prepare('INSERT INTO global_daily_usage (day, count) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET count = count + 1 WHERE count < 4 RETURNING count').bind(today).first();
  if (!shared) return new Response('Today’s shared copy capacity is full', { status: 429 });
  const use = await env.DB.prepare('INSERT INTO daily_usage (user_id, day, count) VALUES (?, ?, 1) ON CONFLICT(user_id,day) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count').bind(user.id, today, DAILY_JOBS).first();
  if (!use) {
    await env.DB.prepare('UPDATE global_daily_usage SET count = count - 1 WHERE day = ?').bind(today).run();
    return new Response('Today’s copy limit is reached', { status: 429 });
  }
  const id = crypto.randomUUID();
  try { await env.DB.prepare("INSERT INTO projects (id, owner_id, source_url, title, status, created_at, updated_at, last_active_at) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?)").bind(id, user.id, source, new URL(source).hostname, now, now, now).run(); }
  catch {
    await env.DB.batch([env.DB.prepare('UPDATE daily_usage SET count = count - 1 WHERE user_id = ? AND day = ?').bind(user.id, today), env.DB.prepare('UPDATE global_daily_usage SET count = count - 1 WHERE day = ?').bind(today)]);
    return new Response('One copy is already running for this account', { status: 409 });
  }
  try {
    const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/copy-beta.yml/dispatches`, { method: 'POST', headers: { Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'web-end-copy-beta', 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main', inputs: { project_id: id } }) });
    if (!response.ok) throw Error(`GitHub dispatch returned ${response.status}`);
  } catch (error) {
    console.error('Copy dispatch failed', error instanceof Error ? error.message : 'unknown');
    await env.DB.prepare("UPDATE projects SET status = 'failed', error = 'Could not start the copy runner' WHERE id = ?").bind(id).run();
    await env.DB.batch([env.DB.prepare('UPDATE daily_usage SET count = count - 1 WHERE user_id = ? AND day = ?').bind(user.id, today), env.DB.prepare('UPDATE global_daily_usage SET count = count - 1 WHERE day = ?').bind(today)]);
  }
  return go(`/projects/${id}`);
}
async function projectPage(env, user, id) {
  await expireStale(env);
  const row = await project(env, id, user.id);
  if (!row) return forbidden();
  const report = row.report_json ? JSON.parse(row.report_json) : null;
  return html(`<p><a href="/dashboard">← Dashboard</a></p><h1>${escapeHtml(row.title)}</h1><section class="card"><p><b>สถานะ:</b> ${escapeHtml(row.status)}</p><p><b>ต้นฉบับ:</b> <a href="${escapeHtml(row.source_url)}" rel="noreferrer">${escapeHtml(row.source_url)}</a></p>${row.error ? `<p role="alert">${escapeHtml(row.error)}</p>` : ''}${row.status === 'ready' ? `<p><a class="button" href="/projects/${id}/preview">ดูพรีวิวส่วนตัว</a> <a class="button" href="/projects/${id}/edit">แก้ข้อความและรูป</a></p><p>${report?.status === 'front-end-checks-passed' ? 'ส่วนที่ตรวจแล้วทำงาน' : 'มีส่วนที่ต้องตรวจเอง'} · ${Number(report?.issueCount || 0)} ปัญหาการโหลด · ${Number(report?.unverifiedControlCount || 0)} ปุ่มที่ยังไม่ยืนยัน</p>${report?.notCopied?.length ? `<p role="alert">หน้าที่คัดลอกไม่ครบ: ${report.notCopied.map(escapeHtml).join(', ')}</p>` : ''}<p class="muted">ฟอร์ม บัญชีลูกค้า การชำระเงิน และ backend ของเว็บต้นฉบับยังไม่ถูกคัดลอก</p><form method="post" action="/projects/${id}/publish"><button>${row.public ? 'เผยแพร่แล้ว' : 'เผยแพร่เว็บ'}</button></form>${row.public ? `<p><a href="https://${env.PUBLISHED_HOST}/p/${id}/">เปิดเว็บสาธารณะ</a></p>` : ''}` : '<p>รอผลสักครู่ แล้วโหลดหน้านี้ใหม่</p>'}</section>`);
}

async function editPage(env, row, page = 'index.html') {
  if (!safeFilePath(page) || !page.endsWith('.html')) return forbidden();
  const pages = (await env.DB.prepare("SELECT path FROM project_files WHERE project_id = ? AND path LIKE '%.html' ORDER BY path LIMIT 20").bind(row.id).all()).results.map(item => item.path);
  if (!pages.includes(page)) return forbidden();
  const file = await env.FILES.get(`${row.id}/${page}`, 'text');
  if (!file) return forbidden();
  const source = file;
  const edits = new Map((await env.DB.prepare('SELECT key, value FROM project_edits WHERE project_id = ?').bind(row.id).all()).results.map(item => [item.key, item.value]));
  const textFields = [...source.matchAll(/<[^>]+data-we-text="([^"]+)"[^>]*>([^<>]{2,300})<\//g)].slice(0, 80).map(([, key, value]) => `<form class="card" method="post" action="/projects/${row.id}/edit"><label>ข้อความ <input name="value" value="${escapeHtml(edits.get(key) || value)}" maxlength="500" required></label><input type="hidden" name="page" value="${escapeHtml(page)}"><input type="hidden" name="key" value="${escapeHtml(key)}"><input type="hidden" name="kind" value="text"><button>บันทึก</button></form>`).join('');
  const imageFields = [...source.matchAll(/<img[^>]+data-we-image="([^"]+)"[^>]*>/g)].slice(0, 40).map(([, key]) => `<form class="card" method="post" action="/projects/${row.id}/edit" enctype="multipart/form-data"><label>เปลี่ยนรูป <input type="file" name="image" accept="image/png,image/jpeg,image/webp" required></label><input type="hidden" name="page" value="${escapeHtml(page)}"><input type="hidden" name="key" value="${escapeHtml(key)}"><input type="hidden" name="kind" value="image"><button>อัปโหลดรูป</button></form>`).join('');
  const choices = pages.map(name => `<a class="button" style="margin:4px" href="?page=${encodeURIComponent(name)}">${escapeHtml(name === 'index.html' ? 'หน้าแรก' : name.replace(/\/index\.html$/, '') + (name.startsWith('m/') ? ' (มือถือ)' : ''))}</a>`).join('');
  return html(`<p><a href="/projects/${row.id}">← โปรเจกต์</a></p><h1>แก้หน้าเว็บ</h1><p class="muted">เลือกหน้า แล้วแก้ข้อความและรูป พรีวิวจะอัปเดตทันที</p><nav>${choices}</nav><h2>${escapeHtml(page)}</h2>${textFields}${imageFields}`);
}

async function saveEdit(request, env, row) {
  const form = await request.formData();
  const key = String(form.get('key') || ''), kind = String(form.get('kind') || '');
  const pagePath = String(form.get('page') || 'index.html');
  if (!/^[ti][0-9a-f]{12}-\d+$/.test(key) || !['text', 'image'].includes(kind) || key[0] !== kind[0]) return new Response('Invalid field', { status: 400 });
  if (!safeFilePath(pagePath) || !pagePath.endsWith('.html')) return new Response('Invalid page', { status: 400 });
  const known = await env.DB.prepare('SELECT 1 AS present FROM project_files WHERE project_id = ? AND path = ?').bind(row.id, pagePath).first();
  if (!known) return forbidden();
  const page = await env.FILES.get(`${row.id}/${pagePath}`, 'text');
  if (!page || !page.includes(`data-we-${kind}="${key}"`)) return forbidden();
  let value;
  if (kind === 'text') {
    value = String(form.get('value') || '').trim();
    if (!value || value.length > 500) return new Response('Text must be 1–500 characters', { status: 400 });
  } else {
    const file = form.get('image');
    if (!(file instanceof File) || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1024 * 1024 || file.size === 0) return new Response('Use PNG, JPEG or WebP up to 1 MB', { status: 400 });
    const imageCount = await env.DB.prepare("SELECT count(*) AS n FROM project_files WHERE project_id = ? AND path LIKE 'assets/owner-%'").bind(row.id).first();
    if (imageCount.n >= 10 || row.bytes + file.size > MAX_JOB_BYTES) return new Response('Project image or storage limit reached', { status: 413 });
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[file.type];
    value = `assets/owner-${crypto.randomUUID()}.${extension}`;
    await env.FILES.put(`${row.id}/${value}`, await file.arrayBuffer());
    await env.DB.prepare('INSERT INTO project_files (project_id, path, content_type, bytes) VALUES (?, ?, ?, ?)').bind(row.id, value, file.type, file.size).run();
    await env.DB.prepare('UPDATE projects SET bytes = bytes + ? WHERE id = ?').bind(file.size, row.id).run();
  }
  await env.DB.prepare('INSERT INTO project_edits (project_id, key, kind, value) VALUES (?, ?, ?, ?) ON CONFLICT(project_id,key) DO UPDATE SET value = excluded.value').bind(row.id, key, kind, value).run();
  await env.DB.prepare('UPDATE projects SET updated_at = ?, last_active_at = ? WHERE id = ?').bind(Date.now(), Date.now(), row.id).run();
  return go(`/projects/${row.id}/edit?page=${encodeURIComponent(pagePath)}`);
}

async function claim(request, env, id) {
  if (!env.RUNNER_SECRET || request.headers.get('authorization') !== `Bearer ${env.RUNNER_SECRET}`) return forbidden();
  const row = await env.DB.prepare("UPDATE projects SET status = 'running', updated_at = ? WHERE id = ? AND status = 'queued' RETURNING source_url").bind(Date.now(), id).first();
  if (!row) return new Response('Job not queued', { status: 409 });
  const upload = token();
  await env.DB.prepare('INSERT INTO job_tokens (token_hash, project_id, expires_at) VALUES (?, ?, ?)').bind(await hash(upload), id, Date.now() + 15 * 60000).run();
  return json({ source_url: row.source_url, upload_token: upload, max_pages: MAX_PAGES });
}
async function runnerProject(request, env, id) {
  const bearer = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('authorization') || '')?.[1];
  if (!bearer) return null;
  return env.DB.prepare("SELECT projects.* FROM job_tokens JOIN projects ON projects.id = job_tokens.project_id WHERE job_tokens.token_hash = ? AND job_tokens.expires_at > ? AND projects.id = ? AND projects.status = 'running'").bind(await hash(bearer), Date.now(), id).first();
}
async function uploadFile(request, env, id, name) {
  const row = await runnerProject(request, env, id), path = safeFilePath(name);
  if (!row || !path) return forbidden();
  const size = Number(request.headers.get('content-length'));
  if (!Number.isInteger(size) || size < 0 || size > MAX_FILE_BYTES || row.bytes + size > MAX_JOB_BYTES) return new Response('File or job size limit exceeded', { status: 413 });
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength !== size) return new Response('Invalid size', { status: 400 });
  const existing = await env.DB.prepare('SELECT bytes FROM project_files WHERE project_id = ? AND path = ?').bind(id, path).first();
  if (row.bytes - Number(existing?.bytes || 0) + size > MAX_JOB_BYTES) return new Response('Job size limit exceeded', { status: 413 });
  const fileCount = await env.DB.prepare('SELECT count(*) AS n FROM project_files WHERE project_id = ?').bind(id).first();
  if (!existing && fileCount.n >= 200) return new Response('Too many files for one beta project', { status: 413 });
  await env.FILES.put(`${id}/${path}`, bytes);
  await env.DB.batch([env.DB.prepare('INSERT INTO project_files (project_id, path, content_type, bytes) VALUES (?, ?, ?, ?) ON CONFLICT(project_id,path) DO UPDATE SET bytes = excluded.bytes, content_type = excluded.content_type').bind(id, path, contentType(path), size), env.DB.prepare('UPDATE projects SET bytes = bytes + ?, updated_at = ? WHERE id = ?').bind(size - Number(existing?.bytes || 0), Date.now(), id)]);
  return json({ ok: true });
}
async function finish(request, env, id) {
  const row = await runnerProject(request, env, id);
  if (!row) return forbidden();
  const body = await request.json().catch(() => null);
  if (!body || typeof body.ok !== 'boolean') return new Response('Invalid result', { status: 400 });
  const index = await env.DB.prepare("SELECT 1 AS present FROM project_files WHERE project_id = ? AND path = 'index.html'").bind(id).first();
  const ready = body.ok && Boolean(index);
  const report = body.report && typeof body.report === 'object' ? JSON.stringify(body.report).slice(0, 20000) : null;
  await env.DB.prepare('UPDATE projects SET status = ?, error = ?, report_json = ?, updated_at = ? WHERE id = ?').bind(ready ? 'ready' : 'failed', ready ? null : String(body.error || 'Copy failed').slice(0, 300), report, Date.now(), id).run();
  await env.DB.prepare('DELETE FROM job_tokens WHERE project_id = ?').bind(id).run();
  return json({ ok: true });
}

async function serveFile(env, id, name, published) {
  const path = safeFilePath(!name || name.endsWith('/') ? `${name}index.html` : name);
  if (!path) return forbidden();
  const row = await env.DB.prepare('SELECT status, public FROM projects WHERE id = ?').bind(id).first();
  if (!row || row.status !== 'ready' || (published && !row.public)) return forbidden();
  const file = await env.FILES.get(`${id}/${path}`, 'arrayBuffer');
  if (!file) return forbidden();
  const type = contentType(path);
  const responseHeaders = { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': published ? 'public, max-age=300' : 'private, no-store', 'Content-Security-Policy': "default-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; form-action 'none'; object-src 'none'; base-uri 'none'" };
  if (type.startsWith('text/html') || type.startsWith('text/css')) {
    const prefix = `/p/${id}`;
    const source = new TextDecoder().decode(file);
    const rewritten = source.replace(/(["'(])\/(?!\/|p\/)/g, `$1${prefix}/`);
    if (!type.startsWith('text/html')) return new Response(rewritten, { headers: responseHeaders });
    const edits = new Map((await env.DB.prepare('SELECT key, kind, value FROM project_edits WHERE project_id = ?').bind(id).all()).results.map(item => [item.key, item]));
    return new HTMLRewriter().on('[data-we-text]', { element(element) { const edit = edits.get(element.getAttribute('data-we-text')); if (edit?.kind === 'text') element.setInnerContent(edit.value); } }).on('img[data-we-image]', { element(element) { const edit = edits.get(element.getAttribute('data-we-image')); if (edit?.kind === 'image') element.setAttribute('src', `${prefix}/${edit.value}`); } }).transform(new Response(rewritten, { headers: responseHeaders }));
  }
  return new Response(file, { headers: responseHeaders });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname, method = request.method;
    if (!path.startsWith('/internal/') && !csrf(request)) return new Response('Cross-site request refused', { status: 403 });
    if (url.hostname === env.PREVIEW_HOST) {
      if (method === 'GET' && path.startsWith('/ticket/')) {
        const value = path.slice(8), row = /^[0-9a-f]{64}$/.test(value) ? await env.DB.prepare('SELECT preview_sessions.project_id FROM preview_sessions JOIN projects ON projects.id = preview_sessions.project_id AND projects.owner_id = preview_sessions.user_id WHERE token_hash = ? AND expires_at > ?').bind(await hash(value), Date.now()).first() : null;
        if (!row) return forbidden();
        const response = go(`/p/${row.project_id}/`);
        response.headers.append('Set-Cookie', `we_preview=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=3600`);
        return response;
      }
      const match = /^\/p\/([0-9a-f-]{36})\/(.*)$/.exec(path);
      if (!match || method !== 'GET') return forbidden();
      const value = request.headers.get('cookie')?.match(/(?:^|;\s*)we_preview=([0-9a-f]{64})/)?.[1] || '';
      const ticket = value ? await env.DB.prepare('SELECT 1 AS valid FROM preview_sessions JOIN projects ON projects.id = preview_sessions.project_id AND projects.owner_id = preview_sessions.user_id WHERE token_hash = ? AND preview_sessions.project_id = ? AND expires_at > ?').bind(await hash(value), match[1], Date.now()).first() : null;
      return ticket ? serveFile(env, match[1], match[2], false) : forbidden();
    }
    if (url.hostname === env.PUBLISHED_HOST) {
      const match = /^\/p\/([0-9a-f-]{36})\/(.*)$/.exec(path);
      return method === 'GET' && match ? serveFile(env, match[1], match[2], true) : forbidden();
    }
    if (method === 'POST' && /^\/internal\/claim\/[0-9a-f-]{36}$/.test(path)) return claim(request, env, path.split('/').at(-1));
    if (method === 'PUT' && /^\/internal\/file\/[0-9a-f-]{36}\//.test(path)) { const [, , , id, ...rest] = path.split('/'); return uploadFile(request, env, id, rest.map(decodeURIComponent).join('/')); }
    if (method === 'POST' && /^\/internal\/finish\/[0-9a-f-]{36}$/.test(path)) return finish(request, env, path.split('/').at(-1));
    if (method === 'GET' && path === '/auth/google') return beginGoogle(request, env);
    if (method === 'GET' && path === '/auth/google/callback') return finishGoogle(request, env);
    if (method === 'POST' && path === '/logout') return logout(request, env);
    if (method === 'GET' && path === '/') return html('<h1>คัดลอกเว็บ แล้วทำต่อในแบบของคุณ</h1><p>สร้างสำเนาหน้าเว็บเพื่อปรับแก้ใน Dashboard ส่วนตัว ก่อนเผยแพร่หรือย้ายไป Cloudflare ของคุณ</p><p><a class="button" href="/auth/google">เริ่มด้วย Google</a></p><p class="muted">รุ่นทดลอง: คัดลอกหน้าเว็บสูงสุด 10 หน้า ฟอร์มและ backend ของเว็บต้นฉบับยังไม่รวม</p>');
    const user = await currentUser(request, env);
    if (!user) return go('/');
    if (method === 'GET' && path === '/dashboard') return dashboard(env, user);
    if (method === 'POST' && path === '/projects') return createProject(request, env, user);
    const detail = /^\/projects\/([0-9a-f-]{36})(?:\/(preview|publish|edit))?$/.exec(path);
    if (detail) {
      const [, id, action] = detail;
      if (method === 'GET' && !action) return projectPage(env, user, id);
      const row = await project(env, id, user.id);
      if (!row || row.status !== 'ready') return forbidden();
      if (method === 'GET' && action === 'edit') return editPage(env, row, url.searchParams.get('page') || 'index.html');
      if (method === 'POST' && action === 'edit') return saveEdit(request, env, row);
      if (method === 'GET' && action === 'preview') {
        const value = token();
        await env.DB.prepare('INSERT INTO preview_sessions (token_hash, user_id, project_id, expires_at) VALUES (?, ?, ?, ?)').bind(await hash(value), user.id, id, Date.now() + 3600000).run();
        return go(`https://${env.PREVIEW_HOST}/ticket/${value}`);
      }
      if (method === 'POST' && action === 'publish') {
        await env.DB.prepare('UPDATE projects SET public = 1, updated_at = ?, last_active_at = ? WHERE id = ? AND owner_id = ?').bind(Date.now(), Date.now(), id, user.id).run();
        return go(`/projects/${id}`);
      }
    }
    return forbidden();
  }
};
