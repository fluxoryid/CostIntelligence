/* procurement-ux.js — procurement taxonomy guardrails and guided flow.
 * Keeps the existing calculation-engine category values intact while filtering
 * the visible category choices by Jenis Pengadaan. This prevents incompatible
 * combinations such as Jasa Konsultansi + IT Hardware.
 */
(function () {
  'use strict';

  var CATEGORY_MAP = {
    goods: [
      { value: 'IT Hardware', label: 'IT Hardware / Perangkat & Equipment' },
      { value: 'Data Center', label: 'Data Center Equipment / Infrastructure' },
      { value: 'Other', label: 'Barang Lainnya / General Goods' }
    ],
    services: [
      { value: 'Software/SaaS', label: 'Software / SaaS / Subscription' },
      { value: 'Manpower/BPO', label: 'Manpower / BPO / Outsourcing' },
      { value: 'Data Center', label: 'Data Center / Colocation / Cloud Infrastructure' },
      { value: 'Logistics', label: 'Logistics / Distribution / Warehousing' },
      { value: 'Payment Terminal Rental', label: 'Payment Terminal Rental / Managed Device' },
      { value: 'Other', label: 'Jasa Lainnya / Other Services' }
    ],
    consultancy: [
      { value: 'Other', label: 'Professional / Advisory Consulting (output-based)' },
      { value: 'Manpower/BPO', label: 'Resource / Man-day Consulting (resource-based)' }
    ],
    construction: [
      { value: 'Construction', label: 'Construction / Civil / MEP / Fit-Out' }
    ]
  };

  var TYPE_HELP = {
    goods: 'Kategori dibatasi ke profil biaya barang/peralatan. Rental dan jasa operasional tidak ditampilkan.',
    services: 'Kategori dibatasi ke jasa operasional, subscription, outsourcing, logistics, data center service, dan managed rental.',
    consultancy: 'Kategori hardware dan software product tidak ditampilkan. Pilih output-based advisory atau resource/man-day consulting sesuai pricing model.',
    construction: 'Kategori dikunci ke Construction agar cost-driver material, tenaga kerja, equipment, dan regional factor tetap relevan.'
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
    if (help) help.textContent = (TYPE_HELP[type.value] || '') + ' Kategori ini menentukan cost-driver profile untuk kalkulasi HPS.';

    if (cat.value !== previous) {
      cat.dispatchEvent(new Event('input', { bubbles: true }));
      cat.dispatchEvent(new Event('change', { bubbles: true }));
    }
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
          '<span><strong class="text-slate-200">1.</strong> Paket & Pagu</span><span>→</span>' +
          '<span><strong class="text-slate-200">2.</strong> Cost Build-up</span><span>→</span>' +
          '<span><strong class="text-slate-200">3.</strong> Production Evidence</span><span>→</span>' +
          '<span><strong class="text-slate-200">4.</strong> Vendor Comparison</span><span>→</span>' +
          '<span><strong class="text-slate-200">5.</strong> Review HPS & Governance</span><span>→</span>' +
          '<span><strong class="text-slate-200">6.</strong> Save / Export</span>' +
        '</div>' +
      '</div>';
    main.parentNode.insertBefore(wrap, main);
  }

  function init() {
    var type = byId('projCategory');
    var cat = byId('engineCategory');
    if (!type || !cat || type.dataset.categoryDependencyBound === 'true') return;

    type.dataset.categoryDependencyBound = 'true';
    ensureFlowGuide();
    ensureHelp(cat);
    applyDependency();

    type.addEventListener('change', function () {
      applyDependency();
    });
  }

  window.HPSProcurementUX = {
    CATEGORY_MAP: CATEGORY_MAP,
    applyDependency: applyDependency,
    init: init
  };

  // Run after app.js has restored any locally persisted form values, so the
  // dependency guard validates the restored Jenis/Kategori combination rather
  // than being overwritten by it.
  if (document.readyState === 'complete') setTimeout(init, 0);
  else window.addEventListener('load', function () { setTimeout(init, 0); });
})();
