(function () {
  'use strict';
  var status='offline';
  function client(){ return window.HPSAuth && window.HPSAuth.getClient ? window.HPSAuth.getClient() : null; }
  function tenant(){ return (window.HPS_CONFIG && window.HPS_CONFIG.TENANT_ID) || 'default-org'; }
  function currentUserId(c){ return c.auth.getSession().then(function(r){ return r.data && r.data.session && r.data.session.user && r.data.session.user.id; }); }
  function pushRequest(req){
    var c=client(); if(!c){status='offline'; return Promise.resolve({localOnly:true});}
    return currentUserId(c).then(function(uid){ if(!uid) throw new Error('No authenticated session');
      return c.from('hps_requests').upsert({id:req.id,tenant_id:tenant(),user_id:uid,status:req.runtimeMode || req.status,category:req.input && req.input.category,product_name:req.input && req.input.productName,data:req,updated_at:new Date().toISOString()});
    }).then(function(r){if(r.error)throw r.error;status='online';return {ok:true};}).catch(function(e){status='offline';console.warn('[HPSCloud]',e.message||e);return {error:e.message||String(e)};});
  }
  function pushAuditLog(entry){
    var c=client(); if(!c)return Promise.resolve();
    return currentUserId(c).then(function(uid){if(!uid)return;return c.from('hps_audit_log').insert({tenant_id:tenant(),user_id:uid,action:entry.action,detail:entry.detail||null,ts:entry.ts||new Date().toISOString()});}).catch(function(e){console.warn('[HPSCloud audit]',e.message||e);});
  }
  function pullLearning(){
    var c=client(); if(!c)return Promise.resolve([]);
    return c.from('hps_learning_outcomes').select('*').eq('tenant_id',tenant()).eq('approved_for_learning',true).then(function(r){if(r.error)throw r.error;status='online';return (r.data||[]).map(function(x){return x.data||x;});}).catch(function(){status='offline';return [];});
  }

  function pushLearningOutcome(event){
    var c=client(); if(!c)return Promise.resolve({localOnly:true});
    return currentUserId(c).then(function(uid){if(!uid)throw new Error('No authenticated session');
      return c.from('hps_learning_outcomes').insert({tenant_id:tenant(),user_id:uid,category:event.category,approved_for_learning:true,source_mode:event.sourceMode,data:event});
    }).then(function(r){if(r.error)throw r.error;status='online';return {ok:true};}).catch(function(e){console.warn('[HPSCloud learning]',e.message||e);return {error:e.message||String(e)};});
  }

  window.HPSCloud={pushRequest:pushRequest,pushAuditLog:pushAuditLog,pullLearning:pullLearning,pushLearningOutcome:pushLearningOutcome,getStatus:function(){return status;}};
})();
