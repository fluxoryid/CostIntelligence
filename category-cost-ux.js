/* category-cost-ux.js — category-dependent HPS cost-component forms.
 * No price is invented here. Every amount is explicitly entered by the user,
 * persisted locally, and bridged into the existing deterministic owner build-up.
 */
(function () {
  'use strict';

  var STORE = 'hps_category_cost_v1_';
  var initialized = false, syncing = false;

  var PROFILES = {
    'goods|IT Hardware': p('IT Hardware / Equipment Cost Structure','Use OEM/principal pricing and landed-cost evidence. General CPI is contextual only.',[
      q('oemUnit','OEM / Principal Unit Price','material',true,'Qty Units','Unit Price (IDR)'),
      a('freight','Freight & Import Logistics','material'), a('insurance','Cargo / Transit Insurance','material'),
      a('customs','Import Duty, Customs & Handling','material'), q('implementation','Installation / Configuration','labor',false,'Mandays','Rate / Manday'),
      a('support','Local Support / Warranty Extension','material')
    ],[
      e('Principal/OEM quotation or official price list','PRIMARY'), e('Internal PO / signed contract / paid invoice','PRIMARY'),
      e('BI JISDOR for foreign-currency exposure','CONDITIONAL'), e('Kemenkeu Kurs Pajak + DJBC tariff for import exposure','CONDITIONAL'),
      e('Freight / insurance quotation','CONDITIONAL'), e('Approved specification / BOQ / delivery terms','PRIMARY')
    ]),
    'goods|Data Center': p('Data Center Equipment Cost Structure','Treat infrastructure equipment as landed hardware with installation and support separated.',[
      q('equipment','Principal / OEM Equipment Price','material',true,'Qty Units','Unit Price'), a('freight','Freight & Import Logistics','material'),
      a('customs','Import Duty / Customs / Handling','material'), q('installation','Installation / Commissioning','labor',false,'Mandays','Rate / Manday'),
      a('support','Support / Warranty / Maintenance','material')
    ],[
      e('Principal/OEM quotation','PRIMARY'), e('Internal PO / contract / invoice','PRIMARY'), e('BI JISDOR','CONDITIONAL'),
      e('Kemenkeu Kurs Pajak + DJBC tariff','CONDITIONAL'), e('Freight quotation','CONDITIONAL'), e('Implementation SOW / support SLA','PRIMARY')
    ]),
    'goods|Other': p('General Goods Cost Structure','Use the most specific category benchmark available before a general index.',[
      q('goods','Primary Goods / Unit Price','material',true,'Qty','Unit Price'), a('freight','Freight / Delivery','material'),
      a('installation','Installation / Setup','labor'), a('other','Other Direct Cost','material')
    ],[
      e('Comparable quotation / principal / distributor price','PRIMARY'), e('Internal transaction history','PRIMARY'),
      e('Specification and quantity','PRIMARY'), e('Freight / delivery evidence','CONDITIONAL'),
      e('BPS CPI only as approved proxy where no specific index exists','CONDITIONAL')
    ]),
    'services|Software/SaaS': p('Software / SaaS Cost Structure','Prioritize principal subscription metrics, contract term, currency and implementation scope.',[
      q('license','License / Subscription','material',true,'Licenses / Units','Rate per License / Period'), q('implementation','Implementation / Configuration','labor',false,'Mandays','Rate / Manday'),
      a('migration','Migration / Integration Service','labor'), a('support','Maintenance / Premium Support','material'), a('usage','Cloud / Consumption / Platform Usage','material')
    ],[
      e('Principal/OEM commercial quotation','PRIMARY'), e('License metric / subscription tier / contract term','PRIMARY'),
      e('Internal historical contract / PO / invoice','PRIMARY'), e('BI reference FX when billed in foreign currency','CONDITIONAL'),
      e('SOW, implementation plan and support tier','PRIMARY'), e('Authorized reseller quotation','SUPPORTING')
    ]),
    'services|Manpower/BPO': p('Manpower / BPO Cost Structure','Use wage regulation and role-specific manpower evidence; broad CPI must not replace UMP/UMK/UMSK.',[
      q('headcount','Base Manpower / Service Rate','labor',true,'Headcount / FTE','Monthly Rate / FTE'), a('thr','THR Provision','labor'),
      a('bpjs','BPJS & Statutory Contributions','labor'), a('overtime','Overtime / Shift Provision','labor'),
      a('supervision','Supervisor / Team Lead Cost','labor'), a('tools','Tools, Uniform, Device & Operational Cost','material')
    ],[
      e('Current UMP/UMK/UMSK decree / JDIH','PRIMARY'), e('Role salary or internal manpower benchmark','PRIMARY'),
      e('BPJS / THR / statutory assumptions','PRIMARY'), e('Vendor manpower cost breakdown','PRIMARY'),
      e('Headcount, shift, attendance and SLA assumptions','PRIMARY'), e('Historical BPO contract / invoice','SUPPORTING')
    ]),
    'services|Data Center': p('Data Center / Colocation Cost Structure','Separate space, power, cross-connect and SLA charges to prevent double counting.',[
      q('space','Dedicated Colocation / Rack Space','material',true,'m² / Rack / Cabinet','Monthly Rate'), q('power','Power Capacity','material',false,'kVA / kW','Monthly Rate / Capacity'),
      q('crossConnect','Cross / Direct Connect MRC','material',false,'Connections','Monthly Rate'), a('otc','Setup / OTC / Installation','material'),
      q('remoteHands','Remote Hands / Operational Support','labor',false,'Hours / Mandays','Service Rate'), a('sla','Premium SLA / Managed Service Add-on','material')
    ],[
      e('Provider signed contract / historical invoice / rate card','PRIMARY'), e('Space, rack and power allocation','PRIMARY'),
      e('ESDM tariff regulation / power cost-driver evidence','COST DRIVER'), e('BI JISDOR for imported equipment exposure','CONDITIONAL'),
      e('Cross-connect / OTC rate card','PRIMARY'), e('Facility tier, SLA and support scope','PRIMARY')
    ]),
    'services|Logistics': p('Logistics / Distribution Cost Structure','Use route, shipment volume and executable carrier evidence. Fuel indices are cost drivers, not direct freight quotes.',[
      q('freight','Freight / Trip / Shipment Charge','material',true,'Trips / Shipments','Rate / Trip / Shipment'), a('fuel','Fuel Surcharge','material'),
      a('toll','Toll / Road / Port Charges','material'), a('handling','Loading / Unloading / Handling','labor'),
      a('warehouse','Warehousing / Storage','material'), a('insurance','Cargo Insurance','material')
    ],[
      e('Carrier / forwarder quotation or contract rate card','PRIMARY'), e('Route, distance and delivery SLA','PRIMARY'),
      e('Shipment volume / weight / CBM assumptions','PRIMARY'), e('Fuel price / surcharge basis','COST DRIVER'),
      e('Toll / port tariff','SUPPORTING'), e('Warehouse / insurance quotation when applicable','CONDITIONAL')
    ]),
    'services|Payment Terminal Rental': p('Payment Terminal Rental Cost Structure','Separate rental, connectivity, field service, replacement and financing assumptions.',[
      q('rental','Terminal Monthly Rental','material',true,'Terminal Units','Monthly Rental / Unit'), q('connectivity','SIM / Connectivity','material',false,'Active Units','Monthly Connectivity / Unit'),
      a('maintenance','Field Maintenance / Swap Service','labor'), a('replacement','Battery / Adapter / Accessory Replacement','material'),
      a('logistics','Deployment / Reverse Logistics','material'), a('financing','Vendor Financing Cost','material')
    ],[
      e('Vendor rental quotation / historical rental contract','PRIMARY'), e('OEM terminal purchase or principal price evidence','PRIMARY'),
      e('BI JISDOR for imported terminal exposure','COST DRIVER'), e('Vendor financing basis / tenor / cost of funds','PRIMARY'),
      e('SIM/connectivity quotation','SUPPORTING'), e('Field-service SLA and replacement assumptions','PRIMARY')
    ]),
    'services|Other': p('General Services Cost Structure','Use service-specific volume, labor and commercial evidence. Avoid generic CPI when a more specific driver exists.',[
      q('service','Primary Service Charge','material',true,'Service Units / Months','Rate / Unit'), q('labor','Direct Service Labor','labor',false,'Mandays / Hours','Rate'),
      a('logistics','Operational / Logistics Cost','material'), a('other','Other Direct Cost','material')
    ],[
      e('Service quotation / contract rate card','PRIMARY'), e('SOW / SLA / volume assumptions','PRIMARY'), e('Internal historical contract / invoice','PRIMARY'),
      e('Role or operational cost evidence','SUPPORTING'), e('BPS CPI only as approved proxy where no specific index exists','CONDITIONAL')
    ]),
    'construction|Construction': p('Construction / Civil / MEP Cost Structure','Build from BOQ, material, labor and equipment evidence; general CPI is not a construction price index.',[
      a('materials','Materials / BOQ Supply','material',true), a('labor','Direct Labor','labor'), a('equipment','Equipment / Plant Rental','material'),
      a('mobilization','Mobilization / Logistics','material'), a('testing','Testing, Commissioning & Certification','labor'), a('safety','Safety / Permit / Site Requirement','material')
    ],[
      e('Approved BOQ, drawings and technical specification','PRIMARY'), e('Current material quotations / internal purchase evidence','PRIMARY'),
      e('BPS construction/material index where applicable','COST DRIVER'), e('UMP/UMK and project labor benchmark','COST DRIVER'),
      e('Equipment rental quotation','SUPPORTING'), e('Site condition, location and mobilization basis','PRIMARY')
    ]),
    'consultancy|Other': p('Professional / Advisory Consulting Cost Structure','Output-based consulting should be anchored to deliverables, scope, team composition and reimbursable policy.',[
      a('professionalFee','Professional Fee / Deliverable Fee','labor',true), q('expert','Expert / Specialist Mandays','labor',false,'Mandays','Rate / Manday'),
      a('workshop','Workshop / Interview / Facilitation Cost','material'), a('travel','Travel / Accommodation / Reimbursable','material'), a('tools','Research / Data / Tool / License Cost','material')
    ],[
      e('Detailed TOR / SOW and deliverables','PRIMARY'), e('Team composition, role, seniority and effort assumptions','PRIMARY'),
      e('Consulting rate card / comparable engagement / internal history','PRIMARY'), e('Travel & reimbursable policy / cap','PRIMARY'),
      e('Third-party data/tool quotation when applicable','CONDITIONAL'), e('Commercial proposal with exclusions and assumptions','PRIMARY')
    ]),
    'consultancy|Manpower/BPO': p('Resource / Man-day Consulting Cost Structure','Resource-based consulting should be calculated from role-specific effort and billing-rate evidence.',[
      q('consultant','Consultant / Specialist Resource','labor',true,'Mandays','Billing Rate / Manday'), q('pm','Project / Program Management','labor',false,'Mandays','Billing Rate / Manday'),
      a('travel','Travel / Accommodation / OOP','material'), a('tools','Tool / License / Workspace Cost','material')
    ],[
      e('TOR / SOW and required roles','PRIMARY'), e('Role-specific billing-rate benchmark','PRIMARY'), e('Manday / utilization assumptions','PRIMARY'),
      e('Comparable consulting contract or quotation','SUPPORTING'), e('Travel / out-of-pocket policy','CONDITIONAL'), e('Acceptance criteria and deliverables','PRIMARY')
    ])
  };

  function p(title,note,components,evidence){return{title:title,note:note,components:components,evidence:evidence};}
  function q(key,label,bucket,primary,qtyLabel,rateLabel){return{key:key,label:label,basis:'qtyRate',bucket:bucket,primary:!!primary,qtyLabel:qtyLabel||'Qty',rateLabel:rateLabel||'Unit Rate (IDR)'};}
  function a(key,label,bucket,primary){return{key:key,label:label,basis:'amount',bucket:bucket,primary:!!primary};}
  function e(label,role){return[label,role];}
  function byId(id){return document.getElementById(id);}
  function n(v){var x=Number(v);return isFinite(x)&&x>0?x:0;}
  function money(v){return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v)||0);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}

  function key(){
    var t=byId('projCategory'), c=byId('engineCategory');
    if(!t||!c)return 'services|Other';
    var exact=t.value+'|'+c.value;
    if(PROFILES[exact])return exact;
    if(t.value==='consultancy')return PROFILES['consultancy|'+c.value]?'consultancy|'+c.value:'consultancy|Other';
    if(t.value==='goods')return 'goods|Other';
    if(t.value==='construction')return 'construction|Construction';
    return 'services|Other';
  }
  function sk(){var s=byId('subCategory');return STORE+key()+'|'+(s?s.value:'default');}
  function load(){try{return JSON.parse(localStorage.getItem(sk())||'{}')||{};}catch(e){return{};}}
  function save(v){try{localStorage.setItem(sk(),JSON.stringify(v||{}));}catch(e){}}

  function costContainer(){
    var x=byId('matQty'); if(!x)return null; x=x.parentElement;
    while(x&&x!==document.body){if(x.classList&&x.classList.contains('space-y-4'))return x;x=x.parentElement;} return null;
  }
  function hideLegacyDirect(){
    ['matQty','laborDays'].forEach(function(id){var x=byId(id);if(!x)return;x=x.parentElement;while(x&&x!==document.body){if(x.classList&&x.classList.contains('p-3')){x.style.display='none';break;}x=x.parentElement;}});
  }
  function panel(){
    var x=byId('categoryCostProfilePanel');if(x)return x;var c=costContainer();if(!c)return null;
    x=document.createElement('div');x.id='categoryCostProfilePanel';x.className='p-4 rounded-lg border border-cyan-900/50 bg-cyan-950/10';c.insertBefore(x,c.firstChild||null);return x;
  }
  function componentHtml(c,s){
    var badge=c.primary?'<span class="rounded border border-cyan-800 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-300">PRIMARY BASIS</span>':'';
    if(c.basis==='qtyRate')return '<div class="rounded border border-slate-800 bg-slate-950/50 p-3"><div class="mb-2 flex items-center justify-between gap-2"><span class="font-medium text-slate-300">'+esc(c.label)+'</span>'+badge+'</div><div class="grid grid-cols-1 sm:grid-cols-2 gap-2"><div><label class="mb-1 block text-[10px] text-slate-500">'+esc(c.qtyLabel)+'</label><input data-ccu-key="'+c.key+'_qty" type="number" min="0" step="any" class="field compact font-mono-num" value="'+esc(s[c.key+'_qty']||'')+'" /></div><div><label class="mb-1 block text-[10px] text-slate-500">'+esc(c.rateLabel)+'</label><input data-ccu-key="'+c.key+'_rate" type="number" min="0" step="any" class="field compact font-mono-num" value="'+esc(s[c.key+'_rate']||'')+'" /></div></div><div class="mt-2 text-right text-[10px] text-slate-500">Subtotal: <span data-ccu-subtotal="'+c.key+'" class="font-mono-num text-slate-300">Rp0</span></div></div>';
    return '<div class="rounded border border-slate-800 bg-slate-950/50 p-3"><div class="mb-2 flex items-center justify-between gap-2"><span class="font-medium text-slate-300">'+esc(c.label)+'</span>'+badge+'</div><input data-ccu-key="'+c.key+'_amount" type="number" min="0" step="any" class="field compact font-mono-num" value="'+esc(s[c.key+'_amount']||'')+'" placeholder="Amount (IDR)" /><div class="mt-2 text-right text-[10px] text-slate-500">Subtotal: <span data-ccu-subtotal="'+c.key+'" class="font-mono-num text-slate-300">Rp0</span></div></div>';
  }
  function evidenceHtml(pr){return pr.evidence.map(function(it){var tone=it[1]==='PRIMARY'?'border-emerald-900 text-emerald-300 bg-emerald-950/20':it[1]==='COST DRIVER'?'border-cyan-900 text-cyan-300 bg-cyan-950/20':'border-slate-700 text-slate-400 bg-slate-900/40';return '<div class="flex items-start justify-between gap-3 rounded border border-slate-800 px-2.5 py-2"><span class="text-slate-400">'+esc(it[0])+'</span><span class="shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold '+tone+'">'+esc(it[1])+'</span></div>';}).join('');}

  function render(){
    var x=panel();if(!x)return;var pr=PROFILES[key()]||PROFILES['services|Other'], s=load();
    x.dataset.profileKey=key();
    x.innerHTML='<div class="mb-3 flex flex-wrap items-start justify-between gap-3"><div><div class="font-semibold text-cyan-300"><i class="fa-solid fa-layer-group mr-1.5"></i>'+esc(pr.title)+'</div><div class="mt-1 text-[10px] leading-relaxed text-slate-500">'+esc(pr.note)+'</div></div><span class="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[9px] font-semibold text-slate-400">USER-PROVIDED / VERIFIED EVIDENCE ONLY</span></div><div class="grid grid-cols-1 md:grid-cols-2 gap-3">'+pr.components.map(function(c){return componentHtml(c,s);}).join('')+'</div><div class="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2"><div class="rounded border border-slate-800 bg-slate-950/50 px-3 py-2"><div class="text-[9px] uppercase tracking-wide text-slate-500">Direct Non-Labor</div><div id="ccuMaterialTotal" class="mt-1 font-mono-num font-semibold text-slate-200">Rp0</div></div><div class="rounded border border-slate-800 bg-slate-950/50 px-3 py-2"><div class="text-[9px] uppercase tracking-wide text-slate-500">Direct Labor</div><div id="ccuLaborTotal" class="mt-1 font-mono-num font-semibold text-slate-200">Rp0</div></div><div class="rounded border border-slate-800 bg-slate-950/50 px-3 py-2"><div class="text-[9px] uppercase tracking-wide text-slate-500">Direct Cost Total</div><div id="ccuDirectTotal" class="mt-1 font-mono-num font-semibold text-cyan-300">Rp0</div></div></div><details class="mt-4 rounded border border-slate-800 bg-slate-950/30 px-3 py-2"><summary class="cursor-pointer font-medium text-slate-300">Required / Relevant Evidence for This Category</summary><div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">'+evidenceHtml(pr)+'</div><p class="mt-3 text-[10px] leading-relaxed text-slate-500">These are evidence requirements, not automatically verified sources. Only evidence accepted by Source Governance may materially influence the HPS.</p></details>';
    x.querySelectorAll('[data-ccu-key]').forEach(function(i){i.addEventListener('input',sync);i.addEventListener('change',sync);}); sync();
  }
  function values(){var v={},x=byId('categoryCostProfilePanel');if(!x)return v;x.querySelectorAll('[data-ccu-key]').forEach(function(i){v[i.getAttribute('data-ccu-key')]=i.value;});return v;}
  function cv(c,v){return c.basis==='qtyRate'?n(v[c.key+'_qty'])*n(v[c.key+'_rate']):n(v[c.key+'_amount']);}
  function fire(i){if(!i)return;i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));}
  function sync(){
    if(syncing)return;syncing=true;
    try{
      var pr=PROFILES[key()]||PROFILES['services|Other'],v=values(),m=0,l=0,pq=1;
      pr.components.forEach(function(c){var z=cv(c,v);if(c.bucket==='labor')l+=z;else m+=z;var s=document.querySelector('[data-ccu-subtotal="'+c.key+'"]');if(s)s.textContent=money(z);if(c.primary&&c.basis==='qtyRate')pq=n(v[c.key+'_qty'])||1;});
      if(byId('ccuMaterialTotal'))byId('ccuMaterialTotal').textContent=money(m);if(byId('ccuLaborTotal'))byId('ccuLaborTotal').textContent=money(l);if(byId('ccuDirectTotal'))byId('ccuDirectTotal').textContent=money(m+l);save(v);
      var mq=byId('matQty'),mr=byId('matUnitPrice'),ld=byId('laborDays'),lr=byId('laborRate');
      if(mq&&mr){mq.value=m>0?pq:0;mr.value=m>0?m/pq:0;} if(ld&&lr){ld.value=l>0?1:0;lr.value=l>0?l:0;} fire(mr);fire(lr);
    }finally{syncing=false;}
  }
  function bind(){
    var t=byId('projCategory'),c=byId('engineCategory');
    if(t&&t.dataset.ccuBound!=='true'){t.dataset.ccuBound='true';t.addEventListener('change',function(){setTimeout(render,0);});}
    if(c&&c.dataset.ccuBound!=='true'){c.dataset.ccuBound='true';c.addEventListener('change',function(){setTimeout(render,0);});}
    document.addEventListener('change',function(ev){if(ev&&ev.target&&ev.target.id==='subCategory')setTimeout(render,0);});
  }
  function init(){
    if(initialized)return;if(!byId('matQty')||!byId('engineCategory')||!byId('projCategory')){setTimeout(init,150);return;}
    initialized=true;hideLegacyDirect();bind();render();
  }

  window.HPSCategoryCostUX={PROFILES:PROFILES,render:render,sync:sync,init:init};
  if(document.readyState==='complete')setTimeout(init,0);else window.addEventListener('load',function(){setTimeout(init,0);});
})();
