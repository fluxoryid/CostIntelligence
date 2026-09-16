(function () {
  'use strict';
  var status='offline';
  var currentRequestId=null;

  function client(){ return window.HPSAuth && window.HPSAuth.getClient ? window.HPSAuth.getClient() : null; }
  function tenant(){ return (window.HPS_CONFIG && window.HPS_CONFIG.TENANT_ID) || 'default-org'; }
  function now(){ return new Date().toISOString(); }
  function currentUserId(c){ return c.auth.getSession().then(function(r){ return r.data && r.data.session && r.data.session.user && r.data.session.user.id; }); }
  function currentUser(c){ return c.auth.getSession().then(function(r){ return r.data && r.data.session && r.data.session.user || null; }); }
  function rememberRequest(id){ if(!id)return; currentRequestId=id; try{sessionStorage.setItem('hps_current_request_id',id);}catch(e){} }
  function getCurrentRequestId(){ if(currentRequestId)return currentRequestId; try{return sessionStorage.getItem('hps_current_request_id');}catch(e){return null;} }
  function errResult(e){ status='offline'; console.warn('[HPSCloud]',e&&e.message||e); return {error:e&&e.message||String(e)}; }
  function hashText(text){
    if(!window.crypto||!window.crypto.subtle)return Promise.resolve(null);
    return window.crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(text||''))).then(function(buf){return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');});
  }
  function normalizeStage(v){
    v=String(v||'DRAFT').toUpperCase().replace(/[ -]+/g,'_');
    return ['DRAFT','SUBMITTED','UNDER_REVIEW','REWORK','APPROVED','REJECTED','LOCKED','ARCHIVED'].indexOf(v)!==-1?v:'DRAFT';
  }

  function pushRequest(req){
    var c=client(); if(!c){status='offline'; if(req&&req.id)rememberRequest(req.id); return Promise.resolve({localOnly:true});}
    if(req&&req.id)rememberRequest(req.id);
    return currentUserId(c).then(function(uid){ if(!uid) throw new Error('No authenticated session');
      return c.from('hps_requests').upsert({
        id:req.id,tenant_id:tenant(),owner_user_id:uid,status:normalizeStage((req.approval&&req.approval.stage)||req.status),
        category:req.input&&req.input.category,subcategory:req.input&&req.input.subCategory||null,
        product_name:req.input&&req.input.productName,data:req,updated_at:now()
      },{onConflict:'id'});
    }).then(function(r){if(r.error)throw r.error;status='online';return {ok:true,id:req.id};}).catch(errResult);
  }

  function pushAuditLog(entry){
    var c=client(); if(!c)return Promise.resolve({localOnly:true});
    return currentUserId(c).then(function(uid){if(!uid)throw new Error('No authenticated session');return c.from('hps_audit_log').insert({tenant_id:tenant(),user_id:uid,request_id:entry.requestId||getCurrentRequestId()||null,action:entry.action,detail:entry.detail||null,ts:entry.ts||now()});})
      .then(function(r){if(r&&r.error)throw r.error;return{ok:true};}).catch(errResult);
  }

  function saveWorkflowDraft(snapshot){
    var c=client(); if(!c)return Promise.resolve({localOnly:true});
    var id=snapshot.requestId||getCurrentRequestId(); rememberRequest(id);
    return Promise.all([currentUserId(c),hashText(JSON.stringify(snapshot))]).then(function(v){var uid=v[0],hash=v[1];if(!uid)throw new Error('No authenticated session');
      return c.rpc('hps_save_draft',{p_tenant_id:tenant(),p_request_id:id,p_snapshot:snapshot,p_category:snapshot.category||null,p_subcategory:snapshot.subcategory||null,p_product_name:snapshot.productName||null,p_content_hash:hash});
    }).then(function(r){if(r.error)throw r.error;status='online';return r.data||{ok:true};}).catch(errResult);
  }

  function transitionRequest(snapshot,action,comment){
    var c=client(); if(!c)return Promise.resolve({error:'Supabase is not configured'});
    var id=snapshot.requestId||getCurrentRequestId(); rememberRequest(id);
    return hashText(JSON.stringify(snapshot)).then(function(hash){
      return c.rpc('hps_transition_request',{p_tenant_id:tenant(),p_request_id:id,p_action:action,p_comment:comment||null,p_snapshot:snapshot,p_content_hash:hash});
    }).then(function(r){if(r.error)throw r.error;status='online';return r.data||{ok:true};}).catch(errResult);
  }

  function getRequest(id){
    var c=client(); if(!c)return Promise.resolve(null); id=id||getCurrentRequestId(); if(!id)return Promise.resolve(null);
    return c.from('hps_requests').select('*').eq('tenant_id',tenant()).eq('id',id).maybeSingle().then(function(r){if(r.error)throw r.error;status='online';if(r.data)rememberRequest(r.data.id);return r.data;}).catch(function(){return null;});
  }

  function listRequests(limit){
    var c=client(); if(!c)return Promise.resolve([]);
    return c.from('hps_requests').select('id,status,category,subcategory,product_name,current_version,approved_version,updated_at,owner_user_id').eq('tenant_id',tenant()).order('updated_at',{ascending:false}).limit(limit||50)
      .then(function(r){if(r.error)throw r.error;status='online';return r.data||[];}).catch(function(){return[];});
  }

  function listReviews(requestId){
    var c=client(); if(!c)return Promise.resolve([]);
    return c.from('hps_reviews').select('*').eq('tenant_id',tenant()).eq('request_id',requestId||getCurrentRequestId()).order('created_at',{ascending:false})
      .then(function(r){if(r.error)throw r.error;return r.data||[];}).catch(function(){return[];});
  }

  function findDocumentByHash(hash){
    var c=client(); if(!c||!hash)return Promise.resolve(null);
    return c.from('hps_documents').select('*').eq('tenant_id',tenant()).eq('sha256',hash).maybeSingle().then(function(r){if(r.error)throw r.error;return r.data;}).catch(function(){return null;});
  }

  function nextDocumentVersion(reference){
    var c=client(); if(!c||!reference)return Promise.resolve(1);
    return c.from('hps_documents').select('version').eq('tenant_id',tenant()).eq('reference',reference).order('version',{ascending:false}).limit(1)
      .then(function(r){if(r.error)throw r.error;return r.data&&r.data[0]?Number(r.data[0].version||0)+1:1;}).catch(function(){return 1;});
  }

  function uploadEvidenceDocument(file,meta){
    var c=client(); if(!c)return Promise.resolve({error:'Supabase is not configured'});
    meta=meta||{}; var requestId=meta.requestId||getCurrentRequestId(); if(!requestId)return Promise.resolve({error:'Save the HPS request before uploading evidence.'});
    return Promise.all([currentUserId(c),nextDocumentVersion(meta.reference)]).then(function(v){
      var uid=v[0],version=v[1]; if(!uid)throw new Error('No authenticated session');
      var clean=String(file.name||'evidence').replace(/[^A-Za-z0-9._-]+/g,'_');
      var path=tenant()+'/'+requestId+'/'+Date.now()+'_'+String(meta.sha256||'').slice(0,12)+'_'+clean;
      return c.storage.from('hps-evidence').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false}).then(function(up){
        if(up.error)throw up.error;
        var row={tenant_id:tenant(),request_id:requestId,component_key:meta.componentKey||null,file_name:file.name,storage_path:path,mime_type:file.type||null,size_bytes:file.size||0,sha256:meta.sha256||null,document_type:meta.documentType||'Other',reference:meta.reference||null,issue_date:meta.issueDate||null,valid_until:meta.validUntil||null,extraction_status:meta.extractionStatus||'NOT_EXTRACTED',extracted_text:meta.extractedText||null,extracted_metadata:meta.extractedMetadata||{},version:version,uploaded_by:uid,status:'ACTIVE'};
        return c.from('hps_documents').insert(row).select('*').single();
      });
    }).then(function(r){if(r.error)throw r.error;status='online';return {ok:true,document:r.data};}).catch(errResult);
  }

  function listDocuments(requestId){
    var c=client(); if(!c)return Promise.resolve([]);
    requestId=requestId||getCurrentRequestId(); if(!requestId)return Promise.resolve([]);
    return c.from('hps_documents').select('*').eq('tenant_id',tenant()).eq('request_id',requestId).order('created_at',{ascending:false})
      .then(function(r){if(r.error)throw r.error;return r.data||[];}).catch(function(){return[];});
  }

  function upsertComponentEvidence(rows){
    var c=client(); if(!c)return Promise.resolve({error:'Supabase is not configured'}); if(!Array.isArray(rows)||!rows.length)return Promise.resolve({ok:true,count:0});
    return currentUserId(c).then(function(uid){if(!uid)throw new Error('No authenticated session');var mapped=rows.map(function(x){return Object.assign({},x,{tenant_id:tenant(),reviewer_user_id:x.reviewer_user_id||uid});});return c.from('hps_component_evidence').upsert(mapped,{onConflict:'tenant_id,request_id,request_version,component_key,slot_index'});})
      .then(function(r){if(r.error)throw r.error;return{ok:true,count:rows.length};}).catch(errResult);
  }

  function pullLearning(){
    var c=client(); if(!c)return Promise.resolve([]);
    return c.from('hps_learning_outcomes').select('*').eq('tenant_id',tenant()).eq('approved_for_learning',true).then(function(r){if(r.error)throw r.error;status='online';return (r.data||[]).map(function(x){return x.data||x;});}).catch(function(){status='offline';return [];});
  }

  function pushLearningOutcome(event){
    var c=client(); if(!c)return Promise.resolve({localOnly:true});
    return currentUserId(c).then(function(uid){if(!uid)throw new Error('No authenticated session');
      return c.from('hps_learning_outcomes').insert({tenant_id:tenant(),user_id:uid,request_id:event.requestId||getCurrentRequestId()||null,request_version:event.requestVersion||null,category:event.category,subcategory:event.subcategory||null,approved_for_learning:false,source_mode:event.sourceMode||'APPROVED_OUTCOME',data:event});
    }).then(function(r){if(r.error)throw r.error;status='online';return {ok:true,pendingApproval:true};}).catch(errResult);
  }

  function approveLearningOutcome(id,approve){
    var c=client(); if(!c)return Promise.resolve({error:'Supabase is not configured'});
    return c.rpc('hps_approve_learning_outcome',{p_tenant_id:tenant(),p_outcome_id:id,p_approve:!!approve}).then(function(r){if(r.error)throw r.error;return r.data||{ok:true};}).catch(errResult);
  }

  function saveNegotiationOutcome(event){
    var c=client(); if(!c)return Promise.resolve({localOnly:true});
    return currentUserId(c).then(function(uid){if(!uid)throw new Error('No authenticated session');return c.from('hps_negotiation_outcomes').insert({tenant_id:tenant(),request_id:event.requestId||getCurrentRequestId(),request_version:event.requestVersion||null,user_id:uid,supplier_name:event.supplierName||null,initial_offer:event.initialOffer||null,final_offer:event.finalOffer||null,hps_value:event.hpsValue||null,target_value:event.targetValue||null,data:event});})
      .then(function(r){if(r.error)throw r.error;return{ok:true};}).catch(errResult);
  }

  function health(){
    var c=client(); if(!c)return Promise.resolve({configured:false,status:'LOCAL_ONLY'});
    return currentUser(c).then(function(u){return{configured:true,status:u?'AUTHENTICATED':'SIGNED_OUT',user:u&&u.email||null,tenant:tenant()};}).catch(function(){return{configured:true,status:'ERROR'};});
  }

  try{currentRequestId=sessionStorage.getItem('hps_current_request_id')||null;}catch(e){}

  window.HPSCloud={
    pushRequest:pushRequest,pushAuditLog:pushAuditLog,
    saveWorkflowDraft:saveWorkflowDraft,transitionRequest:transitionRequest,getRequest:getRequest,listRequests:listRequests,listReviews:listReviews,
    findDocumentByHash:findDocumentByHash,nextDocumentVersion:nextDocumentVersion,uploadEvidenceDocument:uploadEvidenceDocument,listDocuments:listDocuments,upsertComponentEvidence:upsertComponentEvidence,
    pullLearning:pullLearning,pushLearningOutcome:pushLearningOutcome,approveLearningOutcome:approveLearningOutcome,saveNegotiationOutcome:saveNegotiationOutcome,
    getCurrentRequestId:getCurrentRequestId,rememberRequest:rememberRequest,health:health,getStatus:function(){return status;}
  };
})();
