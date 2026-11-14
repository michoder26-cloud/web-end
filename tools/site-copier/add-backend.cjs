// Adds the web-end back office to a copied site: form messages, text and picture
// editing, owner password. Usage: node add-backend.cjs <copied site directory>
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LEAF = /<(h[1-6]|p|span|a|li|button|label|strong|em|b|i|small|td|th|dt|dd|figcaption|blockquote|div)(\s[^<>]*)?>([^<]*?[^\s<][^<]*)<\/\1>/gi;

function markEditable(html) {
  const start = html.search(/<body\b/i);
  if (start < 0) return { html, count: 0 };
  const head = html.slice(0, start);
  let body = html.slice(start);
  const seen = new Map();
  let count = 0;
  // Leave scripts, styles and inline drawings alone.
  const keep = [];
  body = body.replace(/<(script|style|svg|noscript|textarea|select|template)\b[\s\S]*?<\/\1>/gi, block => { keep.push(block); return `\u0000${keep.length - 1}\u0000`; });
  body = body.replace(LEAF, (match, tag, attrs = '', text) => {
    if (/\sdata-we=/.test(attrs) || !text.replace(/&nbsp;|&#160;|​/g, '').trim()) return match;
    const norm = text.replace(/\s+/g, ' ').trim();
    const hash = crypto.createHash('sha1').update(norm).digest('hex').slice(0, 10);
    const n = seen.get(hash) || 0; seen.set(hash, n + 1);
    count++;
    return `<${tag}${attrs} data-we="t${hash}-${n}">${text}</${tag}>`;
  });
  body = body.replace(/\u0000(\d+)\u0000/g, (m, i) => keep[Number(i)]);
  return { html: head + body, count };
}

function htmlFiles(dir, root = dir, list = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (dir === root && ['assets', 'admin', 'data', 'uploads', '_shots', 'node_modules'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) htmlFiles(full, root, list);
    else if (entry.name === 'index.html') list.push(full);
  }
  return list;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name), b = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
}

function addBackend(directory) {
  const site = path.resolve(directory);
  if (!fs.existsSync(path.join(site, 'index.html'))) throw Error('No copied site at ' + site);
  const backend = path.join(__dirname, 'backend');
  fs.copyFileSync(path.join(backend, 'server.cjs'), path.join(site, 'server.cjs'));
  copyDir(path.join(backend, 'admin'), path.join(site, 'admin'));
  fs.mkdirSync(path.join(site, 'assets'), { recursive: true });
  fs.copyFileSync(path.join(backend, 'forms.js'), path.join(site, 'assets', 'we-forms.js'));
  let pages = 0, editable = 0, forms = 0;
  for (const file of htmlFiles(site)) {
    let html = fs.readFileSync(file, 'utf8');
    const marked = markEditable(html);
    html = marked.html; editable += marked.count;
    forms += (html.match(/<form\b/gi) || []).length;
    if (!html.includes('/assets/we-forms.js')) html = html.replace(/<\/body>/i, '<script src="/assets/we-forms.js" defer></script></body>');
    fs.writeFileSync(file, html);
    pages++;
  }
  fs.writeFileSync(path.join(site, 'START.txt'), [
    'Your website with its own back office',
    '',
    '1. Install Node.js 20 or newer (https://nodejs.org).',
    '2. In this folder run:  node server.cjs',
    '3. Website:     http://127.0.0.1:8080/',
    '   Back office: http://127.0.0.1:8080/admin/',
    '   The first password is printed when the server starts and saved in data/first-password.txt.',
    '',
    'Form messages, your edits and new pictures are saved in the data and uploads folders.',
    'Copy those two folders to keep a backup.',
    'To put it online, run it on any server with Node.js behind HTTPS, with PORT and HOST=0.0.0.0 set.',
    '',
    'เว็บของคุณพร้อมหลังบ้าน',
    '1. ติดตั้ง Node.js รุ่น 20 ขึ้นไป',
    '2. ในโฟลเดอร์นี้ พิมพ์:  node server.cjs',
    '3. เปิดเว็บที่ http://127.0.0.1:8080/  และหลังบ้านที่ http://127.0.0.1:8080/admin/',
    '   รหัสผ่านแรกจะแสดงตอนเปิด และเก็บไว้ใน data/first-password.txt',
    'ข้อความจากฟอร์ม การแก้ไข และรูปใหม่ เก็บอยู่ในโฟลเดอร์ data และ uploads',
    '',
  ].join('\n'));
  const report = { pages, editableTexts: editable, forms };
  fs.writeFileSync(path.join(site, 'backend-report.json'), JSON.stringify(report, null, 1));
  return report;
}

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node add-backend.cjs <copied site directory>'); process.exit(1); }
  const report = addBackend(dir);
  console.log(`Back office added: ${report.pages} pages, ${report.editableTexts} editable texts, ${report.forms} forms.`);
  console.log(`Start it: cd "${path.resolve(dir)}" && node server.cjs`);
}
module.exports = { addBackend, markEditable };
