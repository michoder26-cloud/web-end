// Cloner v2: pages from menu, desktop + phone, map, sticky backgrounds.
const {chromium,devices}=require('playwright');const fs=require('fs');const path=require('path');const crypto=require('crypto');
const start=process.argv[2], out=process.argv[3]||'site';
const VIEWS={desktop:{viewport:{width:1366,height:900}},phone:{...devices['iPhone 13']}};
const h=s=>crypto.createHash('md5').update(s).digest('hex').slice(0,12);
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out+'/assets',{recursive:true});fs.copyFileSync(__dirname+'/motion.js',out+'/assets/motion.js');
const savedAssets=new Map();
function slugOf(u){const p=new URL(u).pathname.replace(new URL(start).pathname,'').replace(/^\/+|\/+$/g,'');return p||'index';}
async function capture(b,url,view,shots){
 const ctx=await b.newContext(VIEWS[view]);const p=await ctx.newPage();const bodies=new Map();const texts=[];
 p.on('response',async r=>{try{const t=r.request().resourceType();if(['image','font','stylesheet','media'].includes(t)&&r.ok())bodies.set(r.url(),await r.body());else if(['xhr','fetch','document'].includes(t)&&r.ok())texts.push(await r.text());}catch{}});
 await p.goto(url,{waitUntil:'load',timeout:90000});await p.waitForLoadState('networkidle',{timeout:15000}).catch(()=>{});
 await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=400){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,120));}window.scrollTo(0,0);});
 await p.waitForTimeout(2500);
 if(shots){ // viewport screenshots while scrolling
  const H=await p.evaluate(()=>document.documentElement.scrollHeight);const vh=p.viewportSize().height;let i=0;
  for(let y=0;y<H;y+=vh){await p.evaluate(y=>window.scrollTo(0,y),y);await p.waitForTimeout(700);await p.screenshot({path:`${shots}/${i++}.png`});}
  await p.evaluate(()=>window.scrollTo(0,0));await p.waitForTimeout(500);}
 // map location
 let loc=null;for(const t of texts){const m=t.match(/"locations":\[\{[^\]]*?"address":"([^"]*)"[^\]]*?"latitude":(-?[\d.]+),"longitude":(-?[\d.]+)/);if(m){loc={address:m[1],lat:m[2],lng:m[3]};break;}}
 if(!loc)for(const t of texts){const m=t.match(/"businessLocationCoordinates":\{"latitude":(-?[\d.]+),"longitude":(-?[\d.]+)/);if(m){loc={lat:m[1],lng:m[2]};break;}}
 // record time-based motion (slideshows, crossfades) at the top of the page
 const timeline=await p.evaluate(async()=>{const els=[...document.querySelectorAll('[id^=comp-],[data-motion-part]')];const st=[];
  const snap=()=>els.map(e=>{const s=getComputedStyle(e);return s.opacity+'|'+s.transform;});
  for(let t=0;t<=16000;t+=200){st.push(snap());await new Promise(r=>setTimeout(r,200));}
  const tracks={};els.forEach((e,i)=>{const v=st.map(x=>x[i]);if(v.some(x=>x!==v[0])){e.setAttribute('data-ct',i);tracks[i]=v;}});
  if(!Object.keys(tracks).length)return null;
  // period: first later sample (>2s) matching sample 0 on all tracks, else whole recording
  let period=st.length;for(let k=10;k<st.length;k++){if(Object.keys(tracks).every(i=>tracks[i][k]===tracks[i][0])){period=k;break;}}
  for(const i in tracks)tracks[i]=tracks[i].slice(0,period).map(x=>x.split('|'));return {step:200,tracks};});
 // record scroll-linked motion: transform/opacity of moving parts at each scroll step
 const motion=await p.evaluate(async()=>{const els=[...document.querySelectorAll('[data-motion-part],#SITE_HEADER,header,wow-image,[class*=parallax]')];
  els.forEach((e,i)=>e.setAttribute('data-cl',i));const H=document.documentElement.scrollHeight-innerHeight;const step=150;const samples={};
  for(let y=0;y<=H+step;y+=step){const yy=Math.min(y,H);window.scrollTo(0,yy);await new Promise(r=>setTimeout(r,90));
   els.forEach((e,i)=>{const s=getComputedStyle(e);(samples[i]=samples[i]||[]).push([yy,s.transform,s.opacity]);});}
  const tracks={};for(const i in samples){const v=samples[i];if(v.some(x=>x[1]!==v[0][1]||x[2]!==v[0][2]))tracks[i]=v;}
  window.scrollTo(0,0);await new Promise(r=>setTimeout(r,600));return tracks;});
 let dark=false;try{const mf=await p.$('iframe[src*="googleMap"]');if(mf){await mf.scrollIntoViewIfNeeded();await p.waitForTimeout(1500);const buf=await mf.screenshot();
   dark=await p.evaluate(async b64=>{const i=new Image();await new Promise(r=>{i.onload=r;i.src='data:image/png;base64,'+b64;});const c=document.createElement('canvas');c.width=40;c.height=40;const x=c.getContext('2d');x.drawImage(i,0,0,40,40);const d=x.getImageData(0,0,40,40).data;let L=0;for(let k=0;k<d.length;k+=4)L+=(d[k]+d[k+1]+d[k+2])/3;return L/(d.length/4)<100;},buf.toString('base64'));
   await p.evaluate(()=>window.scrollTo(0,0));await p.waitForTimeout(500);}}catch{}
 if(loc)loc.dark=dark;
 const title=await p.evaluate(()=>(document.querySelector('meta[property="og:site_name"]')||{}).content||document.title);if(loc)loc.title=title;
 const snap=await p.evaluate((loc)=>{
  let css='';for(const s of document.styleSheets){if(s.href)continue;try{for(const r of s.cssRules)css+=r.cssText+'\n';}catch{}}
  const links=[...document.querySelectorAll('a[href]')].map(a=>a.href);
  document.querySelectorAll('img').forEach(i=>{if(i.currentSrc)i.setAttribute('src',i.currentSrc);i.removeAttribute('srcset');i.removeAttribute('loading');});
  // sticky background images were sized to the window by script: make them one screen tall
  document.querySelectorAll('img').forEach(i=>{if(i.style.height===innerHeight+'px'){i.style.height='100vh';}});
  // freeze what the script decided is visible
  document.querySelectorAll('body *').forEach(e=>{const s=getComputedStyle(e);if(s.opacity!=='1')e.style.opacity=s.opacity;if(s.visibility==='hidden')e.style.visibility='hidden';});
  // map: replace Wix map frame by standard Google embed
  document.querySelectorAll('iframe[src*="googleMap"]').forEach(f=>{if(!loc){f.remove();return;}f.src='https://maps.google.com/maps?q='+encodeURIComponent(loc.lat+','+loc.lng)+'&z=14&output=embed';f.removeAttribute('sandbox');f.setAttribute('loading','lazy');if(loc.dark)f.style.filter='grayscale(1) invert(88%) contrast(.85)';});
  document.querySelectorAll('script,noscript,link[rel=preload],link[rel=modulepreload],link[rel=prefetch],style,iframe[src*="wixapps"],#WIX_ADS,[id^=wix-]').forEach(e=>e.remove());
  return {html:document.documentElement.outerHTML,css,base:location.href,links};
 },loc);
 await ctx.close();snap.motion=motion;snap.timeline=timeline;return {snap,bodies};
}
function write(snap,bodies,file){
 let html=snap.html,css=snap.css;
 const save=(u)=>{let abs;try{abs=new URL(u.replace(/&amp;/g,'&'),snap.base).href}catch{return null}if(savedAssets.has(abs))return savedAssets.get(abs);const body=bodies.get(abs);if(!body)return null;
  const ext=(path.extname(new URL(abs).pathname).match(/^\.\w{1,5}/)||['.bin'])[0];const n='assets/'+h(abs)+ext;fs.writeFileSync(out+'/'+n,body);savedAssets.set(abs,n);return n;};
 const saveCss=(u)=>{let abs;try{abs=new URL(u.replace(/&amp;/g,'&'),snap.base).href}catch{return null}const body=bodies.get(abs);if(!body)return null;
  const t=body.toString().replace(/url\(["']?([^"')]+)["']?\)/g,(m,v)=>{if(v.startsWith('data:'))return m;let a;try{a=new URL(v,abs).href}catch{return m}const n=save(a);return n?`url("${n.replace('assets/','')}")`:m;});
  const n='assets/'+h(abs)+'.css';fs.writeFileSync(out+'/'+n,t);return n;};
 css=css.replace(/url\(["']?([^"')]+)["']?\)/g,(m,u)=>{if(u.startsWith('data:'))return m;const n=save(u);return n?`url("/${n}")`:m;});
 html=html.replace(/<link\b[^>]*>/g,tag=>{if(!/rel="stylesheet"/.test(tag))return tag;return tag.replace(/href="([^"]+)"/,(m,u)=>{const n=saveCss(u);return n?`href="/${n}"`:m;});});
 html=html.replace(/(src|poster)="([^"]+)"/g,(m,a,u)=>{const n=save(u);return n?`${a}="/${n}"`:m;});
 html=html.replace(/url\(&quot;([^&]+)&quot;\)/g,(m,u)=>{const n=save(u);return n?`url(&quot;/${n}&quot;)`:m;});
 html=html.replace(/xlink:href="(https?:[^"]+)"/g,(m,u)=>{const n=save(u);return n?`xlink:href="/${n}"`:m;});
 // internal links -> local pages
 const root=new URL(start);html=html.replace(/href="([^"]+)"/g,(m,u)=>{let a;try{a=new URL(u.replace(/&amp;/g,'&'),snap.base)}catch{return m}
  if(a.host===root.host&&a.pathname.startsWith(root.pathname)){const s=slugOf(a.href);return `href="/${s==='index'?'':s+'/'}"`;}return m;});
 html=html.replace('</head>',`<style>${css}</style></head>`);
 if(Object.keys(snap.motion||{}).length||snap.timeline)html=html.replace('</body>',`<script>window.__M=${JSON.stringify(snap.motion||{})};window.__T=${JSON.stringify(snap.timeline)};</script><script src="/assets/motion.js"></script></body>`);
 fs.mkdirSync(path.dirname(out+'/'+file),{recursive:true});fs.writeFileSync(out+'/'+file,'<!doctype html>'+html);
}
const PICK=`<script>(function(){var m=Math.min(screen.width,screen.height)<768,p=location.pathname,ph=p.indexOf('/m/')===0;
if(m&&!ph)location.replace('/m'+p);else if(!m&&ph)location.replace(p.slice(2)||'/');})();</script>`;
(async()=>{const b=await chromium.launch();const queue=[start],seen=new Set();const root=new URL(start);
 while(queue.length&&seen.size<(+process.env.MAXP||15)){const u=queue.shift();const s=slugOf(u);if(seen.has(s))continue;seen.add(s);
  const dir=s==='index'?'':s+'/';const k=s.replace(/\//g,'__');fs.mkdirSync(`${out}/_shots/${k}/desktop`,{recursive:true});fs.mkdirSync(`${out}/_shots/${k}/phone`,{recursive:true});try{
  const d=await capture(b,u,'desktop',`${out}/_shots/${k}/desktop`);write(d.snap,d.bodies,dir+'index.html');
  const m=await capture(b,u,'phone',`${out}/_shots/${k}/phone`);write(m.snap,m.bodies,'m/'+dir+'index.html');
  for(const f of [dir+'index.html','m/'+dir+'index.html']){const fp=out+'/'+f;fs.writeFileSync(fp,fs.readFileSync(fp,'utf8').replace('<head>','<head>'+PICK));}
  for(const l of d.snap.links){try{const a=new URL(l);if(a.host===root.host&&a.pathname.startsWith(root.pathname)&&!a.hash)queue.push(a.origin+a.pathname);}catch{}}
  console.log('page',s);}catch(e){console.log('FAILED',s,e.message.split('\n')[0]);fs.rmSync(`${out}/_shots/${k}`,{recursive:true,force:true});}}
 console.log('assets',savedAssets.size);await b.close();})();
