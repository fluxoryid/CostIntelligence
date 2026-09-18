/* bahasa-id.js — terminologi UI Bahasa Indonesia untuk HPS Intelligence.
 * Prinsip: istilah procurement/finance/IT yang memiliki makna operasional
 * dipertahankan konsisten melalui glosarium; nilai internal/select tidak diubah.
 * Sumber terminologi mengikuti pendekatan glossary + style-rule DeepL:
 * industry-specific terms, UI terms, acronyms, and terms that should remain untranslated.
 */
(function(){
  'use strict';

  var EXACT = {
    'CONNECTING':'MENGHUBUNGKAN',
    'CACHED':'TERSIMPAN',
    'STALE':'KEDALUWARSA',
    'UNAVAILABLE':'TIDAK TERSEDIA',
    'LIVE':'LANGSUNG',
    'HYBRID':'HIBRIDA',
    'BLOCKED':'DIBLOKIR',
    'READY':'SIAP',
    'DEGRADED':'TERBATAS',
    'NOT READY':'BELUM SIAP',
    'PASS':'LOLOS',
    'FAIL':'GAGAL',
    'WARN':'PERINGATAN',
    'LOCAL':'LOKAL',
    'CLOUD SYNC':'SINKRON CLOUD',
    'CLOUD OFFLINE':'CLOUD TIDAK TERHUBUNG',
    'None':'Tidak Ada',
    'No response':'Tidak ada respons',
    'OK':'OK',
    'Production':'Produksi',
    'Production RC':'Kandidat Rilis Produksi',
    'Save Draft':'Simpan Draf',
    'Submit for Review':'Ajukan untuk Ditinjau',
    'Start Review':'Mulai Peninjauan',
    'Return for Rework':'Kembalikan untuk Perbaikan',
    'Approve HPS':'Setujui HPS',
    'Reject':'Tolak',
    'Lock Approved Version':'Kunci Versi yang Disetujui',
    'Workflow history':'Riwayat Alur Persetujuan',
    'Current Role':'Peran Saat Ini',
    'Evidence Gate':'Gerbang Bukti Pendukung',
    'Persistence':'Penyimpanan',
    'Supabase / RLS':'Supabase / RLS',
    'No workflow action yet.':'Belum ada tindakan alur persetujuan.',
    'Production Readiness Monitor':'Monitor Kesiapan Produksi',
    'Run Checks':'Jalankan Pemeriksaan',
    'Platform':'Platform',
    'Worker build / API version':'Build Worker / versi API',
    'Supabase Auth / tenant backend':'Autentikasi Supabase / backend tenant',
    'Browser security primitives':'Fitur keamanan browser',
    'Governance modules':'Modul tata kelola',
    'Bank Indonesia JISDOR':'JISDOR Bank Indonesia',
    'BPS inflation':'Inflasi BPS',
    'Kemenkeu Kurs Pajak':'Kurs Pajak Kemenkeu',
    'LKPP official catalog status':'Status katalog resmi LKPP',
    'ESDM regulation source':'Sumber regulasi ESDM',
    'Source':'Sumber',
    'Runtime':'Status Runtime',
    'Role':'Peran',
    'Score':'Skor',
    'Grade':'Tingkat',
    'HPS Use':'Penggunaan HPS',
    'Confidence':'Tingkat Keyakinan',
    'Models Used':'Model yang Digunakan',
    'Primary Evidence':'Bukti Utama',
    'Corroborating Evidence':'Bukti Penguat',
    'Reference / document / URL':'Referensi / dokumen / URL',
    'Published Date':'Tanggal Publikasi',
    'Valid Until':'Berlaku Sampai',
    'Reviewer verified':'Diverifikasi Peninjau',
    'Decision':'Keputusan',
    'Pending':'Menunggu',
    'Material':'Material',
    'Context':'Konteks',
    'Reject':'Tolak',
    'APPROVAL READY':'SIAP DISETUJUI',
    'REVIEW REQUIRED':'PERLU PENINJAUAN',
    'Evidence Coverage':'Cakupan Bukti',
    'Component Confidence':'Keyakinan Komponen',
    'Document Evidence Hub':'Pusat Dokumen Bukti Pendukung',
    'Upload Evidence':'Unggah Bukti Pendukung',
    'Upload':'Unggah',
    'Download':'Unduh',
    'Delete':'Hapus',
    'File':'Berkas',
    'Document Type':'Jenis Dokumen',
    'Expiry Date':'Tanggal Kedaluwarsa',
    'Version':'Versi',
    'Status':'Status',
    'Negotiation Intelligence':'Inteligensi Negosiasi',
    'Historical Outcomes':'Hasil Historis',
    'Production health checks not run yet.':'Pemeriksaan kesehatan produksi belum dijalankan.',
    'Sign In':'Masuk',
    'Signing in...':'Sedang masuk...',
    'Signed in successfully.':'Berhasil masuk.',
    'Signed out.':'Berhasil keluar.',
    'Email':'Email',
    'Password':'Kata sandi',
    'Cancel':'Batal',
    'Close':'Tutup',
    'Sync Data':'Sinkronkan Data',
    'Syncing...':'Menyinkronkan...',
    'Synced':'Tersinkron',
    'Save Snapshot':'Simpan Snapshot',
    'Export Audit Dossier':'Ekspor Dossier Audit',
    'Reset HPS':'Reset HPS',
    'Primary cost drivers':'Faktor pendorong biaya utama',
    'Category applicability profile':'Profil penerapan kategori',
    'Foreign Price Normalization & Landed-Cost Scenario':'Normalisasi Harga Valuta Asing & Skenario Biaya Landed',
    'Quantity':'Jumlah',
    'Freight IDR':'Biaya Angkut IDR',
    'Insurance IDR':'Asuransi IDR',
    'Other customs/handling IDR':'Biaya Kepabeanan/Penanganan Lain IDR',
    'Commercial IDR':'Nilai Komersial IDR',
    'Customs Base':'Dasar Kepabeanan',
    'Duty + Import Tax':'Bea Masuk + Pajak Impor',
    'Landed Scenario':'Skenario Biaya Landed'
  };

  var PHRASES = [
    [/Production Readiness Monitor/g,'Monitor Kesiapan Produksi'],
    [/Runtime, backend and official-provider smoke checks\./g,'Pemeriksaan singkat runtime, backend, dan penyedia data resmi.'],
    [/Category-specific evidence applicability remains governed by the HPS engine\./g,'Kesesuaian bukti per kategori tetap dikendalikan oleh mesin HPS.'],
    [/Source Reliability & Evidence Governance/g,'Keandalan Sumber & Tata Kelola Bukti Pendukung'],
    [/Evidence-to-Component/g,'Pemetaan Bukti ke Komponen'],
    [/Evidence to Component/g,'Pemetaan Bukti ke Komponen'],
    [/Approval Workflow & RBAC/g,'Alur Persetujuan & RBAC'],
    [/Maker-checker workflow\./g,'Alur maker-checker.'],
    [/Approved\/locked production versions are immutable/g,'Versi produksi yang telah disetujui\/dikunci bersifat tidak dapat diubah'],
    [/requires server-side Supabase RLS\/RPC enforcement/g,'memerlukan penegakan RLS\/RPC Supabase di sisi server'],
    [/Local preview — production approval disabled/g,'Pratinjau lokal — persetujuan produksi dinonaktifkan'],
    [/Production approval\/lock requires configured Supabase authentication and tenant RLS\./g,'Persetujuan\/penguncian produksi memerlukan autentikasi Supabase dan RLS tenant yang aktif.'],
    [/Submission blocked:/g,'Pengajuan diblokir:'],
    [/Approval blocked:/g,'Persetujuan diblokir:'],
    [/resolve critical evidence gaps/g,'selesaikan kekurangan bukti kritis'],
    [/supported direct cost/g,'biaya langsung yang didukung bukti'],
    [/Your role/g,'Peran Anda'],
    [/cannot perform/g,'tidak dapat melakukan'],
    [/A reason is required/g,'Alasan wajib diisi'],
    [/Reason \/ remediation required/g,'Alasan / perbaikan yang diperlukan'],
    [/Rejection reason/g,'Alasan penolakan'],
    [/Approval note/g,'Catatan persetujuan'],
    [/Workflow transition failed/g,'Transisi alur persetujuan gagal'],
    [/Cloud draft save failed/g,'Penyimpanan draf ke cloud gagal'],
    [/Required \/ Relevant Evidence for This Category/g,'Bukti yang Wajib / Relevan untuk Kategori Ini'],
    [/These are evidence requirements, not automatically verified sources\./g,'Daftar ini adalah kebutuhan bukti, bukan sumber yang otomatis terverifikasi.'],
    [/Only evidence accepted by Source Governance may materially influence the HPS\./g,'Hanya bukti yang diterima oleh Tata Kelola Sumber yang boleh memengaruhi HPS secara material.'],
    [/USER-PROVIDED \/ VERIFIED EVIDENCE ONLY/g,'HANYA INPUT PENGGUNA / BUKTI TERVERIFIKASI'],
    [/PRIMARY BASIS/g,'DASAR UTAMA'],
    [/Direct Non-Labor/g,'Biaya Langsung Non-Tenaga Kerja'],
    [/Direct Labor/g,'Tenaga Kerja Langsung'],
    [/Direct Cost Total/g,'Total Biaya Langsung'],
    [/Subtotal/g,'Subtotal'],
    [/Amount \(IDR\)/g,'Nominal (IDR)'],
    [/Qty/g,'Jumlah'],
    [/Unit Rate \(IDR\)/g,'Tarif Satuan (IDR)'],
    [/Intelligence profile:/g,'Profil inteligensi:'],
    [/Material HPS impact still requires accepted evidence under Source Governance\./g,'Dampak material terhadap HPS tetap memerlukan bukti yang diterima dalam Tata Kelola Sumber.'],
    [/Category-specific drivers will be applied by the calculation engine\./g,'Faktor khusus kategori akan diterapkan oleh mesin perhitungan.'],
    [/profile\)/g,'profil)'],
    [/Cost Build-up/g,'Rincian Biaya'],
    [/Production Evidence/g,'Bukti Pendukung Produksi'],
    [/Vendor Comparison/g,'Perbandingan Vendor'],
    [/Review & Approval/g,'Peninjauan & Persetujuan'],
    [/Outcome Learning/g,'Pembelajaran Hasil'],
    [/Document Evidence/g,'Bukti Dokumen'],
    [/Advanced Intelligence/g,'Inteligensi Lanjutan'],
    [/Governed Learning/g,'Pembelajaran Terkendali'],
    [/Foreign unit amount/g,'Nilai satuan valuta asing'],
    [/Import duty \(%\) — user verified/g,'Bea masuk (%) — diverifikasi pengguna'],
    [/Import VAT\/tax \(%\) — user verified/g,'PPN\/pajak impor (%) — diverifikasi pengguna'],
    [/Apply normalized unit price to primary component/g,'Terapkan harga satuan ternormalisasi ke komponen utama'],
    [/This landed-cost view is a scenario, not a tax ruling\./g,'Tampilan biaya landed ini merupakan skenario, bukan penetapan pajak.'],
    [/Duty\/tax percentages must be verified against DJBC\/Kemenkeu and the correct HS classification\./g,'Persentase bea\/pajak harus diverifikasi terhadap DJBC\/Kemenkeu dan klasifikasi HS yang benar.'],
    [/Freight\/insurance remain explicit to prevent double counting\./g,'Biaya angkut\/asuransi tetap ditampilkan terpisah untuk mencegah perhitungan ganda.'],
    [/Enter a foreign unit amount and retrieve an official current FX rate first\./g,'Masukkan nilai satuan valuta asing dan ambil kurs resmi terkini terlebih dahulu.'],
    [/No primary cost component is defined\./g,'Komponen biaya utama belum ditentukan.'],
    [/Current FX/g,'Kurs Saat Ini'],
    [/Historical FX/g,'Kurs Historis'],
    [/Kurs Pajak/g,'Kurs Pajak'],
    [/Foreign Price/g,'Harga Valuta Asing'],
    [/Commercial/g,'Komersial'],
    [/Historical/g,'Historis'],
    [/Current/g,'Saat Ini'],
    [/Evidence/g,'Bukti Pendukung'],
    [/Governance/g,'Tata Kelola'],
    [/Workflow/g,'Alur Persetujuan'],
    [/Approval/g,'Persetujuan'],
    [/Review/g,'Peninjauan'],
    [/Reviewer/g,'Peninjau'],
    [/Learning/g,'Pembelajaran'],
    [/Negotiation/g,'Negosiasi'],
    [/Document/g,'Dokumen'],
    [/Documents/g,'Dokumen'],
    [/Source/g,'Sumber'],
    [/Sources/g,'Sumber'],
    [/Market Benchmark/g,'Acuan Pasar'],
    [/Historical Escalation/g,'Eskalasi Historis'],
    [/Should-Cost Build-up/g,'Rincian Should-Cost'],
    [/Learning Model/g,'Model Pembelajaran'],
    [/Insufficient Data/g,'Data Tidak Memadai'],
    [/Fresh/g,'Terkini'],
    [/Primary/g,'Utama'],
    [/Supporting/g,'Pendukung'],
    [/Informational/g,'Informasional'],
    [/Rejected/g,'Ditolak']
  ];

  var PLACEHOLDERS = {
    'Live FX':'Kurs terkini',
    'Optional':'Opsional',
    'Comparable 1':'Pembanding 1',
    'Comparable 2':'Pembanding 2',
    'Comparable 3':'Pembanding 3',
    'Vendor 1':'Vendor 1',
    'Vendor 2':'Vendor 2',
    'Amount (IDR)':'Nominal (IDR)',
    'IDR':'IDR'
  };

  function translateText(input){
    var raw=String(input==null?'':input);
    var lead=(raw.match(/^\s*/)||[''])[0], trail=(raw.match(/\s*$/)||[''])[0], core=raw.trim();
    if(!core) return raw;
    if(EXACT[core]) return lead+EXACT[core]+trail;
    var out=core;
    PHRASES.forEach(function(pair){out=out.replace(pair[0],pair[1]);});
    return lead+out+trail;
  }

  function translateNode(node){
    if(!node) return;
    if(node.nodeType===3){
      var p=node.parentElement;
      if(!p || /^(SCRIPT|STYLE|CODE|PRE|OPTION)$/.test(p.tagName)) return;
      var next=translateText(node.nodeValue);
      if(next!==node.nodeValue) node.nodeValue=next;
      return;
    }
    if(node.nodeType!==1) return;
    if(/^(SCRIPT|STYLE|CODE|PRE|OPTION)$/.test(node.tagName)) return;
    ['placeholder','title','aria-label'].forEach(function(attr){
      if(!node.hasAttribute || !node.hasAttribute(attr)) return;
      var old=node.getAttribute(attr)||'';
      var next=PLACEHOLDERS[old]||translateText(old);
      if(next!==old) node.setAttribute(attr,next);
    });
    Array.prototype.slice.call(node.childNodes||[]).forEach(translateNode);
  }

  var nativeAlert=window.alert.bind(window);
  var nativeConfirm=window.confirm.bind(window);
  var nativePrompt=window.prompt.bind(window);
  window.alert=function(msg){return nativeAlert(translateText(msg));};
  window.confirm=function(msg){return nativeConfirm(translateText(msg));};
  window.prompt=function(msg,def){return nativePrompt(translateText(msg),def);};

  function run(){translateNode(document.body);}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',run);
  else run();

  var observer=new MutationObserver(function(mutations){
    mutations.forEach(function(m){
      if(m.type==='characterData') translateNode(m.target);
      Array.prototype.slice.call(m.addedNodes||[]).forEach(translateNode);
    });
  });
  if(document.documentElement) observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});

  window.HPSLangID={
    translate:translateText,
    refresh:run,
    glossary:{
      'Owner\'s Estimate':'Harga Perkiraan Sendiri (HPS)',
      'Procurement':'Pengadaan',
      'Evidence':'Bukti Pendukung',
      'Source Governance':'Tata Kelola Sumber',
      'Cost Driver':'Faktor Pendorong Biaya',
      'Benchmark':'Acuan/Pembanding',
      'Principal/OEM':'Principal/OEM',
      'Maker-Checker':'Maker-Checker',
      'RBAC':'RBAC',
      'JISDOR':'JISDOR',
      'Kurs Pajak':'Kurs Pajak',
      'Should-Cost':'Should-Cost'
    }
  };
})();