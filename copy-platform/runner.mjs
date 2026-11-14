import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicUrl } from '../tools/site-copier/public-network.cjs';
import { MAX_FILE_BYTES, MAX_JOB_BYTES, safeFilePath } from './src/core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2];
const base = process.env.COPY_API_BASE?.replace(/\/$/, '');
const secret = process.env.COPY_RUNNER_SECRET;
if (!/^[0-9a-f-]{36}$/.test(id || '') || !(base?.startsWith('https://') || process.env.COPY_TEST_LOCAL === '1' && base?.startsWith('http://127.0.0.1:')) || !secret) throw Error('Runner configuration is incomplete');

const call = async (name, options = {}) => {
  const response = await fetch(`${base}/internal/${name}/${id}`, { ...options, headers: { Authorization: `Bearer ${secret}`, ...options.headers } });
  if (!response.ok) throw Error(`${name} returned ${response.status}`);
  return response.json();
};

async function filesUnder(dir, prefix = '') {
  const output = [];
  for (const item of await readdir(path.join(dir, prefix), { withFileTypes: true })) {
    const name = path.posix.join(prefix.replaceAll('\\', '/'), item.name);
    if (item.isDirectory()) output.push(...await filesUnder(dir, name));
    else if (item.isFile() && safeFilePath(name)) output.push(name);
  }
  return output;
}

function markEditable(html) {
  const seen = new Map();
  const key = (kind, content) => {
    const digest = createHash('sha256').update(content).digest('hex').slice(0, 12);
    const index = seen.get(kind + digest) || 0;
    seen.set(kind + digest, index + 1);
    return `${kind}${digest}-${index}`;
  };
  let output = html.replace(/<(h[1-6]|p|span|a|button|li)(\s[^<>]*)?>([^<>]{2,300})<\/\1>/gi, (all, tag, attrs = '', value) => {
    if (/data-we-text=/.test(attrs) || !value.trim()) return all;
    return `<${tag}${attrs} data-we-text="${key('t', value.trim())}">${value}</${tag}>`;
  });
  output = output.replace(/<img\b([^>]*\bsrc="([^"<>]+)"[^>]*)>/gi, (all, attrs, src) => {
    if (/data-we-image=/.test(attrs)) return all;
    return `<img${attrs} data-we-image="${key('i', src)}">`;
  });
  return output;
}

async function externalizeInlineScripts(html, output) {
  let index = 0;
  const inline = [];
  const rewritten = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (all, attributes, body) => {
    if (/\bsrc\s*=/.test(attributes)) return all;
    const generated = /^\s*(?:window\.__M=|window\.__LOTTIE=|\(function\(\)\{var m=Math\.min\(screen\.width,innerWidth\))/.test(body);
    if (!generated || attributes.trim()) throw Error('Unexpected inline script in copied page');
    const name = `assets/we-inline-${createHash('sha256').update(body).digest('hex').slice(0, 16)}-${index++}.js`;
    if (body.includes('p=location.pathname,ph=p.indexOf')) {
      body = body.replace('p=location.pathname,ph=p.indexOf', "base=location.pathname.match(/^\\/p\\/[0-9a-f-]{36}/)?.[0]||'',p=location.pathname.slice(base.length),ph=p.indexOf")
        .replace("location.replace('/m'+p)", "location.replace(base+'/m'+p)")
        .replace("location.replace(p.slice(2)||'/')", "location.replace(base+(p.slice(2)||'/'))");
    }
    inline.push([name, body]);
    return `<script src="/${name}"></script>`;
  });
  if (inline.length) await mkdir(path.join(output, 'assets'), { recursive: true });
  for (const [name, body] of inline) await writeFile(path.join(output, name), body);
  return rewritten;
}

async function prefixRuntimePaths(output) {
  for (const name of ['assets/ui-runtime.js', 'assets/shop-runtime.js', 'assets/lottie-runtime.js']) {
    const file = path.join(output, name);
    let body;
    try { body = await readFile(file, 'utf8'); } catch { continue; }
    const base = "(location.pathname.match(/^\\/p\\/[0-9a-f-]{36}/)?.[0]||'')";
    if (name.endsWith('ui-runtime.js')) body = body.replaceAll('location.pathname', `location.pathname.replace(/^\\/p\\/[0-9a-f-]{36}/,'')`);
    body = body.replaceAll("fetch('/assets/", `fetch(${base}+'/assets/`);
    if (name.endsWith('lottie-runtime.js')) body = body.replace('fetch(item.path)', `fetch(${base}+item.path)`);
    await writeFile(file, body);
  }
}

async function run() {
  const job = await call('claim', { method: 'POST' });
  try {
    if (!await publicUrl(job.source_url)) throw Error('Source URL does not resolve to a public address');
    const work = await mkdtemp(path.join(os.tmpdir(), 'web-end-copy-'));
    const output = path.join(work, 'site');
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(root, 'tools/site-copier/run.cjs'), job.source_url, output, '--quick'], {
        cwd: root, stdio: 'inherit', env: { ...process.env, COPY_PUBLIC_BETA: '1', MAXP: '10', SHOT_LIMIT: '5', MOTION_MS: '1000', COMPARE_WAIT_MS: '500' }
      });
      const timer = setTimeout(() => child.kill(), 12 * 60 * 1000);
      child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error(`Copier exited ${code}`)); });
      child.on('error', error => { clearTimeout(timer); reject(error); });
    });
    const report = JSON.parse(await readFile(path.join(output, 'front-end-audit.json'), 'utf8'));
    const copyReport = JSON.parse(await readFile(path.join(output, 'copy-report.json'), 'utf8'));
    const visual = JSON.parse(await readFile(path.join(output, 'visual-report.json'), 'utf8'));
    for (const name of await filesUnder(output)) if (name.endsWith('.html')) {
      const file = path.join(output, name);
      await writeFile(file, markEditable(await externalizeInlineScripts(await readFile(file, 'utf8'), output)));
    }
    await prefixRuntimePaths(output);
    let total = 0;
    const names = await filesUnder(output);
    if (names.length > 200) throw Error('Copy exceeds the free beta file limit');
    for (const name of names) {
      const file = path.join(output, name);
      const size = (await stat(file)).size;
      if (size > MAX_FILE_BYTES || total + size > MAX_JOB_BYTES) throw Error('Copy exceeds the free beta size limit');
      total += size;
      const response = await fetch(`${base}/internal/file/${id}/${name.split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', headers: { Authorization: `Bearer ${job.upload_token}`, 'Content-Length': String(size) }, body: await readFile(file) });
      if (!response.ok) throw Error(`Upload failed for ${name}: ${response.status}`);
    }
    const response = await fetch(`${base}/internal/finish/${id}`, { method: 'POST', headers: { Authorization: `Bearer ${job.upload_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, report: { status: report.status, copiedPages: report.copiedPages, notCopied: copyReport.notCopied?.slice(0, 10) || [], issueCount: report.issueCount, unverifiedControlCount: report.unverifiedControlCount, backendDeferred: report.backendDeferred, similarityPercent: visual.meanScrollSimilarityPercent } }) });
    if (!response.ok) throw Error(`Finishing job failed: ${response.status}`);
  } catch (error) {
    console.error('Copy job failed:', error.message);
    await fetch(`${base}/internal/finish/${id}`, { method: 'POST', headers: { Authorization: `Bearer ${job.upload_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: error.message }) });
    process.exitCode = 1;
  }
}

await run();
