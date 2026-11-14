// Builds the download of a copied site: its files with the owner's edits applied,
// as one ZIP that web-end loads with `web-end import-copy site.zip`.
import { escapeHtml } from './core.js';

const table = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A ZIP without compression: copied sites are mostly pictures and fonts, which are compressed already. */
export function zip(files) {
  const encoder = new TextEncoder();
  const local = [], central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const path = encoder.encode(name), crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true);
    head.setUint32(14, crc, true); head.setUint32(18, data.length, true); head.setUint32(22, data.length, true); head.setUint16(26, path.length, true);
    local.push(new Uint8Array(head.buffer), path, data);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true); entry.setUint16(8, 0x0800, true);
    entry.setUint32(16, crc, true); entry.setUint32(20, data.length, true); entry.setUint32(24, data.length, true); entry.setUint16(28, path.length, true); entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), path);
    offset += 30 + path.length + data.length;
  }
  const size = central.reduce((total, part) => total + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...local, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

/** Writes the owner's saved words and pictures into the page itself. */
export function applyEdits(html, edits) {
  return html
    .replace(/(<([a-z0-9]+)\b[^>]*\sdata-we-text="([^"]+)"[^>]*>)[^<]*(<\/\2>)/gi, (all, open, _tag, key, close) => {
      const edit = edits.get(key);
      return edit?.kind === 'text' ? open + escapeHtml(edit.value) + close : all;
    })
    .replace(/<img\b[^>]*\sdata-we-image="([^"]+)"[^>]*>/gi, (tag, key) => {
      const edit = edits.get(key);
      return edit?.kind === 'image' ? tag.replace(/\ssrc="[^"]*"/i, ` src="/${escapeHtml(edit.value)}"`) : tag;
    });
}

export const readme = (source) => `Your copied website, ready for web-end
=======================================

Copied from: ${source}

This folder holds the pages as they looked, for computers and phones, with your edits.
To run it with a full back office (messages from its forms, editing words and pictures,
publishing, customers, products and more), load it into web-end on your own computer:

1. Install Node.js 22 or newer, then get web-end: https://github.com/michoder26-cloud/web-end
2. In web-end/selfhost run:  npm ci  and  npm run build
3. Create a site:            node bin/web-end.mjs new my-site
   Finish its setup page in the browser, then stop it with Ctrl+C.
4. Load this download:       node bin/web-end.mjs import-copy path/to/this.zip --site my-site --replace
5. Open the site again:      node bin/web-end.mjs site my-site
   In the back office, check Pages and press Publish.

Everything stays on your computer. web-end is free and has no monthly fee.

เว็บที่คัดลอกมา พร้อมใช้กับ web-end
1. ติดตั้ง Node.js รุ่น 22 ขึ้นไป แล้วดาวน์โหลด web-end
2. ในโฟลเดอร์ web-end/selfhost พิมพ์ npm ci และ npm run build
3. สร้างเว็บ: node bin/web-end.mjs new my-site แล้วทำหน้าเริ่มต้นให้เสร็จ จากนั้นกด Ctrl+C
4. นำเข้า: node bin/web-end.mjs import-copy ไฟล์นี้.zip --site my-site --replace
5. เปิดเว็บ: node bin/web-end.mjs site my-site แล้วกดเผยแพร่ในหลังบ้าน
ฟอร์มบนเว็บจะส่งข้อความเข้าหลังบ้าน และแก้ข้อความกับรูปได้เอง
`;
