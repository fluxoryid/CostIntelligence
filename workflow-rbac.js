/* workflow-rbac.js — Phase 9 approval workflow + maker/checker RBAC.
 * Production approval requires an authenticated Supabase tenant membership.
 * Supabase is the persistent system of record. Browser state is ephemeral only.
 */
(function () {
  'use strict';

  var initialized = false;
  var memoryState = {stage:'DRAFT',history:[]};

  var ROLES = {
    'Procurement User': { save:true, submit:true, startReview:false, returnForRework:false, approve:false, reject:false, lock:false },
    'Analyst/Senior': { save:true, submit:true, startReview:true, returnForRework:true, approve:false, reject:false, lock:false },
    'Manager': { save:true, submit:false, startReview:true, returnForRework:true, approve:true, reject:true, lock:false },
    'Procurement Head/Admin': { save:true, submit:true, startReview:true, returnForRework:true, approve:true, reject:true, lock:true },
    'Auditor': { save:false, submit:false, startReview:false, returnForRework:false, approve:false, reject:false, lock:false },
    'No Tenant Access': { save:false, submit:false, startReview:false, returnForRework:false, approve:false, reject:false, lock:false }
  };

  var LEGACY_ROLE_MAP = {
    'Requester':'Procurement User', 'Procurement':'Analyst/Senior', 'Approver':'Manager',
    'Admin':'Procurement Head/Admin', 'Auditor':'Auditor'
  };

  var ACTIONS = {
    SUBMIT:{label:'Submit for Review',icon:'fa-paper-plane',tone:'bg-cyan-700 hover:bg-cyan-600'},
    START_REVIEW:{label:'Start Review',icon:'fa-magnifying-glass',tone:'bg-indigo-700 hover:bg-indigo-600'},
    RETURN:{label:'Return for Rework',icon:'fa-rotate-left',tone:'bg-amber-700 hover:bg-amber-600'},
    APPROVE:{label:'Approve HPS',icon:'fa-circle-check',tone:'bg-emerald-700 hover:bg-emerald-600'},
    REJECT:{label:'Reject',icon:'fa-circle-xmark',tone:'bg-rose-800 hover:bg-rose-700'},
    LOCK:{label:'Lock Approved Version',icon:'fa-lock',tone:'bg-slate-700 hover:bg-slate-600'}
  };

  function byId(id){ return document.getElementById(id); }
  function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'})[c];}); }
  function normRole(role){ return LEGACY_ROLE_MAP[role] || role || 'No Tenant Access'; }
  function cloudReady(){ return !!(window.HPSAuth && window.HPSAuth.isConfigured && window.HPSAuth.isConfigured()); }
  function evidence(){ return window.HPSEvidenceComponentUX && window.HPSEvidenceComponentUX.getCoverage ? window.HPSEvidenceComponentUX.getCoverage() : {coveragePct:0,gate:'BLOCKED',criticalMissing:['Evidence module unavailable']}; }
  function moneyNumber(id){ var e=byId(id); if(!e)return null; var s=String(e.textContent||'').replace(/[^0-9,-]/g,'').replace(/\./g,'').replace(',','.'); var n=Number(s); return isFinite(n)?n:null; }

  function readLocal(){ return memoryState; }
  function writeLocal(v){ memoryState=v||{stage:'DRAFT',history:[]}; }

  function currentRequestId(){
    if(window.HPSCloud && window.HPSCloud.getCurrentRequestId){
      var cloudId=window.HPSCloud.getCurrentRequestId(); if(cloudId)return cloudId;
    }
    try{
      var existing=sessionStorage.getItem('hps_workflow_request_id');
      if(existing)return existing;
      var id='req_'+Date.now()+'_'+Math.floor(Math.random()*1000000);
      sessionStorage.setItem('hps_workflow_request_id',id); return id;
    }catch(e){ return 'req_'+Date.now(); }
  }

  function categoryCostValues(){
    var out={}; var p=byId('categoryCostProfilePanel'); if(!p)return out;
    p.querySelectorAll('[data-ccu-key]').forEach(function(i){ out[i.getAttribute('data-ccu-key')]=i.value; });
    return out;
  }

  function captureSnapshot(){
    var cov=evidence();
    return {
      requestId:currentRequestId(),
      capturedAt:new Date().toISOString(),
      ref:byId('requestRef')?byId('requestRef').textContent:null,
      procurementType:byId('projCategory')?byId('projCategory').value:null,
      category:byId('engineCategory')?byId('engineCategory').value:null,
      subcategory:byId('subCategory')?byId('subCategory').value:null,
      productName:byId('projName')?byId('projName').value:null,
      description:byId('projDescription')?byId('projDescription').value:null,
      budget:byId('budgetLimit')?Number(byId('budgetLimit').value||0):0,
      currency:byId('baseCurrency')?byId('baseCurrency').value:'IDR',
      hpsNet:moneyNumber('hpsNetDisplay'),
      hpsGross:moneyNumber('hpsGrossDisplay'),
      categoryCostComponents:categoryCostValues(),
      componentEvidence:window.HPSEvidenceComponentUX&&window.HPSEvidenceComponentUX.exportMappings?window.HPSEvidenceComponentUX.exportMappings():null,
      evidenceCoverage:cov,
      runtimeMode:byId('runtimeModeBadge')?byId('runtimeModeBadge').textContent:null,
      confidence:byId('confidenceDisplay')?byId('confidenceDisplay').textContent:null
    };
  }

  function allowedActions(role,stage){
    role=normRole(role); var p=ROLES[role]||ROLES['No Tenant Access']; var out=[];
    if(stage==='DRAFT'||stage==='REWORK'){
      if(p.submit)out.push('SUBMIT');
    } else if(stage==='SUBMITTED'){
      if(p.startReview)out.push('START_REVIEW');
      if(p.returnForRework)out.push('RETURN');
      if(p.reject)out.push('REJECT');
    } else if(stage==='UNDER_REVIEW'){
      if(p.returnForRework)out.push('RETURN');
      if(p.approve)out.push('APPROVE');
      if(p.reject)out.push('REJECT');
    } else if(stage==='APPROVED'){
      if(p.lock)out.push('LOCK');
    }
    return out;
  }

  function transitionPreview(stage,action){
    var map={SUBMIT:'SUBMITTED',START_REVIEW:'UNDER_REVIEW',RETURN:'REWORK',APPROVE:'APPROVED',REJECT:'REJECTED',LOCK:'LOCKED'};
    return map[action]||stage;
  }

  function getState(){
    var s=readLocal(); if(!s.stage)s.stage='DRAFT'; if(!Array.isArray(s.history))s.history=[]; return s;
  }

  function setState(s){ writeLocal(s); render(); }

  function validateAction(action){
    var cov=evidence();
    if(action==='SUBMIT' && cov.gate==='BLOCKED') return 'Submission blocked: resolve critical evidence gaps or reach at least 70% supported direct cost.';
    if(action==='APPROVE' && cov.gate!=='APPROVAL READY') return 'Approval blocked: Evidence-to-Component gate must be APPROVAL READY (≥90% coverage, no critical gap).';
    if((action==='APPROVE'||action==='LOCK') && !cloudReady()) return 'Production approval/lock requires configured Supabase authentication and tenant RLS.';
    return null;
  }

  function askComment(action){
    if(action==='RETURN'||action==='REJECT'||action==='APPROVE'){
      var label=action==='RETURN'?'Reason / remediation required':action==='REJECT'?'Rejection reason':'Approval note';
      return window.prompt(label+':','') || '';
    }
    return '';
  }

  function act(action){
    var err=validateAction(action); if(err){ window.alert(err); return; }
    var comment=askComment(action);
    if((action==='RETURN'||action==='REJECT')&&!comment.trim()){ window.alert('A reason is required for '+action+'.'); return; }
    var snapshot=captureSnapshot(), state=getState(), userPromise=window.HPSAuth&&window.HPSAuth.getSession?window.HPSAuth.getSession():Promise.resolve(null);
    userPromise.then(function(user){
      var role=normRole(user&&user.role); var allowed=allowedActions(role,state.stage);
      if(allowed.indexOf(action)===-1){ window.alert('Your role ('+role+') cannot perform '+action+' from '+state.stage+'.'); return; }
      if(cloudReady() && window.HPSCloud && window.HPSCloud.transitionRequest){
        return window.HPSCloud.transitionRequest(snapshot,action,comment).then(function(r){
          if(r&&r.error){window.alert('Workflow transition failed: '+r.error);return;}
          state.stage=(r&&r.status)||transitionPreview(state.stage,action);
          state.history.unshift({at:new Date().toISOString(),action:action,stage:state.stage,comment:comment,user:user&&user.email,role:role,cloud:true});
          setState(state);
        });
      }
      state.stage=transitionPreview(state.stage,action);
      state.history.unshift({at:new Date().toISOString(),action:action,stage:state.stage,comment:comment,user:user&&user.email||'Local User',role:role,cloud:false});
      setState(state);
    });
  }

  function saveDraft(){
    var snapshot=captureSnapshot();
    var state=getState(); state.lastSavedAt=new Date().toISOString(); writeLocal(state);
    if(cloudReady()&&window.HPSCloud&&window.HPSCloud.saveWorkflowDraft){
      window.HPSCloud.saveWorkflowDraft(snapshot).then(function(r){ if(r&&r.error)window.alert('Cloud draft save failed: '+r.error); else render(); });
    } else render();
  }

  function panel(){
    var x=byId('workflowRbacPanel'); if(x)return x;
    var anchor=byId('componentEvidencePanel')||byId('categoryCostProfilePanel');
    if(!anchor||!anchor.parentElement)return null;
    x=document.createElement('div'); x.id='workflowRbacPanel'; x.className='p-4 rounded-lg border border-slate-800 bg-slate-950/30';
    if(anchor.nextSibling)anchor.parentElement.insertBefore(x,anchor.nextSibling);else anchor.parentElement.appendChild(x); return x;
  }

  function histHtml(h){
    return (h||[]).slice(0,8).map(function(i){return '<div class="border-l border-slate-700 pl-2 py-1"><div class="text-[10px] text-slate-300"><strong>'+esc(i.action)+'</strong> → '+esc(i.stage)+' · '+esc(i.role||'')+'</div><div class="text-[9px] text-slate-500">'+esc(i.at||'')+(i.comment?' · '+esc(i.comment):'')+'</div></div>';}).join('') || '<div class="text-[10px] text-slate-500">No workflow action yet.</div>';
  }

  function render(){
    var x=panel(); if(!x)return; var state=getState(), cov=evidence();
    var sessionPromise=window.HPSAuth&&window.HPSAuth.getSession?window.HPSAuth.getSession():Promise.resolve(null);
    sessionPromise.then(function(user){
      var role=normRole(user&&user.role); var acts=allowedActions(role,state.stage); var connected=cloudReady();
      var gateTone=cov.gate==='APPROVAL READY'?'text-emerald-300':cov.gate==='BLOCKED'?'text-rose-300':'text-amber-300';
      x.innerHTML='<div class="flex flex-wrap items-start justify-between gap-3"><div><div class="font-semibold text-slate-200"><i class="fa-solid fa-user-check mr-1.5 text-cyan-400"></i>Approval Workflow & RBAC</div><div class="mt-1 text-[10px] text-slate-500">Maker-checker workflow. Approved/locked production versions are immutable and require server-side Supabase RLS/RPC enforcement.</div></div><div class="text-right"><div class="text-[9px] uppercase text-slate-500">Stage</div><div class="font-semibold text-cyan-300">'+esc(state.stage)+'</div></div></div>'+ 
        '<div class="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2"><div class="rounded border border-slate-800 p-2"><div class="text-[9px] uppercase text-slate-500">Current Role</div><div class="mt-1 text-slate-300">'+esc(role)+'</div></div><div class="rounded border border-slate-800 p-2"><div class="text-[9px] uppercase text-slate-500">Evidence Gate</div><div class="mt-1 '+gateTone+'">'+esc(cov.gate)+' · '+cov.coveragePct+'%</div></div><div class="rounded border border-slate-800 p-2"><div class="text-[9px] uppercase text-slate-500">Persistence</div><div class="mt-1 '+(connected?'text-emerald-300':'text-amber-300')+'">'+(connected?'Supabase / RLS':'Local preview — production approval disabled')+'</div></div></div>'+ 
        '<div class="mt-3 flex flex-wrap gap-2"><button type="button" data-wf-save class="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-white text-[10px]"><i class="fa-solid fa-floppy-disk mr-1"></i>Save Draft</button>'+acts.map(function(a){var d=ACTIONS[a];return '<button type="button" data-wf-action="'+a+'" class="px-3 py-1.5 rounded text-white text-[10px] '+d.tone+'"><i class="fa-solid '+d.icon+' mr-1"></i>'+d.label+'</button>';}).join('')+'</div>'+ 
        '<details class="mt-3"><summary class="cursor-pointer text-[10px] font-medium text-slate-400">Workflow history</summary><div class="mt-2 space-y-1">'+histHtml(state.history)+'</div></details>';
      var saveBtn=x.querySelector('[data-wf-save]'); if(saveBtn)saveBtn.addEventListener('click',saveDraft);
      x.querySelectorAll('[data-wf-action]').forEach(function(b){b.addEventListener('click',function(){act(b.getAttribute('data-wf-action'));});});
    });
  }

  function bind(){
    document.addEventListener('change',function(ev){var id=ev&&ev.target&&ev.target.id;if(id==='projCategory'||id==='engineCategory'||id==='subCategory')setTimeout(render,30);});
    document.addEventListener('input',function(ev){if(ev&&ev.target&&ev.target.hasAttribute&&ev.target.hasAttribute('data-ec-field'))setTimeout(render,30);});
  }
  function init(){
    if(initialized)return;if(!byId('componentEvidencePanel')){setTimeout(init,150);return;}
    initialized=true;bind();render();
  }

  window.HPSWorkflow={ROLES:ROLES,allowedActions:allowedActions,captureSnapshot:captureSnapshot,getState:getState,render:render,init:init};
  if(typeof module!=='undefined'&&module.exports)module.exports={ROLES:ROLES,allowedActions:allowedActions,transitionPreview:transitionPreview};
  if(document.readyState==='complete')setTimeout(init,0);else window.addEventListener('load',function(){setTimeout(init,0);});
})();
