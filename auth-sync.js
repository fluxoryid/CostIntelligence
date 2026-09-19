(function () {
  'use strict';
  var client=null;
  var listeners=[];
  var authEventListeners=[];
  var lastAuthEvent=null;
  function cfg(){return window.HPS_CONFIG||{};}
  function getClient(){
    if(client)return client;var c=cfg();
    if(!c.SUPABASE_URL||!c.SUPABASE_PUBLISHABLE_KEY||!window.supabase||!window.supabase.createClient)return null;
    client=window.supabase.createClient(c.SUPABASE_URL,c.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    client.auth.onAuthStateChange(function(event,session){
      lastAuthEvent={event:event,session:session||null};
      authEventListeners.slice().forEach(function(fn){try{fn(event,session||null);}catch(e){}});
      notify();
    });
    return client;
  }
  function normalizeRole(role){var m={Requester:'Procurement User',Procurement:'Analyst/Senior',Approver:'Manager',Admin:'Procurement Head/Admin',Auditor:'Auditor'};return m[role]||role||'No Tenant Access';}
  function baseUser(u,role,active){if(!u)return null;return{id:u.id,email:u.email,name:(u.user_metadata&&u.user_metadata.display_name)||u.email,role:normalizeRole(role),active:active!==false};}
  function loadUser(u){
    var c=getClient();if(!c||!u)return Promise.resolve(baseUser(u));
    return c.from('hps_tenant_members').select('role,active').eq('tenant_id',cfg().TENANT_ID||'default-org').eq('user_id',u.id).maybeSingle().then(function(r){
      if(r.error||!r.data||r.data.active===false)return baseUser(u,'No Tenant Access',false);
      return baseUser(u,r.data.role,r.data.active);
    }).catch(function(){return baseUser(u,'No Tenant Access',false);});
  }
  function signIn(email,password){
    var c=getClient();if(!c)return Promise.resolve({error:'Supabase belum dikonfigurasi.'});
    return c.auth.signInWithPassword({email:email,password:password}).then(function(r){
      if(r.error)return{error:'Kredensial tidak valid atau login ditolak: '+r.error.message};
      return loadUser(r.data.user).then(function(user){
        if(!user || user.active===false || user.role==='No Tenant Access'){
          return c.auth.signOut().then(function(){return{error:'Kredensial terautentikasi, tetapi akun tidak memiliki keanggotaan tenant HPS yang aktif.'};});
        }
        return{user:user};
      });
    });
  }
  function signUp(email,password){
    if(!cfg().ALLOW_SELF_SIGNUP)return Promise.resolve({error:'Pendaftaran mandiri dinonaktifkan. Hubungi Procurement Head/Admin untuk mengundang pengguna.'});
    var c=getClient();if(!c)return Promise.resolve({error:'Supabase belum dikonfigurasi.'});
    return c.auth.signUp({email:email,password:password}).then(function(r){if(r.error)return{error:r.error.message};if(!r.data.user)return{error:'Periksa email untuk mengonfirmasi akun, lalu masuk kembali.'};return loadUser(r.data.user).then(function(user){return{user:user};});});
  }
  function resetPassword(email){
    var c=getClient();if(!c)return Promise.resolve({error:'Supabase belum dikonfigurasi.'});
    var redirectTo='';
    try{redirectTo=window.location.origin+window.location.pathname;}catch(e){}
    return c.auth.resetPasswordForEmail(email,{redirectTo:redirectTo}).then(function(r){
      if(r.error)return{error:r.error.message};
      return{ok:true,redirectTo:redirectTo};
    }).catch(function(e){return{error:e&&e.message||String(e)};});
  }
  function updatePassword(password){
    var c=getClient();if(!c)return Promise.resolve({error:'Supabase belum dikonfigurasi.'});
    return c.auth.updateUser({password:password}).then(function(r){
      if(r.error)return{error:r.error.message};
      return{ok:true,user:r.data&&r.data.user||null};
    }).catch(function(e){return{error:e&&e.message||String(e)};});
  }
  function signOut(){var c=getClient();return c?c.auth.signOut():Promise.resolve();}
  function getSession(){var c=getClient();if(!c)return Promise.resolve(null);return c.auth.getSession().then(function(r){var u=r.data&&r.data.session&&r.data.session.user;return u?loadUser(u):null;}).catch(function(){return null;});}
  function notify(){getSession().then(function(u){listeners.slice().forEach(function(fn){try{fn(u);}catch(e){}});});}
  function onChange(fn){if(typeof fn==='function')listeners.push(fn);return function(){listeners=listeners.filter(function(x){return x!==fn;});};}
  function onAuthEvent(fn){
    if(typeof fn!=='function')return function(){};
    authEventListeners.push(fn);
    if(lastAuthEvent){try{fn(lastAuthEvent.event,lastAuthEvent.session);}catch(e){}}
    return function(){authEventListeners=authEventListeners.filter(function(x){return x!==fn;});};
  }
  window.HPSAuth={
    signIn:signIn,signUp:signUp,resetPassword:resetPassword,updatePassword:updatePassword,signOut:signOut,
    getSession:getSession,getClient:getClient,onChange:onChange,onAuthEvent:onAuthEvent,
    normalizeRole:normalizeRole,isConfigured:function(){return !!getClient();}
  };
})();
