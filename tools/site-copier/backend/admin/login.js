document.getElementById('login').addEventListener('submit',function(e){e.preventDefault();var err=document.getElementById('err');err.textContent='';
fetch('/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:document.getElementById('pw').value})})
.then(function(r){if(r.ok)location.reload();else err.textContent=W('wrong')});});
