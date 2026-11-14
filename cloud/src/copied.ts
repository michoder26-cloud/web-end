// Pages copied from another platform (Wix, Base44 and others) with tools/site-copier.
// A copied page is an ordinary page with one block of type "copied" that holds the
// page as the browser drew it, for desktop and phone. Its forms send to the normal
// inbox, the owner edits its words and pictures in the back office, and publishing,
// versions and page history work as for any other page.
import { escapeHtml, html } from './http'
import { saveImage } from './items'
import { rememberPage } from './page-history'
import type { Block, Env, FormField, SiteRow } from './types'

export type CopiedBlock = Block & { type: 'copied'; desktop: string; phone?: string; forms?: { name: string; fields: FormField[] }[] }

export const copiedBlock = (blocks: Block[]): CopiedBlock | null => (blocks.length === 1 && blocks[0]?.type === 'copied' && typeof blocks[0].desktop === 'string' ? (blocks[0] as CopiedBlock) : null)

/** The form of a copied page with this name, in the shape the inbox expects. */
export function copiedForm(blocks: Block[], name: string): Block | null {
  const form = copiedBlock(blocks)?.forms?.find((one) => one.name === name)
  return form ? { type: 'form', name: form.name, fields: form.fields } : null
}

// The copier makes scripts into files, so pages run without inline code.
const copiedHeaders = {
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' https: data: blob:; media-src 'self' https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src 'self'; frame-src 'self' https://www.google.com https://maps.google.com; form-action 'self'; base-uri 'none'; frame-ancestors 'self'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
}

const wantsPhone = (request: Request) => {
  const view = /(?:^|;\s*)we_view=(phone|desktop)/.exec(request.headers.get('cookie') ?? '')?.[1]
  if (view) return view === 'phone'
  return /Mobi|Android|iPhone/i.test(request.headers.get('user-agent') ?? '')
}

function mark(document: string, attributes: Record<string, string>, scripts: string[], headScripts: string[] = []) {
  const extra = Object.entries(attributes).map(([key, value]) => ` ${key}="${escapeHtml(value)}"`).join('')
  return document
    .replace(/<html\b([^>]*)>/i, (_, rest: string) => `<html${rest}${extra}>`)
    .replace(/<head\b([^>]*)>/i, (open: string) => open + headScripts.map((src) => `<script src="${src}"></script>`).join(''))
    .replace(/<\/body>/i, `${scripts.map((src) => `<script src="${src}" defer></script>`).join('')}</body>`)
}

/** What visitors see: the desktop or phone version of the copied page, with working forms. */
export function showCopied(request: Request, block: CopiedBlock, slug: string, extraHtml = '') {
  const phone = Boolean(block.phone) && wantsPhone(request)
  const page = mark(phone ? block.phone! : block.desktop, { 'data-we-page': slug, 'data-we-view': phone ? 'phone' : 'desktop', 'data-we-phone': block.phone ? '1' : '' }, ['/copied/_we/forms.js'], ['/copied/_we/view.js'])
  return html(extraHtml ? page.replace(/(<body[^>]*>)/i, `$1${extraHtml}`) : page, 200, copiedHeaders)
}

