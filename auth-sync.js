(function () {
  'use strict';
  var client = null;
  function cfg(){ return window.HPS_CONFIG || {}; }
  function getClient() {
    if (client) return client;
    var c = cfg();
    if (!c.SUPABASE_URL || !c.SUPABASE_PUBLISHABLE_KEY || !window.supabase || !window.supabase.createClient) return null;
    client = window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_PUBLISHABLE_KEY);
    return client;
  }
  function baseUser(u, role) {
    if (!u) return null;
    return { id:u.id, email:u.email, name:(u.user_metadata && u.user_metadata.display_name) || u.email, role:role || 'No Tenant Access' };
  }
  function loadUser(u) {
    var c=getClient(); if(!c || !u) return Promise.resolve(baseUser(u));
    return c.from('hps_tenant_members').select('role').eq('tenant_id',cfg().TENANT_ID || 'default-org').eq('user_id',u.id).maybeSingle().then(function(r){
      if(r.error) return baseUser(u,'No Tenant Access');
      return baseUser(u,r.data && r.data.role || 'No Tenant Access');
    }).catch(function(){ return baseUser(u,'No Tenant Access'); });
  }
  function signIn(email,password){
    var c=getClient(); if(!c) return Promise.resolve({error:'Supabase is not configured; application is running local-only.'});
    return c.auth.signInWithPassword({email:email,password:password}).then(function(r){
      if(r.error) return {error:r.error.message};
      return loadUser(r.data.user).then(function(user){return {user:user};});
    });
  }
  function signUp(email,password){
    var c=getClient(); if(!c) return Promise.resolve({error:'Supabase is not configured; application is running local-only.'});
    return c.auth.signUp({email:email,password:password}).then(function(r){
      if(r.error) return {error:r.error.message};
      if(!r.data.user) return {error:'Check your email to confirm the account, then sign in.'};
      return loadUser(r.data.user).then(function(user){return {user:user};});
    });
  }
  function signOut(){var c=getClient(); return c?c.auth.signOut():Promise.resolve();}
  function getSession(){
    var c=getClient(); if(!c)return Promise.resolve(null);
    return c.auth.getSession().then(function(r){
      var u=r.data && r.data.session && r.data.session.user;
      return u ? loadUser(u) : null;
    }).catch(function(){return null;});
  }
  window.HPSAuth={signIn:signIn,signUp:signUp,signOut:signOut,getSession:getSession,getClient:getClient,isConfigured:function(){return !!getClient();}};
})();
