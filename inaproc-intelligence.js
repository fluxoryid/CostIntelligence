/* inaproc-intelligence.js — official Data INAPROC transaction benchmark UI.
 * Read-only. Requires a validated Supabase tenant session and a server-side
 * INAPROC_API_TOKEN secret. Raw transaction prices are displayed as reported
 * and cannot enter Model B until the reviewer explicitly identifies the tax
 * basis/comparability and chooses "Gunakan sebagai pembanding".
 */
(function(){
  'use strict';

  var STORE='hps_inaproc_intel_v1';
  var SELECTED_STORE='hps_inaproc_selected_v1';
  var initialized=false;
  var state={status:'idle',response:null,error:null};
  var selected={};

  function byId(id){return document.getElementById(id);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
  function money(v){return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v)||0);}
  function n(v){var x=Number(v);return isFinite(x)?x:0;}
  function load(){
    try{
      var x=JSON.parse(localStorage.getItem(STORE)||'{}')||{};
      selected=JSON.parse(localStorage.getItem(SELECTED_STORE)||'{}')||{};
      return x;
    }catch(_){return{};}
  }
  function saveForm(){
    try{
      localStorage.setItem(STORE,JSON.stringify({
        kodeKlpd:byId('inaprocKlpd')&&byId('inaprocKlpd').value||'',
        tahun:byId('inaprocYear')&&byId('inaprocYear').value||'',
        q:byId('inaprocQuery')&&byId('inaprocQuery').value||'',
        basis:byId('inaprocPriceBasis')&&byId('inaprocPriceBasis').value||'UNVERIFIED',
        taxPct:byId('inaprocTaxPct')&&byId('inaprocTaxPct').value||''
      }));
    }catch(_){}
  }
  function saveSelected(){try{localStorage.setItem(SELECTED_STORE,JSON.stringify(selected||{}));}catch(_){}}

  function panel(){
    var x=byId('inaprocIntelPanel');if(x)return x;
    var anchor=byId('categoryCostProfilePanel');
    if(!anchor||!anchor.parentElement)return null;
    x=document.createElement('div');
    x.id='inaprocIntelPanel';
    x.className='p-4 rounded-lg border border-cyan-900/50 bg-cyan-950/10';
    if(anchor.nextSibling)anchor.parentElement.insertBefore(x,anchor.nextSibling);else anchor.parentElement.appendChild(x);
    return x;
  }

  function ensureBenchmarkOptions(){
    ['benchmark1Type','benchmark2Type','benchmark3Type'].forEach(function(id){
      var s=byId(id);if(!s||s.querySelector('option[value="INAPROC_TRANSACTION"]'))return;
      var o=document.createElement('option');o.value='INAPROC_TRANSACTION';o.textContent='Riwayat Transaksi INAPROC';s.insertBefore(o,s.firstChild||null);
    });
  }

  function render(){
    var x=panel();if(!x)return;
    var saved=load();
    var currentYear=String(new Date().getFullYear());
    x.innerHTML=
      '<div class="flex flex-wrap items-start justify-between gap-3">'+
        '<div><div class="font-semibold text-cyan-300"><i class="fa-solid fa-landmark mr-1.5"></i>Inteligensi Harga Transaksi INAPROC</div>'+
        '<div class="mt-1 text-[10px] leading-relaxed text-slate-500">Sumber resmi Data INAPROC. Riwayat transaksi hanya digunakan sebagai pembanding setelah spesifikasi, kuantitas, lokasi, pajak, ongkir, periode, dan ruang lingkup dinilai sebanding.</div></div>'+
        '<span id="inaprocStatusBadge" class="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[9px] font-semibold text-slate-400">BELUM DIPERIKSA</span>'+
      '</div>'+
      '<div class="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-2">'+
        '<div><label class="text-[10px] text-slate-500">Kode KLPD yang Diizinkan</label><input id="inaprocKlpd" class="field compact font-mono-num" placeholder="mis. D123" value="'+esc(saved.kodeKlpd||'')+'" /></div>'+
        '<div><label class="text-[10px] text-slate-500">Tahun Transaksi</label><input id="inaprocYear" type="number" min="2020" max="2100" class="field compact font-mono-num" value="'+esc(saved.tahun||currentYear)+'" /></div>'+
        '<div class="sm:col-span-2"><label class="text-[10px] text-slate-500">Kata Kunci Produk / Kategori</label><input id="inaprocQuery" class="field compact" placeholder="contoh: laptop, storage, jasa kebersihan" value="'+esc(saved.q||'')+'" /></div>'+
      '</div>'+
      '<div class="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">'+
        '<div><label class="text-[10px] text-slate-500">Basis Harga Transaksi</label><select id="inaprocPriceBasis" class="field compact">'+
          '<option value="UNVERIFIED">Belum diverifikasi — tidak boleh dipakai</option>'+
          '<option value="DPP">Harga sebelum pajak / DPP</option>'+
          '<option value="GROSS">Harga termasuk PPN — normalisasi ke DPP</option>'+
        '</select></div>'+
        '<div><label class="text-[10px] text-slate-500">PPN untuk normalisasi (%)</label><input id="inaprocTaxPct" type="number" min="0" step="0.1" class="field compact font-mono-num" value="'+esc(saved.taxPct||'11')+'" /></div>'+
        '<div class="flex items-end"><button id="btnInaprocSearch" type="button" class="w-full rounded bg-cyan-800 hover:bg-cyan-700 px-3 py-2 text-[10px] font-semibold text-white"><i class="fa-solid fa-magnifying-glass mr-1"></i>Cari Riwayat Transaksi</button></div>'+
      '</div>'+
      '<p class="mt-2 text-[9px] leading-relaxed text-slate-500">Token API INAPROC tidak pernah disimpan di browser. Aplikasi hanya mengakses gateway melalui Worker setelah sesi Supabase dan keanggotaan tenant aktif tervalidasi.</p>'+
      '<div id="inaprocResult" class="mt-3"></div>';

    if(byId('inaprocPriceBasis'))byId('inaprocPriceBasis').value=saved.basis||'UNVERIFIED';
    ['inaprocKlpd','inaprocYear','inaprocQuery','inaprocPriceBasis','inaprocTaxPct'].forEach(function(id){var e=byId(id);if(e)e.addEventListener('change',saveForm);});
    var b=byId('btnInaprocSearch');if(b)b.addEventListener('click',search);
    ensureBenchmarkOptions();
    renderResults();
  }

  function getSessionToken(){
    if(!window.HPSAuth||!window.HPSAuth.getClient)return Promise.resolve(null);
    var c=window.HPSAuth.getClient();if(!c)return Promise.resolve(null);
    return c.auth.getSession().then(function(r){return r&&r.data&&r.data.session&&r.data.session.access_token||null;}).catch(function(){return null;});
  }

  function search(){
    var klpd=(byId('inaprocKlpd')&&byId('inaprocKlpd').value||'').trim();
    var tahun=(byId('inaprocYear')&&byId('inaprocYear').value||'').trim();
    var q=(byId('inaprocQuery')&&byId('inaprocQuery').value||'').trim();
    saveForm();
    if(!klpd){setError('Kode KLPD wajib diisi sesuai akses Data Integrator yang dimiliki.');return;}
    if(!/^20\d{2}$/.test(tahun)){setError('Tahun transaksi harus dalam format YYYY.');return;}
    if(q.length<2){setError('Kata kunci minimal 2 karakter.');return;}

    state={status:'loading',response:null,error:null};renderResults();
    getSessionToken().then(function(token){
      if(!token)throw new Error('Sesi login tidak valid. Silakan masuk kembali.');
      var u='/api/inaproc-transactions?kode_klpd='+encodeURIComponent(klpd)+'&tahun='+encodeURIComponent(tahun)+'&q='+encodeURIComponent(q)+'&limit=100&max_pages=3';
      return fetch(u,{headers:{Accept:'application/json',Authorization:'Bearer '+token},cache:'no-store'});
    }).then(function(res){
      return res.json().catch(function(){return{};}).then(function(body){
        if(!res.ok)throw new Error(body.message||body.note||body.error||('HTTP '+res.status));
        return body;
      });
    }).then(function(body){
      state={status:'ready',response:body,error:null};
      if(window.HPSCloud&&window.HPSCloud.pushAuditLog){
        window.HPSCloud.pushAuditLog({ts:new Date().toISOString(),action:'INAPROC benchmark search',detail:{kodeKlpd:klpd,tahun:tahun,query:q,count:body.count||0}});
      }
      renderResults();
    }).catch(function(e){
      state={status:'error',response:null,error:e&&e.message||String(e)};renderResults();
    });
  }

  function setError(msg){state={status:'error',response:null,error:msg};renderResults();}

  function normalizePrice(raw){
    var basis=byId('inaprocPriceBasis')?byId('inaprocPriceBasis').value:'UNVERIFIED';
    var tax=n(byId('inaprocTaxPct')&&byId('inaprocTaxPct').value);
    var p=Number(raw)||0;
    if(basis==='DPP')return p;
    if(basis==='GROSS')return tax>=0?p/(1+tax/100):0;
    return null;
  }

  function useComparable(index){
    var body=state.response||{},item=(body.items||[])[index];if(!item)return;
    var normalized=normalizePrice(item.unitPrice);
    if(!(normalized>0)){
      window.alert('Tentukan dan verifikasi basis harga transaksi terlebih dahulu. Harga dengan basis belum diverifikasi tidak boleh masuk ke perhitungan HPS.');
      return;
    }
    var slot=null;
    for(var i=1;i<=3;i++){var input=byId('benchmark'+i);if(input&&!(Number(input.value)>0)){slot=i;break;}}
    if(slot==null){window.alert('Tiga slot pembanding sudah terisi. Kosongkan salah satu slot sebelum menambahkan pembanding INAPROC.');return;}
    var type=byId('benchmark'+slot+'Type'),input=byId('benchmark'+slot);
    if(type)type.value='INAPROC_TRANSACTION';
    if(input)input.value=Math.round(normalized);
    selected[String(slot)]={
      sourceKey:'INAPROC_TRANSACTION',
      rawUnitPrice:Number(item.unitPrice)||0,
      normalizedUnitPrice:normalized,
      priceBasis:byId('inaprocPriceBasis')&&byId('inaprocPriceBasis').value,
      taxPct:n(byId('inaprocTaxPct')&&byId('inaprocTaxPct').value),
      itemName:item.itemName||null,
      category:item.category||null,
      quantity:item.quantity||null,
      vendor:item.vendor||null,
      transactionDate:item.transactionDate||null,
      reference:item.reference||null,
      packageName:item.packageName||null,
      kodeKlpd:item.kodeKlpd||body.kodeKlpd||null,
      tahun:item.tahun||body.tahun||null,
      sourceUrl:item.sourceUrl||null,
      retrievedAt:body.retrievedAt||new Date().toISOString(),
      reviewerDecision:'COMPARABLE_ACCEPTED'
    };
    saveSelected();
    if(window.HPSAppControl&&window.HPSAppControl.exitResetMode)window.HPSAppControl.exitResetMode();
    if(input){input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
    if(window.HPSAppControl&&window.HPSAppControl.recalculate)window.HPSAppControl.recalculate();
    renderResults();
    window.alert('Riwayat transaksi INAPROC ditambahkan ke Pembanding '+slot+' setelah normalisasi basis harga.');
  }

  function renderResults(){
    var out=byId('inaprocResult'),badge=byId('inaprocStatusBadge');if(!out)return;
    if(state.status==='loading'){
      if(badge){badge.textContent='MENGAMBIL DATA';badge.className='rounded border border-cyan-800 bg-cyan-950/40 px-2 py-1 text-[9px] font-semibold text-cyan-300';}
      out.innerHTML='<div class="text-[10px] text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i>Mengambil riwayat transaksi resmi INAPROC…</div>';return;
    }
    if(state.status==='error'){
      if(badge){badge.textContent='TIDAK TERSEDIA';badge.className='rounded border border-rose-800 bg-rose-950/40 px-2 py-1 text-[9px] font-semibold text-rose-300';}
      out.innerHTML='<div class="rounded border border-rose-900/60 bg-rose-950/20 p-3 text-[10px] text-rose-300">'+esc(state.error||'Kesalahan tidak diketahui')+'</div>';return;
    }
    if(state.status!=='ready'||!state.response){
      if(badge){badge.textContent='BELUM DIPERIKSA';badge.className='rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[9px] font-semibold text-slate-400';}
      out.innerHTML='<div class="text-[10px] text-slate-500">Belum ada pencarian riwayat transaksi.</div>';return;
    }

    var body=state.response,items=body.items||[],sum=body.summary||{};
    if(badge){badge.textContent='DATA RESMI · '+items.length+' HASIL';badge.className='rounded border border-emerald-800 bg-emerald-950/30 px-2 py-1 text-[9px] font-semibold text-emerald-300';}
    var summary='<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">'+
      '<div class="rounded border border-slate-800 p-2"><div class="text-[9px] text-slate-500">Jumlah Harga</div><div class="font-mono-num text-slate-200">'+esc(sum.count||0)+'</div></div>'+
      '<div class="rounded border border-slate-800 p-2"><div class="text-[9px] text-slate-500">Minimum</div><div class="font-mono-num text-slate-200">'+money(sum.min)+'</div></div>'+
      '<div class="rounded border border-slate-800 p-2"><div class="text-[9px] text-slate-500">Median</div><div class="font-mono-num text-cyan-300">'+money(sum.median)+'</div></div>'+
      '<div class="rounded border border-slate-800 p-2"><div class="text-[9px] text-slate-500">Maksimum</div><div class="font-mono-num text-slate-200">'+money(sum.max)+'</div></div>'+
    '</div>';

    var rows=items.slice(0,20).map(function(it,idx){
      var norm=normalizePrice(it.unitPrice);
      return '<div class="rounded border border-slate-800 bg-slate-950/40 p-3 mb-2">'+
        '<div class="flex flex-wrap items-start justify-between gap-3"><div class="min-w-0 flex-1">'+
          '<div class="font-medium text-slate-200">'+esc(it.itemName||it.packageName||'Item transaksi')+'</div>'+
          '<div class="mt-1 text-[9px] text-slate-500">'+
            (it.category?'Kategori: '+esc(it.category)+' · ':'')+
            (it.vendor?'Penyedia: '+esc(it.vendor)+' · ':'')+
            (it.quantity!=null?'Qty: '+esc(it.quantity)+' · ':'')+
            (it.transactionDate?'Tanggal: '+esc(it.transactionDate)+' · ':'')+
            'Field harga: '+esc(it.priceField||'—')+
          '</div>'+
          '<div class="mt-1 text-[9px] text-slate-500">Referensi: '+esc(it.reference||'—')+(it.packageName?' · Paket: '+esc(it.packageName):'')+'</div>'+
        '</div><div class="text-right shrink-0"><div class="text-[9px] text-slate-500">Harga dilaporkan</div><div class="font-mono-num font-semibold text-cyan-300">'+money(it.unitPrice)+'</div>'+
          '<div class="text-[9px] text-slate-500">'+(norm>0?'DPP ternormalisasi: '+money(norm):'Belum boleh dipakai')+'</div></div></div>'+
        '<div class="mt-2 flex justify-end"><button type="button" data-inaproc-use="'+idx+'" class="rounded bg-slate-700 hover:bg-slate-600 px-2.5 py-1 text-[9px] text-white">Gunakan sebagai Pembanding</button></div>'+
      '</div>';
    }).join('');

    out.innerHTML=summary+
      '<div class="mb-2 text-[9px] leading-relaxed text-slate-500">'+esc(body.note||'')+
      (body.pagination&&body.pagination.truncated?' <strong class="text-amber-300">Hasil dibatasi untuk menjaga kuota/rate limit API.</strong>':'')+'</div>'+
      (rows||'<div class="text-[10px] text-slate-500">Tidak ada harga transaksi eksplisit yang cocok dengan kata kunci pada data yang dapat diakses token.</div>');
    out.querySelectorAll('[data-inaproc-use]').forEach(function(b){b.addEventListener('click',function(){useComparable(Number(b.getAttribute('data-inaproc-use')));});});
  }

  function getSelectedBenchmark(slot){return selected&&selected[String(slot)]?JSON.parse(JSON.stringify(selected[String(slot)])):null;}
  function clearSelected(){
    selected={};saveSelected();
  }
  function bindReset(){
    var b=byId('btnResetHps');if(b&&!b.dataset.inaprocBound){b.dataset.inaprocBound='true';b.addEventListener('click',function(){setTimeout(clearSelected,0);});}
  }
  function init(){
    if(initialized)return;
    if(!byId('categoryCostProfilePanel')){setTimeout(init,150);return;}
    initialized=true;render();bindReset();
  }

  window.HPSInaproc={init:init,search:search,getState:function(){return JSON.parse(JSON.stringify(state));},getSelectedBenchmark:getSelectedBenchmark,clearSelected:clearSelected};
  if(document.readyState==='complete')setTimeout(init,0);else window.addEventListener('load',function(){setTimeout(init,0);});
})();