/** The owner's editor: the same page, with clicks turned into editing. */
export function editCopied(request: Request, block: CopiedBlock, slug: string, base: string, language: string) {
  const phone = Boolean(block.phone) && new URL(request.url).searchParams.get('view') === 'phone'
  const page = mark(phone ? block.phone! : block.desktop, { 'data-we-page': slug, 'data-we-save': `${base}/page/${slug}`, 'data-we-lang': language, 'data-we-view': phone ? 'phone' : 'desktop', 'data-we-phone': block.phone ? '1' : '' }, ['/copied/_we/editor.js'])
  return html(page, 200, { ...copiedHeaders, 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' })
}

export async function showCopiedAsset(env: Env, siteId: number, path: string) {
  if (path.startsWith('_we/')) {
    const code = runtimes[path.slice(4)]
    return code ? new Response(code, { headers: { 'Cache-Control': 'no-cache', 'Content-Type': 'application/javascript; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } }) : null
  }
  const row = await env.DB.prepare('SELECT type, bytes FROM copied_assets WHERE site_id = ? AND path = ?').bind(siteId, path).first<{ bytes: ArrayBuffer | number[]; type: string }>()
  if (!row) return null
  return new Response(new Uint8Array(row.bytes as ArrayBuffer), { headers: { 'Cache-Control': 'public, max-age=86400', 'Content-Type': row.type, 'X-Content-Type-Options': 'nosniff' } })
}

const textEdit = (document: string, key: string, text: string) => {
  // Keys sit only on elements whose content is plain text, so the text ends at the next tag.
  const pattern = new RegExp(`(<([a-z0-9]+)\\b[^>]*\\sdata-we="${key}"[^>]*>)[^<]*(</\\2>)`, 'gi')
  return document.replace(pattern, (_match, open: string, _tag: string, close: string) => open + escapeHtml(text) + close)
}

/** Saves changed words. The same words on the phone version change with them. */
export async function saveCopiedText(env: Env, site: SiteRow, slug: string, edits: unknown) {
  if (!edits || typeof edits !== 'object') return false
  const row = await env.DB.prepare('SELECT blocks FROM pages WHERE site_id = ? AND slug = ?').bind(site.id, slug).first<{ blocks: string }>()
  const block = row && copiedBlock(JSON.parse(row.blocks) as Block[])
  if (!block) return false
  let changed = false
  for (const [key, text] of Object.entries(edits as Record<string, unknown>).slice(0, 500)) {
    if (!/^t[a-f0-9]{10}-\d{1,4}$/.test(key) || typeof text !== 'string' || text.length > 5000) continue
    block.desktop = textEdit(block.desktop, key, text)
    if (block.phone) block.phone = textEdit(block.phone, key, text)
    changed = true
  }
  if (!changed) return false
  await rememberPage(env, site.id, slug)
  await env.DB.prepare("UPDATE pages SET blocks = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE site_id = ? AND slug = ?").bind(JSON.stringify([block]), site.id, slug).run()
  return true
}

/** Replaces one picture on every copied page that shows it. The new picture also appears in Images. */
export async function replaceCopiedImage(env: Env, site: SiteRow, from: string, file: File) {
  if (!/^\/(copied\/[\w./-]+|media\/\d+)$/.test(from) || from.includes('..')) return { error: 'picture' }
  const stored = await saveImage(env, site.id, file, 'copied page')
  if (stored.error || !stored.url) return { error: stored.error ?? 'picture' }
  const pattern = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=["\'&) ?#])', 'g')
  const { results } = await env.DB.prepare('SELECT slug, blocks FROM pages WHERE site_id = ?').bind(site.id).all<{ blocks: string; slug: string }>()
  let pages = 0
  for (const row of results) {
    const block = copiedBlock(JSON.parse(row.blocks) as Block[])
    if (!block) continue
    const desktop = block.desktop.replace(pattern, stored.url)
    const phone = block.phone?.replace(pattern, stored.url)
    if (desktop === block.desktop && phone === block.phone) continue
    await rememberPage(env, site.id, row.slug)
    await env.DB.prepare("UPDATE pages SET blocks = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE site_id = ? AND slug = ?").bind(JSON.stringify([{ ...block, desktop, phone }]), site.id, row.slug).run()
    pages++
  }
  return pages ? { url: stored.url, pages } : { error: 'picture' }
}

// ---- small scripts served at /copied/_we/ ---------------------------------

const viewScript = `(function(){var d=document.documentElement;if(d.dataset.wePhone!=='1')return;
var want=Math.min(screen.width,innerWidth)<768?'phone':'desktop';if(d.dataset.weView===want)return;
try{if(sessionStorage.getItem('we_view_tried')===want)return;sessionStorage.setItem('we_view_tried',want)}catch(e){return}
document.cookie='we_view='+want+';path=/;max-age=31536000;samesite=lax';location.reload();})();`

const formsScript = `(function(){
var d=document.documentElement,page=d.dataset.wePage,th=/^th\\b/i.test(d.lang||navigator.language||'');
var w=th?{sent:'ส่งข้อความแล้ว ขอบคุณครับ',fail:'ส่งไม่สำเร็จ โปรดตรวจข้อมูลแล้วลองอีกครั้ง',fill:'กรุณากรอกช่องที่จำเป็นให้ถูกต้อง',sending:'กำลังส่ง…'}:{sent:'Thanks, your message was sent.',fail:'Could not send. Please check the details and try again.',fill:'Please fill in the required fields correctly.',sending:'Sending…'};
function note(f,t,ok){var b=f.querySelector('.we-form-note');if(!b){b=document.createElement('p');b.className='we-form-note';b.setAttribute('role','status');f.appendChild(b)}b.textContent=t;b.style.cssText='margin:12px 0 0;padding:10px 14px;border-radius:6px;font:14px/1.4 system-ui,sans-serif;'+(ok?'background:#e8f6ec;color:#14532d':'background:#fdecec;color:#7f1d1d')}
function send(f){if(f.dataset.weBusy)return;var bad=[].slice.call(f.querySelectorAll('[name]')).filter(function(i){return i.name!=='website'&&i.checkValidity&&!i.checkValidity()});
if(bad.length){note(f,w.fill,false);bad[0].focus();return}f.dataset.weBusy='1';note(f,w.sending,true);
var body=new FormData();f.querySelectorAll('[name]').forEach(function(i){if(i.type==='checkbox'){if(i.checked)body.append(i.name,'on')}else if(i.type==='radio'){if(i.checked)body.append(i.name,i.value)}else body.append(i.name,i.value)});
fetch('/form/'+page+'/'+f.dataset.weForm,{method:'POST',body:body}).then(function(r){if(!r.ok||!/[?&]sent=/.test(r.url))throw Error();f.reset&&f.reset();note(f,w.sent,true)}).catch(function(){note(f,w.fail,false)}).then(function(){delete f.dataset.weBusy})}
document.querySelectorAll('form[data-we-form]').forEach(function(f){if(f.querySelector('[name=website]'))return;var i=document.createElement('input');i.name='website';i.tabIndex=-1;i.autocomplete='off';i.setAttribute('aria-hidden','true');i.style.cssText='position:absolute;left:-9999px;width:1px;height:1px;opacity:0';f.appendChild(i)});
document.addEventListener('submit',function(e){var f=e.target.closest&&e.target.closest('form[data-we-form]');if(!f)return;e.preventDefault();send(f)},true);
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('form[data-we-form] button,form[data-we-form] [role=button],form[data-we-form] input[type=submit]');if(!b)return;
if(!(b.type==='submit'||b.getAttribute('data-hook')==='submit-button'||/submit|send|ส่ง/i.test(b.getAttribute('aria-label')||b.textContent||'')))return;e.preventDefault();send(b.closest('form'))},true);
})();`

const editorScript = `(function(){
var d=document.documentElement,th=d.dataset.weLang==='th',t=function(en,x){return th?x:en},save=d.dataset.weSave,edits={};
var bar=document.createElement('div');bar.id='we-editbar';
bar.innerHTML='<style>#we-editbar{position:fixed;z-index:2147483647;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 32px);background:#1d1d1b;color:#fff;padding:10px 12px;border-radius:12px;box-shadow:0 10px 30px #0005;font:14px/1.3 system-ui,sans-serif}#we-editbar button,#we-editbar a{font:inherit;border:0;border-radius:8px;padding:8px 12px;cursor:pointer;text-decoration:none;background:#3a3a37;color:#fff}#we-editbar .save{background:#7fb8a4;color:#0f1f1a}#we-editbar .save:disabled{opacity:.45;cursor:default}[data-we]{cursor:text}[data-we]:hover{outline:2px dashed #7fb8a4;outline-offset:2px}[data-we][contenteditable]{outline:2px solid #2f5d50;outline-offset:2px}[data-we].we-changed{outline:2px solid #e8a33d}img.we-img-hover{outline:3px dashed #e8a33d;outline-offset:-3px;cursor:pointer}</style><span class="we-status"></span><a class="view"></a><a class="back"></a><button class="save" disabled></button>';
document.body.appendChild(bar);var status=bar.querySelector('.we-status'),btn=bar.querySelector('.save'),back=bar.querySelector('.back'),view=bar.querySelector('.view');
back.textContent=t('Done','เสร็จ');back.href=save;
if(d.dataset.wePhone==='1'){var phone=d.dataset.weView==='phone';view.textContent=phone?t('Desktop version','แบบคอมพิวเตอร์'):t('Phone version','แบบมือถือ');view.href=location.pathname+(phone?'':'?view=phone')}else view.remove();
function update(x){var n=Object.keys(edits).length;btn.textContent=n?t('Save '+n+' change'+(n>1?'s':''),'บันทึก '+n+' จุด'):t('Save','บันทึก');btn.disabled=!n;status.textContent=x||t('Click words to change them · click a picture to replace it','คลิกข้อความเพื่อแก้ · คลิกรูปเพื่อเปลี่ยน')}update();
function picture(x,y){var all=document.elementsFromPoint(x,y);for(var i=0;i<all.length;i++){var e=all[i];if(e.closest&&e.closest('#we-editbar'))return null;if(e.tagName==='IMG'&&/^\\/(copied|media)\\//.test(e.getAttribute('src')||''))return e}return null}
var hovered=null;document.addEventListener('mousemove',function(e){var tx=e.target.closest&&e.target.closest('[data-we]');var im=tx?null:picture(e.clientX,e.clientY);if(hovered&&hovered!==im)hovered.classList.remove('we-img-hover');hovered=im;if(im)im.classList.add('we-img-hover')},true);
document.addEventListener('submit',function(e){e.preventDefault();e.stopPropagation()},true);
document.addEventListener('click',function(e){if(e.target.closest('#we-editbar'))return;e.preventDefault();e.stopPropagation();var tx=e.target.closest('[data-we]');if(tx)return start(tx);var im=picture(e.clientX,e.clientY);if(im)pick(im)},true);
function start(el){if(el.isContentEditable)return;el.setAttribute('contenteditable','plaintext-only');if(el.contentEditable!=='plaintext-only')el.setAttribute('contenteditable','true');if(el.dataset.weBefore===undefined)el.dataset.weBefore=el.textContent;el.focus();
el.onkeydown=function(k){if(k.key==='Enter'&&!k.shiftKey){k.preventDefault();el.blur()}};el.onpaste=function(p){p.preventDefault();document.execCommand('insertText',false,p.clipboardData.getData('text/plain'))};
el.addEventListener('blur',function(){el.removeAttribute('contenteditable');var now=el.textContent;if(now!==el.dataset.weBefore){edits[el.dataset.we]=now;el.classList.add('we-changed')}else{delete edits[el.dataset.we];el.classList.remove('we-changed')}update()},{once:true})}
function pick(img){var from=img.getAttribute('src');var input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp,image/gif';
input.onchange=function(){var f=input.files[0];if(!f)return;update(t('Uploading…','กำลังอัปโหลด…'));var body=new FormData();body.append('from',from);body.append('file',f);
fetch(save+'/visual-image',{method:'POST',body:body}).then(function(r){return r.json().then(function(x){if(!r.ok)throw Error(x.error);return x})}).then(function(x){document.querySelectorAll('img').forEach(function(i){if(i.getAttribute('src')===from)i.setAttribute('src',x.url)});update(t('Picture replaced. Publish to show it on the live site.','เปลี่ยนรูปแล้ว กดเผยแพร่เพื่อให้แสดงบนเว็บจริง'))}).catch(function(err){update(t('Could not replace the picture. ','เปลี่ยนรูปไม่สำเร็จ ')+(err.message||''))})};input.click()}
btn.addEventListener('click',function(){btn.disabled=true;update(t('Saving…','กำลังบันทึก…'));btn.disabled=true;
fetch(save+'/visual-text',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({edits:edits})}).then(function(r){if(!r.ok)throw Error()}).then(function(){document.querySelectorAll('.we-changed').forEach(function(e){e.classList.remove('we-changed');delete e.dataset.weBefore});edits={};update(t('Saved. Publish to show it on the live site.','บันทึกแล้ว กดเผยแพร่เพื่อให้แสดงบนเว็บจริง'))}).catch(function(){update(t('Could not save. Try again.','บันทึกไม่สำเร็จ ลองอีกครั้ง'));btn.disabled=false})});
addEventListener('beforeunload',function(e){if(Object.keys(edits).length){e.preventDefault();e.returnValue=''}});
})();`

const runtimes: Record<string, string> = { 'editor.js': editorScript, 'forms.js': formsScript, 'view.js': viewScript }
