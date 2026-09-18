/* lkpp-open-data.js — official LKPP Open Data intelligence UI.
 * This module is deliberately non-price-setting. It discovers and reads
 * official data.lkpp.go.id datasets for market/procurement context and keeps
 * aggregate statistics out of HPS Model B.
 */
(function(){
  'use strict';

  var initialized=false;
  var state={status:'idle',search:null,dataset:null,error:null};

  function byId(id){return document.getElementById(id);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
  function money(v){return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v)||0);}
  function fmt(v){return Number(v).toLocaleString('id-ID');}
  function formatDate(raw){
    if(!raw)return '—';
    var d=new Date(raw);
    if(!isFinite(d.getTime()))return String(raw);
    return new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(d);
  }

  function panel(){
    var x=byId('lkppOpenDataPanel');if(x)return x;
    var anchor=byId('inaprocIntelPanel')||byId('categoryCostProfilePanel');
    if(!anchor||!anchor.parentElement)return null;
    x=document.createElement('div');
    x.id='lkppOpenDataPanel';
    x.className='p-4 rounded-lg border border-indigo-900/50 bg-indigo-950/10';
    if(anchor.nextSibling)anchor.parentElement.insertBefore(x,anchor.nextSibling);else anchor.parentElement.appendChild(x);
    return x;
  }

  function render(){
    var x=panel();if(!x)return;
    var defaultQ='';
    var product=byId('projName'),cat=byId('engineCategory');
    if(product&&product.value.trim())defaultQ=product.value.trim();
    else if(cat&&cat.value)defaultQ=cat.value;
    x.innerHTML=
      '<div class="flex flex-wrap items-start justify-between gap-3">'+
        '<div><div class="font-semibold text-indigo-300"><i class="fa-solid fa-database mr-1.5"></i>LKPP Open Data</div>'+
        '<div class="mt-1 text-[10px] leading-relaxed text-slate-500">Dataset resmi LKPP untuk konteks pasar dan statistik pengadaan. Nilai agregat tidak pernah diperlakukan sebagai harga unit HPS.</div></div>'+
        '<span id="lkppOpenDataBadge" class="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[9px] font-semibold text-slate-400">BELUM DIPERIKSA</span>'+
      '</div>'+
      '<div class="mt-3 flex flex-col sm:flex-row gap-2">'+
        '<input id="lkppOpenDataQuery" class="field compact flex-1" placeholder="Cari dataset LKPP, mis. katalog, realisasi, konsolidasi" value="'+esc(defaultQ)+'" />'+
        '<button id="btnLkppOpenDataSearch" type="button" class="rounded bg-indigo-700 hover:bg-indigo-600 px-3 py-2 text-[10px] font-semibold text-white"><i class="fa-solid fa-magnifying-glass mr-1"></i>Cari Dataset</button>'+
      '</div>'+
      '<div class="mt-2 flex flex-wrap gap-1.5">'+
        quick('jumlah-produk-tayang-pada-katalog-elektronik-2025','Produk Tayang 2025')+
        quick('nilai-perencanaan-dan-realisasi-pengadaan-barang-jasa','Perencanaan vs Realisasi 2025')+
        quick('persentase-efisiensi-paket-konsolidasi','Efisiensi Konsolidasi 2025')+
      '</div>'+
      '<div id="lkppOpenDataResult" class="mt-3"></div>';

    var b=byId('btnLkppOpenDataSearch');if(b)b.addEventListener('click',search);
    var q=byId('lkppOpenDataQuery');if(q)q.addEventListener('keydown',function(e){if(e.key==='Enter')search();});
    x.querySelectorAll('[data-lkpp-dataset]').forEach(function(btn){
      btn.addEventListener('click',function(){loadDataset(btn.getAttribute('data-lkpp-dataset'));});
    });
    renderResult();
  }

  function quick(slug,label){
    return '<button type="button" data-lkpp-dataset="'+esc(slug)+'" class="rounded border border-indigo-900/60 bg-slate-950/40 px-2 py-1 text-[9px] text-indigo-300 hover:bg-indigo-950/40">'+esc(label)+'</button>';
  }

  function search(){
    var q=(byId('lkppOpenDataQuery')&&byId('lkppOpenDataQuery').value||'').trim();
    if(q.length<2){state={status:'error',search:null,dataset:null,error:'Kata kunci minimal 2 karakter.'};renderResult();return;}
    state={status:'loading',search:null,dataset:null,error:null};renderResult();
    fetch('/api/lkpp-open-data?q='+encodeURIComponent(q),{headers:{Accept:'application/json'},cache:'no-store'})
      .then(function(r){return r.json().catch(function(){return{};}).then(function(b){if(!r.ok)throw new Error(b.message||b.note||b.error||('HTTP '+r.status));return b;});})
      .then(function(b){state={status:'search',search:b,dataset:null,error:null};renderResult();})
      .catch(function(e){state={status:'error',search:null,dataset:null,error:e&&e.message||String(e)};renderResult();});
  }

  function loadDataset(slug){
    if(!slug)return;
    state={status:'loading',search:null,dataset:null,error:null};renderResult();
    fetch('/api/lkpp-open-data?dataset='+encodeURIComponent(slug),{headers:{Accept:'application/json'},cache:'no-store'})
      .then(function(r){return r.json().catch(function(){return{};}).then(function(b){if(!r.ok)throw new Error(b.message||b.note||b.error||('HTTP '+r.status));return b;});})
      .then(function(b){state={status:'dataset',search:null,dataset:b,error:null};renderResult();})
      .catch(function(e){state={status:'error',search:null,dataset:null,error:e&&e.message||String(e)};renderResult();});
  }

  function renderResult(){
    var out=byId('lkppOpenDataResult'),badge=byId('lkppOpenDataBadge');if(!out)return;
    if(state.status==='loading'){
      if(badge){badge.textContent='MENGAMBIL DATA';badge.className='rounded border border-indigo-800 bg-indigo-950/40 px-2 py-1 text-[9px] font-semibold text-indigo-300';}
      out.innerHTML='<div class="text-[10px] text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i>Mengambil data resmi LKPP…</div>';
      return;
    }
    if(state.status==='error'){
      if(badge){badge.textContent='TIDAK TERSEDIA';badge.className='rounded border border-rose-800 bg-rose-950/40 px-2 py-1 text-[9px] font-semibold text-rose-300';}
      out.innerHTML='<div class="rounded border border-rose-900/60 bg-rose-950/20 p-3 text-[10px] text-rose-300">'+esc(state.error||'Kesalahan tidak diketahui')+'</div>';
      return;
    }
    if(state.status==='search'&&state.search){
      var body=state.search,items=body.items||[];
      if(badge){badge.textContent=(body.sourceState==='LIVE'?'LANGSUNG':'TERSIMPAN')+' · '+items.length+' DATASET';badge.className='rounded border border-emerald-800 bg-emerald-950/30 px-2 py-1 text-[9px] font-semibold text-emerald-300';}
      out.innerHTML='<div class="mb-2 text-[9px] text-slate-500">'+esc(body.note||'')+'</div>'+
        (items.length?items.map(datasetCard).join(''):'<div class="text-[10px] text-slate-500">Tidak ada dataset yang cocok.</div>');
      out.querySelectorAll('[data-lkpp-open]').forEach(function(b){b.addEventListener('click',function(){loadDataset(b.getAttribute('data-lkpp-open'));});});
      return;
    }
    if(state.status==='dataset'&&state.dataset){
      renderDataset(state.dataset,out,badge);return;
    }
    if(badge){badge.textContent='BELUM DIPERIKSA';badge.className='rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[9px] font-semibold text-slate-400';}
    out.innerHTML='<div class="text-[10px] text-slate-500">Cari dataset atau pilih salah satu dataset resmi di atas.</div>';
  }

  function datasetCard(d){
    var slug=d.slug||'';
    var meta=[
      d.priorityYear?'Tahun: '+esc(d.priorityYear):'',
      d.unit?'Satuan: '+esc(d.unit):'',
      d.metadataModified?'Diperbarui: '+esc(formatDate(d.metadataModified)):''
    ].filter(Boolean).join(' · ');
    return '<div class="mb-2 rounded border border-slate-800 bg-slate-950/40 p-3">'+
      '<div class="flex flex-wrap items-start justify-between gap-3"><div class="min-w-0 flex-1">'+
      '<div class="font-medium text-slate-200">'+esc(d.title||slug)+'</div>'+
      '<div class="mt-1 text-[9px] text-slate-500">'+meta+'</div>'+
      '<div class="mt-1 text-[9px] leading-relaxed text-slate-500">'+esc(d.notes||'')+'</div></div>'+
      (slug?'<button type="button" data-lkpp-open="'+esc(slug)+'" class="rounded bg-slate-700 hover:bg-slate-600 px-2.5 py-1 text-[9px] text-white">Buka Data</button>':'')+
      '</div></div>';
  }

  function renderDataset(body,out,badge){
    var d=body.dataset||{},cl=body.classification||{},rows=body.rows||[],fields=body.fields||[];
    if(badge){badge.textContent='DATA RESMI · '+(body.rowCount||rows.length)+' BARIS';badge.className='rounded border border-emerald-800 bg-emerald-950/30 px-2 py-1 text-[9px] font-semibold text-emerald-300';}
    var meta='<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">'+
      mini('Tahun Data',d.priorityYear||d.dataAsOf||'—')+
      mini('Diperbarui',formatDate(d.metadataModified))+
      mini('Satuan',d.unit||'—')+
      mini('Peran HPS',cl.hpsRole||body.evidenceRole||'CONTEXT')+
      '</div>';
    var guard='<div class="mb-3 rounded border border-amber-900/60 bg-amber-950/20 p-2.5 text-[9px] leading-relaxed text-amber-200"><strong>Kontrol HPS:</strong> '+esc(cl.note||body.note||'Dataset ini hanya untuk konteks.')+'</div>';
    var preview=rows.slice(0,8).map(function(r){
      var parts=fields.slice(0,6).map(function(f){
        var v=r&&r[f];
        if(typeof v==='number'&&/rupiah|nilai/i.test(f))v=money(v);
        else if(typeof v==='number')v=fmt(v);
        return '<div><span class="text-slate-500">'+esc(f)+':</span> <span class="text-slate-300">'+esc(v==null?'—':v)+'</span></div>';
      }).join('');
      return '<div class="rounded border border-slate-800 bg-slate-950/30 p-2 text-[9px]">'+parts+'</div>';
    }).join('');
    var sourceLink=(d.datasetUrl||body.resource&&body.resource.url)?'<a class="text-indigo-300 hover:underline" target="_blank" rel="noopener noreferrer" href="'+esc(d.datasetUrl||body.resource.url)+'">Buka sumber LKPP</a>':'';

    out.innerHTML=
      '<div class="mb-2 flex flex-wrap items-start justify-between gap-2"><div><div class="font-medium text-slate-200">'+esc(d.title||'Dataset LKPP')+'</div><div class="mt-1 text-[9px] text-slate-500">'+esc(d.producer||'Walidata LKPP')+'</div></div><div class="text-[9px]">'+sourceLink+'</div></div>'+
      meta+guard+
      '<div class="mb-2 text-[9px] text-slate-500">Field: '+esc(fields.join(', ')||'—')+'</div>'+
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-2">'+preview+'</div>'+
      (body.truncated?'<div class="mt-2 text-[9px] text-amber-300">Pratinjau dibatasi; dataset memiliki lebih banyak baris.</div>':'');
  }

  function mini(label,value){
    return '<div class="rounded border border-slate-800 p-2"><div class="text-[9px] text-slate-500">'+esc(label)+'</div><div class="mt-0.5 text-[10px] text-slate-200">'+esc(value)+'</div></div>';
  }

  function init(){
    if(initialized)return;
    if(!byId('categoryCostProfilePanel')){setTimeout(init,150);return;}
    initialized=true;render();
  }

  window.HPSLkppOpenData={init:init,search:search,loadDataset:loadDataset,getState:function(){return JSON.parse(JSON.stringify(state));}};
  if(document.readyState==='complete')setTimeout(init,0);else window.addEventListener('load',function(){setTimeout(init,0);});
})();