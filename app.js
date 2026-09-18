/* app.js — Enterprise dark UI merged with HPS Intelligence Live-Ready core.
 * HYBRID_STRICT is enforced. This UI never fabricates missing production
 * evidence: user-entered cost build-up is treated as USER PROVIDED evidence;
 * market Model B activates only with >=3 explicit comparables.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'hps_production_fresh_v1';
  var LEARNING_KEY = 'hps_learning_outcomes_v1';
  var TENANT_ID = (window.HPS_CONFIG && window.HPS_CONFIG.TENANT_ID) || 'default-org';
  var learningEvents = [];
  var currentUser = null;
  var currentRequestId = 'req_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  var latestSnapshot = null;
  var syncInFlight = false;
  var appStarted = false;
  var hpsResetMode = false;

  function el(id) { return document.getElementById(id); }
  function num(id) { var n = Number(el(id) && el(id).value); return isFinite(n) ? n : 0; }
  function fmtIDR(v) {
    if (v == null || !isFinite(Number(v))) return '—';
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v));
  }
  function fmtNum(v, digits) {
    if (v == null || !isFinite(Number(v))) return '—';
    return Number(v).toLocaleString('id-ID', { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 });
  }
  function isoNow() { return new Date().toISOString(); }
  function formatParameterDate(raw) {
    if (!raw) return '—';
    var s = String(raw).trim();
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      var d = new Date(iso[1] + '-' + iso[2] + '-' + iso[3] + 'T00:00:00Z');
      if (isFinite(d.getTime())) return new Intl.DateTimeFormat('id-ID', { day:'2-digit', month:'short', year:'numeric', timeZone:'UTC' }).format(d);
    }
    return s;
  }

  function notify(message, type) {
    var bar = el('notificationBar');
    if (!bar) return;
    var cls = type === 'error' ? 'border-rose-800 bg-rose-950/50 text-rose-300' : type === 'success' ? 'border-emerald-800 bg-emerald-950/50 text-emerald-300' : 'border-slate-700 bg-slate-900 text-slate-300';
    bar.innerHTML = '<div class="rounded-lg border px-3 py-2 text-xs ' + cls + '">' + escapeHtml(message) + '</div>';
    bar.classList.remove('hidden');
    clearTimeout(notify._t);
    notify._t = setTimeout(function () { bar.classList.add('hidden'); }, 4200);
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; });
  }

  function ownerBuildUp() {
    var materialGross = num('matQty') * num('matUnitPrice');
    var labor = num('laborDays') * num('laborRate');
    var primaryBase = materialGross;
    if (window.HPSCategoryCostUX && typeof window.HPSCategoryCostUX.getPrimaryAmount === 'function') {
      var categoryPrimary = Number(window.HPSCategoryCostUX.getPrimaryAmount());
      if (isFinite(categoryPrimary) && categoryPrimary >= 0) primaryBase = Math.min(materialGross, categoryPrimary);
    }
    var discountMode = el('principalDiscountMode') ? el('principalDiscountMode').value : 'PERCENT';
    var discountValue = num('principalDiscountValue');
    var principalDiscount = discountMode === 'AMOUNT'
      ? Math.min(primaryBase, Math.max(0, discountValue))
      : Math.min(primaryBase, primaryBase * Math.min(100, Math.max(0, discountValue)) / 100);
    var material = Math.max(0, materialGross - principalDiscount);
    var direct = material + labor;
    var overhead = direct * (num('overheadPercent') / 100);
    var profit = (direct + overhead) * (num('profitPercent') / 100);
    var net = direct + overhead + profit;
    var tax = net * (num('taxPercent') / 100);
    return {
      materialGross: materialGross,
      primaryDiscountBase: primaryBase,
      principalDiscountMode: discountMode,
      principalDiscountInput: discountValue,
      principalDiscount: principalDiscount,
      material: material,
      labor: labor,
      direct: direct,
      overhead: overhead,
      profit: profit,
      net: net,
      tax: tax,
      gross: net + tax
    };
  }

  function applyLiveDataOverrides(sources) {
    var C = window.CalcCore;
    sources = C.applyLiveFxOverride(sources, window.HPSFx && window.HPSFx.getRate());
    sources = C.applyLiveWbOverride(sources, window.HPSWB && window.HPSWB.getValue());
    sources = C.applyLiveLkppOverride(sources, window.HPSLkpp && window.HPSLkpp.getData());
    sources = C.applyLiveKursPajakOverride(sources, window.HPSFx && window.HPSFx.getKursPajak());
    sources = C.applyLiveBiRateOverride(sources, window.HPSFx && window.HPSFx.getBiRate());
    sources = C.applyLiveEsdmOverride(sources, window.HPSLkpp && window.HPSLkpp.getEsdmData());
    if (C.applyLiveEiaOverride) sources = C.applyLiveEiaOverride(sources, window.HPSLkpp && window.HPSLkpp.getEiaData && window.HPSLkpp.getEiaData());
    return sources;
  }

  function buildRequest(build) {
    var benchmarks = [1,2,3].map(function (i) {
      var value = num('benchmark' + i); if (value <= 0) return null;
      var key = el('benchmark' + i + 'Type').value;
      var meta = key === 'INAPROC_TRANSACTION' && window.HPSInaproc && window.HPSInaproc.getSelectedBenchmark
        ? window.HPSInaproc.getSelectedBenchmark(i) : null;
      var publishedDate = meta && meta.transactionDate ? meta.transactionDate : null;
      var gov = window.HPSSourceEngine
        ? window.HPSSourceEngine.scoreSource(key, {retrievedAt:(meta&&meta.retrievedAt)||isoNow(),publishedDate:publishedDate})
        : {allowed:true,label:key,grade:'ACCEPTABLE'};
      var hasRequiredInaprocProvenance = key !== 'INAPROC_TRANSACTION' || !!(meta && meta.reference && meta.retrievedAt && meta.priceBasis && meta.priceBasis !== 'UNVERIFIED');
      return {
        value:value,
        sourceKey:key,
        status:(gov.allowed && hasRequiredInaprocProvenance) ? 'USER PROVIDED' : 'REJECTED',
        source:gov.label,
        observedAt:publishedDate || isoNow(),
        reference:meta&&meta.reference||null,
        vendor:meta&&meta.vendor||null,
        quantity:meta&&meta.quantity||null,
        packageName:meta&&meta.packageName||null,
        itemName:meta&&meta.itemName||null,
        priceBasis:meta&&meta.priceBasis||null,
        rawUnitPrice:meta&&meta.rawUnitPrice||null,
        normalizedUnitPrice:meta&&meta.normalizedUnitPrice||null,
        taxPct:meta&&meta.taxPct||null,
        sourceUrl:meta&&meta.sourceUrl||null,
        retrievedAt:meta&&meta.retrievedAt||isoNow(),
        governance:gov
      };
    }).filter(Boolean);
    var input = {
      businessUnit: '', requester: currentUser ? currentUser.name : 'Local User',
      category: el('engineCategory').value, subCategory: '', productName: el('projName').value.trim(),
      description: el('projDescription').value.trim(), quantity: Math.max(1, num('matQty') || 1), uom: 'unit',
      requiredDate: '', deliveryLocation: '', origin: 'Mixed', currency: el('baseCurrency').value,
      procurementType: el('projCategory').value, historicalPrice: num('historicalPrice') || '', historicalDate: '',
      historicalFxRate: num('historicalFxRate') || '', supplierQuotation: '', principalQuotation: '',
      marketBenchmarks: benchmarks,
      shouldCostBase: build.net > 0 ? build.net : '', costDriverObservations: [],
      commercialTerms: 'Diskon Principal/OEM: ' + (build.principalDiscountMode === 'AMOUNT' ? fmtIDR(build.principalDiscountInput) : fmtNum(build.principalDiscountInput,2) + '%') + '; nilai diskon diterapkan: ' + fmtIDR(build.principalDiscount),
      warranty: '', taxTreatment: 'PPN efektif ' + num('taxPercent') + '%',
      notes: 'Rincian biaya HPS berasal dari input pengguna dan bukti pendukung yang diterima.', calculationMode: (window.HPS_CONFIG && window.HPS_CONFIG.CALCULATION_MODE) || 'HYBRID_STRICT'
    };
    var req = {
      id: currentRequestId, tenantId: TENANT_ID, version: 1, status: 'Draft', calculationMode: input.calculationMode, runtimeMode: 'BLOCKED',
      createdBy: currentUser ? currentUser.name : 'Local User', createdAt: isoNow(), input: input,
      scenario: { fx:0, index:0, commodity:0, freight:0, labor:0, margin:0, volumeDiscount:0 }, approval: { stage: 'Draft', history: [] }, learningEvents: []
    };
    req.classification = window.CalcCore.generateClassification(input);
    req.coverage = window.CalcCore.computeCoverage(input, true);
    req.sources = applyLiveDataOverrides(window.CalcCore.generateSources(input, true));
    // Explicit market comparables are evidence objects, not anonymous numbers.
    (input.marketBenchmarks || []).forEach(function (b, i) {
      req.sources.push({
        sourceKey:b.sourceKey,
        name:(b.source || 'Pembanding') + ' #' + (i + 1),
        status:b.status || 'USER PROVIDED',
        value:b.value,
        publishedDate:b.observedAt || null,
        retrievedAt:b.retrievedAt || isoNow(),
        freshness:'Fresh',
        trustScore:b.governance ? b.governance.score : 75,
        reference:b.reference || null,
        vendor:b.vendor || null,
        quantity:b.quantity || null,
        packageName:b.packageName || null,
        itemName:b.itemName || null,
        priceBasis:b.priceBasis || null,
        rawUnitPrice:b.rawUnitPrice || null,
        normalizedUnitPrice:b.normalizedUnitPrice || null,
        taxPct:b.taxPct || null,
        sourceUrl:b.sourceUrl || null,
        note:b.sourceKey==='INAPROC_TRANSACTION'
          ? 'Riwayat transaksi resmi Data INAPROC; dipilih pengguna setelah verifikasi basis harga dan tetap memerlukan telaah kesebandingan spesifikasi, kuantitas, lokasi, pajak, ongkir, periode, dan ruang lingkup.'
          : 'Pembanding yang diatestasi pengguna; kesebandingan spesifikasi dan ketentuan komersial tetap menjadi tanggung jawab peninjau.'
      });
    });
    if (window.HPSSourceEngine) {
      req.sources = req.sources.map(function (src) {
        var e = window.HPSSourceEngine.enrich(src);
        e.trustScore = e.governance.score;
        return e;
      });
    }
    req.costDrivers = window.CalcCore.generateCostDrivers(req);
    return req;
  }

  function calculateStrict(req) {
    var C = window.CalcCore;
    var models = { A: C.modelA(req), B: C.modelB(req), C: C.modelC(req), D: C.modelD(req, learningEvents) };
    var tri = C.triangulate(models, { A:0.30, B:0.30, C:0.30, D:0.10 }, req.calculationMode);
    var conf = tri.recommended != null ? C.computeConfidence(req, models, req.sources, req.coverage) : { score:0, label:'Insufficient Data', capped:false, components:{} };
    var runtime = C.assessRuntimeMode(req, models);
    req.runtimeMode = runtime.mode; req.runtimeReason = runtime.reason;
    req.hps = { models:models, recommended:tri.recommended, low:tri.low, high:tri.high, weightsUsed:tri.weightsUsed, weightsExact:tri.weightsExact, error:tri.error || null, confidence:conf.score, confidenceLabel:conf.label, runtimeMode:runtime.mode, runtimeReason:runtime.reason };
    return req;
  }

  function recalculate() {
    var build = ownerBuildUp();
    el('subtotalMaterial').textContent = fmtIDR(build.material);
    el('subtotalLabor').textContent = fmtIDR(build.labor);
    if (el('principalDiscountDisplay')) el('principalDiscountDisplay').textContent = '-' + fmtIDR(build.principalDiscount);
    el('ownerBuildDisplay').textContent = fmtIDR(build.net);

    var req = calculateStrict(buildRequest(build));
    var netHps = req.hps.recommended;
    if (hpsResetMode) {
      Object.keys(req.hps.models || {}).forEach(function(k){
        req.hps.models[k] = { value:null, status:'UNAVAILABLE', reason:'HPS direset oleh pengguna.' };
      });
      req.hps.recommended = 0;
      req.hps.low = 0;
      req.hps.high = 0;
      req.hps.confidence = 0;
      req.hps.confidenceLabel = 'Direset';
      req.runtimeMode = 'BLOCKED';
      req.runtimeReason = 'HPS aktif telah direset ke 0. Masukkan nilai biaya/evidence baru untuk memulai perhitungan.';
      netHps = 0;
    }
    var grossHps = netHps == null ? null : netHps * (1 + num('taxPercent') / 100);
    latestSnapshot = buildSnapshot(req, build, grossHps);

    el('hpsNetDisplay').textContent = fmtIDR(netHps);
    el('hpsGrossDisplay').textContent = fmtIDR(grossHps);
    updateRuntime(req);
    updateBudget(grossHps);
    updateVendorComparison(grossHps);
    updateModels(req.hps.models);
    renderSourceGovernance(req.sources);
    updateLearningStatus(req);
    updateAuditEvidence(req, build);
    updateCloudBadge();
    persistForm();
  }

  function updateRuntime(req) {
    var badge = el('runtimeModeBadge');
    var mode = req.runtimeMode || 'BLOCKED';
    badge.textContent = mode;
    var classes = {
      LIVE:'bg-emerald-950 text-emerald-400 border-emerald-800',
      HYBRID:'bg-cyan-950 text-cyan-300 border-cyan-800',
      DEMO:'bg-amber-950 text-amber-300 border-amber-800',
      BLOCKED:'bg-rose-950 text-rose-300 border-rose-800'
    };
    badge.className = 'px-2 py-0.5 rounded text-[11px] font-semibold border ' + (classes[mode] || classes.BLOCKED);
    el('runtimeReason').textContent = req.runtimeReason || '';
    el('confidenceDisplay').textContent = req.hps.recommended == null ? '—' : (req.hps.confidence + '% · ' + req.hps.confidenceLabel);
    var used = Object.keys(req.hps.models).filter(function (k) { return req.hps.models[k] && req.hps.models[k].value != null; });
    el('modelsUsedDisplay').textContent = used.length ? used.join(' / ') : 'Tidak Ada';
  }

  function updateBudget(grossHps) {
    var budget = num('budgetLimit');
    var display = el('budgetVarianceDisplay'), badge = el('budgetBadge');
    if (grossHps == null || grossHps <= 0 || budget <= 0) {
      display.textContent = '—'; display.className = 'font-semibold text-slate-400 font-mono-num';
      badge.textContent = 'Belum Tersedia'; badge.className = 'inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700';
      return;
    }
    var variance = budget - grossHps;
    var pct = (variance / budget) * 100;
    if (variance >= 0) {
      display.textContent = pct.toFixed(1) + '% (' + fmtIDR(variance) + ' efisiensi)';
      display.className = 'font-semibold text-emerald-400 font-mono-num';
      badge.textContent = 'Dalam Batas Pagu'; badge.className = 'inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800';
    } else {
      display.textContent = 'Melebihi Pagu: ' + fmtIDR(Math.abs(variance));
      display.className = 'font-semibold text-rose-400 font-mono-num';
      badge.textContent = 'Melebihi Pagu'; badge.className = 'inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950 text-rose-400 border border-rose-800';
    }
  }

  function updateVendorComparison(grossHps) {
    var threshold = grossHps == null ? null : grossHps * 0.8;
    el('threshold80Display').textContent = fmtIDR(threshold);
    [['v1Price','v1Deviation'],['v2Price','v2Deviation']].forEach(function (x) {
      var p = num(x[0]), out = el(x[1]);
      if (!grossHps || p <= 0) { out.textContent = '—'; out.className = 'font-mono-num text-slate-400 font-semibold'; return; }
      var diff = p - grossHps, pct = (diff / grossHps) * 100;
      out.textContent = (diff >= 0 ? '+' : '') + pct.toFixed(1) + '% (' + (diff >= 0 ? '+' : '') + fmtIDR(diff) + ')';
      out.className = 'font-mono-num font-semibold ' + (diff <= 0 ? 'text-emerald-400' : 'text-rose-400');
    });
    var v = [num('v1Price'),num('v2Price')].filter(function (n) { return n > 0; });
    var alert = el('complianceAlert');
    if (!threshold || !v.length) {
      alert.className = 'p-3 rounded-lg border text-xs leading-relaxed bg-slate-950 border-slate-800 text-slate-400';
      alert.innerHTML = 'Menunggu HPS dan penawaran vendor.'; return;
    }
    var minVendor = Math.min.apply(Math, v);
    if (minVendor < threshold) {
      alert.className = 'p-3 rounded-lg border text-xs leading-relaxed bg-amber-950/40 border-amber-800/80 text-amber-300';
      alert.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1.5 text-amber-400"></i><strong>Perhatian:</strong> Penawaran terendah (' + fmtIDR(minVendor) + ') berada di bawah 80% HPS (' + fmtIDR(threshold) + '). Untuk PBJ Pemerintah yang tunduk pada aturan tersebut, verifikasi besaran Jaminan Pelaksanaan sesuai Pasal 33(3).';
    } else {
      alert.className = 'p-3 rounded-lg border text-xs leading-relaxed bg-emerald-950/40 border-emerald-800/80 text-emerald-300';
      alert.innerHTML = '<i class="fa-solid fa-circle-check mr-1.5 text-emerald-400"></i> Penawaran vendor berada pada/di atas ambang 80% HPS.';
    }
  }

  function updateModels(models) {
    var labels = { A:'Eskalasi Historis', B:'Acuan Pasar', C:'Rincian Should-Cost', D:'Model Pembelajaran' };
    el('modelCards').innerHTML = ['A','B','C','D'].map(function (k) {
      var m = models[k] || {}; var ok = m.value != null;
      var status = m.status || 'UNAVAILABLE';
      var tone = status === 'LIVE' ? 'text-emerald-400' : status === 'USER PROVIDED' || status === 'INTERNAL' ? 'text-cyan-300' : status === 'HYBRID' ? 'text-cyan-300' : 'text-slate-500';
      return '<div class="p-3 rounded-lg border border-slate-800 bg-slate-950/60 flex items-center justify-between gap-3"><div><div class="font-medium text-slate-300">Model ' + k + ' · ' + labels[k] + '</div><div class="text-[10px] ' + tone + '">' + escapeHtml(status) + '</div></div><div class="font-mono-num font-semibold ' + (ok ? 'text-slate-100' : 'text-slate-500') + '">' + (ok ? fmtIDR(m.value) : '—') + '</div></div>';
    }).join('');
  }

  function updateAuditEvidence(req, build) {
    var live = (req.sources || []).filter(function (s) { return s.status === 'LIVE'; });
    var cached = (req.sources || []).filter(function (s) { return s.status === 'CACHED'; });
    var benchCount = window.CalcCore.parseMarketBenchmarks(req.input).filter(function (b) { return window.CalcCore.isAcceptedEvidenceStatus(b.status); }).length;
    var items = [
      'Owner cost build-up supplied explicitly: material ' + fmtIDR(build.material) + ', labor ' + fmtIDR(build.labor) + ', overhead/profit calculated from entered rates.',
      'Calculation mode: HYBRID_STRICT; AI-generated, random/synthetic and low-grade informational sources are excluded from production HPS.',
      live.length + ' live provider observation(s) currently available' + (cached.length ? '; ' + cached.length + ' cached observation(s).' : '.'),
      'Verified comparable market observations supplied: ' + benchCount + (benchCount >= 3 ? ' — Model B eligible.' : ' — Model B remains inactive until at least 3 are provided.'),
      'HPS detail is treated as confidential/non-public and should be locked only after evidence review and approval.'
    ];
    el('auditEvidenceList').innerHTML = items.map(function (t) { return '<li class="flex items-start gap-2"><i class="fa-solid fa-check text-indigo-400 mt-0.5"></i><span>' + escapeHtml(t) + '</span></li>'; }).join('');
  }

  function renderSourceGovernance(sources) {
    var body = el('sourceGovernanceRows');
    if (!body || !window.HPSSourceEngine) return;
    var rows = (sources || []).map(function (s) { return s.governance ? s : window.HPSSourceEngine.enrich(s); });
    rows.sort(function (a,b) { return (b.governance.score || 0) - (a.governance.score || 0); });
    body.innerHTML = rows.map(function (s) {
      var g = s.governance;
      var active = ['LIVE','CACHED','INTERNAL','USER PROVIDED','VERIFIED'].indexOf(s.status) !== -1;
      var use = !g.allowed ? 'BLOCKED' : !active ? 'NOT ACTIVE' : (window.HPSSourceEngine.canInfluenceHps(s) && typeof s.value === 'number' ? 'ELIGIBLE' : 'REFERENCE ONLY');
      var tone = g.grade === 'REJECTED' ? 'text-rose-400' : g.score >= 90 ? 'text-emerald-400' : g.score >= 80 ? 'text-cyan-300' : g.score >= 70 ? 'text-amber-300' : 'text-slate-400';
      var useTone = use === 'ELIGIBLE' ? 'text-emerald-400' : use === 'BLOCKED' ? 'text-rose-400' : 'text-slate-400';
      return '<tr><td class="py-2 pr-3"><div class="text-slate-200">' + escapeHtml(s.name) + '</div><div class="text-[10px] text-slate-600">' + escapeHtml(g.note || '') + '</div></td>' +
        '<td class="py-2 pr-3 font-mono-num text-slate-400">' + escapeHtml(s.status || 'UNAVAILABLE') + '</td>' +
        '<td class="py-2 pr-3 text-slate-400">' + escapeHtml(g.role) + '</td>' +
        '<td class="py-2 pr-3 text-right font-mono-num ' + tone + '">' + g.score + '</td>' +
        '<td class="py-2 pr-3 ' + tone + '">' + escapeHtml(g.grade) + '</td>' +
        '<td class="py-2 ' + useTone + '">' + use + '</td></tr>';
    }).join('');
  }

  function loadLocalLearning() {
    try { learningEvents = JSON.parse(localStorage.getItem(LEARNING_KEY) || '[]') || []; } catch (e) { learningEvents = []; }
  }
  function saveLocalLearning() {
    try { localStorage.setItem(LEARNING_KEY, JSON.stringify(learningEvents.slice(-200))); } catch (e) {}
  }
  function updateLearningStatus(req) {
    var node = el('learningStatus'); if (!node) return;
    var count = learningEvents.filter(function (e) { return e.category === req.input.category && e.approvedForLearning === true && e.sourceMode !== 'DEMO'; }).length;
    node.textContent = count + ' approved outcome(s) available for ' + req.input.category + '. Model D activates at 3.';
    node.className = 'mt-2 text-[11px] ' + (count >= 3 ? 'text-cyan-300' : 'text-slate-500');
  }
  function recordOutcome() {
    recalculate();
    var req = latestSnapshot && latestSnapshot.rawRequest;
    if (!req || !req.hps || !req.hps.recommended) { notify('Cannot record learning outcome before an evidence-backed HPS exists.', 'error'); return; }
    if (req.runtimeMode === 'DEMO' || req.runtimeMode === 'BLOCKED') { notify('Only non-demo, evidence-backed requests can enter the learning set.', 'error'); return; }
    var award = num('actualOutcomePrice'), invoice = num('actualInvoicePrice');
    var actual = invoice > 0 ? invoice : award;
    if (actual <= 0) { notify('Masukkan nilai penetapan final atau nilai invoice aktual.', 'error'); return; }
    var initialBids = [num('v1Price'),num('v2Price')].filter(function(n){return n>0;});
    var stats = window.CalcCore.computeOutcomeLearning(req, { actualCost:actual, contractPrice:award || actual, supplierInitialBid:initialBids.length ? Math.min.apply(Math,initialBids) : null });
    var event = Object.assign({}, stats, { id:'learn_' + Date.now(), category:req.input.category, productName:req.input.productName, approvedForLearning:true, sourceMode:req.runtimeMode, observedAt:isoNow() });
    learningEvents.push(event); saveLocalLearning();
    if (currentUser && window.HPSCloud && window.HPSCloud.pushLearningOutcome) window.HPSCloud.pushLearningOutcome(event);
    el('actualOutcomePrice').value=''; el('actualInvoicePrice').value='';
    notify('Hasil yang disetujui telah dicatat untuk pembelajaran terkendali.', 'success'); recalculate();
  }

  function buildSnapshot(req, build, grossHps) {
    return {
      exportedAt: isoNow(), requestId: req.id, tenantId: req.tenantId, projectName: req.input.productName,
      procurementType: req.input.procurementType, category: req.input.category, calculationMode:req.calculationMode,
      runtimeMode:req.runtimeMode, runtimeReason:req.runtimeReason, budget:num('budgetLimit'), taxPercent:num('taxPercent'),
      ownerBuildUp:build, hpsNet:req.hps.recommended, hpsGross:grossHps, confidence:req.hps.confidence,
      models:req.hps.models, sources:req.sources, costDrivers:req.costDrivers,
      vendors:[{name:el('v1Name').value,price:num('v1Price')},{name:el('v2Name').value,price:num('v2Price')}], rawRequest:req
    };
  }

  function updateTickers() {
    var fx = window.HPSFx && window.HPSFx.getRate();
    var kp = window.HPSFx && window.HPSFx.getKursPajak();
    var bi = window.HPSFx && window.HPSFx.getBiRate();
    var bps = window.HPSBPS && window.HPSBPS.getInflation ? window.HPSBPS.getInflation() : null;
    var esdm = window.HPSLkpp && window.HPSLkpp.getEsdmData();
    var lkpp = window.HPSLkpp && window.HPSLkpp.getData();
    var fxOfficial = fx && /Bank Indonesia JISDOR/i.test(fx.source || '');

    if (el('tickerFxLabel')) el('tickerFxLabel').textContent = fxOfficial ? 'USD / IDR (JISDOR):' : 'USD / IDR (referensi pasar):';
    if (el('tickerFxUsd')) el('tickerFxUsd').textContent = fx && fx.rate ? 'Rp' + fmtNum(fx.rate,0) : statusText(window.HPSFx && window.HPSFx.getStatus());
    if (el('tickerFxDate')) el('tickerFxDate').textContent = 'Tanggal nilai: ' + formatParameterDate(fx && (fx.publishedDateRaw || fx.date));
    if (el('tickerFxUsd') && fx) el('tickerFxUsd').title = (fx.source || 'Bank Indonesia') + ' · diambil ' + formatParameterDate(fx.retrievedAt && String(fx.retrievedAt).slice(0,10));

    if (el('tickerKursPajak')) el('tickerKursPajak').textContent = kp && kp.rate ? 'Rp' + fmtNum(kp.rate,0) : statusText(window.HPSFx && window.HPSFx.getKursPajakStatus());
    if (el('tickerKursPajakDate')) el('tickerKursPajakDate').textContent = 'Masa berlaku: ' + (kp && kp.effectivePeriod ? kp.effectivePeriod : '—');
    if (el('tickerKursPajak') && kp) el('tickerKursPajak').title = (kp.source || 'Kementerian Keuangan') + ' · diambil ' + formatParameterDate(kp.retrievedAt && String(kp.retrievedAt).slice(0,10));

    if (el('tickerBiRate')) el('tickerBiRate').textContent = bi && bi.rate != null ? fmtNum(bi.rate,2) + '%' : statusText(window.HPSFx && window.HPSFx.getBiRateStatus());
    if (el('tickerBiRateDate')) el('tickerBiRateDate').textContent = 'Tanggal nilai: ' + formatParameterDate(bi && bi.publishedDateRaw);
    if (el('tickerBiRate') && bi) el('tickerBiRate').title = (bi.source || 'Bank Indonesia') + ' · diambil ' + formatParameterDate(bi.retrievedAt && String(bi.retrievedAt).slice(0,10));

    if (el('tickerBps')) {
      var bpsStatus = window.HPSBPS && window.HPSBPS.getStatus ? window.HPSBPS.getStatus() : null;
      el('tickerBps').textContent = bps && typeof bps.headlineInflationYoY === 'number'
        ? fmtNum(bps.headlineInflationYoY,2) + '% YoY' + (bps.sourceState === 'CACHED' ? ' · TERSIMPAN' : bps.sourceState === 'STALE' ? ' · KEDALUWARSA' : '')
        : statusText(bpsStatus);
      el('tickerBps').title = bps ? (bps.source || 'BPS') : '';
    }
    if (el('tickerBpsDate')) {
      var bpsPeriod = bps && bps.referencePeriod ? bps.referencePeriod : '—';
      var bpsRelease = bps && bps.releaseDate ? formatParameterDate(bps.releaseDate) : '—';
      el('tickerBpsDate').textContent = 'Periode nilai: ' + bpsPeriod + ' · Rilis: ' + bpsRelease;
    }

    if (el('tickerEsdm')) el('tickerEsdm').textContent = esdm ? 'REGULASI TERVERIFIKASI' : statusText(window.HPSLkpp && window.HPSLkpp.getEsdmStatus());
    if (el('tickerLkpp')) el('tickerLkpp').textContent = lkpp ? 'DATASET LANGSUNG' : statusText(window.HPSLkpp && window.HPSLkpp.getStatus());
    if (fx && fx.rate && el('fxRateInput')) el('fxRateInput').value = Math.round(fx.rate);

    var statuses = [
      window.HPSFx && window.HPSFx.getStatus(), window.HPSFx && window.HPSFx.getKursPajakStatus(),
      window.HPSFx && window.HPSFx.getBiRateStatus(), window.HPSWB && window.HPSWB.getStatus(),
      window.HPSBPS && window.HPSBPS.getStatus && window.HPSBPS.getStatus(),
      window.HPSLkpp && window.HPSLkpp.getStatus(), window.HPSLkpp && window.HPSLkpp.getEsdmStatus()
    ].filter(Boolean);
    var online = statuses.filter(function (s) { return s === 'online'; }).length;
    var cached = statuses.filter(function (s) { return s === 'cached'; }).length;
    var badge = el('benchmarkHealthBadge');
    if (online >= 3) {
      badge.className = 'inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800';
      badge.innerHTML = '<i class="fa-solid fa-circle text-[6px] mr-1.5 animate-pulse text-emerald-400"></i> ACUAN LANGSUNG';
    } else if (online + cached > 0) {
      badge.className = 'inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-950 text-amber-300 border border-amber-800';
      badge.innerHTML = '<i class="fa-solid fa-circle text-[6px] mr-1.5 text-amber-400"></i> SEBAGIAN / TERSIMPAN';
    } else {
      badge.className = 'inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-950 text-rose-300 border border-rose-800';
      badge.innerHTML = '<i class="fa-solid fa-circle text-[6px] mr-1.5 text-rose-400"></i> PENYEDIA DATA TIDAK TERHUBUNG';
    }
  }

  function statusText(s) { return s === 'cached' ? 'TERSIMPAN' : s === 'stale' ? 'KEDALUWARSA' : s === 'connecting' ? 'MENGHUBUNGKAN' : s === 'online' ? 'LANGSUNG' : 'TIDAK TERSEDIA'; }

  function initProvider(adapter, method) {
    return new Promise(function (resolve) {
      if (!adapter || typeof adapter[method] !== 'function') { resolve(); return; }
      var done = false;
      var finish = function () { if (done) return; done = true; resolve(); };
      try { adapter[method](finish); } catch (e) { finish(); }
      setTimeout(finish, 6500);
    });
  }

  function syncProviders() {
    if (syncInFlight) return;
    syncInFlight = true;
    var btn = el('btnSync');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menyinkronkan...';
    Promise.all([
      initProvider(window.HPSFx, 'init'), initProvider(window.HPSWB, 'init'), initProvider(window.HPSLkpp, 'init')
    ]).then(function () {
      updateTickers(); recalculate();
      btn.innerHTML = '<i class="fa-solid fa-check mr-1 text-emerald-400"></i> Tersinkron';
      setTimeout(function () { btn.innerHTML = '<i class="fa-solid fa-rotate mr-1"></i> Sinkronkan Data'; btn.disabled = false; }, 1200);
      syncInFlight = false;
    });
  }

  function persistForm() {
    var ids = ['projName','projCategory','engineCategory','budgetLimit','baseCurrency','projDescription','matQty','matUnitPrice','laborDays','laborRate','overheadPercent','profitPercent','taxPercent','principalDiscountMode','principalDiscountValue','historicalPrice','historicalFxRate','benchmark1Type','benchmark1','benchmark2Type','benchmark2','benchmark3Type','benchmark3','v1Name','v1Price','v2Name','v2Price'];
    var data = { requestId:currentRequestId, resetToZero:hpsResetMode, fields:{} };
    ids.forEach(function (id) { if (el(id)) data.fields[id] = el(id).value; });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function restoreForm() {
    try {
      var data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!data || !data.fields) return;
      currentRequestId = data.requestId || currentRequestId;
      hpsResetMode = data.resetToZero === true;
      Object.keys(data.fields).forEach(function (id) { if (el(id)) el(id).value = data.fields[id]; });
    } catch (e) {}
    updateRef();
  }

  function updateRef() {
    var d = new Date();
    var stamp = d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
    el('requestRef').textContent = 'REF: HPS-' + stamp + '-' + currentRequestId.slice(-4).toUpperCase();
  }

  function exportDossier() {
    recalculate();
    var blob = new Blob([JSON.stringify(latestSnapshot, null, 2)], { type:'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'HPS-Audit-Dossier-' + currentRequestId + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
  }

  function saveSnapshot() {
    recalculate();
    if (!latestSnapshot || !latestSnapshot.rawRequest) return;
    if (!currentUser) {
      showAccessGate('Sesi tidak valid. Silakan masuk kembali sebelum menyimpan HPS.'); return;
    }
    if (!window.HPSCloud) { notify('Konektor cloud tidak tersedia; penyimpanan dibatalkan.', 'error'); return; }
    var req = latestSnapshot.rawRequest;
    req.createdBy = currentUser.name; req.input.requester = currentUser.name;
    window.HPSCloud.pushRequest(req).then(function (result) {
      updateCloudBadge();
      if (result && result.error) notify('Penyimpanan ke cloud gagal: ' + result.error + '.', 'error');
      else notify('Snapshot berhasil dikirim ke sinkronisasi cloud. Kebijakan RLS tetap menjadi batas otorisasi.', 'success');
    });
    if (window.HPSCloud.pushAuditLog) window.HPSCloud.pushAuditLog({ tenantId:TENANT_ID, ts:isoNow(), user:currentUser.name, role:currentUser.role, action:'Saved HPS snapshot', detail:req.input.productName });
  }

  function updateCloudBadge() {
    var badge = el('cloudStatus');
    var s = window.HPSCloud && window.HPSCloud.getStatus ? window.HPSCloud.getStatus() : 'offline';
    if (currentUser && s === 'online') { badge.textContent = 'CLOUD SYNC'; badge.className = 'text-[10px] px-2 py-0.5 rounded border border-emerald-800 text-emerald-400 bg-emerald-950'; }
    else if (currentUser) { badge.textContent = 'CLOUD OFFLINE'; badge.className = 'text-[10px] px-2 py-0.5 rounded border border-amber-800 text-amber-300 bg-amber-950'; }
    else { badge.textContent = 'LOCAL'; badge.className = 'text-[10px] px-2 py-0.5 rounded border border-slate-700 text-slate-400'; }
  }

  function showAccessGate(message) {
    document.body.classList.add('auth-locked');
    var gate=el('authAccessGate'); if(gate) gate.classList.remove('hidden');
    if(message && el('gateError')) el('gateError').textContent=message;
  }

  function unlockAccessGate() {
    document.body.classList.remove('auth-locked');
    var gate=el('authAccessGate'); if(gate) gate.classList.add('hidden');
    if(el('gateError')) el('gateError').textContent='';
  }

  function startApp() {
    if(appStarted) return;
    appStarted=true;
    loadLocalLearning();
    restoreForm();
    updateRef();
    bind();
    recalculate();
    updateTickers();
    setTimeout(syncProviders,120);
  }

  function refreshAuth() {
    if (!window.HPSAuth) { showAccessGate('Layanan autentikasi belum tersedia.'); return Promise.resolve(null); }
    return window.HPSAuth.getSession().then(function (user) {
      var valid = !!(user && user.active !== false && user.role && user.role !== 'No Tenant Access');
      currentUser = valid ? user : null;
      if (!valid) {
        showAccessGate(user ? 'Akun terautentikasi tetapi tidak memiliki keanggotaan tenant HPS yang aktif.' : '');
        return null;
      }
      if(el('authLabel')) el('authLabel').textContent = currentUser.name + ' · ' + currentUser.role;
      unlockAccessGate();
      updateCloudBadge();
      startApp();
      if (window.HPSCloud && window.HPSCloud.pullLearning) {
        window.HPSCloud.pullLearning().then(function (remote) {
          var byId = {}; learningEvents.concat(remote || []).forEach(function (e) { byId[e.id || (e.category + '|' + e.observedAt + '|' + e.actual)] = e; });
          learningEvents = Object.keys(byId).map(function (k) { return byId[k]; }); saveLocalLearning(); recalculate();
        });
      }
      return currentUser;
    }).catch(function(){
      currentUser=null; showAccessGate('Validasi sesi gagal. Silakan masuk kembali.'); return null;
    });
  }

  function openAuth() {
    if (currentUser) {
      if (confirm('Keluar dari akun ' + currentUser.name + '?')) { showAccessGate(''); window.HPSAuth.signOut().then(function () { currentUser = null; window.location.reload(); }); }
      return;
    }
    el('authError').textContent = '';
    if (el('authDialog').showModal) el('authDialog').showModal();
  }

  function submitAuth() {
    var email = el('authEmail').value.trim(), password = el('authPassword').value;
    if (!email || !password) { el('authError').textContent = 'Masukkan email dan kata sandi.'; return; }
    el('authSubmit').disabled = true; el('authSubmit').textContent = 'Sedang masuk...';
    window.HPSAuth.signIn(email, password).then(function (res) {
      el('authSubmit').disabled = false; el('authSubmit').textContent = 'Masuk';
      if (res.error) { el('authError').textContent = res.error; return; }
      currentUser = res.user; el('authLabel').textContent = currentUser.name + ' · ' + currentUser.role;
      el('authDialog').close(); unlockAccessGate(); updateCloudBadge(); startApp(); recalculate(); notify('Berhasil masuk.', 'success');
    });
  }

  function submitGateAuth() {
    var email=el('gateEmail') ? el('gateEmail').value.trim() : '';
    var password=el('gatePassword') ? el('gatePassword').value : '';
    if(!email || !password){ if(el('gateError')) el('gateError').textContent='Masukkan email dan kata sandi.'; return; }
    var b=el('gateSubmit'); if(b){b.disabled=true;b.innerHTML='<i class="fa-solid fa-spinner fa-spin mr-1.5"></i>Memvalidasi...';}
    if(el('gateError')) el('gateError').textContent='';
    window.HPSAuth.signIn(email,password).then(function(res){
      if(b){b.disabled=false;b.innerHTML='<i class="fa-solid fa-right-to-bracket mr-1.5"></i>Masuk';}
      if(res.error){ if(el('gateError')) el('gateError').textContent=res.error; return; }
      currentUser=res.user;
      if(!currentUser || currentUser.active===false || currentUser.role==='No Tenant Access'){
        if(el('gateError')) el('gateError').textContent='Kredensial valid, tetapi akun tidak memiliki akses tenant HPS yang aktif.';
        return window.HPSAuth.signOut();
      }
      if(el('authLabel')) el('authLabel').textContent=currentUser.name+' · '+currentUser.role;
      unlockAccessGate();
      updateCloudBadge();
      startApp();
      notify('Kredensial tervalidasi. Selamat datang.', 'success');
    }).catch(function(e){
      if(b){b.disabled=false;b.innerHTML='<i class="fa-solid fa-right-to-bracket mr-1.5"></i>Masuk';}
      if(el('gateError')) el('gateError').textContent='Validasi login gagal: '+(e&&e.message||String(e));
    });
  }

  function bindAccessGate(){
    var b=el('gateSubmit'); if(b&&!b.dataset.bound){b.dataset.bound='true';b.addEventListener('click',submitGateAuth);}
    ['gateEmail','gatePassword'].forEach(function(id){var x=el(id);if(x&&!x.dataset.bound){x.dataset.bound='true';x.addEventListener('keydown',function(ev){if(ev.key==='Enter')submitGateAuth();});}});
  }

  function resetHps(){
    if(!currentUser){showAccessGate('Sesi tidak valid. Silakan masuk kembali.');return;}
    if(!window.confirm('Reset seluruh nilai perhitungan HPS aktif menjadi 0? Histori yang sudah tersimpan di server tidak akan dihapus.'))return;
    var zeroIds=['matQty','matUnitPrice','laborDays','laborRate','overheadPercent','profitPercent','principalDiscountValue','historicalPrice','historicalFxRate','benchmark1','benchmark2','benchmark3'];
    zeroIds.forEach(function(id){var x=el(id);if(x){x.value='0';x.dispatchEvent(new Event('input',{bubbles:true}));x.dispatchEvent(new Event('change',{bubbles:true}));}});
    var panel=el('categoryCostProfilePanel');
    if(panel) panel.querySelectorAll('[data-ccu-key]').forEach(function(x){x.value='0';x.dispatchEvent(new Event('input',{bubbles:true}));x.dispatchEvent(new Event('change',{bubbles:true}));});
    if(el('principalDiscountMode')) el('principalDiscountMode').value='PERCENT';
    hpsResetMode = true;
    recalculate();
    persistForm();
    ['subtotalMaterial','subtotalLabor','ownerBuildDisplay','hpsNetDisplay','hpsGrossDisplay','threshold80Display'].forEach(function(id){if(el(id))el(id).textContent='Rp0';});
    if(el('principalDiscountDisplay'))el('principalDiscountDisplay').textContent='-Rp0';
    if(el('confidenceDisplay'))el('confidenceDisplay').textContent='—';
    if(el('modelsUsedDisplay'))el('modelsUsedDisplay').textContent='—';
    notify('HPS aktif telah direset ke 0. Histori server tidak dihapus.', 'success');
  }

  function isHpsCalculationInput(node) {
    if (!node) return false;
    if (node.hasAttribute && node.hasAttribute('data-ccu-key')) return true;
    var id=node.id||'';
    return [
      'projCategory','engineCategory','subCategory','baseCurrency',
      'matQty','matUnitPrice','laborDays','laborRate',
      'overheadPercent','profitPercent','taxPercent',
      'principalDiscountMode','principalDiscountValue',
      'historicalPrice','historicalFxRate','historicalPurchaseDate','allowBpsCpiProxy',
      'benchmark1Type','benchmark1','benchmark2Type','benchmark2','benchmark3Type','benchmark3'
    ].indexOf(id)!==-1;
  }

  function exitResetMode() {
    if (!hpsResetMode) return;
    hpsResetMode=false;
    persistForm();
  }

  function bind() {
    document.querySelectorAll('input, select, textarea').forEach(function (node) {
      if (node.id && node.id.indexOf('auth') !== 0 && node.id.indexOf('gate') !== 0) node.addEventListener('input', recalculate);
    });
    document.addEventListener('input',function(ev){
      if(ev&&ev.isTrusted&&isHpsCalculationInput(ev.target)) exitResetMode();
    },true);
    document.addEventListener('change',function(ev){
      if(ev&&ev.isTrusted&&isHpsCalculationInput(ev.target)) { exitResetMode(); recalculate(); }
    },true);
    el('btnSync').addEventListener('click', syncProviders);
    el('btnExport').addEventListener('click', exportDossier);
    el('btnSave').addEventListener('click', saveSnapshot);
    if(el('btnResetHps')) el('btnResetHps').addEventListener('click', resetHps);
    el('btnAuth').addEventListener('click', openAuth);
    el('btnRecordOutcome').addEventListener('click', recordOutcome);
    el('authSubmit').addEventListener('click', submitAuth);
  }

  window.HPSAppControl={exitResetMode:exitResetMode,isReset:function(){return hpsResetMode;},recalculate:recalculate};

  document.addEventListener('DOMContentLoaded', function () {
    bindAccessGate();
    showAccessGate('');
    refreshAuth();
  });
})();
