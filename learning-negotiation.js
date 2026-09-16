/* learning-negotiation.js — Phase 13 Governed Learning & Negotiation Intelligence.
 * Uses only approved historical outcomes for category-level learning. Proposed
 * negotiation targets are decision support, never automatic approval or vendor
 * selection. New outcomes enter PENDING learning status until Manager/Head approval.
 */
(function(){
  'use strict';
  var initialized=false,approved=[],pending=[];

  function byId(id){return document.getElementById(id);}
  function n(v){var x=Number(v);return isFinite(x)&&x>0?x:0;}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
  function money(v){return v&&isFinite(Number(v))?new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v)):'—';}
  function domMoney(id){var e=byId(id);if(!e)return 0;var s=String(e.textContent||'').replace(/[^0-9,-]/g,'').replace(/\./g,'').replace(',','.');return n(s);}
  function percentile(arr,p){if(!arr.length)return null;var a=arr.slice().sort(function(x,y){return x-y;}),i=(a.length-1)*p,l=Math.floor(i),h=Math.ceil(i);return l===h?a[l]:a[l]+(a[h]-a[l])*(i-l);}
  function category(){return byId('engineCategory')?byId('engineCategory').value:'Other';}
  function subcategory(){return byId('subCategory')?byId('subCategory').value:null;}
  function requestId(){return window.HPSCloud&&window.HPSCloud.getCurrentRequestId?window.HPSCloud.getCurrentRequestId():null;}

  function outcomeDiscount(x){
    if(!x)return null;
    var d=Number(x.negotiationDiscountPct!=null?x.negotiationDiscountPct:x.achievedDiscountPct!=null?x.achievedDiscountPct:x.discountPct);
    if(isFinite(d)&&d>=0&&d<100)return d;
    var initial=n(x.initialOffer||x.initial_offer),final=n(x.finalOffer||x.final_offer);
    return initial&&final&&final<=initial?((initial-final)/initial)*100:null;
  }
  function relevant(){return approved.filter(function(x){return (x.category||x.input&&x.input.category)===category();});}
  function stats(){
    var rows=relevant(),discounts=rows.map(outcomeDiscount).filter(function(x){return x!=null&&isFinite(x);});
    var maturity=discounts.length>=12?'MATURE':discounts.length>=6?'ESTABLISHED':discounts.length>=3?'EMERGING':'INSUFFICIENT';
    return {count:discounts.length,maturity:maturity,p25:percentile(discounts,.25),median:percentile(discounts,.5),p75:percentile(discounts,.75),discounts:discounts};
  }
  function vendorOffer(){var vals=[n(byId('v1Price')&&byId('v1Price').value),n(byId('v2Price')&&byId('v2Price').value)].filter(Boolean);return vals.length?Math.min.apply(Math,vals):0;}
  function target(){
    var s=stats(),offer=vendorOffer(),hps=domMoney('hpsGrossDisplay');
    if(s.count<3||!offer||!hps)return {available:false,reason:s.count<3?'At least 3 approved comparable outcomes are required.':'Enter current vendor offer and obtain HPS first.',stats:s};
    var mid=offer*(1-s.median/100),low=offer*(1-(s.p75||s.median)/100),high=offer*(1-(s.p25||s.median)/100);
    return {available:true,offer:offer,hps:hps,target:Math.min(hps,mid),low:Math.min(hps,low),high:Math.min(hps,high),stats:s};
  }

  function panel(){var x=byId('learningNegotiationPanel');if(x)return x;var anchor=byId('advancedIntelPanel')||byId('workflowRbacPanel')||byId('documentEvidenceHub');if(!anchor||!anchor.parentElement)return null;x=document.createElement('div');x.id='learningNegotiationPanel';x.className='p-4 rounded-lg border border-slate-800 bg-slate-950/30';if(anchor.nextSibling)anchor.parentElement.insertBefore(x,anchor.nextSibling);else anchor.parentElement.appendChild(x);return x;}

  function pendingHtml(){
    if(!pending.length)return '<div class="text-[10px] text-slate-500">No pending learning outcomes visible to your role.</div>';
    return pending.slice(0,10).map(function(x){var d=x.data||{};return '<div class="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 px-2 py-2"><div><div class="text-[10px] text-slate-300">'+esc(x.category)+' · '+esc(d.supplierName||d.supplier_name||'Supplier')+'</div><div class="text-[9px] text-slate-500">Discount '+(outcomeDiscount(d)!=null?outcomeDiscount(d).toFixed(2)+'%':'—')+' · '+esc(x.created_at||'')+'</div></div><div class="flex gap-1"><button data-learn-approve="'+esc(x.id)+'" class="rounded bg-emerald-800 px-2 py-1 text-[9px] text-white">Approve Learning</button><button data-learn-reject="'+esc(x.id)+'" class="rounded bg-slate-700 px-2 py-1 text-[9px] text-white">Keep Excluded</button></div></div>';}).join('');
  }

  function render(){
    var x=panel();if(!x)return;var s=stats(),t=target();
    x.innerHTML='<div class="flex flex-wrap items-start justify-between gap-3"><div><div class="font-semibold text-slate-200"><i class="fa-solid fa-brain mr-1.5 text-cyan-400"></i>Governed Learning & Negotiation Intelligence</div><div class="mt-1 text-[10px] text-slate-500">Learning uses only Manager/Head-approved outcomes from the same category. Recommendations remain human-reviewed decision support.</div></div><span class="rounded border border-slate-700 px-2 py-1 text-[9px] text-slate-400">'+esc(s.maturity)+' · '+s.count+' APPROVED OUTCOMES</span></div>'+ 
      '<div class="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-2"><div class="rounded border border-slate-800 p-2"><div class="text-[9px] uppercase text-slate-500">Median Achieved Discount</div><div class="font-mono-num text-cyan-300">'+(s.median!=null?s.median.toFixed(2)+'%':'—')+'</div></div><div class="rounded border border-slate-800 p-2"><div class="text-[9px] uppercase text-slate-500">P25–P75</div><div class="font-mono-num text-slate-300">'+(s.p25!=null?s.p25.toFixed(2)+'% – '+s.p75.toFixed(2)+'%':'—')+'</div></div><div class="rounded border border-slate-800 p-2"><div class="text-[9px] uppercase text-slate-500">Current HPS Gross</div><div class="font-mono-num text-slate-300">'+money(t.hps||domMoney('hpsGrossDisplay'))+'</div></div><div class="rounded border border-cyan-900 p-2"><div class="text-[9px] uppercase text-slate-500">Historical-Evidence Target</div><div class="font-mono-num text-cyan-300">'+(t.available?money(t.target):'—')+'</div></div></div>'+ 
      (t.available?'<div class="mt-2 rounded border border-cyan-900/60 bg-cyan-950/10 px-3 py-2 text-[10px] text-slate-400">Reference negotiation range from approved category outcomes: <strong class="text-slate-200">'+money(t.low)+' – '+money(t.high)+'</strong>. Target midpoint capped at current HPS: <strong class="text-cyan-300">'+money(t.target)+'</strong>. This does not guarantee market acceptance and does not select a supplier.</div>':'<div class="mt-2 text-[10px] text-amber-300">'+esc(t.reason)+'</div>')+
      '<details class="mt-3 rounded border border-slate-800 bg-slate-900/30 px-3 py-2"><summary class="cursor-pointer text-[10px] font-medium text-slate-300">Record Negotiation Outcome</summary><div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2"><input id="learnSupplier" class="field compact" placeholder="Supplier / vendor" /><input id="learnInitial" type="number" min="0" class="field compact font-mono-num" placeholder="Initial offer (IDR)" /><input id="learnFinal" type="number" min="0" class="field compact font-mono-num" placeholder="Final negotiated price (IDR)" /><input id="learnTarget" type="number" min="0" class="field compact font-mono-num" value="'+(t.available?Math.round(t.target):'')+'" placeholder="Negotiation target used (IDR)" /></div><div class="mt-2"><button id="btnLearnSave" class="rounded bg-cyan-800 px-3 py-1.5 text-[10px] text-white">Save Outcome → Pending Learning Approval</button><span id="learnStatus" class="ml-2 text-[10px] text-slate-500"></span></div></details>'+ 
      '<details class="mt-3"><summary class="cursor-pointer text-[10px] font-medium text-slate-400">Learning approval queue</summary><div class="mt-2 space-y-2">'+pendingHtml()+'</div></details>';
    var b=byId('btnLearnSave');if(b)b.addEventListener('click',saveOutcome);
    x.querySelectorAll('[data-learn-approve]').forEach(function(b){b.addEventListener('click',function(){approveOutcome(b.getAttribute('data-learn-approve'),true);});});
    x.querySelectorAll('[data-learn-reject]').forEach(function(b){b.addEventListener('click',function(){approveOutcome(b.getAttribute('data-learn-reject'),false);});});
  }

  function saveOutcome(){
    var supplier=(byId('learnSupplier')&&byId('learnSupplier').value||'').trim(),initial=n(byId('learnInitial')&&byId('learnInitial').value),final=n(byId('learnFinal')&&byId('learnFinal').value),targetVal=n(byId('learnTarget')&&byId('learnTarget').value),hps=domMoney('hpsGrossDisplay'),st=byId('learnStatus');
    if(!supplier||!initial||!final||final>initial){if(st)st.textContent='Enter supplier and valid initial/final prices (final ≤ initial).';return;}
    var event={requestId:requestId(),category:category(),subcategory:subcategory(),supplierName:supplier,initialOffer:initial,finalOffer:final,hpsValue:hps||null,targetValue:targetVal||null,negotiationDiscountPct:((initial-final)/initial)*100,sourceMode:'APPROVED_WORKFLOW_OUTCOME_PENDING',recordedAt:new Date().toISOString()};
    if(!window.HPSCloud){if(st)st.textContent='Cloud backend required.';return;}
    Promise.all([window.HPSCloud.saveNegotiationOutcome(event),window.HPSCloud.pushLearningOutcome(event)]).then(function(res){if(res.some(function(r){return r&&r.error;}))throw new Error(res.map(function(r){return r&&r.error;}).filter(Boolean).join(' · '));if(st)st.textContent='Saved. Learning remains excluded until Manager/Head approval.';return refresh();}).catch(function(e){if(st)st.textContent=e.message||String(e);});
  }

  function loadPending(){
    if(!window.HPSAuth||!window.HPSAuth.getClient||!window.HPSAuth.getClient())return Promise.resolve([]);
    var c=window.HPSAuth.getClient(),tenant=(window.HPS_CONFIG&&window.HPS_CONFIG.TENANT_ID)||'default-org';
    return window.HPSAuth.getSession().then(function(u){if(!u||['Manager','Procurement Head/Admin'].indexOf((u.role==='Approver'?'Manager':u.role==='Admin'?'Procurement Head/Admin':u.role))===-1)return[];return c.from('hps_learning_outcomes').select('*').eq('tenant_id',tenant).eq('approved_for_learning',false).order('created_at',{ascending:false}).limit(25).then(function(r){return r.error?[]:(r.data||[]);});}).catch(function(){return[];});
  }
  function approveOutcome(id,approve){if(!window.HPSCloud||!window.HPSCloud.approveLearningOutcome)return;window.HPSCloud.approveLearningOutcome(id,approve).then(function(r){if(r&&r.error)window.alert(r.error);else refresh();});}
  function refresh(){
    var p1=window.HPSCloud&&window.HPSCloud.pullLearning?window.HPSCloud.pullLearning():Promise.resolve([]),p2=loadPending();
    return Promise.all([p1,p2]).then(function(v){approved=v[0]||[];pending=v[1]||[];render();return{approved:approved,pending:pending};});
  }
  function bind(){['v1Price','v2Price','engineCategory','subCategory'].forEach(function(id){var e=byId(id);if(e)e.addEventListener('change',render);});}
  function init(){if(initialized)return;if(!byId('hpsGrossDisplay')){setTimeout(init,150);return;}initialized=true;bind();refresh();}

  window.HPSLearningNegotiation={init:init,refresh:refresh,getStats:stats,getTarget:target,getApproved:function(){return approved.slice();}};
  if(typeof module!=='undefined'&&module.exports)module.exports={percentile:percentile,outcomeDiscount:outcomeDiscount};
  if(document.readyState==='complete')setTimeout(init,0);else window.addEventListener('load',function(){setTimeout(init,0);});
})();
