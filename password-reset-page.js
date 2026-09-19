(function(){
  'use strict';
  function byId(id){return document.getElementById(id);}
  function status(id,msg,tone){
    var e=byId(id); if(!e)return;
    e.textContent=msg||'';
    e.className='mt-3 min-h-5 text-xs '+(tone==='ok'?'text-emerald-400':tone==='warn'?'text-amber-300':'text-rose-400');
  }
  function strong(v){
    return String(v||'').length>=12 && /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v) && /[^A-Za-z0-9]/.test(v);
  }
  function showRecovery(){
    byId('requestPanel').classList.add('hidden');
    byId('updatePanel').classList.remove('hidden');
    status('updateStatus','Silakan masukkan kata sandi baru.','warn');
  }
  function parseError(){
    var raw=(window.location.hash||'').replace(/^#/,'');
    if(!raw)return;
    var p=new URLSearchParams(raw);
    var code=p.get('error_code'),desc=p.get('error_description');
    if(code||desc){
      status('requestStatus',desc||'Link reset tidak valid atau sudah kedaluwarsa. Minta email reset baru.','error');
      try{history.replaceState(null,document.title,location.pathname+location.search);}catch(e){}
    }
  }
  function bind(){
    var send=byId('sendReset');
    if(!send)return;
    send.addEventListener('click',function(){
      var email=String(byId('resetEmail').value||'').trim();
      if(!email||email.indexOf('@')<1){status('requestStatus','Masukkan alamat email yang valid.','error');return;}
      send.disabled=true; send.textContent='Mengirim…';
      window.HPSAuth.resetPassword(email).then(function(r){
        if(r&&r.error){status('requestStatus','Gagal mengirim email reset: '+r.error,'error');return;}
        status('requestStatus','Email reset dikirim. Gunakan email PALING BARU; link sebelumnya tidak berlaku lagi.','ok');
      }).finally(function(){send.disabled=false;send.textContent='Kirim Email Reset';});
    });
    byId('savePassword').addEventListener('click',function(){
      var p1=String(byId('newPassword').value||''),p2=String(byId('confirmPassword').value||'');
      if(!strong(p1)){status('updateStatus','Kata sandi belum memenuhi kebijakan keamanan.','error');return;}
      if(p1!==p2){status('updateStatus','Konfirmasi kata sandi tidak sama.','error');return;}
      var b=byId('savePassword'); b.disabled=true; b.textContent='Menyimpan…';
      window.HPSAuth.updatePassword(p1).then(function(r){
        if(r&&r.error){status('updateStatus','Gagal memperbarui kata sandi: '+r.error,'error');return;}
        status('updateStatus','Kata sandi berhasil diperbarui. Mengarahkan ke HPS Intelligence…','ok');
        try{history.replaceState(null,document.title,location.pathname);}catch(e){}
        setTimeout(function(){window.location.href='/';},1000);
      }).finally(function(){b.disabled=false;b.textContent='Simpan Kata Sandi Baru';});
    });
    byId('resetEmail').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();send.click();}});
    byId('confirmPassword').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();byId('savePassword').click();}});
    if(window.HPSAuth&&window.HPSAuth.onAuthEvent){
      window.HPSAuth.onAuthEvent(function(event){if(event==='PASSWORD_RECOVERY')showRecovery();});
      if(window.HPSAuth.getClient)window.HPSAuth.getClient();
    }
    parseError();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();