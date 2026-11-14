export const MAX_PAGES = 10;
export const DAILY_JOBS = 3;
export const MAX_JOB_BYTES = 50 * 1024 * 1024;
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

export function sourceUrl(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.')) return null;
  if (url.hostname === 'localhost' || /(^|\.)(local|internal|localhost|test|invalid)$/.test(url.hostname)) return null;
  if (/^\d+(\.\d+){3}$/.test(url.hostname) || url.hostname.includes(':')) return null;
  url.hash = '';
  return url.href.length <= 2048 ? url.href : null;
}

export function safeFilePath(value) {
  if (typeof value !== 'string' || !value || value.length > 500 || value.startsWith('/') || value.includes('\\') || value.includes('\0')) return null;
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) return null;
  if (value.startsWith('_shots/') || value === 'copy-report.json' || value === 'front-end-audit.json' || value === 'visual-report.json') return null;
  return value;
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function contentType(path) {
  const extension = path.split('.').at(-1)?.toLowerCase();
  return ({ html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'application/javascript; charset=utf-8', json: 'application/json; charset=utf-8', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', gif: 'image/gif', woff: 'font/woff', woff2: 'font/woff2', mp4: 'video/mp4' })[extension] || 'application/octet-stream';
}
