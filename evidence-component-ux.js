/* evidence-component-ux.js — evidence-to-component governance mapping.
 * Links every non-zero category cost component to explicit supporting evidence.
 * No numerical benchmark is generated here. Evidence is reviewer-attested,
 * scored through HPSSourceEngine, and persisted locally by procurement profile.
 */
(function () {
  'use strict';

  var STORE = 'hps_component_evidence_v1_';
  var initialized = false;
  var MAX_SLOTS = 2;

  var SOURCE_KEYS = [
    'INTERNAL_TRANSACTION','PRINCIPAL_QUOTE','AUTH_DISTRIBUTOR_QUOTE','SUPPLIER_QUOTE','INAPROC_TRANSACTION','LKPP',
    'BI_JISDOR','KURS_PAJAK','BPS','UMP_JDIH','DJBC_CEISA','ESDM','UN_COMTRADE','EIA','FREIGHT_QUOTE',
    'WORLD_BANK','MARKETPLACE','NEWS_BLOG','SEARCH_SNIPPET'
  ];

  function byId(id){ return document.getElementById(id); }
  function n(v){ var x=Number(v); return isFinite(x)&&x>0?x:0; }
  function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];}); }
  function money(v){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v)||0); }
  function today(){ return new Date().toISOString().slice(0,10); }

  function profileKey(){
    var p=byId('categoryCostProfilePanel');
    if(p&&p.dataset.profileKey) return p.dataset.profileKey;
    var t=byId('projCategory'), c=byId('engineCategory');
    return (t?t.value:'services')+'|'+(c?c.value:'Other');
  }
  function subcategory(){ var s=byId('subCategory'); return s?s.value:'default'; }
  function storageKey(){ return STORE+profileKey()+'|'+subcategory(); }
  function load(){ try{return JSON.parse(localStorage.getItem(storageKey())||'{}')||{};}catch(e){return{};} }
  function save(v){ try{localStorage.setItem(storageKey(),JSON.stringify(v||{}));}catch(e){} }

  function profile(){
    var all=window.HPSCategoryCostUX&&window.HPSCategoryCostUX.PROFILES;
    if(!all) return null;
    return all[profileKey()]||all['services|Other']||null;
  }
  function componentValue(c){
    var panel=byId('categoryCostProfilePanel'); if(!panel)return 0;
    if(c.basis==='qtyRate'){
      var q=panel.querySelector('[data-ccu-key="'+c.key+'_qty"]');
      var r=panel.querySelector('[data-ccu-key="'+c.key+'_rate"]');
      return n(q&&q.value)*n(r&&r.value);
    }
    var a=panel.querySelector('[data-ccu-key="'+c.key+'_amount"]');
    return n(a&&a.value);
  }

  function sourceOptions(selected){
    var se=window.HPSSourceEngine;
    return '<option value="">Select evidence source</option>'+SOURCE_KEYS.map(function(k){
      var d=se&&se.REGISTRY&&se.REGISTRY[k];
      return '<option value="'+esc(k)+'" '+(selected===k?'selected':'')+'>'+esc(d?d.label:k)+'</option>';
    }).join('');
  }

  function defaultSlot(){ return {sourceKey:'',reference:'',publishedDate:'',validUntil:'',verified:false,decision:'PENDING'}; }
  function componentState(state,key){
    if(!state[key]) state[key]={slots:[defaultSlot(),defaultSlot()]};
    if(!Array.isArray(state[key].slots)) state[key].slots=[defaultSlot(),defaultSlot()];
    while(state[key].slots.length<MAX_SLOTS) state[key].slots.push(defaultSlot());
    return state[key];
  }

  function slotAssessment(slot){
    slot=slot||defaultSlot();
    var engine=window.HPSSourceEngine;
    var gov=engine&&slot.sourceKey?engine.scoreSource(slot.sourceKey,{publishedDate:slot.publishedDate||null}):null;
    var expired=!!(slot.validUntil && slot.validUntil<today());
    var material=slot.decision==='MATERIAL';
    var attested=!!slot.verified && !!String(slot.reference||'').trim();
    var usable=!!(gov&&gov.allowed&&attested&&!expired&&material&&gov.grade!=='REJECTED'&&gov.grade!=='INFORMATIONAL');
    return {governance:gov,expired:expired,material:material,attested:attested,usable:usable};
  }

  function componentAssessment(c,state){
    var amount=componentValue(c), cs=componentState(state,c.key), assessed=cs.slots.map(slotAssessment);
    var usable=assessed.filter(function(x){return x.usable;});
    var priceUsable=usable.filter(function(x){return x.governance&&['PRIMARY_PRICE','SUPPORTING_PRICE'].indexOf(x.governance.role)!==-1;});
    var primaryStrong=priceUsable.some(function(x){return x.governance.score>=80;});
    var independentAcceptable={};
    priceUsable.forEach(function(x){if(x.governance.score>=70) independentAcceptable[x.governance.key]=true;});
    var twoAcceptable=Object.keys(independentAcceptable).length>=2;
    var anyUsable=usable.some(function(x){return x.governance&&x.governance.score>=70;});
    var supported=amount<=0 ? true : (c.primary ? (primaryStrong||twoAcceptable) : anyUsable);
    var scores=usable.map(function(x){return x.governance.score;}).sort(function(a,b){return b-a;});
    var confidence=scores.length?scores[0]:0;
    if(scores.length>=2) confidence=Math.min(100,confidence+5);
    return {amount:amount,supported:supported,confidence:confidence,assessed:assessed,critical:!!c.primary&&amount>0};
  }

  function coverage(state){
    var pr=profile(); if(!pr)return {coveragePct:0,gate:'BLOCKED',criticalMissing:[],unsupported:[],totalAmount:0,supportedAmount:0};
    var total=0,supported=0,criticalMissing=[],unsupported=[],components=[];
    pr.components.forEach(function(c){
      var a=componentAssessment(c,state); components.push({component:c,assessment:a});
      if(a.amount>0){total+=a.amount;if(a.supported)supported+=a.amount;else unsupported.push(c.label);if(a.critical&&!a.supported)criticalMissing.push(c.label);}
    });
    var pct=total>0?Math.round((supported/total)*100):0;
    var gate=criticalMissing.length||pct<70?'BLOCKED':(pct>=90?'APPROVAL READY':'REVIEW REQUIRED');
    return {coveragePct:pct,gate:gate,criticalMissing:criticalMissing,unsupported:unsupported,totalAmount:total,supportedAmount:supported,components:components};
  }

  function panel(){
    var existing=byId('componentEvidencePanel'); if(existing)return existing;
    var cost=byId('categoryCostProfilePanel'); if(!cost||!cost.parentElement)return null;
    var x=document.createElement('div');x.id='componentEvidencePanel';x.className='p-4 rounded-lg border border-slate-800 bg-slate-950/30';
    if(cost.nextSibling)cost.parentElement.insertBefore(x,cost.nextSibling);else cost.parentElement.appendChild(x);return x;
  }

  function slotHtml(c,slot,index){
    var a=slotAssessment(slot),g=a.governance;
    var tone=!g?'text-slate-500':!g.allowed?'text-rose-400':g.score>=90?'text-emerald-400':g.score>=80?'text-cyan-300':g.score>=70?'text-amber-300':'text-slate-400';
    var status=!g?'Not scored':(g.score+' / 100 · '+g.grade+' · '+g.role)+(a.expired?' · EXPIRED':'');
    return '<div class="rounded border border-slate-800 bg-slate-900/40 p-3" data-ec-slot="'+index+'" data-ec-component="'+esc(c.key)+'">'+
      '<div class="mb-2 flex items-center justify-between gap-2"><span class="text-[10px] font-semibold text-slate-400">'+(index===0?'Primary Evidence':'Corroborating Evidence')+'</span><span class="text-[9px] '+tone+'">'+esc(status)+'</span></div>'+ 
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-2">'+
        '<select class="field compact" data-ec-field="sourceKey">'+sourceOptions(slot.sourceKey)+'</select>'+ 
        '<input class="field compact" data-ec-field="reference" value="'+esc(slot.reference)+'" placeholder="Document ID / URL / contract / quotation reference" />'+
        '<div><label class="mb-1 block text-[9px] text-slate-500">Source / Published Date</label><input type="date" class="field compact" data-ec-field="publishedDate" value="'+esc(slot.publishedDate)+'" /></div>'+ 
        '<div><label class="mb-1 block text-[9px] text-slate-500">Valid Until</label><input type="date" class="field compact" data-ec-field="validUntil" value="'+esc(slot.validUntil)+'" /></div>'+ 
        '<select class="field compact" data-ec-field="decision"><option value="PENDING" '+(slot.decision==='PENDING'?'selected':'')+'>Material-use: Pending Review</option><option value="MATERIAL" '+(slot.decision==='MATERIAL'?'selected':'')+'>Material-use: Allow</option><option value="CONTEXT" '+(slot.decision==='CONTEXT'?'selected':'')+'>Context Only</option><option value="REJECT" '+(slot.decision==='REJECT'?'selected':'')+'>Reject</option></select>'+ 
        '<label class="flex items-center gap-2 rounded border border-slate-800 px-2 py-1.5 text-[10px] text-slate-400"><input type="checkbox" data-ec-field="verified" '+(slot.verified?'checked':'')+' /> Reviewer verified source/reference</label>'+ 
      '</div></div>';
  }

  function componentHtml(c,state){
    var cs=componentState(state,c.key), a=componentAssessment(c,state);
    var badge=a.amount<=0?'NOT USED':a.supported?'SUPPORTED':a.critical?'CRITICAL UNSUPPORTED':'UNSUPPORTED';
    var tone=a.amount<=0?'border-slate-700 text-slate-500':a.supported?'border-emerald-800 text-emerald-300':a.critical?'border-rose-800 text-rose-300':'border-amber-800 text-amber-300';
    return '<div class="rounded-lg border border-slate-800 bg-slate-950/40 p-3" data-ec-component-card="'+esc(c.key)+'">'+
      '<div class="mb-3 flex flex-wrap items-start justify-between gap-2"><div><div class="font-medium text-slate-300">'+esc(c.label)+'</div><div class="mt-0.5 text-[10px] text-slate-500">Component amount: <span class="font-mono-num">'+money(a.amount)+'</span> · Confidence '+a.confidence+'/100'+(c.primary?' · PRIMARY BASIS':'')+'</div></div><span class="rounded border px-1.5 py-0.5 text-[9px] font-semibold '+tone+'">'+badge+'</span></div>'+ 
      '<div class="grid grid-cols-1 xl:grid-cols-2 gap-2">'+slotHtml(c,cs.slots[0],0)+slotHtml(c,cs.slots[1],1)+'</div></div>';
  }

  function render(){
    var x=panel(),pr=profile();if(!x||!pr)return;var state=load(),cov=coverage(state);
    var gateTone=cov.gate==='APPROVAL READY'?'border-emerald-800 text-emerald-300 bg-emerald-950/20':cov.gate==='BLOCKED'?'border-rose-800 text-rose-300 bg-rose-950/20':'border-amber-800 text-amber-300 bg-amber-950/20';
    x.innerHTML='<div class="mb-3 flex flex-wrap items-start justify-between gap-3"><div><div class="font-semibold text-slate-200"><i class="fa-solid fa-link mr-1.5 text-cyan-400"></i>Evidence-to-Component Mapping</div><div class="mt-1 max-w-3xl text-[10px] leading-relaxed text-slate-500">Every non-zero direct-cost component must be linked to auditable evidence. Primary-basis components require either one High Confidence/Verified price source (score ≥80) or two independent Acceptable price sources (score ≥70). Cost-driver evidence alone does not validate a primary price component.</div></div><span class="rounded border px-2 py-1 text-[10px] font-semibold '+gateTone+'">'+esc(cov.gate)+'</span></div>'+ 
      '<div class="mb-4 grid grid-cols-1 sm:grid-cols-4 gap-2"><div class="rounded border border-slate-800 px-3 py-2"><div class="text-[9px] uppercase text-slate-500">Evidence Coverage</div><div class="mt-1 font-mono-num font-semibold text-cyan-300">'+cov.coveragePct+'%</div></div><div class="rounded border border-slate-800 px-3 py-2"><div class="text-[9px] uppercase text-slate-500">Supported Cost</div><div class="mt-1 font-mono-num text-slate-300">'+money(cov.supportedAmount)+'</div></div><div class="rounded border border-slate-800 px-3 py-2"><div class="text-[9px] uppercase text-slate-500">Total Direct Cost</div><div class="mt-1 font-mono-num text-slate-300">'+money(cov.totalAmount)+'</div></div><div class="rounded border border-slate-800 px-3 py-2"><div class="text-[9px] uppercase text-slate-500">Critical Missing</div><div class="mt-1 font-mono-num '+(cov.criticalMissing.length?'text-rose-300':'text-emerald-300')+'">'+cov.criticalMissing.length+'</div></div></div>'+ 
      (cov.criticalMissing.length?'<div class="mb-3 rounded border border-rose-900 bg-rose-950/20 px-3 py-2 text-[10px] text-rose-300"><strong>Approval blocked:</strong> '+esc(cov.criticalMissing.join(' · '))+'</div>':'')+
      '<div class="space-y-3">'+pr.components.map(function(c){return componentHtml(c,state);}).join('')+'</div>'+ 
      '<p class="mt-3 text-[10px] leading-relaxed text-slate-500">Gate logic: BLOCKED when any non-zero primary component is unsupported or weighted evidence coverage is below 70%; REVIEW REQUIRED at 70–89%; APPROVAL READY at ≥90% with no critical gap. This is an evidence-governance gate and does not itself approve the procurement.</p>';
    x.querySelectorAll('[data-ec-field]').forEach(function(i){i.addEventListener('input',onEdit);i.addEventListener('change',onEdit);});
  }

  function onEdit(ev){
    var input=ev.target,slotNode=input.closest('[data-ec-slot]');if(!slotNode)return;
    var state=load(),c=slotNode.getAttribute('data-ec-component'),idx=Number(slotNode.getAttribute('data-ec-slot'))||0,cs=componentState(state,c),field=input.getAttribute('data-ec-field');
    cs.slots[idx][field]=field==='verified'?!!input.checked:input.value;save(state);render();
  }

  function exportMappings(){
    var state=load(),pr=profile();if(!pr)return {profileKey:profileKey(),subcategory:subcategory(),coverage:coverage(state),components:[]};
    return {profileKey:profileKey(),subcategory:subcategory(),coverage:coverage(state),components:pr.components.map(function(c){var cs=componentState(state,c.key),a=componentAssessment(c,state);return {key:c.key,label:c.label,primary:!!c.primary,amount:a.amount,supported:a.supported,confidence:a.confidence,evidence:cs.slots};})};
  }

  function patchAuditSources(){
    if(!window.CalcCore||!window.CalcCore.generateSources||window.CalcCore.__componentEvidencePatched)return;
    var original=window.CalcCore.generateSources;
    window.CalcCore.generateSources=function(input,researched){
      var sources=original(input,researched),m=exportMappings();
      (m.components||[]).forEach(function(c){
        (c.evidence||[]).forEach(function(slot,index){
          var a=slotAssessment(slot);if(!slot.sourceKey||!String(slot.reference||'').trim())return;
          sources.push({sourceKey:slot.sourceKey,name:'Component Evidence — '+c.label+' #'+(index+1),status:slot.verified?'USER PROVIDED':'UNAVAILABLE',publishedDate:slot.publishedDate||null,retrievedAt:new Date().toISOString(),trustScore:a.governance?a.governance.score:0,freshness:a.expired?'Stale':'Fresh',componentKey:c.key,componentLabel:c.label,componentAmount:c.amount,evidenceReference:slot.reference,validUntil:slot.validUntil||null,materialUseDecision:slot.decision,materialUseAllowed:a.usable,note:'Reviewer-attested evidence mapping. Reference is recorded for audit; no synthetic numerical benchmark is generated.'});
        });
      });
      return sources;
    };
    window.CalcCore.__componentEvidencePatched=true;
  }

  function bind(){
    document.addEventListener('input',function(ev){if(ev&&ev.target&&ev.target.hasAttribute&&ev.target.hasAttribute('data-ccu-key'))setTimeout(render,0);});
    document.addEventListener('change',function(ev){var id=ev&&ev.target&&ev.target.id;if(id==='projCategory'||id==='engineCategory'||id==='subCategory')setTimeout(render,20);});
  }
  function init(){
    if(initialized)return;if(!window.HPSCategoryCostUX||!byId('categoryCostProfilePanel')){setTimeout(init,150);return;}
    initialized=true;patchAuditSources();bind();render();
  }

  window.HPSEvidenceComponentUX={init:init,render:render,getCoverage:function(){return coverage(load());},exportMappings:exportMappings};
  if(document.readyState==='complete')setTimeout(init,0);else window.addEventListener('load',function(){setTimeout(init,0);});
})();
