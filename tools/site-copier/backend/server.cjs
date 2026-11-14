// web-end back office for a copied site. No packages needed: run `node server.cjs`.
// Serves the copied pages, keeps form messages, and lets the owner edit text and
// images from /admin. Data lives in ./data next to this file.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const UPLOADS = path.join(ROOT, 'uploads');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1';
fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.csv': 'text/csv; charset=utf-8' };
const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' };

// ---- small JSON store ------------------------------------------------------
function load(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8')); } catch { return fallback; }
}
function store(name, value) {
  const file = path.join(DATA, name);
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 1));
  fs.renameSync(file + '.tmp', file);
}

// ---- owner password --------------------------------------------------------
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}
let owner = load('owner.json', null);
if (!owner) {
  const first = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url');
  owner = hashPassword(first);
  store('owner.json', owner);
  fs.writeFileSync(path.join(DATA, 'first-password.txt'), first + '\n', { mode: 0o600 });
}
function checkPassword(password) {
  const { hash } = hashPassword(String(password || ''), owner.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(owner.hash, 'hex'));
}
const sessions = new Map(); // token -> expiry
const SESSION_MS = 7 * 24 * 3600 * 1000;
function newSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_MS);
  return token;
}
function signedIn(req) {
  const token = /(?:^|;\s*)we_admin=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1];
  const until = token && sessions.get(token);
  if (!until || until < Date.now()) return false;
  return token;
}

