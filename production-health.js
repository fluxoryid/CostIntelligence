/* production-health.js — Phase 14 runtime readiness and operational checks. */
(function(){
  'use strict';
  var initialized=false,last=null;
  function byId(id){return document.getElementById(id);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&quot;',"'":'&#39;'})[c];});}
  function json(url){var t=Date.now();return fetch(url+(url.indexOf('?')>=0?'&':'?')+'_health='+t,{headers:{Accept:'application/json'},cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();});}
  function check(name,promise,required){return promise.then(function(data){return{name:name,ok:!(data&&data.error),required:!!required,data:data};}).catch(function(e){return{name:name,ok:false,required:!!required,error:e.message||String(e)};});}
  function panel(){var x=byId('productionHealthPanel');if(x)return x;var anchor=byId('learningNegotiationPanel')||byId('advancedIntelPanel');if(!anchor||!anchor.parentElement)return null;x=document.createElement('div');x.id='productionHealthPanel';x.className='p-4 rounded-lg border border-slate-800 bg-slate-950/30';if(anchor.nextSibling)anchor.parentElement.insertBefore(x,anchor.nextSibling);else anchor.parentElement.appendChild(x);return x;}
  function badge(ok,required){return ok?'border-emerald-800 text-emerald-300':required?'border-rose-800 text-rose-300':'border-amber-800 text-amber-300';}
  function render(){var x=panel();if(!x)return;if(!last){x.innerHTML='<div class="text-[10px] text-slate-500">Production health checks not run yet.</div>';return;}var reqFail=last.checks.filter(function(c){return c.required&&!c.ok;}).length,optFail=last.checks.filter(function(c){return !c.required&&!c.ok;}).length;var state=reqFail?'NOT READY':optFail?'DEGRADED':'READY';var tone=reqFail?'text-rose-300':optFail?'text-amber-300':'text-emerald-300';x.innerHTML='<div class="flex flex-wrap items-start justify-between gap-3"><div><div class="font-semibold text-slate-200"><i class="fa-solid fa-heart-pulse mr-1.5 text-cyan-400"></i>Production Readiness Monitor</div><div class="mt-1 text-[10px] text-slate-500">Runtime, backend and official-provider smoke checks. Category-specific evidence applicability remains governed by the HPS engine.</div></div><div class="text-right"><div class="text-[9px] uppercase text-slate-500">Platform</div><div class="font-semibold '+tone+'">'+state+'</div></div></div><div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">'+last.checks.map(function(c){return '<div class="rounded border border-slate-800 px-3 py-2 flex items-start justify-between gap-2"><div><div class="text-[10px] text-slate-300">'+esc(c.name)+'</div><div class="text-[9px] text-slate-500">'+esc(c.error||summary(c.data))+'</div></div><span class="shrink-0 rounded border px-1.5 py-0.5 text-[9px] '+badge(c.ok,c.required)+'">'+(c.ok?'PASS':c.required?'FAIL':'WARN')+'</span></div>';}).join('')+'</div><div class="mt-3 flex items-center gap-2"><button id="btnHealthRun" class="rounded bg-slate-700 px-3 py-1.5 text-[10px] text-white"><i class="fa-solid fa-rotate mr-1"></i>Run Checks</button><span class="text-[9px] text-slate-500">Last run '+esc(last.at)+'</span></div>';var b=byId('btnHealthRun');if(b)b.addEventListener('click',run);}
  function summary(d){if(!d)return 'No response';if(d.buildId)return d.buildId;if(d.status)return String(d.status);if(d.sourceState)return String(d.sourceState);if(d.source)return String(d.source).slice(0,90);return 'OK';}
  function run(){
    var expected=(window.HPS_CONFIG&&window.HPS_CONFIG.EXPECTED_WORKER_BUILD)||null;
    var versionCheck=check('Worker build / API version',json('/api/version').then(function(v){if(expected&&v.buildId!==expected)throw new Error('Expected '+expected+', got '+v.buildId);return v;}),true);
    var cloud=window.HPSCloud&&window.HPSCloud.health?check('Supabase Auth / tenant backend',window.HPSCloud.health().then(function(h){if(!h.configured)throw new Error('Supabase not configured');if(h.status!=='AUTHENTICATED')throw new Error(h.status);return h;}),true):Promise.resolve({name:'Supabase Auth / tenant backend',ok:false,required:true,error:'HPSCloud unavailable'});
    var localChecks=Promise.resolve({name:'Browser security primitives',ok:!!(window.crypto&&window.crypto.subtle&&window.fetch),required:true,data:{status:(window.crypto&&window.crypto.subtle)?'WebCrypto + Fetch available':'Missing WebCrypto'}});
    var modules=Promise.resolve({name:'Governance modules',ok:!!(window.HPSSourceEngine&&window.HPSEvidenceComponentUX&&window.HPSWorkflow&&window.HPSDocumentHub&&window.HPSAdvancedIntel&&window.HPSLearningNegotiation),required:true,data:{status:'Source/Evidence/Workflow/Document/Advanced/Learning modules'}});
    Promise.all([
      versionCheck,cloud,localChecks,modules,
      check('Bank Indonesia JISDOR',json('/api/fx-usd-idr'),false),
      check('BPS inflation',json('/api/bps-inflation'),false),
      check('Kemenkeu Kurs Pajak',json('/api/kurs-pajak?currency=USD'),false),
      check('LKPP official catalog status',json('/api/lkpp-status'),false),
      check('ESDM regulation source',json('/api/esdm-electricity'),false)
    ]).then(function(checks){last={at:new Date().toISOString(),checks:checks};render();});
  }
  function init(){if(initialized)return;if(!byId('learningNegotiationPanel')){setTimeout(init,150);return;}initialized=true;render();setTimeout(run,500);}
  window.HPSProductionHealth={init:init,run:run,getLast:function(){return last;}};
  if(document.readyState==='complete')setTimeout(init,0);else window.addEventListener('load',function(){setTimeout(init,0);});
})();
