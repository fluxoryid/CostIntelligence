/* advanced-intelligence.js — Phase 12 Advanced Procurement Intelligence.
 * Official BI/Kemenkeu FX normalization, historical-date comparison and a
 * transparent landed-cost scenario. No hidden buffer, tax rate or synthetic
 * market price is introduced. Duty/tax percentages are explicit user inputs.
 */
(function(){
  'use strict';
  var initialized=false;
  var state={currency:'IDR',current:null,historical:null,tax:null,lastError:null};
  var CURRENCIES=['IDR','USD','EUR','SGD','JPY','CNY','GBP','AUD','MYR','THB','KRW','HKD'];

  function byId(id){return document.getElementById(id);}
  function n(v){var x=Number(v);return isFinite(x)&&x>0?x:0;}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
  function fmt(v,d){if(v==null||!isFinite(Number(v)))return '—';return Number(v).toLocaleString('id-ID',{minimumFractionDigits:d||0,maximumFractionDigits:d||2});}
  function money(v){return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v)||0);}
  function minusDays(s,d){var x=new Date(s+'T00:00:00Z');if(!isFinite(x.getTime()))return '';x.setUTCDate(x.getUTCDate()-d);return x.toISOString().slice(0,10);}
  function unitRate(r){if(!r)return null;var rate=Number(r.rate),nom=Number(r.nominal)||1;return isFinite(rate)&&rate>0?rate/nom:null;}
  function json(url){return fetch(url,{headers:{Accept:'application/json'},cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();});}

  function ensureCurrencies(){
    var s=byId('baseCurrency');if(!s)return;
    var current=s.value||'IDR';
    CURRENCIES.forEach(function(c){if(!Array.from(s.options).some(function(o){return o.value===c;})){var o=document.createElement('option');o.value=c;o.textContent=c;s.appendChild(o);}});
    if(CURRENCIES.indexOf(current)!==-1)s.value=current;
  }

  function currentRate(currency){
    if(currency==='IDR')return Promise.resolve({currency:'IDR',rate:1,nominal:1,unitRate:1,source:'Indonesian Rupiah base currency',sourceMode:'BASE_CURRENCY',sourceState:'LIVE',retrievedAt:new Date().toISOString()});
    if(currency==='USD')return json('/api/fx-usd-idr').then(function(x){if(typeof x.rate!=='number')throw new Error('USD JISDOR unavailable');return Object.assign({},x,{currency:'USD',nominal:1,unitRate:x.rate});});
    return json('/api/bi-kurs?series=reference&mode=latest').then(function(x){var rows=(x.records||[]).filter(function(r){return String(r.currency||'').toUpperCase()===currency;});if(!rows.length)throw new Error('BI reference rate unavailable for '+currency);var r=rows[0];return {currency:currency,rate:r.rate,nominal:r.nominal||1,unitRate:unitRate(r),date:r.date,source:x.source||'Bank Indonesia reference rate',sourceMode:'OFFICIAL_BI_REFERENCE_NONUSD',sourceState:x.sourceState||'LIVE',retrievedAt:x.retrievedAt||new Date().toISOString()};});
  }

  function historicalRate(currency,date){
    if(!date||currency==='IDR')return Promise.resolve(currency==='IDR'?{currency:'IDR',rate:1,nominal:1,unitRate:1,date:date,source:'IDR base currency',sourceState:'LIVE'}:null);
    var series=currency==='USD'?'jisdor':'reference',start=minusDays(date,10);
    return json('/api/bi-kurs?series='+series+'&mode=range&currency='+encodeURIComponent(currency)+'&start='+encodeURIComponent(start)+'&end='+encodeURIComponent(date)).then(function(x){var rows=(x.records||[]).filter(function(r){return String(r.currency||'').toUpperCase()===currency&&r.date&&r.date<=date&&unitRate(r);});rows.sort(function(a,b){return String(b.date).localeCompare(String(a.date));});if(!rows.length)throw new Error('Historical BI '+currency+' rate unavailable');var r=rows[0];return {currency:currency,rate:r.rate,nominal:r.nominal||1,unitRate:unitRate(r),date:r.date,source:x.source||'Bank Indonesia historical reference',sourceMode:currency==='USD'?'OFFICIAL_BI_WSKURSBI_HISTORICAL':'OFFICIAL_BI_REFERENCE_HISTORICAL',sourceState:x.sourceState||'LIVE',retrievedAt:x.retrievedAt||new Date().toISOString()};});
  }

  function taxRate(currency){
    if(currency==='IDR')return Promise.resolve({currency:'IDR',rate:1,source:'IDR base currency',sourceState:'LIVE'});
    return json('/api/kurs-pajak?currency='+encodeURIComponent(currency)).then(function(x){if(typeof x.rate!=='number')throw new Error('Kurs Pajak unavailable');return Object.assign({},x,{unitRate:x.rate,sourceState:'LIVE'});});
  }

  function sync(){
    ensureCurrencies();var cur=byId('baseCurrency')?byId('baseCurrency').value:'IDR',date=byId('historicalPurchaseDate')&&byId('historicalPurchaseDate').value;
    state.currency=cur;state.lastError=null;
    return Promise.allSettled([currentRate(cur),historicalRate(cur,date),taxRate(cur)]).then(function(res){
      state.current=res[0].status==='fulfilled'?res[0].value:null;
      state.historical=res[1].status==='fulfilled'?res[1].value:null;
      state.tax=res[2].status==='fulfilled'?res[2].value:null;
      state.lastError=res.filter(function(x){return x.status==='rejected';}).map(function(x){return x.reason&&x.reason.message||String(x.reason);}).join(' · ')||null;
      var fx=byId('fxRateInput');if(fx&&state.current&&state.current.unitRate)fx.value=Math.round(state.current.unitRate*10000)/10000;
      render();return state;
    });
  }

  function profileDrivers(){
    var c=byId('engineCategory'),cat=window.CalcCore&&window.CalcCore.CATEGORIES&&c&&window.CalcCore.CATEGORIES[c.value];
    return cat&&Array.isArray(cat.drivers)?cat.drivers:[];
  }
  function driverHtml(){var d=profileDrivers();return d.slice(0,8).map(function(x){return '<span class="rounded border border-slate-700 px-1.5 py-0.5">'+esc(x.name)+' · '+Math.round((x.weight||0)*100)+'% profile</span>';}).join(' ');}

  function calcScenario(){
    var amount=n(byId('advForeignUnit')&&byId('advForeignUnit').value),qty=n(byId('advQty')&&byId('advQty').value)||1,commercial=state.current&&state.current.unitRate||0,taxfx=state.tax&&state.tax.unitRate||0;
    var freight=n(byId('advFreight')&&byId('advFreight').value),insurance=n(byId('advInsurance')&&byId('advInsurance').value),dutyPct=n(byId('advDutyPct')&&byId('advDutyPct').value),taxPct=n(byId('advImportTaxPct')&&byId('advImportTaxPct').value),other=n(byId('advOtherImport')&&byId('advOtherImport').value);
    var commercialIdr=amount*qty*commercial;
    var customsBase=amount*qty*(taxfx||commercial)+freight+insurance;
    var duty=customsBase*(dutyPct/100),taxBase=customsBase+duty+other,importTax=taxBase*(taxPct/100),landed=customsBase+duty+other+importTax;
    return {amount:amount,qty:qty,commercialRate:commercial,taxRate:taxfx,commercialIdr:commercialIdr,customsBase:customsBase,duty:duty,importTax:importTax,other:other,landed:landed};
  }

  function panel(){var x=byId('advancedIntelPanel');if(x)return x;var anchor=byId('documentEvidenceHub')||byId('componentEvidencePanel');if(!anchor||!anchor.parentElement)return null;x=document.createElement('div');x.id='advancedIntelPanel';x.className='p-4 rounded-lg border border-slate-800 bg-slate-950/30';if(anchor.nextSibling)anchor.parentElement.insertBefore(x,anchor.nextSibling);else anchor.parentElement.appendChild(x);return x;}

  function render(){
    var x=panel();if(!x)return;var c=state.current,h=state.historical,t=state.tax,sc=calcScenario(),histDelta=c&&h&&h.unitRate?((c.unitRate/h.unitRate)-1)*100:null;
    x.innerHTML='<div class="flex flex-wrap items-start justify-between gap-3"><div><div class="font-semibold text-slate-200"><i class="fa-solid fa-chart-line mr-1.5 text-cyan-400"></i>Advanced Procurement Intelligence</div><div class="mt-1 text-[10px] text-slate-500">Official FX/date normalization and transparent landed-cost scenario. JISDOR = commercial USD reference; BI non-USD reference = non-USD normalization; Kemenkeu Kurs Pajak = customs/tax conversion.</div></div><button id="btnAdvSync" type="button" class="px-2.5 py-1 rounded bg-slate-700 text-[10px] text-white"><i class="fa-solid fa-rotate mr-1"></i>Refresh</button></div>'+ 
      '<div class="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2"><div class="rounded border border-slate-800 p-2"><div class="text-[9px] uppercase text-slate-500">Current '+esc(state.currency)+'/IDR</div><div class="mt-1 font-mono-num text-cyan-300">'+fmt(c&&c.unitRate,4)+'</div><div class="text-[9px] text-slate-500">'+esc(c&&c.source||'UNAVAILABLE')+'</div></div><div class="rounded border border-slate-800 p-2"><div class="text-[9px] uppercase text-slate-500">Historical baseline</div><div class="mt-1 font-mono-num text-slate-300">'+fmt(h&&h.unitRate,4)+'</div><div class="text-[9px] text-slate-500">'+esc(h&&h.date||'No historical date selected')+(histDelta!=null?' · Δ '+histDelta.toFixed(2)+'%':'')+'</div></div><div class="rounded border border-slate-800 p-2"><div class="text-[9px] uppercase text-slate-500">Kurs Pajak '+esc(state.currency)+'/IDR</div><div class="mt-1 font-mono-num text-amber-300">'+fmt(t&&t.unitRate,4)+'</div><div class="text-[9px] text-slate-500">'+esc(t&&t.effectivePeriod||t&&t.source||'UNAVAILABLE')+'</div></div></div>'+ 
      (state.lastError?'<div class="mt-2 text-[9px] text-amber-300">'+esc(state.lastError)+'</div>':'')+
      '<details class="mt-3 rounded border border-slate-800 bg-slate-900/30 px-3 py-2" open><summary class="cursor-pointer text-[10px] font-medium text-slate-300">Foreign Price Normalization & Landed-Cost Scenario</summary><div class="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2"><div><label class="text-[9px] text-slate-500">Foreign unit amount ('+esc(state.currency)+')</label><input id="advForeignUnit" type="number" min="0" step="any" class="field compact font-mono-num" /></div><div><label class="text-[9px] text-slate-500">Quantity</label><input id="advQty" type="number" min="0" step="any" value="1" class="field compact font-mono-num" /></div><div><label class="text-[9px] text-slate-500">Freight IDR</label><input id="advFreight" type="number" min="0" class="field compact font-mono-num" /></div><div><label class="text-[9px] text-slate-500">Insurance IDR</label><input id="advInsurance" type="number" min="0" class="field compact font-mono-num" /></div><div><label class="text-[9px] text-slate-500">Import duty (%) — user verified</label><input id="advDutyPct" type="number" min="0" step="0.01" class="field compact font-mono-num" /></div><div><label class="text-[9px] text-slate-500">Import VAT/tax (%) — user verified</label><input id="advImportTaxPct" type="number" min="0" step="0.01" class="field compact font-mono-num" /></div><div><label class="text-[9px] text-slate-500">Other customs/handling IDR</label><input id="advOtherImport" type="number" min="0" class="field compact font-mono-num" /></div></div><div class="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2"><div class="rounded border border-slate-800 p-2"><div class="text-[9px] text-slate-500">Commercial IDR</div><div id="advCommercialOut" class="font-mono-num text-slate-300">'+money(sc.commercialIdr)+'</div></div><div class="rounded border border-slate-800 p-2"><div class="text-[9px] text-slate-500">Customs Base</div><div id="advCustomsOut" class="font-mono-num text-slate-300">'+money(sc.customsBase)+'</div></div><div class="rounded border border-slate-800 p-2"><div class="text-[9px] text-slate-500">Duty + Import Tax</div><div id="advTaxOut" class="font-mono-num text-slate-300">'+money(sc.duty+sc.importTax)+'</div></div><div class="rounded border border-cyan-900 p-2"><div class="text-[9px] text-slate-500">Landed Scenario</div><div id="advLandedOut" class="font-mono-num text-cyan-300">'+money(sc.landed)+'</div></div></div><div class="mt-2 flex flex-wrap gap-2"><button id="btnApplyCommercial" type="button" class="px-2.5 py-1 rounded bg-cyan-800 text-white text-[10px]">Apply normalized unit price to primary component</button></div><p class="mt-2 text-[9px] text-slate-500">This landed-cost view is a scenario, not a tax ruling. Duty/tax percentages must be verified against DJBC/Kemenkeu and the correct HS classification. Freight/insurance remain explicit to prevent double counting.</p></details>'+ 
      '<details class="mt-3"><summary class="cursor-pointer text-[10px] font-medium text-slate-400">Category applicability profile</summary><div class="mt-2 flex flex-wrap gap-1 text-[9px] text-slate-500">'+driverHtml()+'</div></details>';
    ['advForeignUnit','advQty','advFreight','advInsurance','advDutyPct','advImportTaxPct','advOtherImport'].forEach(function(id){var e=byId(id);if(e){e.addEventListener('input',updateOutputs);}});
    var b=byId('btnAdvSync');if(b)b.addEventListener('click',sync);var a=byId('btnApplyCommercial');if(a)a.addEventListener('click',applyPrimary);
  }

  function updateOutputs(){var s=calcScenario();if(byId('advCommercialOut'))byId('advCommercialOut').textContent=money(s.commercialIdr);if(byId('advCustomsOut'))byId('advCustomsOut').textContent=money(s.customsBase);if(byId('advTaxOut'))byId('advTaxOut').textContent=money(s.duty+s.importTax);if(byId('advLandedOut'))byId('advLandedOut').textContent=money(s.landed);}
  function applyPrimary(){
    var s=calcScenario();if(!s.amount||!s.commercialRate){window.alert('Enter a foreign unit amount and retrieve an official current FX rate first.');return;}
    var pr=window.HPSCategoryCostUX&&window.HPSCategoryCostUX.PROFILES,pk=byId('categoryCostProfilePanel')&&byId('categoryCostProfilePanel').dataset.profileKey,p=pr&&(pr[pk]||pr['services|Other']),primary=p&&p.components&&p.components.filter(function(c){return c.primary;})[0];if(!primary){window.alert('No primary cost component is defined.');return;}
    var unit=s.amount*s.commercialRate,panel=byId('categoryCostProfilePanel');
    if(primary.basis==='qtyRate'){var q=panel.querySelector('[data-ccu-key="'+primary.key+'_qty"]'),r=panel.querySelector('[data-ccu-key="'+primary.key+'_rate"]');if(q)q.value=s.qty||1;if(r)r.value=unit;if(r){r.dispatchEvent(new Event('input',{bubbles:true}));r.dispatchEvent(new Event('change',{bubbles:true}));}}
    else{var a=panel.querySelector('[data-ccu-key="'+primary.key+'_amount"]');if(a){a.value=unit*(s.qty||1);a.dispatchEvent(new Event('input',{bubbles:true}));a.dispatchEvent(new Event('change',{bubbles:true}));}}
  }

  function bind(){
    var cur=byId('baseCurrency');if(cur)cur.addEventListener('change',sync);
    document.addEventListener('change',function(ev){var id=ev&&ev.target&&ev.target.id;if(id==='historicalPurchaseDate'||id==='engineCategory'||id==='projCategory'||id==='subCategory')setTimeout(sync,20);});
  }
  function init(){if(initialized)return;if(!byId('baseCurrency')||!byId('categoryCostProfilePanel')){setTimeout(init,150);return;}initialized=true;ensureCurrencies();bind();sync();}

  window.HPSAdvancedIntel={init:init,sync:sync,getState:function(){return JSON.parse(JSON.stringify(state));},calcScenario:calcScenario};
  if(document.readyState==='complete')setTimeout(init,0);else window.addEventListener('load',function(){setTimeout(init,0);});
})();