// ---- request helpers -------------------------------------------------------
function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'content-type': type, 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) { reject(Object.assign(Error('Too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req, limit = 32 * 1024) {
  if (!/^application\/json\b/.test(req.headers['content-type'] || '')) throw Object.assign(Error('Send JSON'), { status: 415 });
  try { return JSON.parse((await readBody(req, limit)).toString('utf8')); }
  catch (error) { throw error.status ? error : Object.assign(Error('Bad JSON'), { status: 400 }); }
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  return !origin || origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
}
function safeFile(urlPath) {
  const file = path.resolve(ROOT, '.' + urlPath, urlPath.endsWith('/') ? 'index.html' : '');
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return null;
  const rel = path.relative(ROOT, file).split(path.sep);
  if (['data', 'server.cjs', 'node_modules'].includes(rel[0]) || rel.some(part => part.startsWith('.'))) return null;
  return file;
}

// ---- pages and edits -------------------------------------------------------
function htmlFiles(dir = ROOT, list = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['data', 'uploads', 'assets', 'admin', 'node_modules', '_shots'].includes(entry.name) && dir === ROOT) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) htmlFiles(full, list);
    else if (entry.name === 'index.html') list.push(full);
  }
  return list;
}
function pageFiles(pagePath) {
  // A page and its phone version share the same edit keys.
  const clean = '/' + String(pagePath || '/').replace(/^\/(m\/)?/, '').replace(/[?#].*$/, '');
  const desktop = safeFile(clean.endsWith('/') ? clean : clean + '/');
  const phone = safeFile('/m' + (clean.endsWith('/') ? clean : clean + '/'));
  return [desktop, phone].filter(file => file && fs.existsSync(file));
}
const escapeHtml = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
function applyTextEdits(files, edits) {
  let changed = 0;
  for (const file of files) {
    let html = fs.readFileSync(file, 'utf8');
    for (const [key, text] of Object.entries(edits)) {
      if (!/^t[a-f0-9]{10}-\d{1,4}$/.test(key) || typeof text !== 'string' || text.length > 5000) continue;
      // Edit keys sit only on leaf elements whose content has no tags.
      const pattern = new RegExp(`(<([a-z0-9]+)\\b[^>]*\\sdata-we="${key}"[^>]*>)[^<]*(</\\2>)`, 'g');
      html = html.replace(pattern, (match, open, tag, close) => { changed++; return open + escapeHtml(text) + close; });
    }
    fs.writeFileSync(file, html);
  }
  return changed;
}
function replaceImageEverywhere(from, to) {
  if (!/^\/(assets|uploads)\/[\w.-]+$/.test(from)) return 0;
  let changed = 0;
  const pattern = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=["\'&) ])', 'g');
  for (const file of htmlFiles()) {
    const html = fs.readFileSync(file, 'utf8');
    const next = html.replace(pattern, () => { changed++; return to; });
    if (next !== html) fs.writeFileSync(file, next);
  }
  return changed;
}
function history(entry) {
  const list = load('changes.json', []);
  list.unshift({ at: new Date().toISOString(), ...entry });
  store('changes.json', list.slice(0, 500));
}

// ---- form messages ---------------------------------------------------------
const recent = new Map(); // ip -> timestamps
function tooMany(ip) {
  const now = Date.now();
  const list = (recent.get(ip) || []).filter(t => now - t < 60_000);
  list.push(now); recent.set(ip, list);
  return list.length > 8;
}
function cleanFields(fields) {
  if (!Array.isArray(fields) || !fields.length || fields.length > 40) return null;
  const out = [];
  for (const field of fields) {
    const label = String(field?.label ?? '').trim().slice(0, 120);
    const value = String(field?.value ?? '').trim().slice(0, 5000);
    if (label) out.push({ label, value });
  }
  return out.some(field => field.value) ? out : null;
}

// ---- admin -----------------------------------------------------------------
const ADMIN_DIR = path.join(ROOT, 'admin');
function adminPage(res, name) {
  send(res, 200, fs.readFileSync(path.join(ADMIN_DIR, name)), 'text/html; charset=utf-8', {
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'",
  });
}
function csv(messages) {
  const labels = [...new Set(messages.flatMap(m => m.fields.map(f => f.label)))];
  const cell = v => /[",\n\r]/.test(v) || /^[=+\-@]/.test(v) ? '"' + String(/^[=+\-@]/.test(v) ? "'" + v : v).replace(/"/g, '""') + '"' : v;
  const rows = [['Date', 'Form', 'Page', ...labels].map(cell).join(',')];
  for (const m of messages) {
    const byLabel = Object.fromEntries(m.fields.map(f => [f.label, f.value]));
    rows.push([m.at, m.form, m.page, ...labels.map(l => byLabel[l] || '')].map(v => cell(String(v))).join(','));
  }
  return '﻿' + rows.join('\r\n');
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://local');
  const p = url.pathname;
  const ip = req.socket.remoteAddress || '';

  // Visitors send forms here.
  if (p === '/api/forms' && req.method === 'POST') {
    if (!sameOrigin(req)) return send(res, 403, { error: 'origin' });
    if (tooMany(ip)) return send(res, 429, { error: 'Please wait a minute and try again.' });
    const body = await readJson(req);
    if (body.website) return send(res, 200, { ok: true }); // hidden trap field for bots
    const fields = cleanFields(body.fields);
    if (!fields) return send(res, 400, { error: 'Please fill in the form.' });
    const messages = load('messages.json', []);
    messages.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), form: String(body.form || 'Form').slice(0, 120), page: String(body.page || '/').slice(0, 300), fields, read: false });
    store('messages.json', messages.slice(0, 20000));
    return send(res, 200, { ok: true });
  }

  // Owner sign in and back office.
  if (p === '/admin' || p === '/admin/') return adminPage(res, signedIn(req) ? 'index.html' : 'login.html');
  if (p === '/admin/login' && req.method === 'POST') {
    if (!sameOrigin(req)) return send(res, 403, { error: 'origin' });
    if (tooMany('login:' + ip)) return send(res, 429, { error: 'wait' });
    const body = await readJson(req);
    if (!checkPassword(body.password)) return send(res, 401, { error: 'wrong' });
    const token = newSession();
    const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    return send(res, 200, { ok: true }, undefined, { 'set-cookie': `we_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure}` });
  }
  if (p.startsWith('/admin/') && /\.(js|css)$/.test(p) && !p.includes('..')) {
    const file = path.join(ADMIN_DIR, path.basename(p));
    if (fs.existsSync(file)) return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)], { 'cache-control': 'no-store' });
  }
  if (p.startsWith('/admin/api/')) {
    const token = signedIn(req);
    if (!token) return send(res, 401, { error: 'signin' });
    if (req.method !== 'GET' && !sameOrigin(req)) return send(res, 403, { error: 'origin' });
    const what = p.slice('/admin/api/'.length);
    if (what === 'logout' && req.method === 'POST') { sessions.delete(token); return send(res, 200, { ok: true }, undefined, { 'set-cookie': 'we_admin=; Path=/; Max-Age=0' }); }
    if (what === 'overview') {
      const messages = load('messages.json', []);
      const pages = htmlFiles().filter(f => !path.relative(ROOT, f).startsWith('m' + path.sep)).map(f => '/' + path.relative(ROOT, path.dirname(f)).split(path.sep).join('/')).map(x => x === '/' ? '/' : x + '/').sort();
      return send(res, 200, { unread: messages.filter(m => !m.read).length, total: messages.length, pages, changes: load('changes.json', []).slice(0, 20), firstPassword: fs.existsSync(path.join(DATA, 'first-password.txt')) });
    }
    if (what === 'messages' && req.method === 'GET') return send(res, 200, load('messages.json', []));
    if (what === 'messages.csv') return send(res, 200, csv(load('messages.json', [])), TYPES['.csv'], { 'content-disposition': 'attachment; filename="messages.csv"' });
    if (what === 'messages' && req.method === 'POST') {
      const body = await readJson(req);
      let messages = load('messages.json', []);
      const ids = new Set(Array.isArray(body.ids) ? body.ids.map(String) : []);
      if (body.action === 'read' || body.action === 'unread') messages.forEach(m => { if (ids.has(m.id)) m.read = body.action === 'read'; });
      else if (body.action === 'delete') messages = messages.filter(m => !ids.has(m.id));
      else return send(res, 400, { error: 'action' });
      store('messages.json', messages);
      return send(res, 200, { ok: true });
    }
    if (what === 'text' && req.method === 'POST') {
      const body = await readJson(req, 256 * 1024);
      const files = pageFiles(body.page);
      if (!files.length || !body.edits || typeof body.edits !== 'object') return send(res, 400, { error: 'page' });
      const changed = applyTextEdits(files, body.edits);
      history({ kind: 'text', page: body.page, count: Object.keys(body.edits).length });
      return send(res, 200, { ok: true, changed });
    }
    if (what === 'image' && req.method === 'POST') {
      const ext = IMAGE_TYPES[req.headers['content-type']];
      const from = url.searchParams.get('from') || '';
      if (!ext) return send(res, 415, { error: 'Use a JPG, PNG, WebP, GIF or AVIF picture.' });
      const body = await readBody(req, 8 * 1024 * 1024);
      const name = crypto.randomBytes(8).toString('hex') + ext;
      fs.writeFileSync(path.join(UPLOADS, name), body);
      const changed = replaceImageEverywhere(from, '/uploads/' + name);
      if (!changed) { fs.unlinkSync(path.join(UPLOADS, name)); return send(res, 400, { error: 'image' }); }
      history({ kind: 'image', from, to: '/uploads/' + name });
      return send(res, 200, { ok: true, src: '/uploads/' + name, changed });
    }
    if (what === 'password' && req.method === 'POST') {
      const body = await readJson(req);
      if (!checkPassword(body.current)) return send(res, 401, { error: 'wrong' });
      if (String(body.next || '').length < 8) return send(res, 400, { error: 'short' });
      owner = hashPassword(String(body.next)); store('owner.json', owner);
      fs.rmSync(path.join(DATA, 'first-password.txt'), { force: true });
      for (const key of sessions.keys()) if (key !== token) sessions.delete(key);
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'not found' });
  }

  // Editing a page: the normal page with the editor added, owner only.
  if (p.startsWith('/admin/edit')) {
    if (!signedIn(req)) { res.writeHead(302, { location: '/admin/' }); return res.end(); }
    const page = p.slice('/admin/edit'.length) || '/';
    const file = safeFile(page.endsWith('/') ? page : page + '/');
    if (!file || !fs.existsSync(file)) return send(res, 404, 'Page not found', 'text/plain; charset=utf-8');
    const html = fs.readFileSync(file, 'utf8')
      .replace(/<script>\(function\(\)\{var m=Math\.min[\s\S]*?<\/script>/, '') // keep this version while editing
      .replace('</body>', '<script src="/admin/editor.js"></script></body>');
    return send(res, 200, html, 'text/html; charset=utf-8', { 'cache-control': 'no-store' });
  }

  // Public files.
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method' });
  const file = safeFile(p);
  if (!file) return send(res, 404, 'Page not found', 'text/plain; charset=utf-8');
  fs.readFile(file, (error, body) => {
    if (error) return send(res, 404, 'Page not found', 'text/plain; charset=utf-8');
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    send(res, 200, body, type, { 'cache-control': type.startsWith('text/html') ? 'no-cache' : 'public, max-age=3600' });
  });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(error => {
    if (!res.headersSent) send(res, error.status || 500, { error: error.status ? error.message : 'Something went wrong' });
    if (!error.status) console.error(error);
  });
});
if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Website: http://${HOST}:${PORT}/`);
    console.log(`Back office: http://${HOST}:${PORT}/admin/`);
    const first = path.join(DATA, 'first-password.txt');
    if (fs.existsSync(first)) console.log(`First password: ${fs.readFileSync(first, 'utf8').trim()} (change it in the back office)`);
  });
}
module.exports = { server };
