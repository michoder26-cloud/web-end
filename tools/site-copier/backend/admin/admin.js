(function(){
function api(path,body){return fetch('/admin/api/'+path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}).then(function(r){if(r.status===401){location.reload();throw Error('signin')}return r.json().then(function(d){if(!r.ok)throw Object.assign(Error(d.error),{data:d});return d})})}
function el(tag,attrs,kids){var e=document.createElement(tag);for(var k in attrs||{})if(k==='text')e.textContent=attrs[k];else e.setAttribute(k,attrs[k]);(kids||[]).forEach(function(c){e.append(c)});return e}
var tabs=document.querySelectorAll('[data-tab]');tabs.forEach(function(b){b.onclick=function(){tabs.forEach(function(x){x.setAttribute('aria-selected',x===b);document.getElementById('tab-'+x.dataset.tab).hidden=x!==b})}});
function overview(){api('overview').then(function(o){var u=document.getElementById('unread');u.hidden=!o.unread;u.textContent=o.unread;document.getElementById('first').hidden=!o.firstPassword;
 var pl=document.getElementById('pagelist');pl.replaceChildren.apply(pl,o.pages.map(function(p){return el('a',{href:'/admin/edit'+p,text:p==='/'?'/ (home)':p})}));
 var ch=document.getElementById('changes');ch.replaceChildren.apply(ch,o.changes.length?o.changes.map(function(c){return el('div',{text:new Date(c.at).toLocaleString()+' · '+(c.kind==='text'?W('textChange')+' '+c.page:W('imageChange'))})}):[document.createTextNode(W('none'))])})}
function inbox(){api('messages').then(function(list){var box=document.getElementById('list');
 if(!list.length){box.replaceChildren(el('p',{class:'muted',text:W('noMessages')}));return}
 box.replaceChildren.apply(box,list.map(function(m){var dl=el('dl');m.fields.forEach(function(f){dl.append(el('dt',{text:f.label}),el('dd',{text:f.value}))});
  var read=el('button',{class:'btn',text:W(m.read?'markUnread':'markRead')});read.onclick=function(){api('messages',{action:m.read?'unread':'read',ids:[m.id]}).then(refresh)};
  var del=el('button',{class:'btn',text:W('del')});del.onclick=function(){if(confirm(W('confirmDel')))api('messages',{action:'delete',ids:[m.id]}).then(refresh)};
  return el('div',{class:'msg'+(m.read?'':' unread')},[el('div',{class:'when muted',text:new Date(m.at).toLocaleString()+' · '+m.form+' · '+W('from')+' '+m.page}),dl,el('div',{class:'row'},[read,del])])}))})}
function refresh(){overview();inbox()}
document.getElementById('out').onclick=function(){api('logout',{}).then(function(){location.reload()})};
document.getElementById('pwform').onsubmit=function(e){e.preventDefault();var msg=document.getElementById('pwmsg');var nx=document.getElementById('nx').value;if(nx.length<8){msg.textContent=W('pwShort');return}
 api('password',{current:document.getElementById('cur').value,next:nx}).then(function(){msg.textContent=W('pwSaved');e.target.reset();overview()}).catch(function(){msg.textContent=W('wrong')})};
refresh();setInterval(refresh,60000);
})();
