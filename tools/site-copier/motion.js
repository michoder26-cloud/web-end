// Replays recorded scroll motion. Header that hides on scroll down shows again on scroll up.
(function(){var M=window.__M||{},items=[];
function parse(t){if(!t||t==='none')return [1,0,0,1,0,0];var m=t.match(/matrix\(([^)]+)\)/);if(m)return m[1].split(',').map(Number);
 var m3=t.match(/matrix3d\(([^)]+)\)/);if(m3){var v=m3[1].split(',').map(Number);return [v[0],v[1],v[4],v[5],v[12],v[13]];}return [1,0,0,1,0,0];}
for(var k in M){var el=document.querySelector('[data-cl="'+k+'"]');if(!el)continue;
 items.push({el:el,head:el.id==='SITE_HEADER'||el.tagName==='HEADER'||!!el.closest('header'),s:M[k].map(function(x){return [x[0],parse(x[1]),+x[2]];})});}
var last=0;function at(s,y){if(y<=s[0][0])return s[0];for(var i=1;i<s.length;i++)if(y<=s[i][0]){var a=s[i-1],b=s[i],f=(y-a[0])/((b[0]-a[0])||1);
 return [y,a[1].map(function(v,j){return v+(b[1][j]-v)*f;}),a[2]+(b[2]-a[2])*f];}return s[s.length-1];}
function run(){var y=scrollY,up=y<last;last=y;items.forEach(function(it){var v=at(it.s,y);
 if(it.head&&up){it.el.style.transform='none';it.el.style.opacity='1';return;}
 it.el.style.transform='matrix('+v[1].join(',')+')';it.el.style.opacity=v[2];});}
addEventListener('scroll',function(){requestAnimationFrame(run);},{passive:true});run();})();
// Replays recorded time motion in a loop (slideshows, crossfades).
(function(){var T=window.__T;if(!T)return;var items=[];
for(var k in T.tracks){var el=document.querySelector('[data-ct="'+k+'"]');if(el)items.push({el:el,v:T.tracks[k]});}
var n=items.length?items[0].v.length:0;if(!n)return;var t0=performance.now();
function tick(now){var f=((now-t0)/T.step)%n,i=Math.floor(f),j=(i+1)%n,r=f-i;
 items.forEach(function(it){var a=it.v[i],b=it.v[j];if(!a||!b)return;it.el.style.opacity=(+a[0])+((+b[0])-(+a[0]))*r;if(a[1]!==b[1]||a[1]!=='none')it.el.style.transform=r<.5?a[1]:b[1];});
 requestAnimationFrame(tick);}requestAnimationFrame(tick);})();
