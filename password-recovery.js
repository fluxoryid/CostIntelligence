/* password-recovery.js — self-service Supabase password recovery for HPS Intelligence. */
(function(){
  'use strict';

  function byId(id){return document.getElementById(id);}
  function emailValue(){
    var a=byId('gateEmail'),b=byId('authEmail'),c=byId('resetEmail');
    return String((a&&a.value)||(b&&b.value)||(c&&c.value)||'').trim();
  }
  function setText(id,msg,tone){
    var e=byId(id);if(!e)return;
    e.textContent=msg||'';
    e.className='min-h-4 text-[10px] '+(tone==='ok'?'text-emerald-400':tone==='warn'?'text-amber-300':'text-rose-400');
  }
  function openDialog(id){
    var d=byId(id);if(!d)return;
    try{if(!d.open)d.showModal();}catch(e){d.setAttribute('open','');}
  }
  function closeDialog(id){
    var d=byId(id);if(!d)return;
    try{if(d.open)d.close();}catch(e){d.removeAttribute('open');}
  }
  function openReset(message,tone){
    var input=byId('resetEmail');if(input&&!input.value)input.value=emailValue();
    setText('resetStatus',message||'',tone||'error');
    openDialog('passwordResetDialog');
    setTimeout(function(){if(input)input.focus();},0);
  }
  function strongEnough(v){
    return String(v||'').length>=12 &&
      /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v) &&
      /[^A-Za-z0-9]/.test(v);
  }
  function sendReset(){
    var email=String((byId('resetEmail')&&byId('resetEmail').value)||'').trim();
    if(!email||email.indexOf('@')<1){setText('resetStatus','Masukkan alamat email yang valid.','error');return;}
    if(!(window.HPSAuth&&window.HPSAuth.resetPassword)){setText('resetStatus','Layanan pemulihan kata sandi belum siap.','error');return;}
    var b=byId('btnSendPasswordReset');if(b){b.disabled=true;b.textContent='Mengirim…';}
    setText('resetStatus','','error');
    window.HPSAuth.resetPassword(email).then(function(r){
      if(r&&r.error){setText('resetStatus','Gagal mengirim email pemulihan: '+r.error,'error');return;}
      setText('resetStatus','Email pemulihan dikirim. Gunakan email reset PALING BARU; link lama tidak berlaku lagi.','ok');
    }).finally(function(){if(b){b.disabled=false;b.textContent='Kirim Email Reset';}});
  }
  function openRecovery(){
    setText('recoveryStatus','Masukkan kata sandi baru. Minimal 12 karakter dan wajib mengandung huruf kecil, huruf besar, angka, dan simbol.','warn');
    var p1=byId('newRecoveryPassword'),p2=byId('confirmRecoveryPassword');
    if(p1)p1.value='';if(p2)p2.value='';
    openDialog('passwordRecoveryDialog');
    setTimeout(function(){if(p1)p1.focus();},0);
  }
  function saveNewPassword(){
    var p1=String((byId('newRecoveryPassword')&&byId('newRecoveryPassword').value)||'');
    var p2=String((byId('confirmRecoveryPassword')&&byId('confirmRecoveryPassword').value)||'');
    if(!strongEnough(p1)){setText('recoveryStatus','Kata sandi belum memenuhi kebijakan: minimal 12 karakter + lowercase + uppercase + angka + simbol.','error');return;}
    if(p1!==p2){setText('recoveryStatus','Konfirmasi kata sandi tidak sama.','error');return;}
    if(!(window.HPSAuth&&window.HPSAuth.updatePassword)){setText('recoveryStatus','Layanan perubahan kata sandi belum siap.','error');return;}
    var b=byId('btnSaveRecoveryPassword');if(b){b.disabled=true;b.textContent='Menyimpan…';}
    window.HPSAuth.updatePassword(p1).then(function(r){
      if(r&&r.error){setText('recoveryStatus','Gagal memperbarui kata sandi: '+r.error,'error');return;}
      setText('recoveryStatus','Kata sandi berhasil diperbarui. Anda dapat melanjutkan ke HPS Intelligence.','ok');
      try{history.replaceState(null,document.title,location.pathname+location.search);}catch(e){}
      setTimeout(function(){closeDialog('passwordRecoveryDialog');},900);
    }).finally(function(){if(b){b.disabled=false;b.textContent='Simpan Kata Sandi Baru';}});
  }
  function handleHashError(){
    var raw='';
    try{raw=window.location.hash&&window.location.hash.slice(1)||'';}catch(e){}
    if(!raw)return;
    var p=new URLSearchParams(raw),code=p.get('error_code'),desc=p.get('error_description');
    if(code==='otp_expired'||code==='access_denied'){
      openReset(desc||'Link reset tidak valid atau sudah kedaluwarsa. Minta email reset baru.','error');
    }
  }
  function bind(){
    ['gateForgotPassword','authForgotPassword'].forEach(function(id){
      var e=byId(id);
      // Native anchors must navigate to password-reset.html. Only legacy button surfaces use the dialog fallback.
      if(e&&e.tagName!=='A')e.addEventListener('click',function(ev){ev.preventDefault();openReset('','error');});
    });
    var send=byId('btnSendPasswordReset');if(send)send.addEventListener('click',sendReset);
    var save=byId('btnSaveRecoveryPassword');if(save)save.addEventListener('click',saveNewPassword);
    var closeReset=byId('btnClosePasswordReset');if(closeReset)closeReset.addEventListener('click',function(){closeDialog('passwordResetDialog');});
    var closeRecovery=byId('btnCloseRecoveryDialog');if(closeRecovery)closeRecovery.addEventListener('click',function(){closeDialog('passwordRecoveryDialog');});
    var email=byId('resetEmail');if(email)email.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();sendReset();}});
    var confirm=byId('confirmRecoveryPassword');if(confirm)confirm.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();saveNewPassword();}});
    if(window.HPSAuth&&window.HPSAuth.onAuthEvent){
      window.HPSAuth.onAuthEvent(function(event){if(event==='PASSWORD_RECOVERY')openRecovery();});
      // Force client initialization so URL recovery tokens are detected even before normal sign-in.
      if(window.HPSAuth.getClient)window.HPSAuth.getClient();
    }
    handleHashError();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();