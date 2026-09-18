/* procurement-ux.js — procurement taxonomy guardrails and guided flow.
 * Keeps the existing calculation-engine category values intact while filtering
 * visible category/subcategory choices by Jenis Pengadaan. The extension does
 * not invent pricing data and does not change HPS values by itself.
 */
(function () {
  'use strict';

  var SUBCATEGORY_STORAGE_PREFIX = 'hps_subcategory_v1_';

  var CATEGORY_MAP = {
    goods: [
      { value: 'IT Hardware', label: 'Perangkat Keras TI / Peralatan' },
      { value: 'Data Center', label: 'Peralatan / Infrastruktur Pusat Data' },
      { value: 'Other', label: 'Barang Lainnya' }
    ],
    services: [
      { value: 'Software/SaaS', label: 'Perangkat Lunak / SaaS / Langganan' },
      { value: 'Manpower/BPO', label: 'Tenaga Kerja / BPO / Alih Daya' },
      { value: 'Data Center', label: 'Pusat Data / Kolokasi / Infrastruktur Cloud' },
      { value: 'Logistics', label: 'Logistik / Distribusi / Pergudangan' },
      { value: 'Payment Terminal Rental', label: 'Sewa Terminal Pembayaran / Perangkat Terkelola' },
      { value: 'Other', label: 'Jasa Lainnya' }
    ],
    consultancy: [
      { value: 'Other', label: 'Konsultansi Profesional / Advisory (berbasis keluaran)' },
      { value: 'Manpower/BPO', label: 'Konsultansi Berbasis Sumber Daya / Hari-Orang' }
    ],
    construction: [
      { value: 'Construction', label: 'Konstruksi / Sipil / MEP / Fit-Out' }
    ]
  };

  var SUBCATEGORY_OVERRIDES = {
    'goods|Other': [
      'General Goods', 'Spare Parts / Consumables', 'Office / Facility Equipment', 'Other Goods'
    ],
    'services|Other': [
      'General Services', 'Maintenance / Support Service', 'Managed Service', 'Professional Service', 'Other Services'
    ],
    'consultancy|Other': [
      'Management / Strategy Consulting', 'IT / Technology Consulting', 'Audit / Assessment',
      'Project / Program Management', 'Research / Study', 'Other Professional Consulting'
    ],
    'consultancy|Manpower/BPO': [
      'Resource-based Consulting', 'Expert / Specialist Man-day', 'Project Team / Squad', 'Technical Assistance'
    ]
  };

  var SUBCATEGORY_LABELS = {
    'General':'Umum',
    'Server':'Server',
    'Storage':'Penyimpanan',
    'Network Equipment':'Perangkat Jaringan',
    'Laptop/Desktop':'Laptop/Desktop',
    'Peripherals':'Periferal',
    'License':'Lisensi',
    'Subscription':'Langganan',
    'Cloud Service':'Layanan Cloud',
    'Maintenance/Support':'Pemeliharaan/Dukungan',
    'Outsourced Staffing':'Tenaga Kerja Alih Daya',
    'Managed Service':'Layanan Terkelola',
    'Project-Based Labor':'Tenaga Kerja Berbasis Proyek',
    'Civil Works':'Pekerjaan Sipil',
    'MEP':'MEP',
    'Fit-Out':'Fit-Out',
    'Materials Supply':'Pasokan Material',
    'Colocation':'Kolokasi',
    'Cloud Infrastructure':'Infrastruktur Cloud',
    'DC Equipment':'Peralatan Pusat Data',
    'Freight Forwarding':'Freight Forwarding',
    'Trucking/Distribution':'Trucking/Distribusi',
    'Warehousing':'Pergudangan',
    'EDC Terminal (Rental)':'Terminal EDC (Sewa)',
    'mPOS Terminal (Rental)':'Terminal mPOS (Sewa)',
    'Terminal + SIM Bundle (Rental)':'Paket Terminal + SIM (Sewa)',
    'General Goods':'Barang Umum',
    'Spare Parts / Consumables':'Suku Cadang / Barang Habis Pakai',
    'Office / Facility Equipment':'Peralatan Kantor / Fasilitas',
    'Other Goods':'Barang Lainnya',
    'General Services':'Jasa Umum',
    'Maintenance / Support Service':'Jasa Pemeliharaan / Dukungan',
    'Professional Service':'Jasa Profesional',
    'Other Services':'Jasa Lainnya',
    'Management / Strategy Consulting':'Konsultansi Manajemen / Strategi',
    'IT / Technology Consulting':'Konsultansi TI / Teknologi',
    'Audit / Assessment':'Audit / Asesmen',
    'Project / Program Management':'Manajemen Proyek / Program',
    'Research / Study':'Riset / Kajian',
    'Other Professional Consulting':'Konsultansi Profesional Lainnya',
    'Resource-based Consulting':'Konsultansi Berbasis Sumber Daya',
    'Expert / Specialist Man-day':'Hari-Orang Ahli / Spesialis',
    'Project Team / Squad':'Tim Proyek / Squad',
    'Technical Assistance':'Bantuan Teknis'
  };

  var TYPE_HELP = {
    goods: 'Kategori dibatasi pada profil biaya barang/peralatan. Sewa dan jasa operasional tidak ditampilkan.',
    services: 'Kategori dibatasi pada jasa operasional, langganan, alih daya, logistik, layanan pusat data, dan sewa terkelola.',
    consultancy: 'Kategori perangkat keras/produk tidak ditampilkan. Pilih konsultansi berbasis keluaran atau berbasis sumber daya/hari-orang sesuai model harga.',
    construction: 'Kategori dikunci ke Konstruksi agar faktor biaya material, tenaga kerja, peralatan, dan faktor regional tetap relevan.'
  };

  function byId(id) { return document.getElementById(id); }

  function ensureHelp(cat) {
    var label = cat && cat.parentElement && cat.parentElement.querySelector('label');
    if (label) label.textContent = 'Kategori Pengadaan';

    var help = byId('procurementCategoryDependencyHelp');
    if (!help && cat && cat.parentElement) {
      help = document.createElement('p');
      help.id = 'procurementCategoryDependencyHelp';
      help.className = 'mt-1 text-[10px] leading-relaxed text-slate-500';
      cat.parentElement.appendChild(help);
    }
    return help;
  }

  function subcategoryOptions(typeValue, categoryValue) {
    var override = SUBCATEGORY_OVERRIDES[typeValue + '|' + categoryValue];
    if (override && override.length) return override.slice();
    var category = window.CalcCore && window.CalcCore.CATEGORIES && window.CalcCore.CATEGORIES[categoryValue];
    return category && Array.isArray(category.subcategories) ? category.subcategories.slice() : ['General'];
  }

  function ensureSubcategoryField(cat) {
    var existing = byId('subCategory');
    if (existing) return existing;
    if (!cat || !cat.parentElement || !cat.parentElement.parentElement) return null;

    var wrapper = document.createElement('div');
    wrapper.id = 'subCategoryWrapper';
    wrapper.innerHTML =
      '<label class="block text-slate-400 mb-1 font-medium">Subkategori / Profil Harga</label>' +
      '<select id="subCategory" class="field"></select>' +
      '<p id="subCategoryHelp" class="mt-1 text-[10px] leading-relaxed text-slate-500">Subkategori memperjelas klasifikasi dan jejak audit; tidak membuat acuan sintetis.</p>';

    var grid = cat.parentElement.parentElement;
    if (cat.parentElement.nextSibling) grid.insertBefore(wrapper, cat.parentElement.nextSibling);
    else grid.appendChild(wrapper);

    existing = byId('subCategory');
    if (existing) {
      existing.addEventListener('change', function () {
        persistSubcategory();
        updateIntelligenceProfile();
      });
    }
    return existing;
  }

  function storageKey() {
    var type = byId('projCategory');
    var cat = byId('engineCategory');
    return SUBCATEGORY_STORAGE_PREFIX + (type ? type.value : 'unknown') + '_' + (cat ? cat.value : 'unknown');
  }

  function persistSubcategory() {
    var sub = byId('subCategory');
    if (!sub) return;
    try { localStorage.setItem(storageKey(), sub.value || ''); } catch (e) {}
  }

  function populateSubcategory() {
    var type = byId('projCategory');
    var cat = byId('engineCategory');
    if (!type || !cat) return;
    var sub = ensureSubcategoryField(cat);
    if (!sub) return;

    var options = subcategoryOptions(type.value, cat.value);
    var previous = sub.value;
    var saved = '';
    try { saved = localStorage.getItem(storageKey()) || ''; } catch (e) {}
    var target = options.indexOf(previous) !== -1 ? previous : (options.indexOf(saved) !== -1 ? saved : options[0]);

    sub.innerHTML = '';
    options.forEach(function (value) {
      var opt = document.createElement('option');
      opt.value = value;
      opt.textContent = SUBCATEGORY_LABELS[value] || value;
      sub.appendChild(opt);
    });
    sub.value = target || '';
    persistSubcategory();
    updateIntelligenceProfile();
  }

  function ensureIntelligenceProfile() {
    var sub = byId('subCategory');
    if (!sub || !sub.parentElement) return null;
    var box = byId('categoryIntelligenceProfile');
    if (box) return box;
    box = document.createElement('div');
    box.id = 'categoryIntelligenceProfile';
    box.className = 'mt-2 rounded border border-slate-800 bg-slate-950/50 px-3 py-2 text-[10px] leading-relaxed text-slate-400';
    sub.parentElement.appendChild(box);
    return box;
  }

  function updateIntelligenceProfile() {
    var cat = byId('engineCategory');
    var sub = byId('subCategory');
    var box = ensureIntelligenceProfile();
    if (!cat || !box) return;

    var category = window.CalcCore && window.CalcCore.CATEGORIES && window.CalcCore.CATEGORIES[cat.value];
    var drivers = category && Array.isArray(category.drivers) ? category.drivers.slice(0, 6) : [];
    var driverText = drivers.map(function (d) {
      return d.name + (typeof d.weight === 'number' ? ' (' + Math.round(d.weight * 100) + '% profile)' : '');
    }).join(' · ');

    box.innerHTML = '<strong class="text-slate-300">Profil inteligensi:</strong> ' +
      (sub && sub.value ? '<span class="text-cyan-300">' + escapeHtml(SUBCATEGORY_LABELS[sub.value] || sub.value) + '</span>. ' : '') +
      (driverText ? 'Faktor pendorong biaya utama: ' + escapeHtml(driverText) + '.' : 'Faktor khusus kategori akan diterapkan oleh mesin perhitungan.') +
      ' Dampak material terhadap HPS tetap memerlukan bukti yang diterima dalam Tata Kelola Sumber.';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  function applyDependency() {
    var type = byId('projCategory');
    var cat = byId('engineCategory');
    if (!type || !cat) return;

    var options = CATEGORY_MAP[type.value] || CATEGORY_MAP.services;
    var previous = cat.value;
    var keepPrevious = options.some(function (o) { return o.value === previous; });

    cat.innerHTML = '';
    options.forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      cat.appendChild(opt);
    });

    if (keepPrevious) cat.value = previous;
    else if (options.length) cat.value = options[0].value;

    cat.dataset.procurementType = type.value;
    var help = ensureHelp(cat);
    if (help) help.textContent = (TYPE_HELP[type.value] || '') + ' Kategori menentukan profil faktor biaya dan bukti pendukung yang relevan.';

    populateSubcategory();

    if (cat.value !== previous) {
      cat.dispatchEvent(new Event('input', { bubbles: true }));
      cat.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function patchRequestEnrichment() {
    if (!window.CalcCore || window.CalcCore.__subcategoryEnrichmentPatched) return;
    var original = window.CalcCore.generateClassification;
    if (typeof original !== 'function') return;

    window.CalcCore.generateClassification = function (input) {
      var sub = byId('subCategory');
      if (input && sub && sub.value) input.subCategory = sub.value;
      return original(input);
    };
    window.CalcCore.__subcategoryEnrichmentPatched = true;
  }

  function ensureFlowGuide() {
    if (byId('hpsFlowGuide')) return;
    var main = document.querySelector('main');
    if (!main || !main.parentNode) return;

    var wrap = document.createElement('section');
    wrap.id = 'hpsFlowGuide';
    wrap.className = 'max-w-7xl w-full mx-auto px-4 pt-4';
    wrap.innerHTML =
      '<div class="rounded-xl border border-cyan-900/50 bg-cyan-950/20 px-4 py-3 text-xs">' +
        '<div class="font-semibold text-cyan-300 mb-2"><i class="fa-solid fa-route mr-1.5"></i>Alur Penggunaan HPS Intelligence</div>' +
        '<div class="flex flex-wrap gap-x-2 gap-y-1 text-slate-400">' +
          '<span><strong class="text-slate-200">1.</strong> Jenis → Kategori → Subkategori</span><span>→</span>' +
          '<span><strong class="text-slate-200">2.</strong> Paket & Pagu</span><span>→</span>' +
          '<span><strong class="text-slate-200">3.</strong> Cost Build-up</span><span>→</span>' +
          '<span><strong class="text-slate-200">4.</strong> Production Evidence</span><span>→</span>' +
          '<span><strong class="text-slate-200">5.</strong> Vendor Comparison</span><span>→</span>' +
          '<span><strong class="text-slate-200">6.</strong> Review HPS & Governance</span><span>→</span>' +
          '<span><strong class="text-slate-200">7.</strong> Save / Export</span>' +
        '</div>' +
      '</div>';
    main.parentNode.insertBefore(wrap, main);
  }

  function init() {
    var type = byId('projCategory');
    var cat = byId('engineCategory');
    if (!type || !cat || type.dataset.categoryDependencyBound === 'true') return;

    type.dataset.categoryDependencyBound = 'true';
    patchRequestEnrichment();
    ensureFlowGuide();
    ensureHelp(cat);
    ensureSubcategoryField(cat);
    applyDependency();

    type.addEventListener('change', function () {
      applyDependency();
    });
    cat.addEventListener('change', function () {
      populateSubcategory();
      updateIntelligenceProfile();
    });
  }

  window.HPSProcurementUX = {
    CATEGORY_MAP: CATEGORY_MAP,
    SUBCATEGORY_OVERRIDES: SUBCATEGORY_OVERRIDES,
    applyDependency: applyDependency,
    populateSubcategory: populateSubcategory,
    init: init
  };

  // Run after app.js has restored any locally persisted form values, so the
  // dependency guard validates the restored Jenis/Kategori combination rather
  // than being overwritten by it.
  if (document.readyState === 'complete') setTimeout(init, 0);
  else window.addEventListener('load', function () { setTimeout(init, 0); });
})();
