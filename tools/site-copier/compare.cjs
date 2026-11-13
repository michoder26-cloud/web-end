const {chromium,devices}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const dir=process.argv[2];const VIEWS={desktop:{viewport:{width:1366,height:900}},phone:{...devices['iPhone 13']}};
const srv=http.createServer((q,r)=>{let f=path.join(dir,decodeURIComponent(q.url.split('?')[0]));if(q.url.split('?')[0].endsWith('/'))f=path.join(f,'index.html');fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();}else{if(f.endsWith('.css'))r.setHeader('content-type','text/css');if(f.endsWith('.avif'))r.setHeader('content-type','image/avif');r.end(d);}});}).listen(8812);
const diff=async(p,a,c)=>p.evaluate(async([a,c])=>{const ld=s=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src='data:image/png;base64,'+s;});
 const A0=await ld(a),C0=await ld(c);const w=Math.min(A0.width,C0.width),h=Math.min(A0.height,C0.height);
 const g=im=>{const cv=document.createElement('canvas');cv.width=w;cv.height=h;const x=cv.getContext('2d');x.drawImage(im,0,0);return x.getImageData(0,0,w,h).data};
 const A=g(A0),C=g(C0);let d=0;for(let i=0;i<A.length;i+=4)if(Math.abs(A[i]-C[i])+Math.abs(A[i+1]-C[i+1])+Math.abs(A[i+2]-C[i+2])>48)d++;return [d,w*h];},[a,c]);
(async()=>{const b=await chromium.launch();const tool=await b.newPage();
 for(const page of fs.readdirSync(dir+'/_shots')){for(const view of ['desktop','phone']){if(!fs.existsSync(`${dir}/_shots/${page}/${view}`))continue;
  const ctx=await b.newContext(VIEWS[view]);const p=await ctx.newPage();let ext=0;
  await p.route('**/*',rt=>{const u=rt.request().url();if(u.startsWith('http://localhost:8812')||/google.com|gstatic.com|googleapis.com|unpkg.com|cartocdn.com/.test(u))return rt.continue();ext++;return rt.abort();});
  await p.goto('http://localhost:8812/'+(view==='phone'?'m/':'')+(page==='index'?'':page.replace(/__/g,'/')+'/'),{waitUntil:'load'});await p.waitForTimeout(1000);
  const odir=`${dir}/_shots/${page}/${view}`;const n=fs.readdirSync(odir).filter(f=>/^\d+\.png$/.test(f)).length;let D=0,T=0;fs.mkdirSync(odir+'/copy',{recursive:true});
  const vh=p.viewportSize().height;
  for(let i=0;i<n;i++){await p.evaluate(y=>window.scrollTo(0,y),i*vh);await p.waitForTimeout(500);const cp=`${odir}/copy/${i}.png`;await p.screenshot({path:cp});
   const [d,t]=await diff(tool,fs.readFileSync(`${odir}/${i}.png`).toString('base64'),fs.readFileSync(cp).toString('base64'));D+=d;T+=t;}
  console.log(page.padEnd(16),view.padEnd(8),'same',(100-100*D/T).toFixed(2)+'%','screens',n,'blocked',ext);await ctx.close();}}
 await b.close();srv.close();})();
