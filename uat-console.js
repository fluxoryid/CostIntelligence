/* uat-console.js — governed Production UAT Console for UAT-01 through UAT-24.
 * Test attempts are append-only in Supabase. Final sign-off is enforced by the
 * database and is available only when the latest result for every case is PASS.
 */
(function(){
  'use strict';

  var initialized=false;
  var run=null;
  var attempts=[];
  var currentUser=null;

  var CASES=[
    {id:'UAT-01',title:'Evidence utama belum didukung',scenario:'Procurement User membuat HPS dengan primary component tanpa bukti pendukung yang memenuhi syarat.',expected:'Evidence gate = BLOCKED dan submission tidak tersedia.'},
    {id:'UAT-02',title:'Satu sumber terverifikasi skor ≥80',scenario:'Primary component memiliki satu sumber terverifikasi dengan reliability score minimal 80.',expected:'Komponen dapat dianggap supported, tetap tunduk pada validity dan material-use decision.'},
    {id:'UAT-03',title:'Dua sumber harga independen skor ≥70',scenario:'Primary component memiliki dua sumber harga independen yang dapat diterima dengan score minimal 70.',expected:'Komponen didukung oleh bukti yang cukup.'},
    {id:'UAT-04',title:'Bukti telah kedaluwarsa',scenario:'Tanggal validitas evidence telah terlewati.',expected:'Evidence tidak dapat digunakan sebagai material support.'},
    {id:'UAT-05',title:'Procurement User mencoba approval',scenario:'Procurement User mencoba melakukan approval.',expected:'Ditolak di client dan server.'},
    {id:'UAT-06',title:'Review dan return oleh Analyst',scenario:'Analyst/Senior memulai review lalu mengembalikan request dengan alasan.',expected:'SUBMITTED → UNDER_REVIEW → REWORK dan history/audit bertambah.'},
    {id:'UAT-07',title:'Approval saat gate belum siap',scenario:'Manager mencoba approve ketika evidence gate di bawah APPROVAL READY.',expected:'Server menolak approval.'},
    {id:'UAT-08',title:'Approval saat gate siap',scenario:'Manager approve ketika evidence gate = APPROVAL READY.',expected:'Approved immutable version dibuat.'},
    {id:'UAT-09',title:'Manager mencoba final lock',scenario:'Manager mencoba melakukan final lock.',expected:'Ditolak.'},
    {id:'UAT-10',title:'Head melakukan final lock',scenario:'Procurement Head/Admin mengunci request yang sudah approved.',expected:'Status = LOCKED dan mutasi konten setelah lock ditolak.'},
    {id:'UAT-11',title:'Auditor mencoba menulis data',scenario:'Auditor mencoba INSERT atau UPDATE.',expected:'RLS menolak write operation.'},
    {id:'UAT-12',title:'Isolasi tenant',scenario:'User dari tenant lain mencoba membaca request atau document.',expected:'RLS tidak memberikan akses.'},
    {id:'UAT-13',title:'Duplicate evidence SHA-256',scenario:'File bukti yang sama di-upload dua kali.',expected:'Duplicate hash terdeteksi; row dan storage copy kedua tidak dibuat.'},
    {id:'UAT-14',title:'Upload dokumen produksi',scenario:'Upload PDF/DOCX/XLSX/PPTX yang valid.',expected:'Original tersimpan private, extraction status tercatat, original tetap authoritative.'},
    {id:'UAT-15',title:'Upload scanned image',scenario:'Upload evidence berupa scanned image.',expected:'Metadata tersimpan dan sistem tidak mengklaim OCR/extraction sintetis.'},
    {id:'UAT-16',title:'Normalisasi historis USD',scenario:'Historical normalization untuk transaksi USD.',expected:'JISDOR current dan historical date-aligned tampil dengan provenance.'},
    {id:'UAT-17',title:'Normalisasi non-USD',scenario:'Normalisasi mata uang non-USD yang didukung.',expected:'Official BI reference rate digunakan tanpa substitusi third-party.'},
    {id:'UAT-18',title:'Customs / landed-cost scenario',scenario:'Perhitungan customs menggunakan foreign currency.',expected:'Kurs Pajak Kemenkeu digunakan; duty/tax tetap explicit user input.'},
    {id:'UAT-19',title:'Learning outcome kurang dari 3',scenario:'Approved learning outcomes untuk kategori yang sama kurang dari tiga.',expected:'Negotiation learning target tetap unavailable.'},
    {id:'UAT-20',title:'Learning outcome minimal 3',scenario:'Terdapat minimal tiga approved outcomes pada kategori yang sama.',expected:'Historical discount distribution dan evidence-derived target range ditampilkan.'},
    {id:'UAT-21',title:'Outcome baru belum approved untuk learning',scenario:'Negotiation outcome baru direkam.',expected:'Tersimpan pending learning; Model D tidak menggunakannya sebelum approval Manager/Head.'},
    {id:'UAT-22',title:'Official provider unavailable',scenario:'Salah satu active official provider seperti BI/BPS/ESDM tidak tersedia.',expected:'Status menjadi unavailable/degraded dan tidak ada synthetic price yang dimasukkan.'},
    {id:'UAT-23',title:'Lima user simultan',scenario:'Lima user bekerja secara bersamaan pada shared workflow.',expected:'Supabase records/versions konsisten dan tidak terjadi browser-local collision.'},
    {id:'UAT-24',title:'Verifikasi deployment',scenario:'Verifikasi production Worker deployment.',expected:'/api/version sesuai expected build dan /api/health = healthy.'}
  ];

  function byId(id){return document.getElementById(id);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
  function tenant(){return window.HPS_CONFIG&&window.HPS_CONFIG.TENANT_ID||'default-org';}
  function build(){return window.HPS_CONFIG&&window.HPS_CONFIG.EXPECTED_WORKER_BUILD||'unknown-build';}
  function canWrite(){return !!(currentUser&&currentUser.active!==false&&currentUser.role&&currentUser.role!=='No Tenant Access'&&currentUser.role!=='Auditor');}
  function canSign(){return !!(currentUser&&currentUser.role==='Procurement Head/Admin');}
  function deviceInfo(){
    var size='';
    try{size=(window.screen&&window.screen.width?window.screen.width+'x'+window.screen.height:'');}catch(e){}
    return [navigator.userAgent||'Unknown browser',size].filter(Boolean).join(' | ').slice(0,500);
  }
  function fmtTime(v){
    if(!v)return '—';
    try{return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v));}catch(e){return String(v);}
  }
  function latestMap(){
    var out={};
    attempts.forEach(function(a){
      var prev=out[a.test_id];
      if(!prev||String(a.created_at||'')>String(prev.created_at||''))out[a.test_id]=a;
    });
    return out;
  }
  function stats(){
    var latest=latestMap(),s={PASS:0,FAIL:0,BLOCKED:0,NOT_RUN:0};
    CASES.forEach(function(c){var r=latest[c.id];if(r&&s[r.result]!=null)s[r.result]++;else s.NOT_RUN++;});
    s.ready=s.PASS===CASES.length&&s.FAIL===0&&s.BLOCKED===0&&s.NOT_RUN===0;
    return s;
  }
  function tone(result){
    if(result==='PASS')return 'border-emerald-700 bg-emerald-950/30 text-emerald-300';
    if(result==='FAIL')return 'border-rose-700 bg-rose-950/30 text-rose-300';
    if(result==='BLOCKED')return 'border-amber-700 bg-amber-950/30 text-amber-300';
    return 'border-slate-700 bg-slate-900 text-slate-400';
  }
  function statusLabel(result){return result||'NOT RUN';}
  function panel(){
    var p=byId('uatConsolePanel');if(p)return p;
    var main=document.querySelector('main');if(!main||!main.parentNode)return null;
    var shell=document.createElement('section');
    shell.id='uatConsoleShell';
    shell.className='max-w-7xl w-full mx-auto px-4 pb-8';
    shell.innerHTML='<div id="uatConsolePanel" class="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm"></div>';
    if(main.nextSibling)main.parentNode.insertBefore(shell,main.nextSibling);else main.parentNode.appendChild(shell);
    return byId('uatConsolePanel');
  }
  function summaryCard(label,value,cls){
    return '<div class="rounded-lg border border-slate-800 bg-slate-950/40 p-3"><div class="text-[9px] uppercase tracking-wide text-slate-500">'+esc(label)+'</div><div class="mt-1 text-lg font-semibold '+cls+'">'+esc(value)+'</div></div>';
  }
  function renderEmpty(p){
    p.innerHTML=
      '<div class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3">'+
        '<div><h2 class="text-sm font-semibold text-slate-200"><i class="fa-solid fa-clipboard-check mr-2 text-indigo-400"></i>Production UAT Console</h2>'+
        '<p class="mt-1 text-[10px] text-slate-500">UAT-01 s.d. UAT-24 · evidence-preserving retest · build-specific sign-off.</p></div>'+
        '<span class="rounded border border-slate-700 px-2 py-1 text-[9px] text-slate-400">'+esc(build())+'</span>'+
      '</div>'+
      '<div class="mt-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4">'+
        '<div class="text-xs font-medium text-slate-200">Belum ada UAT run untuk build ini.</div>'+
        '<p class="mt-1 text-[10px] leading-relaxed text-slate-500">Mulai satu UAT run bersama untuk tenant '+esc(tenant())+'. Semua retest disimpan sebagai attempt baru dan tidak menimpa bukti sebelumnya.</p>'+
        '<div class="mt-3 flex flex-wrap gap-2"><button id="btnUatStart" class="rounded bg-indigo-600 px-3 py-2 text-[10px] font-semibold text-white '+(canWrite()?'':'opacity-50 cursor-not-allowed')+'" '+(canWrite()?'':'disabled')+'><i class="fa-solid fa-play mr-1"></i>Mulai UAT Build Ini</button>'+
        '<button id="btnUatRefresh" class="rounded bg-slate-700 px-3 py-2 text-[10px] text-white"><i class="fa-solid fa-rotate mr-1"></i>Refresh</button></div>'+
      '</div>';
  }
  function caseHtml(c,latest){
    var a=latest[c.id]||null;
    var historyCount=attempts.filter(function(x){return x.test_id===c.id;}).length;
    var disabled=(run&&run.status==='SIGNED_OFF')||!canWrite();
    return '<details class="rounded-lg border border-slate-800 bg-slate-950/25">'+
      '<summary class="cursor-pointer list-none px-3 py-3">'+
        '<div class="flex flex-wrap items-start justify-between gap-3">'+
          '<div class="min-w-0 flex-1"><div class="flex items-center gap-2"><span class="font-mono-num text-[10px] text-indigo-300">'+esc(c.id)+'</span><span class="text-[11px] font-medium text-slate-200">'+esc(c.title)+'</span></div>'+
          '<div class="mt-1 text-[9px] text-slate-500">'+(a?'Terakhir: '+esc(a.tester_role||'')+' · '+esc(fmtTime(a.created_at))+' · '+historyCount+' attempt':'Belum diuji')+'</div></div>'+
          '<span class="rounded border px-2 py-1 text-[9px] '+tone(a&&a.result)+'">'+esc(statusLabel(a&&a.result))+'</span>'+
        '</div>'+
      '</summary>'+
      '<div class="border-t border-slate-800 px-3 py-3">'+
        '<div class="grid grid-cols-1 lg:grid-cols-2 gap-3 text-[10px]">'+
          '<div class="rounded border border-slate-800 p-3"><div class="text-[9px] uppercase text-slate-500">Skenario</div><div class="mt-1 text-slate-300">'+esc(c.scenario)+'</div></div>'+
          '<div class="rounded border border-slate-800 p-3"><div class="text-[9px] uppercase text-slate-500">Expected Result</div><div class="mt-1 text-slate-300">'+esc(c.expected)+'</div></div>'+
        '</div>'+
        (a?'<div class="mt-3 rounded border border-slate-800 bg-slate-900/60 p-3 text-[10px]"><div class="text-[9px] uppercase text-slate-500">Latest Evidence</div><div class="mt-1 whitespace-pre-wrap text-slate-300">'+esc(a.evidence||'—')+'</div>'+(a.defect_ref?'<div class="mt-2 text-rose-300">Defect: '+esc(a.defect_ref)+'</div>':'')+(a.retest_notes?'<div class="mt-2 text-slate-400">Retest: '+esc(a.retest_notes)+'</div>':'')+'</div>':'')+
        '<div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">'+
          '<div><label class="mb-1 block text-[9px] text-slate-500">Hasil Test</label><select id="uatResult_'+c.id+'" class="field compact" '+(disabled?'disabled':'')+'><option value="">Pilih hasil</option><option value="PASS">PASS</option><option value="FAIL">FAIL</option><option value="BLOCKED">BLOCKED</option></select></div>'+
          '<div><label class="mb-1 block text-[9px] text-slate-500">Defect / Ticket Reference</label><input id="uatDefect_'+c.id+'" class="field compact" maxlength="500" placeholder="Wajib bila FAIL; contoh DEF-012" '+(disabled?'disabled':'')+' /></div>'+
          '<div class="md:col-span-2"><label class="mb-1 block text-[9px] text-slate-500">Evidence / Screenshot / Reference</label><textarea id="uatEvidence_'+c.id+'" rows="2" maxlength="5000" class="field resize-y" placeholder="Wajib. Tuliskan langkah verifikasi, request ID, document hash, screenshot reference, browser evidence, atau hasil yang diamati." '+(disabled?'disabled':'')+'></textarea></div>'+
          '<div class="md:col-span-2"><label class="mb-1 block text-[9px] text-slate-500">Catatan Retest</label><textarea id="uatRetest_'+c.id+'" rows="2" maxlength="5000" class="field resize-y" placeholder="Opsional; isi saat melakukan retest setelah defect diperbaiki." '+(disabled?'disabled':'')+'></textarea></div>'+
        '</div>'+
        '<div class="mt-3 flex flex-wrap items-center justify-between gap-2"><div class="text-[9px] text-slate-500">Tester: '+esc(currentUser?currentUser.name||currentUser.email:'—')+' · '+esc(currentUser?currentUser.role:'—')+'</div>'+
        '<button data-uat-save="'+c.id+'" class="rounded bg-indigo-600 px-3 py-1.5 text-[10px] font-semibold text-white '+(disabled?'opacity-50 cursor-not-allowed':'')+'" '+(disabled?'disabled':'')+'><i class="fa-solid fa-floppy-disk mr-1"></i>Simpan Attempt</button></div>'+
      '</div>'+
    '</details>';
  }
  function render(){
    var p=panel();if(!p)return;
    if(!run){renderEmpty(p);return;}
    var s=stats(),latest=latestMap(),signed=run.status==='SIGNED_OFF';
    var state=signed?'SIGNED OFF':s.ready?'READY FOR SIGN-OFF':'IN PROGRESS';
    var stateTone=signed?'text-emerald-300':s.ready?'text-cyan-300':'text-amber-300';
    p.innerHTML=
      '<div class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3">'+
        '<div><h2 class="text-sm font-semibold text-slate-200"><i class="fa-solid fa-clipboard-check mr-2 text-indigo-400"></i>Production UAT Console</h2>'+
        '<p class="mt-1 text-[10px] text-slate-500">Append-only attempts · RLS tenant isolation · final sign-off hanya setelah latest result seluruh UAT PASS.</p></div>'+
        '<div class="text-right"><div class="font-mono-num text-[9px] text-slate-500">'+esc(run.build_id)+'</div><div class="mt-1 text-xs font-semibold '+stateTone+'">'+esc(state)+'</div></div>'+
      '</div>'+
      '<div class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">'+
        summaryCard('PASS',String(s.PASS),'text-emerald-300')+
        summaryCard('FAIL',String(s.FAIL),'text-rose-300')+
        summaryCard('BLOCKED',String(s.BLOCKED),'text-amber-300')+
        summaryCard('NOT RUN',String(s.NOT_RUN),'text-slate-300')+
      '</div>'+
      '<div class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">'+
        '<div class="text-[10px] text-slate-400">Run dibuat '+esc(fmtTime(run.created_at))+(run.signed_off_at?' · Signed off '+esc(fmtTime(run.signed_off_at)):'')+'</div>'+
        '<div class="flex flex-wrap gap-2"><button id="btnUatRefresh" class="rounded bg-slate-700 px-3 py-1.5 text-[10px] text-white"><i class="fa-solid fa-rotate mr-1"></i>Refresh</button><button id="btnUatExport" class="rounded bg-slate-700 px-3 py-1.5 text-[10px] text-white"><i class="fa-solid fa-file-csv mr-1"></i>Export CSV</button></div>'+
      '</div>'+
      '<div class="mt-4 space-y-2">'+CASES.map(function(c){return caseHtml(c,latest);}).join('')+'</div>'+
      '<div class="mt-4 rounded-lg border '+(s.ready?'border-cyan-800':'border-slate-800')+' bg-slate-950/40 p-4">'+
        '<div class="flex flex-wrap items-start justify-between gap-3"><div><div class="text-xs font-medium text-slate-200">Final Sign-off</div><div class="mt-1 text-[10px] text-slate-500">'+(signed?'Build ini sudah ditandatangani dan UAT attempts baru dikunci.':s.ready?'Semua 24 latest results PASS. Procurement Head/Admin dapat melakukan sign-off.':'Belum siap: seluruh 24 latest results harus PASS.')+'</div></div>'+
        '<span class="rounded border px-2 py-1 text-[9px] '+(s.ready?'border-cyan-800 text-cyan-300':'border-slate-700 text-slate-500')+'">'+s.PASS+'/24 PASS</span></div>'+
        (signed?'<div class="mt-3 text-[10px] text-emerald-300">Signed off by user '+esc(run.signed_off_by||'—')+' · '+esc(fmtTime(run.signed_off_at))+(run.signoff_note?'<div class="mt-1 whitespace-pre-wrap text-slate-400">'+esc(run.signoff_note)+'</div>':'')+'</div>':
        '<div class="mt-3"><label class="mb-1 block text-[9px] text-slate-500">Sign-off Note / Residual UAT Note</label><textarea id="uatSignoffNote" rows="2" maxlength="5000" class="field resize-y" placeholder="Catatan final UAT, residual accepted, atau referensi evidence paket UAT."></textarea><button id="btnUatSignoff" class="mt-2 rounded bg-cyan-700 px-3 py-2 text-[10px] font-semibold text-white '+(s.ready&&canSign()?'':'opacity-50 cursor-not-allowed')+'" '+(s.ready&&canSign()?'':'disabled')+'><i class="fa-solid fa-signature mr-1"></i>Sign-off Production UAT</button>'+(canSign()?'':'<span class="ml-2 text-[9px] text-slate-500">Hanya Procurement Head/Admin.</span>')+'</div>')+
      '</div>';
  }
  function refresh(){
    if(!(window.HPSCloud&&window.HPSCloud.getUatRun)){run=null;attempts=[];render();return Promise.resolve();}
    return (window.HPSAuth&&window.HPSAuth.getSession?window.HPSAuth.getSession():Promise.resolve(null)).then(function(u){
      currentUser=u;
      return window.HPSCloud.getUatRun(build());
    }).then(function(r){
      run=r||null;
      if(!run){attempts=[];render();return null;}
      return window.HPSCloud.listUatAttempts(run.id).then(function(rows){attempts=rows||[];render();return rows;});
    }).catch(function(e){console.warn('[UAT]',e&&e.message||e);run=null;attempts=[];render();});
  }
  function startRun(){
    if(!canWrite()||!window.HPSCloud)return;
    var b=byId('btnUatStart');if(b){b.disabled=true;b.textContent='Creating…';}
    window.HPSCloud.createUatRun(build()).then(function(r){
      if(r&&r.error)throw new Error(r.error);
      return refresh();
    }).catch(function(e){alert(e.message||String(e));refresh();});
  }
  function saveAttempt(testId){
    if(!run||run.status==='SIGNED_OFF'||!canWrite())return;
    var result=byId('uatResult_'+testId),evidence=byId('uatEvidence_'+testId),defect=byId('uatDefect_'+testId),retest=byId('uatRetest_'+testId);
    var rv=result?result.value:'',ev=evidence?evidence.value.trim():'',df=defect?defect.value.trim():'',rt=retest?retest.value.trim():'';
    if(['PASS','FAIL','BLOCKED'].indexOf(rv)===-1){alert('Pilih hasil PASS, FAIL, atau BLOCKED.');return;}
    if(!ev){alert('Evidence / reference wajib diisi.');return;}
    if(rv==='FAIL'&&!df){alert('Defect / ticket reference wajib diisi untuk hasil FAIL.');return;}
    var btn=document.querySelector('[data-uat-save="'+testId+'"]');if(btn){btn.disabled=true;btn.textContent='Saving…';}
    window.HPSCloud.recordUatAttempt(run.id,{testId:testId,result:rv,evidence:ev,defectRef:df||null,retestNotes:rt||null,browserDevice:deviceInfo()}).then(function(r){
      if(r&&r.error)throw new Error(r.error);
      return refresh();
    }).catch(function(e){alert(e.message||String(e));refresh();});
  }
  function signoff(){
    if(!run||!stats().ready||!canSign()||!window.HPSCloud)return;
    var note=byId('uatSignoffNote'),value=note?note.value.trim():'';
    var b=byId('btnUatSignoff');if(b){b.disabled=true;b.textContent='Signing…';}
    window.HPSCloud.signoffUatRun(run.id,value||null).then(function(r){
      if(r&&r.error)throw new Error(r.error);
      return refresh();
    }).catch(function(e){alert(e.message||String(e));refresh();});
  }
  function csv(v){v=String(v==null?'':v);return '"'+v.replace(/"/g,'""')+'"';}
  function exportCsv(){
    if(!run)return;
    var latest=latestMap();
    var rows=[['Build','Test ID','Case','Latest Result','Tester Role','Tester User','Executed At','Evidence','Defect Ref','Retest Notes','Attempt Count']];
    CASES.forEach(function(c){
      var a=latest[c.id]||{};
      rows.push([run.build_id,c.id,c.title,a.result||'NOT RUN',a.tester_role||'',a.tester_user_id||'',a.created_at||'',a.evidence||'',a.defect_ref||'',a.retest_notes||'',attempts.filter(function(x){return x.test_id===c.id;}).length]);
    });
    var blob=new Blob([rows.map(function(r){return r.map(csv).join(',');}).join('\n')],{type:'text/csv;charset=utf-8'});
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='HPS-UAT-'+run.build_id+'.csv';document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},0);
  }
  function bind(p){
    p.addEventListener('click',function(ev){
      var t=ev.target&&ev.target.closest?ev.target.closest('button'):null;if(!t)return;
      if(t.id==='btnUatStart')startRun();
      else if(t.id==='btnUatRefresh')refresh();
      else if(t.id==='btnUatExport')exportCsv();
      else if(t.id==='btnUatSignoff')signoff();
      else if(t.getAttribute('data-uat-save'))saveAttempt(t.getAttribute('data-uat-save'));
    });
  }
  function init(){
    if(initialized)return;
    var p=panel();if(!p){setTimeout(init,150);return;}
    initialized=true;bind(p);render();setTimeout(refresh,100);
    if(window.HPSAuth&&window.HPSAuth.onChange)window.HPSAuth.onChange(function(){setTimeout(refresh,50);});
  }

  window.HPSUATConsole={init:init,refresh:refresh,getRun:function(){return run;},getAttempts:function(){return attempts.slice();},getCases:function(){return CASES.slice();},getStats:stats};
  if(document.readyState==='complete')setTimeout(init,0);else window.addEventListener('load',function(){setTimeout(init,0);});
})();