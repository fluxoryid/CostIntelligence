/* app.js — HPS Intelligence PWA
 * Vanilla JS, no build step. Relies on calc-core.js being loaded first.
 * State persisted to localStorage. Hash-based router. Delegated click handler.
 */

(function () {
  'use strict';

  var STORAGE_KEY = 'hps_intelligence_state_v1';

  var ROLES = ['Requester', 'Procurement Analyst', 'Procurement Manager', 'Procurement Head', 'Reviewer', 'Approver', 'Admin', 'Auditor'];

  var APPROVAL_STAGES = ['Draft', 'Procurement Review', 'Reviewer', 'Approver', 'HPS Locked'];

  var DEFAULT_PROVIDERS = [
    { id: 'bps', name: 'Badan Pusat Statistik (BPS)', status: 'UNAVAILABLE', note: 'No public CORS-enabled endpoint from a static client — requires a server-side proxy.' },
    { id: 'bi', name: 'Bank Indonesia — JISDOR / BI Rate', status: 'DEMO', note: 'Prototype uses cached demo values. Connect via a Cloudflare Worker proxy for live rates.' },
    { id: 'lkpp', name: 'LKPP / e-Katalog', status: 'UNAVAILABLE', note: 'Requires authenticated access where legally and technically permitted.' },
    { id: 'wage', name: 'Kemnaker / Regional Wage Decrees (UMP/UMK)', status: 'DEMO', note: 'Annual, effective-date based. Demo value only.' },
    { id: 'esdm', name: 'Kementerian ESDM', status: 'UNAVAILABLE' },
    { id: 'kemenkeu', name: 'Kementerian Keuangan (Customs/Tax)', status: 'UNAVAILABLE' },
    { id: 'principal', name: 'Principal / Manufacturer Price Lists', status: 'DEMO' },
    { id: 'distributor', name: 'Authorized Distributors', status: 'DEMO' },
    { id: 'internal', name: 'Company Historical Procurement Data', status: 'INTERNAL' },
    { id: 'quotation', name: 'Supplier Quotations', status: 'USER PROVIDED' },
    { id: 'contracts', name: 'Contracts / POs / Invoices', status: 'INTERNAL' },
    { id: 'benchmark', name: 'Market Benchmark Sources', status: 'DEMO' },
  ];

  // -------------------------------------------------------------------------
  // Store
  // -------------------------------------------------------------------------

  function initialState() {
    return {
      onboarded: false,
      tenants: [
        { id: 't1', name: 'PT Mitra Transaksi Indonesia (Yokke)', short: 'Yokke' },
        { id: 't2', name: 'Client Org B (Demo)', short: 'Org B' },
      ],
      currentTenantId: 't1',
      currentUser: { name: 'Tommi Wiedhawan', role: 'Procurement Analyst' },
      requests: [],
      providers: JSON.parse(JSON.stringify(DEFAULT_PROVIDERS)),
      modelGovernance: {
        production: { A: 0.30, B: 0.30, C: 0.30, D: 0.10 },
        candidate: null,
        history: [],
      },
      auditLog: [],
    };
  }

  var Store = {
    state: null,
    load: function () {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        this.state = raw ? JSON.parse(raw) : initialState();
      } catch (e) {
        this.state = initialState();
      }
      if (!this.state.providers) this.state.providers = JSON.parse(JSON.stringify(DEFAULT_PROVIDERS));
      if (!this.state.modelGovernance) this.state.modelGovernance = { production: { A: 0.30, B: 0.30, C: 0.30, D: 0.10 }, candidate: null, history: [] };
      if (!this.state.auditLog) this.state.auditLog = [];
    },
    save: function () {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); } catch (e) { /* storage full/unavailable — non-fatal for prototype */ }
    },
    reset: function () {
      this.state = initialState();
      this.save();
    },
    tenantRequests: function () {
      var tid = this.state.currentTenantId;
      return this.state.requests.filter(function (r) { return r.tenantId === tid; });
    },
    getRequest: function (id) {
      return this.state.requests.filter(function (r) { return r.id === id; })[0] || null;
    },
    log: function (action, detail) {
      this.state.auditLog.unshift({
        ts: new Date().toISOString(), user: this.state.currentUser.name, role: this.state.currentUser.role,
        tenantId: this.state.currentTenantId, action: action, detail: detail || '',
      });
      if (this.state.auditLog.length > 200) this.state.auditLog.length = 200;
    },
  };

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function badgeClass(status) {
    return 'badge badge-' + String(status).replace(/\s+/g, '');
  }

  function badge(status, extra) {
    return '<span class="' + badgeClass(status) + '">' + esc(status) + (extra ? ' · ' + esc(extra) : '') + '</span>';
  }

  function freshBadge(f) {
    return '<span class="badge badge-' + esc(f) + '">' + esc(f) + '</span>';
  }

  function go(hash) {
    if (location.hash === '#' + hash) { render(); return; }
    location.hash = hash;
    render();
  }

  function qs(id) { return document.getElementById(id); }

  function fmtPct(n) { return (n > 0 ? '+' : '') + (Math.round(n * 100) / 100) + '%'; }

  function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch (e) { return iso; }
  }

  function canApprove(role) { return ['Procurement Manager', 'Procurement Head', 'Approver', 'Admin'].indexOf(role) !== -1; }
  function canReview(role) { return ['Reviewer', 'Procurement Manager', 'Procurement Head', 'Admin'].indexOf(role) !== -1; }
  function canEditWeights(role) { return ['Procurement Head', 'Admin'].indexOf(role) !== -1; }
  function isAdmin(role) { return role === 'Admin'; }
  function isAuditor(role) { return role === 'Auditor'; }
  function isReadOnly() { return isAuditor(Store.state.currentUser.role); }

  // -------------------------------------------------------------------------
  // Request lifecycle helpers
  // -------------------------------------------------------------------------

  function newRequest() {
    return {
      id: 'req_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      tenantId: Store.state.currentTenantId,
      version: 1,
      status: 'Draft',
      createdBy: Store.state.currentUser.name,
      createdAt: new Date().toISOString(),
      input: {
        businessUnit: '', requester: Store.state.currentUser.name, category: '', subCategory: '', productName: '',
        description: '', quantity: 1, uom: 'unit', requiredDate: '', deliveryLocation: '', origin: 'Local',
        currency: 'IDR', procurementType: 'New',
        historicalPrice: '', historicalDate: '', supplierQuotation: '', principalQuotation: '',
        commercialTerms: '', warranty: '', taxTreatment: 'PPN 11%', notes: '',
      },
      classification: null,
      coverage: null,
      researched: false,
      sources: [],
      costDrivers: [],
      hps: null,
      scenario: { fx: 0, index: 0, commodity: 0, freight: 0, labor: 0, margin: 0, volumeDiscount: 0 },
      negotiation: null,
      approval: { stage: 'Draft', history: [{ stage: 'Draft', by: Store.state.currentUser.name, at: new Date().toISOString() }] },
      outcome: null,
      learningEvents: [],
    };
  }

  function recompute(req) {
    // Recomputes models + triangulation + confidence from current drivers/scenario.
    var models = {
      A: CalcCore.modelA(req),
      B: CalcCore.modelB(req),
      C: CalcCore.modelC(req),
      D: CalcCore.modelD(req, allLearningEvents(req.input.category, req.id)),
    };
    var weights = Store.state.modelGovernance.production;
    var tri = CalcCore.triangulate(models, weights);
    var conf = tri.recommended != null ? CalcCore.computeConfidence(req, models, req.sources, req.coverage) : { score: 0, label: 'Low', capped: false, components: {} };
    req.hps = {
      models: models, recommended: tri.recommended, low: tri.low, high: tri.high,
      weightsUsed: tri.weightsUsed, error: tri.error || null,
      confidence: conf.score, confidenceLabel: conf.label, confidenceCapped: conf.capped, confidenceComponents: conf.components,
    };
    // Rental categories (e.g. Payment Terminal Rental) display the HPS as a
    // per-unit-per-month rate rather than a total fleet figure — triangulated
    // values above are computed as unitRate x quantity, so convert for display.
    var cat = CalcCore.categoryOf(req.input.category);
    if (cat.outputBasis === 'perUnitPerMonth' && tri.recommended != null) {
      req.hps.outputBasis = 'perUnitPerMonth';
      req.hps.rentalTermMonths = cat.rentalTermMonths || null;
      req.hps.recommendedPerUnit = CalcCore.toDisplayBasis(tri.recommended, req.input);
      req.hps.lowPerUnit = CalcCore.toDisplayBasis(tri.low, req.input);
      req.hps.highPerUnit = CalcCore.toDisplayBasis(tri.high, req.input);
    }
    if (cat.bufferStock) {
      req.bufferBreakdown = CalcCore.bufferStockBreakdown(req.input);
    }
    if (tri.recommended != null) {
      req.negotiation = CalcCore.generateNegotiation(req, models, tri);
    }
    return req;
  }

  function allLearningEvents(category, excludeReqId) {
    var events = [];
    Store.state.requests.forEach(function (r) {
      if (r.id === excludeReqId) return;
      (r.learningEvents || []).forEach(function (e) { events.push(e); });
    });
    return events.filter(function (e) { return e.category === category; });
  }

  function upsertRequest(req) {
    var idx = Store.state.requests.findIndex(function (r) { return r.id === req.id; });
    if (idx === -1) Store.state.requests.push(req); else Store.state.requests[idx] = req;
    Store.save();
  }

  window.HPSApp = { Store: Store, esc: esc, newRequest: newRequest, recompute: recompute, upsertRequest: upsertRequest, go: go };

  // -------------------------------------------------------------------------
  // Router
  // -------------------------------------------------------------------------

  var screenRenderers = {}; // filled below
  var currentSheet = null; // {render: fn}

  function parseHash() {
    var h = location.hash.replace(/^#/, '') || 'home';
    var parts = h.split('/');
    return { screen: parts[0], params: parts.slice(1) };
  }

  function render() {
    currentSheet = null;
    var r = parseHash();
    var appRoot = qs('app-root');
    var headerHtml = renderHeader(r.screen, r.params);
    var bodyHtml = '<div class="app-body"><div class="screen' + (screenScrolls(r.screen) ? ' scroll-y' : '') + '" id="screen-el">' + safeRenderScreen(r.screen, r.params) + '</div></div>';
    var navHtml = renderBottomNav(r.screen);
    appRoot.innerHTML = headerHtml + bodyHtml + navHtml;
  }

  function safeRenderScreen(screen, params) {
    var fn = screenRenderers[screen] || screenRenderers['home'];
    try {
      return fn(params);
    } catch (e) {
      return '<div class="card"><h2>Calculation error</h2><p class="small muted">Something in this screen failed to render: ' + esc(e.message) + '</p>' +
        '<button class="btn btn-primary btn-block" data-action="go" data-arg="home">Return to Home</button></div>';
    }
  }

  function screenScrolls(screen) {
    // Screens that are inherently short lists get outer scroll; complex layouts manage their own inner scroll region.
    return ['governance', 'settings', 'auditlog'].indexOf(screen) !== -1;
  }

  window.addEventListener('hashchange', render);
  window.addEventListener('load', function () {
    Store.load();
    if (!location.hash) location.hash = Store.state.onboarded ? '#home' : '#login';
    render();
  });

  // -------------------------------------------------------------------------
  // Header
  // -------------------------------------------------------------------------

  var TITLES = {
    home: 'HPS Intelligence', login: 'Welcome', new: 'New HPS Request', classify: 'AI Classification',
    coverage: 'Knowledge Coverage', research: 'Research Mission', sources: 'Intelligence Sources',
    drivers: 'Cost Driver Analysis', result: 'HPS Result', modeldetail: 'Model Detail', why: 'Why This HPS',
    scenario: 'Scenario Simulation', negotiation: 'Negotiation Intelligence', approval: 'Approval',
    outcome: 'Procurement Outcome', learningevent: 'Learning Event', brain: 'AI Brain', knowledgedetail: 'Knowledge Detail',
    governance: 'Model Governance', settings: 'Data Providers', more: 'More', intelligence: 'Intelligence',
    auditlog: 'Audit Log',
  };

  var NO_BACK = { home: 1, login: 1 };

  function renderHeader(screen, params) {
    var title = TITLES[screen] || 'HPS Intelligence';
    var tenant = Store.state.tenants.filter(function (t) { return t.id === Store.state.currentTenantId; })[0];
    var offlineBadge = navigator.onLine === false ? '<span class="hdr-status">Offline — cached/demo data</span>' : '';
    var backBtn = NO_BACK[screen] ? '' : '<button class="hdr-back" data-action="back">\u2039</button>';
    return '<div class="app-header">' +
      '<div class="hdr-left">' + backBtn + '<div class="hdr-title">' + esc(title) + '</div></div>' +
      '<div class="hstack">' + offlineBadge + (tenant ? '<button class="hdr-tenant" data-action="go" data-arg="more">' + esc(tenant.short || tenant.name) + ' \u25be</button>' : '') + '</div>' +
      '</div>';
  }

  function back() {
    history.length > 1 ? history.back() : go('home');
  }

  // -------------------------------------------------------------------------
  // Bottom nav
  // -------------------------------------------------------------------------

  var NAV_ITEMS = [
    { key: 'home', icon: '\u2302', label: 'Home' },
    { key: 'new', icon: '\u2795', label: 'New HPS' },
    { key: 'intelligence', icon: '\u25C9', label: 'Intelligence' },
    { key: 'brain', icon: '\u26A1', label: 'Learning' },
    { key: 'more', icon: '\u22EF', label: 'More' },
  ];

  function renderBottomNav(screen) {
    var activeGroup = screen === 'new' ? 'new' :
      ['sources', 'drivers', 'intelligence'].indexOf(screen) !== -1 ? 'intelligence' :
      ['brain', 'knowledgedetail'].indexOf(screen) !== -1 ? 'brain' :
      ['more', 'settings', 'governance', 'auditlog'].indexOf(screen) !== -1 ? 'more' :
      screen === 'home' ? 'home' : '';
    var html = '<div class="bottom-nav">';
    NAV_ITEMS.forEach(function (item) {
      html += '<button class="nav-item' + (activeGroup === item.key ? ' active' : '') + '" data-action="navroot" data-arg="' + item.key + '">' +
        '<span class="nav-ic">' + item.icon + '</span><span>' + item.label + '</span></button>';
    });
    html += '</div>';
    return html;
  }

  // -------------------------------------------------------------------------
  // Screen: Login / Splash (demo tenant + role picker)
  // -------------------------------------------------------------------------

  screenRenderers.login = function () {
    var tenantOpts = Store.state.tenants.map(function (t) {
      return '<option value="' + t.id + '"' + (t.id === Store.state.currentTenantId ? ' selected' : '') + '>' + esc(t.name) + '</option>';
    }).join('');
    var roleOpts = ROLES.map(function (r) {
      return '<option value="' + r + '"' + (r === Store.state.currentUser.role ? ' selected' : '') + '>' + r + '</option>';
    }).join('');
    return '<div class="stack center" style="justify-content:center;flex:1;">' +
      '<div style="font-size:34px;">\uD83D\uDCCA</div>' +
      '<h2 style="font-size:20px;">HPS Intelligence</h2>' +
      '<p class="small muted" style="margin-top:-6px;">Autonomous Procurement Intelligence &amp; Harga Perkiraan Sendiri Engine</p>' +
      '<div class="card stack" style="text-align:left;width:100%;">' +
      '<div class="field"><label>Your name</label><input id="login-name" value="' + esc(Store.state.currentUser.name) + '"></div>' +
      '<div class="field"><label>Role</label><select id="login-role">' + roleOpts + '</select></div>' +
      '<div class="field"><label>Organization / Tenant</label><select id="login-tenant">' + tenantOpts + '</select></div>' +
      '<div class="field-hint">This is a demo sign-in. All data stays in this browser (localStorage) — nothing is sent to a server.</div>' +
      '</div>' +
      '<button class="btn btn-primary btn-block" data-action="doLogin">Enter Demo Workspace</button>' +
      '</div>';
  };

  // -------------------------------------------------------------------------
  // Screen: Home Dashboard
  // -------------------------------------------------------------------------

  screenRenderers.home = function () {
    var reqs = Store.tenantRequests();
    var active = reqs.filter(function (r) { return r.status !== 'HPS Locked' && r.status !== 'Rejected'; }).length;
    var awaiting = reqs.filter(function (r) { return ['Procurement Review', 'Reviewer', 'Approver'].indexOf(r.status) !== -1; }).length;
    var withHps = reqs.filter(function (r) { return r.hps && r.hps.recommended != null; });
    var avgConf = withHps.length ? Math.round(withHps.reduce(function (s, r) { return s + r.hps.confidence; }, 0) / withHps.length) : null;
    var withOutcome = reqs.filter(function (r) { return r.outcome; });
    var avgMape = withOutcome.length ? (withOutcome.reduce(function (s, r) { return s + (r.outcome.percentError || 0); }, 0) / withOutcome.length) : null;
    var modelAccuracy = avgMape != null ? Math.max(0, Math.round(100 - avgMape)) : null;
    var staleCount = reqs.reduce(function (s, r) { return s + (r.sources || []).filter(function (src) { return src.freshness === 'Stale'; }).length; }, 0);
    var newKnowledge = reqs.reduce(function (s, r) { return s + (r.learningEvents || []).length; }, 0);

    function statCard(label, val) {
      return '<div class="card card-tight"><div class="tiny muted">' + label + '</div><div class="bold mono-num" style="font-size:18px;">' + (val === null ? '—' : val) + '</div></div>';
    }

    var recentList = reqs.slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }).slice(0, 4).map(function (r) {
      return '<div class="row" data-action="go" data-arg="result/' + r.id + '" style="cursor:pointer;">' +
        '<div><div class="bold small">' + esc(r.input.productName || '(unnamed)') + '</div><div class="tiny muted">' + esc(r.input.category || '—') + ' · <span class="pill-status pill-' + r.status.replace(/\s+/g, '') + '">' + esc(r.status) + '</span></div></div>' +
        '<div class="bold small mono-num">' + (r.hps && r.hps.recommended != null ? CalcCore.fmtIDR(r.hps.recommended) : '—') + '</div>' +
        '</div>';
    }).join('<hr class="divider">') || '<div class="empty-state small">No HPS requests yet. Start your first one below.</div>';

    return '<div class="screen-scroll-region">' +
      '<div class="card-tight"><div class="hstack" style="justify-content:space-between;"><div><div class="bold" style="font-size:15px;">Hi, ' + esc(Store.state.currentUser.name.split(' ')[0]) + '</div><div class="tiny muted">' + esc(Store.state.currentUser.role) + '</div></div><span class="badge badge-DEMO">DEMO DATA</span></div></div>' +
      '<div class="grid-3">' + statCard('Active HPS', active) + statCard('Awaiting Approval', awaiting) + statCard('Avg. Confidence', avgConf !== null ? avgConf : null) + '</div>' +
      '<div class="grid-3">' + statCard('Category Model Acc.', modelAccuracy !== null ? modelAccuracy + '%' : null) + statCard('Stale Intel.', staleCount) + statCard('New Knowledge', newKnowledge) + '</div>' +
      '<div class="card stack">' +
      '<h3>Quick actions</h3>' +
      '<div class="btn-group"><button class="btn btn-primary" data-action="navroot" data-arg="new">New HPS</button><button class="btn" data-action="go" data-arg="intelligence">View Intelligence</button></div>' +
      '<div class="btn-group"><button class="btn" data-action="go" data-arg="brain">Learning Dashboard</button><button class="btn" data-action="go" data-arg="outcomepicker">Enter Outcome</button></div>' +
      '</div>' +
      '<div class="card stack"><h3>Recent HPS requests</h3>' + recentList + '</div>' +
      '</div>';
  };

  screenRenderers.outcomepicker = function () {
    var reqs = Store.tenantRequests().filter(function (r) { return r.hps && r.hps.recommended != null && !r.outcome; });
    var list = reqs.map(function (r) {
      return '<div class="row" data-action="go" data-arg="outcome/' + r.id + '" style="cursor:pointer;"><div><div class="bold small">' + esc(r.input.productName) + '</div><div class="tiny muted">' + esc(r.input.category) + '</div></div><span class="linklike small">Enter \u203A</span></div>';
    }).join('<hr class="divider">') || '<div class="empty-state small">No HPS awaiting an outcome. Generate one from New HPS first.</div>';
    return '<div class="card stack"><h3>Select a request to capture its procurement outcome</h3>' + list + '</div>';
  };

  // -------------------------------------------------------------------------
  // Screen: New HPS wizard (steps 1-3) + advanced fields bottom sheet
  // -------------------------------------------------------------------------

  var CATEGORY_NAMES = Object.keys(CalcCore.CATEGORIES);

  function stepperHtml(step) {
    var html = '<div class="stepper-track">';
    for (var i = 1; i <= 3; i++) html += '<div class="stepper-dot ' + (i < step ? 'done' : (i === step ? 'active' : '')) + '"></div>';
    return html + '</div>';
  }

  screenRenderers.new = function (params) {
    var step = parseInt(params[0] || '1', 10);
    if (!Store.state.draftRequest) Store.state.draftRequest = newRequest();
    var d = Store.state.draftRequest;

    if (step === 1) {
      var catOpts = '<option value=""' + (d.input.category ? '' : ' selected') + ' disabled>Select category\u2026</option>' +
        CATEGORY_NAMES.map(function (c) { return '<option value="' + c + '"' + (d.input.category === c ? ' selected' : '') + '>' + c + '</option>'; }).join('');
      var subOpts = '<option value="">Select sub-category\u2026</option>' +
        (d.input.category ? (CalcCore.categoryOf(d.input.category).subcategories || []).map(function (s) { return '<option value="' + s + '"' + (d.input.subCategory === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') : '');
      return '<div class="eyebrow-title">Step 1 of 3</div>' + stepperHtml(1) +
        '<div class="screen-scroll-region">' +
        '<div class="card stack">' +
        '<div class="field"><label>Business unit</label><input id="f-bu" value="' + esc(d.input.businessUnit) + '" placeholder="e.g. Procurement / IT"></div>' +
        '<div class="field"><label>Requester</label><input id="f-requester" value="' + esc(d.input.requester) + '"></div>' +
        '<div class="field"><label>Procurement category</label><select id="f-category" data-action="categoryChanged">' + catOpts + '</select></div>' +
        '<div class="field"><label>Sub-category</label><select id="f-subcategory">' + subOpts + '</select></div>' +
        '<div class="field"><label>Product / service name</label><input id="f-productname" value="' + esc(d.input.productName) + '" placeholder="e.g. Rack Server X200"></div>' +
        '</div></div>' +
        '<div class="fab-bar"><button class="btn btn-primary btn-block" data-action="wizardNext" data-arg="1">Continue</button></div>';
    }

    if (step === 2) {
      return '<div class="eyebrow-title">Step 2 of 3</div>' + stepperHtml(2) +
        '<div class="screen-scroll-region">' +
        '<div class="card stack">' +
        '<div class="field"><label>Description / specification</label><textarea id="f-description" placeholder="Key technical attributes that affect price">' + esc(d.input.description) + '</textarea></div>' +
        '<div class="grid-2"><div class="field"><label>Quantity</label><input id="f-qty" type="number" min="1" value="' + esc(d.input.quantity) + '"></div>' +
        '<div class="field"><label>Unit of measure</label><input id="f-uom" value="' + esc(d.input.uom) + '"></div></div>' +
        '<div class="grid-2"><div class="field"><label>Required delivery date</label><input id="f-reqdate" type="date" value="' + esc(d.input.requiredDate) + '"></div>' +
        '<div class="field"><label>Delivery location</label><input id="f-location" value="' + esc(d.input.deliveryLocation) + '"></div></div>' +
        '<div class="field"><label>Local / imported</label><div class="chip-select" id="f-origin" data-val="' + esc(d.input.origin) + '">' +
        ['Local', 'Imported'].map(function (o) { return '<button type="button" class="chip-opt' + (d.input.origin === o ? ' active' : '') + '" data-action="chipPick" data-group="f-origin" data-val="' + o + '">' + o + '</button>'; }).join('') + '</div></div>' +
        '</div></div>' +
        '<div class="fab-bar"><button class="btn" data-action="go" data-arg="new/1">Back</button><button class="btn btn-primary btn-block" data-action="wizardNext" data-arg="2">Continue</button></div>';
    }

    // Step 3: currency / type + review + advanced sheet trigger
    var summary = d.input;
    return '<div class="eyebrow-title">Step 3 of 3</div>' + stepperHtml(3) +
      '<div class="screen-scroll-region">' +
      '<div class="card stack">' +
      '<div class="grid-2"><div class="field"><label>Currency</label><select id="f-currency"><option ' + (summary.currency === 'IDR' ? 'selected' : '') + '>IDR</option><option ' + (summary.currency === 'USD' ? 'selected' : '') + '>USD</option></select></div>' +
      '<div class="field"><label>Procurement type</label><select id="f-proctype">' + ['New', 'Reorder', 'Renewal'].map(function (o) { return '<option' + (summary.procurementType === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></div></div>' +
      '<button class="btn btn-ghost" data-action="openAdvancedSheet" style="align-self:flex-start;">Advanced fields (historical price, quotations, terms) \u2039\u203A</button>' +
      '</div>' +
      '<div class="card stack">' +
      '<h3>Review</h3>' +
      '<div class="row small"><span class="muted">Product</span><span class="bold">' + esc(summary.productName || '—') + '</span></div>' +
      '<div class="row small"><span class="muted">Category</span><span>' + esc(summary.category || '—') + ' / ' + esc(summary.subCategory || '—') + '</span></div>' +
      '<div class="row small"><span class="muted">Quantity</span><span>' + esc(summary.quantity) + ' ' + esc(summary.uom) + '</span></div>' +
      '<div class="row small"><span class="muted">Historical price</span><span>' + (summary.historicalPrice ? CalcCore.fmtIDR(summary.historicalPrice) : 'Not provided') + '</span></div>' +
      '<div class="row small"><span class="muted">Supplier quotation</span><span>' + (summary.supplierQuotation ? CalcCore.fmtIDR(summary.supplierQuotation) : 'Not provided') + '</span></div>' +
      '</div>' +
      '</div>' +
      '<div class="fab-bar"><button class="btn" data-action="go" data-arg="new/2">Back</button><button class="btn btn-accent btn-block" data-action="generateHPS"' + (!summary.category || !summary.productName ? ' disabled' : '') + '>Generate Intelligent HPS</button></div>';
  };

  function advancedSheetHtml() {
    var d = Store.state.draftRequest.input;
    var cat = CalcCore.CATEGORIES[d.category];
    var isRentalCat = !!(cat && cat.principalDiscountPct);
    var rentalFieldsHtml = '';
    if (isRentalCat) {
      var discDefault = cat.principalDiscountPct.defaultPct;
      var aprDefault = cat.vendorFinancingAPR.defaultPct;
      var bo = d.bufferOverridesPct || {};
      var rateModelVal = d.rateModel || cat.defaultRateModel || 'listRateMarkup';
      var purchaseDefault = cat.purchasePriceIDR.defaultValue;
      var marginDefault = cat.vendorMarginPct.defaultPct;
      rentalFieldsHtml =
        '<div class="stack" style="border-top:1px solid var(--border,#e5e7eb);padding-top:12px;margin-top:4px;">' +
        '<h4 style="margin:0;">Rental rate assumptions <span class="muted small">(Payment Terminal Rental)</span></h4>' +
        '<div class="field"><label>Rate build-up model</label><select id="a-ratemodel">' +
        '<option value="listRateMarkup"' + (rateModelVal === 'listRateMarkup' ? ' selected' : '') + '>List rate + discount + financing markup</option>' +
        '<option value="purchasePriceDepreciation"' + (rateModelVal === 'purchasePriceDepreciation' ? ' selected' : '') + '>Purchase price \u00f7 term (depreciation) + financing + margin</option>' +
        '</select></div>' +
        '<div class="grid-2">' +
        '<div class="field"><label>Principal/Vendor discount (%)</label><input id="a-discount" type="number" step="0.1" placeholder="Demo default: ' + discDefault + '" value="' + esc(d.principalDiscountPct != null ? d.principalDiscountPct : '') + '"></div>' +
        '<div class="field"><label>Vendor financing APR (%)</label><input id="a-apr" type="number" step="0.1" placeholder="Demo default: ' + aprDefault + '" value="' + esc(d.vendorFinancingAPR != null ? d.vendorFinancingAPR : '') + '"></div>' +
        '</div>' +
        '<div class="tiny muted">Discount is applied before financing. Leave any field blank to use the demo default shown as its placeholder.</div>' +
        '<div class="grid-2" style="margin-top:8px;">' +
        '<div class="field"><label>Terminal purchase price (IDR, per unit)</label><input id="a-purchaseprice" type="number" placeholder="Demo default: ' + purchaseDefault + '" value="' + esc(d.purchasePriceIDR != null ? d.purchasePriceIDR : '') + '"></div>' +
        '<div class="field"><label>Vendor margin (%)</label><input id="a-marginpct" type="number" step="0.1" placeholder="Demo default: ' + marginDefault + '" value="' + esc(d.vendorMarginPct != null ? d.vendorMarginPct : '') + '"></div>' +
        '</div>' +
        '<div class="tiny muted">Purchase price and margin are only used when the rate model above is set to purchase-price depreciation.</div>' +
        '<div class="grid-2" style="margin-top:8px;">' +
        '<div class="field"><label>Terminal buffer stock (%)</label><input id="a-buf-terminal" type="number" step="0.1" placeholder="Demo default: 1" value="' + esc(bo.terminalBuffer != null ? bo.terminalBuffer : '') + '"></div>' +
        '<div class="field"><label>Battery replacement buffer (%)</label><input id="a-buf-battery" type="number" step="0.1" placeholder="Demo default: 10" value="' + esc(bo.batteryBuffer != null ? bo.batteryBuffer : '') + '"></div>' +
        '</div>' +
        '<div class="field"><label>Adapter/charger replacement buffer (%)</label><input id="a-buf-adapter" type="number" step="0.1" placeholder="Demo default: 10" value="' + esc(bo.adapterBuffer != null ? bo.adapterBuffer : '') + '"></div>' +
        '</div>';
    }
    return '<div class="sheet-handle"></div>' +
      '<h3>Advanced fields</h3>' +
      '<div class="stack">' +
      '<div class="grid-2"><div class="field"><label>Historical purchase price (IDR)</label><input id="a-histprice" type="number" value="' + esc(d.historicalPrice) + '"></div>' +
      '<div class="field"><label>Historical purchase date</label><input id="a-histdate" type="date" value="' + esc(d.historicalDate) + '"></div></div>' +
      '<div class="field"><label>Supplier quotation (IDR, optional)</label><input id="a-suppq" type="number" value="' + esc(d.supplierQuotation) + '"></div>' +
      '<div class="field"><label>Principal quotation (IDR, optional)</label><input id="a-princq" type="number" value="' + esc(d.principalQuotation) + '"></div>' +
      '<div class="field"><label>Commercial terms</label><input id="a-terms" value="' + esc(d.commercialTerms) + '" placeholder="e.g. Net 30, FOB destination"></div>' +
      '<div class="field"><label>Warranty / support requirement</label><input id="a-warranty" value="' + esc(d.warranty) + '"></div>' +
      '<div class="field"><label>Tax treatment</label><input id="a-tax" value="' + esc(d.taxTreatment) + '"></div>' +
      '<div class="field"><label>Notes</label><textarea id="a-notes">' + esc(d.notes) + '</textarea></div>' +
      rentalFieldsHtml +
      '</div>' +
      '<button class="btn btn-primary btn-block" data-action="saveAdvancedSheet">Save</button>';
  }

  // -------------------------------------------------------------------------
  // Screen: AI Classification
  // -------------------------------------------------------------------------

  screenRenderers.classify = function (params) {
    var req = Store.getRequest(params[0]);
    if (!req) return emptyRequestState();
    var c = req.classification;
    function line(label, val) { return '<div class="row small"><span class="muted">' + label + '</span><span class="bold">' + esc(val) + '</span></div>'; }
    return '<div class="screen-scroll-region">' +
      '<div class="card"><h3>' + esc(req.input.productName) + '</h3><span class="badge badge-neutral">' + esc(req.input.category) + '</span></div>' +
      '<div class="card stack">' +
      '<div class="row"><h3 style="margin:0;">Classification</h3><span class="badge badge-DEMO">Confidence ' + c.confidence + '%</span></div>' +
      line('Commodity', c.commodity) + line('Product family', c.productFamily) + line('Pricing characteristic', c.pricingCharacteristic) +
      line('Import exposure', c.importExposure) + line('Labor exposure', c.laborExposure) + line('Commodity exposure', c.commodityExposure) +
      line('Tech lifecycle exposure', c.techLifecycleExposure) + line('Supplier dependency', c.supplierDependency) +
      (c.corrected ? '<div class="banner banner-info">Classification manually corrected by ' + esc(req.correctionBy || 'user') + '. Recorded as a learning event.</div>' : '') +
      '<button class="btn btn-ghost" style="align-self:flex-start;" data-action="openCorrectionSheet" data-arg="' + req.id + '">Correct classification</button>' +
      '</div>' +
      '</div>' +
      '<div class="fab-bar"><button class="btn btn-primary btn-block" data-action="go" data-arg="coverage/' + req.id + '">Continue \u2192 Knowledge Coverage</button></div>';
  };

  function correctionSheetHtml(req) {
    var opts = CATEGORY_NAMES.map(function (c) { return '<option value="' + c + '"' + (req.input.category === c ? ' selected' : '') + '>' + c + '</option>'; }).join('');
    return '<div class="sheet-handle"></div><h3>Correct classification</h3>' +
      '<div class="field"><label>Correct category</label><select id="c-category">' + opts + '</select></div>' +
      '<div class="field-hint">This will regenerate cost drivers and models for the corrected category, and log a learning event.</div>' +
      '<button class="btn btn-primary btn-block" data-action="applyCorrection" data-arg="' + req.id + '">Apply correction</button>';
  }

  function emptyRequestState() {
    return '<div class="empty-state"><p>Request not found.</p><button class="btn btn-primary" data-action="go" data-arg="home">Go Home</button></div>';
  }

  // -------------------------------------------------------------------------
  // Screen: Knowledge Coverage
  // -------------------------------------------------------------------------

  screenRenderers.coverage = function (params) {
    var req = Store.getRequest(params[0]);
    if (!req) return emptyRequestState();
    var cov = req.coverage;
    function bar(label, val) {
      return '<div class="stack" style="gap:2px;"><div class="row tiny"><span class="muted">' + label + '</span><span class="bold">' + val + '</span></div>' +
        '<div class="range-bar" style="margin:0;"><div style="position:absolute;left:0;top:0;bottom:0;width:' + val + '%;background:var(--accent);border-radius:3px;"></div></div></div>';
    }
    var labelBadge = cov.label === 'Sufficient' ? 'badge-LIVE' : (cov.label === 'Research Required' ? 'badge-DEMO' : 'badge-UNAVAILABLE');
    return '<div class="screen-scroll-region">' +
      '<div class="card center"><div class="tiny muted">Overall coverage</div><div class="bold" style="font-size:28px;">' + cov.overall + '<span class="tiny muted">/100</span></div><span class="badge ' + labelBadge + '">' + esc(cov.label) + '</span></div>' +
      '<div class="card stack">' +
      bar('Product knowledge', cov.productKnowledge) + bar('Category knowledge', cov.categoryKnowledge) + bar('Historical data', cov.historicalData) +
      bar('Market coverage', cov.marketCoverage) + bar('Cost-driver knowledge', cov.costDriverKnowledge) + bar('Source freshness', cov.sourceFreshness) +
      '</div>' +
      (cov.label !== 'Sufficient' ? '<div class="banner banner-warning">Coverage is below the Sufficient threshold (70). Autonomous research is recommended before calculation.</div>' : '<div class="banner banner-success">Coverage is sufficient — you can proceed directly to sources.</div>') +
      '</div>' +
      '<div class="fab-bar">' +
      (cov.label !== 'Sufficient' ? '<button class="btn btn-accent btn-block" data-action="go" data-arg="research/' + req.id + '">Launch Research Mission</button>' : '<button class="btn btn-primary btn-block" data-action="go" data-arg="sources/' + req.id + '">Continue \u2192 Sources</button>') +
      '</div>';
  };

  // -------------------------------------------------------------------------
  // Screen: Research Mission
  // -------------------------------------------------------------------------

  screenRenderers.research = function (params) {
    var req = Store.getRequest(params[0]);
    if (!req) return emptyRequestState();
    var objectives = CalcCore.RESEARCH_OBJECTIVES;
    var done = req.researched;
    var chips = objectives.map(function (o, i) {
      var state = done ? 'done' : (i === 0 ? 'active' : '');
      return '<div class="agent-chip ' + state + '"><span class="dot"></span>' + esc(o) + (done ? ' \u2713' : (i === 0 ? ' \u2026' : ''))+'</div>';
    }).join('');
    return '<div class="screen-scroll-region">' +
      '<div class="card"><h3 style="margin:0 0 4px;">Autonomous research agents</h3><p class="small muted" style="margin:0;">' + (done ? 'Research complete. Coverage and sources have been refreshed.' : 'Coverage was below Sufficient — running research objectives.') + '</p></div>' +
      '<div class="stack">' + chips + '</div>' +
      (done ? '<div class="banner banner-success">Knowledge coverage improved. Sources refreshed — none are claimed as LIVE; unverifiable items remain DEMO or UNAVAILABLE.</div>' : '') +
      '</div>' +
      '<div class="fab-bar">' + (done ?
        '<button class="btn btn-primary btn-block" data-action="go" data-arg="sources/' + req.id + '">Continue \u2192 Sources</button>' :
        '<button class="btn btn-accent btn-block" data-action="runResearch" data-arg="' + req.id + '">Run Research Mission</button>') + '</div>';
  };

  // -------------------------------------------------------------------------
  // Screen: Intelligence Sources
  // -------------------------------------------------------------------------

  screenRenderers.sources = function (params) {
    var req = Store.getRequest(params[0]);
    if (!req) return emptyRequestState();
    var rows = req.sources.map(function (s) {
      return '<div class="card card-tight stack" style="gap:4px;">' +
        '<div class="row"><span class="bold small">' + esc(s.name) + '</span>' + badge(s.status) + '</div>' +
        '<div class="tiny muted">Published ' + esc(s.publishedDate) + ' · Trust score ' + s.trustScore + '/100</div>' +
        '<div class="tag-row">' + freshBadge(s.freshness) + (s.note ? '<span class="tiny muted">' + esc(s.note) + '</span>' : '') + '</div>' +
        '</div>';
    }).join('');
    return '<div class="screen-scroll-region">' +
      '<div class="banner banner-info">Every source below carries a status. Nothing here is presented as LIVE unless a real connected provider confirms it — see Settings \u2192 Data Providers.</div>' +
      rows +
      '</div>' +
      '<div class="fab-bar"><button class="btn btn-primary btn-block" data-action="go" data-arg="drivers/' + req.id + '">Continue \u2192 Cost Drivers</button></div>';
  };

  // -------------------------------------------------------------------------
  // Screen: Cost Driver Analysis
  // -------------------------------------------------------------------------

  screenRenderers.drivers = function (params) {
    var req = Store.getRequest(params[0]);
    if (!req) return emptyRequestState();
    var editable = canEditWeights(Store.state.currentUser.role);
    var rows = req.costDrivers.map(function (d, i) {
      return '<div class="row small">' +
        '<span>' + esc(d.name) + '</span>' +
        '<span class="hstack"><span class="mono-num">' + Math.round(d.weight * 100) + '%</span>' +
        '<span class="mono-num" style="color:' + (d.delta >= 0 ? 'var(--danger)' : 'var(--success)') + ';min-width:52px;text-align:right;">' + fmtPct(d.delta) + '</span>' +
        badge(d.status) + '</span></div>';
    }).join('<hr class="divider">');
    return '<div class="screen-scroll-region">' +
      '<div class="card"><h3 style="margin:0 0 4px;">' + esc(req.input.category) + ' cost drivers</h3><p class="tiny muted" style="margin:0;">Weight · demo % change vs. baseline · status. Deltas are synthetic DEMO figures pending live provider connection.</p></div>' +
      '<div class="card stack">' + rows + '</div>' +
      (!editable ? '<div class="banner banner-info">Only Procurement Head / Admin roles can edit driver weights. You are viewing as ' + esc(Store.state.currentUser.role) + '.</div>' : '') +
      '</div>' +
      '<div class="fab-bar"><button class="btn btn-primary btn-block" data-action="go" data-arg="result/' + req.id + '">Calculate HPS \u2192</button></div>';
  };

  // -------------------------------------------------------------------------
  // Screen: HPS Result
  // -------------------------------------------------------------------------

  screenRenderers.result = function (params) {
    var req = Store.getRequest(params[0]);
    if (!req) return emptyRequestState();
    var hps = req.hps;
    if (!hps || hps.recommended == null) {
      return '<div class="banner banner-danger">' + esc(hps && hps.error ? hps.error : 'Calculation error — no model produced a usable value.') +
        '</div><button class="btn btn-primary btn-block" data-action="go" data-arg="drivers/' + req.id + '">Review Cost Drivers</button>';
    }
    var isRental = hps.outputBasis === 'perUnitPerMonth';
    var heroValue = isRental ? hps.recommendedPerUnit : hps.recommended;
    var heroLow = isRental ? hps.lowPerUnit : hps.low;
    var heroHigh = isRental ? hps.highPerUnit : hps.high;
    var rangePct = heroHigh > heroLow ? ((heroValue - heroLow) / (heroHigh - heroLow)) * 100 : 50;
    var confBadgeClass = hps.confidenceLabel === 'Very High' || hps.confidenceLabel === 'High' ? 'badge-LIVE' : (hps.confidenceLabel === 'Moderate' ? 'badge-DEMO' : 'badge-UNAVAILABLE');
    var topDrivers = req.costDrivers.slice().sort(function (a, b) { return Math.abs(b.weight * b.delta) - Math.abs(a.weight * a.delta); }).slice(0, 3);
    var qty = Math.max(1, Number(req.input.quantity) || 1);
    return '<div class="screen-scroll-region">' +
      '<div class="card center" style="padding:8px 12px;"><div class="tiny muted">' + esc(req.input.productName) + ' · ' + esc(req.input.category) + '</div></div>' +
      '<div class="card hps-hero">' +
      '<div class="tiny muted">' + (isRental ? 'RECOMMENDED HPS (PER UNIT / MONTH)' : 'RECOMMENDED HPS') + '</div>' +
      '<div class="hps-amount mono-num">' + CalcCore.fmtIDR(heroValue) + '</div>' +
      (isRental ? '<div class="tiny muted">Fleet of ' + qty + ' units · ' + (hps.rentalTermMonths || 36) + '-month term · total/month ' + CalcCore.fmtIDR(hps.recommended) + '</div>' : '') +
      '<div class="hstack" style="justify-content:center;margin-top:4px;"><span class="badge ' + confBadgeClass + '">Confidence ' + hps.confidence + ' · ' + esc(hps.confidenceLabel) + '</span></div>' +
      (hps.confidenceCapped ? '<div class="tiny" style="color:var(--warning);margin-top:4px;">Capped — demo/unavailable inputs in use</div>' : '') +
      '<div class="range-bar"><div class="marker" style="left:' + rangePct + '%;"></div></div>' +
      '<div class="range-labels"><span>Low ' + CalcCore.fmtIDR(heroLow) + '</span><span>High ' + CalcCore.fmtIDR(heroHigh) + '</span></div>' +
      '</div>' +
      '<div class="grid-3">' +
      modelMini('Historical', hps.models.A) + modelMini('Market', hps.models.B) + modelMini('Should Cost', hps.models.C) +
      '</div>' +
      (req.bufferBreakdown ? rentalBreakdownCard(req) : '') +
      '<div class="card stack">' +
      '<h3>Top cost drivers</h3>' +
      topDrivers.map(function (d) { return '<div class="row small"><span>' + esc(d.name) + '</span><span class="mono-num" style="color:' + (d.delta >= 0 ? 'var(--danger)' : 'var(--success)') + ';">' + fmtPct(d.delta) + '</span></div>'; }).join('') +
      '</div>' +
      '</div>' +
      '<div class="fab-bar">' +
      '<button class="btn btn-sm" data-action="go" data-arg="why/' + req.id + '">Why This HPS</button>' +
      '<button class="btn btn-sm" data-action="go" data-arg="scenario/' + req.id + '">Simulate</button>' +
      '<button class="btn btn-sm btn-primary" data-action="go" data-arg="negotiation/' + req.id + '">Negotiation</button>' +
      '</div>' +
      '<div class="fab-bar"><button class="btn btn-block" data-action="go" data-arg="approval/' + req.id + '">Go to Approval \u2192</button></div>';
  };

  function modelMini(label, m) {
    var val = m.value != null ? CalcCore.fmtIDR(m.value) : '—';
    var st = m.value != null ? m.status : (m.status || 'UNAVAILABLE');
    return '<div class="card card-tight center" style="padding:8px;"><div class="tiny muted">' + label + '</div><div class="bold small mono-num">' + val + '</div>' + badge(st) + '</div>';
  }

  // Rental/buffer-stock breakdown card (Payment Terminal Rental and similar
  // categories): shows how list rate -> vendor discount -> vendor financing
  // add-on -> buffer stock lines build up to the final per-unit rate.
  function rentalBreakdownCard(req) {
    var b = req.bufferBreakdown;
    if (!b) return '';
    var rows = '';
    if (b.rateAdjustments) {
      var ra = b.rateAdjustments;
      var isDeprec = ra.rateModel === 'purchasePriceDepreciation';
      if (isDeprec) {
        rows += '<div class="row small"><span>Terminal purchase price (per unit)</span><span class="mono-num">' + CalcCore.fmtIDR(ra.purchasePrice) + '</span></div>';
      } else {
        rows += '<div class="row small"><span>List rate (per unit/month)</span><span class="mono-num">' + CalcCore.fmtIDR(ra.listRate) + '</span></div>';
      }
      ra.lines.forEach(function (l) {
        var color = l.kind === 'discount' ? 'var(--success)' : (l.kind === 'surcharge' ? 'var(--danger)' : 'inherit');
        var sign = l.kind === 'discount' ? '\u2212' : (l.kind === 'surcharge' ? '+' : '');
        var pctLabel = l.pct != null ? ' (' + fmtPct(l.pct) + ')' : '';
        rows += '<div class="row small"><span>' + esc(l.label) + pctLabel + '</span><span class="mono-num" style="color:' + color + ';">' + sign + CalcCore.fmtIDR(Math.abs(l.amount)) + '</span></div>';
      });
      rows += '<div class="row small bold"><span>Net rate (per unit/month)</span><span class="mono-num">' + CalcCore.fmtIDR(b.unitRate) + '</span></div>';
    }
    var bufferRows = b.lines.map(function (l) {
      return '<div class="row small"><span>' + esc(l.label) + ' (' + l.pct + '%)</span><span class="mono-num">' + CalcCore.fmtIDR(l.amount) + '</span></div>';
    }).join('');
    return '<div class="card stack">' +
      '<h3>Rate build-up &amp; buffer stock</h3>' +
      rows +
      '<div class="tiny muted" style="margin-top:4px;">Buffer stock (spares &amp; consumables), fleet total/month</div>' +
      bufferRows +
      '<div class="row small bold"><span>Core + buffer total (fleet/month)</span><span class="mono-num">' + CalcCore.fmtIDR(b.grandTotal) + '</span></div>' +
      '</div>';
  }

  // -------------------------------------------------------------------------
  // Screen: HPS Model Detail
  // -------------------------------------------------------------------------

  screenRenderers.modeldetail = function (params) {
    var req = Store.getRequest(params[0]);
    if (!req) return emptyRequestState();
    var hps = req.hps;
    var A = hps.models.A, B = hps.models.B, C = hps.models.C, D = hps.models.D;
    function block(title, m, extra) {
      return '<div class="card stack"><h3 style="margin:0;">' + title + '</h3>' +
        (m.value != null ? '<div class="bold mono-num" style="font-size:18px;">' + CalcCore.fmtIDR(m.value) + '</div>' + badge(m.status) : '<div class="banner banner-warning">' + esc(m.reason) + '</div>') +
        (extra || '') + '</div>';
    }
    var aExtra = A.value != null ? '<div class="tiny muted">Base (historical): ' + CalcCore.fmtIDR(A.basis) + ' · Escalation: ' + fmtPct(A.escalationPct) + '</div>' : '';
    var bExtra = B.value != null ? '<div class="tiny muted">' + B.n + ' comparable points after outlier removal · Range ' + CalcCore.fmtIDR(B.low) + ' – ' + CalcCore.fmtIDR(B.high) + '</div>' : '';
    var cExtra = C.value != null ? '<div class="tiny muted">' + Object.keys(C.stack).filter(function (k) { return k !== 'total' && C.stack[k] > 0; }).map(function (k) { return k + ' ' + CalcCore.fmtIDR(C.stack[k]); }).join(' · ') + '</div>' : '';
    var dExtra = D.value != null ? '<div class="tiny muted">' + esc(D.note) + ' (n=' + D.sampleSize + ')</div>' : '';
    return '<div class="screen-scroll-region">' +
      block('Model A — Historical Indexation', A, aExtra) +
      block('Model B — Market Benchmark', B, bExtra) +
      block('Model C — Should Cost', C, cExtra) +
      block('Model D — Predictive/Economic', D, dExtra) +
      '<div class="card"><h3>Triangulation weights used</h3>' + Object.keys(hps.weightsUsed).map(function (k) { return '<div class="row small"><span>Model ' + k + '</span><span class="bold">' + Math.round(hps.weightsUsed[k] * 100) + '%</span></div>'; }).join('') +
      (canEditWeights(Store.state.currentUser.role) ? '<button class="btn btn-ghost" style="align-self:flex-start;" data-action="go" data-arg="governance">Edit production weights (Model Governance)</button>' : '') +
      '</div>' +
      '</div>';
  };

  // -------------------------------------------------------------------------
  // Screen: Why This HPS (explainability)
  // -------------------------------------------------------------------------

  screenRenderers.why = function (params) {
    var req = Store.getRequest(params[0]);
    if (!req) return emptyRequestState();
    var hps = req.hps;
    var driverRows = req.costDrivers.map(function (d) {
      var scenarioAdj = CalcCore.scenarioAdjustment(d.name, req.scenario) * 100;
      return '<div class="row small"><span>' + esc(d.name) + '</span><span class="mono-num">' + fmtPct(d.delta) + (scenarioAdj ? ' <span style="color:var(--accent);">(' + fmtPct(scenarioAdj) + ' sim.)</span>' : '') + '</span></div>';
    }).join('');
    var sourceRows = req.sources.map(function (s) {
      return '<div class="row small"><span>' + esc(s.name) + '</span>' + badge(s.status) + '</div>';
    }).join('');
    return '<div class="screen-scroll-region">' +
      '<div class="card stack"><h3>Base &amp; escalation</h3>' +
      (hps.models.A.value != null ? '<div class="row small"><span class="muted">Historical base price</span><span class="bold">' + CalcCore.fmtIDR(hps.models.A.basis) + '</span></div>' : '<div class="tiny muted">No historical base price provided.</div>') +
      driverRows +
      '</div>' +
      (req.bufferBreakdown ? rentalBreakdownCard(req) : '') +
      '<div class="card stack"><h3>Model contribution to recommended HPS</h3>' +
      Object.keys(hps.weightsUsed).map(function (k) { return '<div class="row small"><span>Model ' + k + '</span><span class="bold">' + Math.round(hps.weightsUsed[k] * 100) + '%</span></div>'; }).join('') +
      '</div>' +
      '<div class="card stack"><h3>Sources used</h3>' + sourceRows + '</div>' +
      '<div class="card stack"><h3>Confidence: ' + hps.confidence + ' (' + esc(hps.confidenceLabel) + ')</h3>' +
      Object.keys(hps.confidenceComponents || {}).map(function (k) { return '<div class="row tiny"><span class="muted">' + k + '</span><span>' + Math.round(hps.confidenceComponents[k]) + '</span></div>'; }).join('') +
      '</div>' +
      '</div>';
  };

  // -------------------------------------------------------------------------
  // Screen: Scenario Simulation
  // -------------------------------------------------------------------------

  var SCENARIO_SLIDERS = [
    { key: 'fx', label: 'FX (USD/IDR)' }, { key: 'index', label: 'Inflation / Index' },
    { key: 'commodity', label: 'Commodity/Component' }, { key: 'freight', label: 'Freight' },
    { key: 'labor', label: 'Labor' }, { key: 'margin', label: 'Supplier margin' },
    { key: 'volumeDiscount', label: 'Volume discount' },
  ];

  screenRenderers.scenario = function (params) {
    var req = Store.getRequest(params[0]);
    if (!req) return emptyRequestState();
    var hps = req.hps;
    var sliders = SCENARIO_SLIDERS.map(function (s) {
      var v = req.scenario[s.key] || 0;
      return '<div class="slider-row"><div class="row tiny"><span class="muted">' + s.label + '</span><span class="slider-val" id="val-' + s.key + '">' + fmtPct(v) + '</span></div>' +
        '<input type="range" min="-20" max="20" step="1" value="' + v + '" data-action="scenarioInput" data-key="' + s.key + '" data-arg="' + req.id + '"></div>';
    }).join('');
    return '<div class="screen-scroll-region">' +
      '<div class="card center" id="scenario-hps-display"><div class="tiny muted">Simulated recommended HPS</div><div class="bold mono-num" style="font-size:22px;color:var(--primary);">' + CalcCore.fmtIDR(hps.recommended) + '</div></div>' +
      '<div class="card stack">' + sliders + '</div>' +
      '<button class="btn btn-ghost" style="align-self:flex-start;" data-action="resetScenario" data-arg="' + req.id + '">Reset scenario</button>' +
      '</div>';
  };

  // -------------------------------------------------------------------------
  // Screen: Negotiation Intelligence
  // -------------------------------------------------------------------------

  screenRenderers.negotiation = function (params) {
    var req = Store.getRequest(params[0]);
    if (!req) return emptyRequestState();
    var n = req.negotiation;
    if (!n) return '<div class="empty-state">Negotiation intelligence unavailable — calculate HPS first.</div>';
    return '<div class="screen-scroll-region">' +
      '<div class="card stack">' +
      '<div class="row small"><span class="muted">Supplier initial quotation</span><span class="bold">' + (n.supplierQuote ? CalcCore.fmtIDR(n.supplierQuote) : 'Not provided') + '</span></div>' +
      '<div class="row small"><span class="muted">Recommended HPS</span><span class="bold">' + CalcCore.fmtIDR(n.recommendedHPS) + '</span></div>' +
      '<div class="row small"><span class="muted">Market median</span><span>' + (n.marketMedian != null ? CalcCore.fmtIDR(n.marketMedian) : '—') + '</span></div>' +
      '<div class="row small"><span class="muted">Should-cost estimate</span><span>' + (n.shouldCost != null ? CalcCore.fmtIDR(n.shouldCost) : '—') + '</span></div>' +
      '<hr class="divider">' +
      '<div class="row small"><span class="muted">Target settlement range</span><span class="bold">' + CalcCore.fmtIDR(n.targetLow) + ' – ' + CalcCore.fmtIDR(n.targetHigh) + '</span></div>' +
      '</div>' +
      '<div class="card stack"><h3>Negotiation levers</h3>' + n.levers.map(function (l) { return '<div class="small" style="padding:6px 0;border-bottom:1px solid var(--border);">' + esc(l) + '</div>'; }).join('') + '</div>' +
      '<div class="banner banner-info">Negotiation intelligence, not an automated commercial commitment. Any agreement still requires standard approval.</div>' +
      '</div>';
  };

  // -------------------------------------------------------------------------
  // Screen: Approval / HPS Lock
  // -------------------------------------------------------------------------

  screenRenderers.approval = function (params) {
    var req = Store.getRequest(params[0]);
    if (!req) return emptyRequestState();
    var role = Store.state.currentUser.role;
    var stage = req.approval.stage;
    var stageIdx = APPROVAL_STAGES.indexOf(stage);
    var track = APPROVAL_STAGES.map(function (s, i) {
      return '<div class="badge ' + (i < stageIdx ? 'badge-LIVE' : (i === stageIdx ? 'badge-DEMO' : 'badge-neutral')) + '">' + s + '</div>';
    }).join(' \u2192 ');
    var history = req.approval.history.map(function (h) {
      return '<div class="row tiny"><span class="muted">' + esc(h.stage) + '</span><span>' + esc(h.by) + ' · ' + fmtDate(h.at) + '</span></div>';
    }).join('');

    var actionArea = '';
    if (isReadOnly()) {
      actionArea = '<div class="banner banner-info">Auditor role — read-only view of the approval trail.</div>';
    } else if (req.status === 'Rejected') {
      actionArea = '<div class="banner banner-danger">Rejected: ' + esc(req.approval.rejectReason || 'No reason given') + '<button class="btn btn-sm banner-action" data-action="go" data-arg="drivers/' + req.id + '">Revise cost drivers</button></div>';
    } else if (stage === 'HPS Locked') {
      actionArea = '<div class="banner banner-success">HPS Locked at version ' + req.version + '. Editing cost drivers now will create a new version.</div>' +
        '<button class="btn btn-block" data-action="go" data-arg="outcome/' + req.id + '">Proceed to Outcome Capture</button>';
    } else if (stage === 'Draft') {
      actionArea = '<button class="btn btn-primary btn-block" data-action="advanceApproval" data-arg="' + req.id + '">Submit for Procurement Review</button>';
    } else if (stage === 'Procurement Review') {
      if (canReview(role)) actionArea = '<button class="btn btn-primary btn-block" data-action="advanceApproval" data-arg="' + req.id + '">Mark Reviewed \u2192 Send to Reviewer</button>';
      else actionArea = permissionDeniedBanner(role, 'advance this request past Procurement Review');
    } else if (stage === 'Reviewer') {
      if (canReview(role)) actionArea = '<button class="btn btn-primary btn-block" data-action="advanceApproval" data-arg="' + req.id + '">Send to Approver</button>';
      else actionArea = permissionDeniedBanner(role, 'act as Reviewer');
    } else if (stage === 'Approver') {
      if (canApprove(role)) {
        actionArea = '<div class="btn-group"><button class="btn btn-danger" data-action="rejectApproval" data-arg="' + req.id + '">Reject</button><button class="btn btn-primary" data-action="advanceApproval" data-arg="' + req.id + '">Approve &amp; Lock HPS</button></div>';
      } else actionArea = permissionDeniedBanner(role, 'approve or reject this request');
    }

    return '<div class="screen-scroll-region">' +
      '<div class="card"><div class="hstack" style="flex-wrap:wrap;gap:6px;">' + track + '</div></div>' +
      '<div class="card stack"><h3>Version ' + req.version + '</h3>' + history + '</div>' +
      '<div class="card stack">' + actionArea + '</div>' +
      '</div>';
  };

  function permissionDeniedBanner(role, action) {
    return '<div class="banner banner-danger">Permission denied — your role (' + esc(role) + ') cannot ' + esc(action) + '. Switch role in More \u2192 Switch User if you are demoing another persona.<button class="btn btn-sm banner-action" data-action="go" data-arg="more">Switch role</button></div>';
  }

  // -------------------------------------------------------------------------
  // Screen: Procurement Outcome
  // -------------------------------------------------------------------------

  screenRenderers.outcome = function (params) {
    var req = Store.getRequest(params[0]);
    if (!req) return emptyRequestState();
    if (req.outcome) {
      var o = req.outcome, le = req.learningEvents[req.learningEvents.length - 1];
      return '<div class="screen-scroll-region"><div class="card stack"><h3>Outcome recorded</h3>' +
        '<div class="row small"><span class="muted">Final / actual cost</span><span class="bold">' + CalcCore.fmtIDR(le.actual) + '</span></div>' +
        '<div class="row small"><span class="muted">Variance vs HPS</span><span class="bold">' + fmtPct(le.percentError) + '</span></div>' +
        '<div class="row small"><span class="muted">Saving vs initial bid</span><span>' + (le.savingVsInitial != null ? fmtPct(le.savingVsInitial) : '—') + '</span></div>' +
        '</div><button class="btn btn-primary btn-block" data-action="go" data-arg="learningevent/' + req.id + '">View Learning Event</button></div>';
    }
    return '<div class="screen-scroll-region"><div class="card stack">' +
      '<div class="field"><label>Supplier initial bid (IDR)</label><input id="o-initial" type="number"></div>' +
      '<div class="field"><label>Negotiation rounds</label><input id="o-rounds" type="number" min="0" value="1"></div>' +
      '<div class="field"><label>Final negotiated / contract price (IDR)</label><input id="o-final" type="number"></div>' +
      '<div class="field"><label>Selected supplier</label><input id="o-supplier" placeholder="e.g. PT Vendor Sejahtera"></div>' +
      '<div class="field"><label>Invoice / actual cost (IDR, optional)</label><input id="o-invoice" type="number"></div>' +
      '<div class="field"><label>Notes</label><textarea id="o-notes"></textarea></div>' +
      '</div></div>' +
      '<div class="fab-bar"><button class="btn btn-primary btn-block" data-action="submitOutcome" data-arg="' + req.id + '">Capture Outcome &amp; Generate Learning Event</button></div>';
  };

  // -------------------------------------------------------------------------
  // Screen: Learning Event
  // -------------------------------------------------------------------------

  screenRenderers.learningevent = function (params) {
    var req = Store.getRequest(params[0]);
    if (!req) return emptyRequestState();
    var le = req.learningEvents[req.learningEvents.length - 1];
    if (!le) return '<div class="empty-state">No learning event yet for this request.</div>';
    return '<div class="screen-scroll-region">' +
      '<div class="card stack"><h3>Learning event</h3>' +
      '<div class="row small"><span class="muted">Predicted HPS</span><span>' + CalcCore.fmtIDR(le.hps) + '</span></div>' +
      '<div class="row small"><span class="muted">Actual outcome</span><span>' + CalcCore.fmtIDR(le.actual) + '</span></div>' +
      '<div class="row small"><span class="muted">Absolute error</span><span>' + CalcCore.fmtIDR(le.absoluteError) + '</span></div>' +
      '<div class="row small"><span class="muted">Percent error (MAPE contribution)</span><span class="bold">' + le.percentError + '%</span></div>' +
      '<div class="row small"><span class="muted">Systematic bias</span><span>' + fmtPct(le.bias) + '</span></div>' +
      '</div>' +
      '<div class="banner banner-success">This outcome has been added to ' + esc(req.input.category) + '\u2019s knowledge base and will influence future Model D predictions and category maturity.</div>' +
      '<button class="btn btn-primary btn-block" data-action="go" data-arg="brain">View AI Brain Dashboard</button>' +
      '</div>';
  };

  // -------------------------------------------------------------------------
  // Screen: AI Brain / Learning Dashboard
  // -------------------------------------------------------------------------

  screenRenderers.brain = function () {
    var reqs = Store.tenantRequests();
    var products = {}, vendors = {};
    reqs.forEach(function (r) { products[r.input.productName] = 1; if (r.outcome) vendors[r.outcome.selectedSupplier || 'Unknown'] = 1; });
    var categoriesUsed = {};
    reqs.forEach(function (r) { if (r.input.category) categoriesUsed[r.input.category] = (categoriesUsed[r.input.category] || 0) + 1; });
    var totalOutcomes = reqs.filter(function (r) { return r.outcome; }).length;
    var avgMape = totalOutcomes ? (reqs.filter(function (r) { return r.outcome; }).reduce(function (s, r) { return s + r.outcome.percentError; }, 0) / totalOutcomes) : null;
    var newKnowledge = reqs.reduce(function (s, r) { return s + (r.learningEvents || []).length; }, 0);

    function stat(label, val) { return '<div class="card card-tight"><div class="tiny muted">' + label + '</div><div class="bold mono-num" style="font-size:17px;">' + (val === null ? '—' : val) + '</div></div>'; }

    var catRows = Object.keys(categoriesUsed).map(function (cat) {
      var m = CalcCore.categoryMaturity(cat, reqs);
      return '<div class="row small" data-action="go" data-arg="knowledgedetail/' + encodeURIComponent(cat) + '" style="cursor:pointer;">' +
        '<span>' + esc(cat) + '</span><span class="badge badge-neutral">Lv.' + m + ' ' + CalcCore.MATURITY_LABELS[m] + '</span></div>';
    }).join('<hr class="divider">') || '<div class="empty-state small">No categories processed yet.</div>';

    return '<div class="screen-scroll-region">' +
      '<div class="grid-3">' + stat('Knowledge items', newKnowledge) + stat('Products learned', Object.keys(products).length) + stat('Categories learned', Object.keys(categoriesUsed).length) + '</div>' +
      '<div class="grid-3">' + stat('HPS generated', reqs.length) + stat('Model accuracy', avgMape != null ? Math.max(0, Math.round(100 - avgMape)) + '%' : null) + stat('Vendors learned', Object.keys(vendors).length) + '</div>' +
      '<div class="card stack"><h3>Category maturity</h3>' + catRows + '</div>' +
      (isAdmin(Store.state.currentUser.role) ? '<button class="btn btn-block" data-action="go" data-arg="governance">Open Model Governance</button>' : '') +
      '</div>';
  };

  screenRenderers.knowledgedetail = function (params) {
    var cat = decodeURIComponent(params[0] || '');
    var reqs = Store.tenantRequests().filter(function (r) { return r.input.category === cat; });
    var maturity = CalcCore.categoryMaturity(cat, Store.tenantRequests());
    var rows = reqs.map(function (r) {
      return '<div class="row small" data-action="go" data-arg="result/' + r.id + '" style="cursor:pointer;"><span>' + esc(r.input.productName) + '</span><span class="mono-num">' + (r.hps && r.hps.recommended != null ? CalcCore.fmtIDR(r.hps.recommended) : '—') + '</span></div>';
    }).join('<hr class="divider">');
    return '<div class="screen-scroll-region">' +
      '<div class="card center"><h3 style="margin:0;">' + esc(cat) + '</h3><span class="badge badge-neutral">Level ' + maturity + ' · ' + CalcCore.MATURITY_LABELS[maturity] + '</span></div>' +
      '<div class="card stack"><h3>Requests in this category</h3>' + (rows || '<div class="empty-state small">None yet.</div>') + '</div>' +
      '<div class="banner banner-info">Maturity is a heuristic visualization of data volume and outcome accuracy for this prototype — not a claim of true predictive certainty.</div>' +
      '</div>';
  };

  // -------------------------------------------------------------------------
  // Screen: Intelligence hub (all requests, links into sources/drivers)
  // -------------------------------------------------------------------------

  screenRenderers.intelligence = function () {
    var reqs = Store.tenantRequests();
    var rows = reqs.map(function (r) {
      return '<div class="card card-tight stack" style="gap:4px;">' +
        '<div class="row"><span class="bold small">' + esc(r.input.productName) + '</span><span class="pill-status pill-' + r.status.replace(/\s+/g, '') + '">' + esc(r.status) + '</span></div>' +
        '<div class="tiny muted">' + esc(r.input.category) + ' · Coverage ' + (r.coverage ? r.coverage.overall : '—') + '/100</div>' +
        '<div class="btn-group"><button class="btn btn-sm" data-action="go" data-arg="sources/' + r.id + '">Sources</button><button class="btn btn-sm" data-action="go" data-arg="drivers/' + r.id + '">Drivers</button><button class="btn btn-sm" data-action="go" data-arg="result/' + r.id + '">Result</button></div>' +
        '</div>';
    }).join('') || '<div class="empty-state">No requests yet.<br><button class="btn btn-primary" style="margin-top:8px;" data-action="navroot" data-arg="new">Start New HPS</button></div>';
    return '<div class="screen-scroll-region">' + rows + '</div>';
  };

  // -------------------------------------------------------------------------
  // Screen: Model Governance (Admin)
  // -------------------------------------------------------------------------

  screenRenderers.governance = function () {
    var role = Store.state.currentUser.role;
    if (!isAdmin(role)) return permissionDeniedBanner(role, 'view Model Governance') + '<button class="btn btn-block" data-action="go" data-arg="home">Home</button>';
    var gov = Store.state.modelGovernance;
    var prod = gov.production;
    var rows = Object.keys(prod).map(function (k) {
      return '<div class="field"><label>Model ' + k + ' weight (production)</label><input type="number" step="0.05" min="0" max="1" id="gov-' + k + '" value="' + prod[k] + '"></div>';
    }).join('');
    var historyRows = gov.history.map(function (h) {
      return '<div class="row tiny"><span class="muted">' + fmtDate(h.at) + '</span><span>' + esc(h.by) + ' — ' + esc(h.summary) + '</span></div>';
    }).join('') || '<div class="tiny muted">No governance changes yet.</div>';
    return '<div class="stack">' +
      '<div class="card stack"><h3>Production model weights</h3>' + rows +
      '<div class="field-hint">Proposed changes go through backtest + explicit approval — no material change is auto-deployed.</div>' +
      '<button class="btn btn-primary btn-block" data-action="proposeGovernanceChange">Propose &amp; Approve Change</button>' +
      '</div>' +
      '<div class="card stack"><h3>Change history</h3>' + historyRows + '</div>' +
      '</div>';
  };

  // -------------------------------------------------------------------------
  // Screen: Settings / Data Providers
  // -------------------------------------------------------------------------

  screenRenderers.settings = function () {
    var rows = Store.state.providers.map(function (p) {
      return '<div class="card card-tight stack" style="gap:4px;">' +
        '<div class="row"><span class="bold small">' + esc(p.name) + '</span>' + badge(p.status) + '</div>' +
        (p.note ? '<div class="tiny muted">' + esc(p.note) + '</div>' : '') +
        '<button class="btn btn-sm" disabled title="Requires a backend proxy — see deployment guide">Connect (requires backend)</button>' +
        '</div>';
    }).join('');
    return '<div class="stack">' +
      '<div class="banner banner-info">This prototype runs entirely in your browser with no backend. No provider below is LIVE. Connecting real feeds requires a small backend/proxy (e.g. Cloudflare Worker) — see the deployment README.</div>' +
      rows +
      '</div>';
  };

  // -------------------------------------------------------------------------
  // Screen: More (menu)
  // -------------------------------------------------------------------------

  screenRenderers.more = function () {
    var tenantOpts = Store.state.tenants.map(function (t) { return '<option value="' + t.id + '"' + (t.id === Store.state.currentTenantId ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('');
    var roleOpts = ROLES.map(function (r) { return '<option value="' + r + '"' + (r === Store.state.currentUser.role ? ' selected' : '') + '>' + r + '</option>'; }).join('');
    return '<div class="screen-scroll-region">' +
      '<div class="card stack"><h3>Switch user / tenant</h3>' +
      '<div class="field"><label>Name</label><input id="more-name" value="' + esc(Store.state.currentUser.name) + '"></div>' +
      '<div class="field"><label>Role</label><select id="more-role">' + roleOpts + '</select></div>' +
      '<div class="field"><label>Tenant</label><select id="more-tenant">' + tenantOpts + '</select></div>' +
      '<button class="btn btn-primary btn-block" data-action="applyMoreSwitch">Apply</button>' +
      '</div>' +
      '<div class="card stack">' +
      '<button class="btn" data-action="go" data-arg="settings">Data Providers</button>' +
      (isAdmin(Store.state.currentUser.role) ? '<button class="btn" data-action="go" data-arg="governance">Model Governance</button>' : '') +
      '<button class="btn" data-action="go" data-arg="auditlog">Audit Log</button>' +
      '</div>' +
      '<div class="card stack"><button class="btn btn-danger" data-action="resetDemoData">Reset Demo Data</button></div>' +
      '</div>';
  };

  screenRenderers.auditlog = function () {
    var rows = Store.state.auditLog.map(function (e) {
      return '<div class="row tiny"><span class="muted">' + fmtDate(e.ts) + '</span><span>' + esc(e.user) + ' (' + esc(e.role) + ') — ' + esc(e.action) + '</span></div>';
    }).join('<hr class="divider">') || '<div class="empty-state small">No audit events yet.</div>';
    return '<div class="card stack"><h3>Audit log</h3>' + rows + '</div>';
  };

  // -------------------------------------------------------------------------
  // Sheets (bottom sheet overlay)
  // -------------------------------------------------------------------------

  function showSheet(html) {
    var root = qs('app-root');
    var wrap = document.createElement('div');
    wrap.className = 'sheet-backdrop';
    wrap.id = 'active-sheet';
    wrap.innerHTML = '<div class="sheet">' + html + '</div>';
    wrap.addEventListener('click', function (e) { if (e.target === wrap) closeSheet(); });
    root.appendChild(wrap);
  }
  function closeSheet() {
    var el = qs('active-sheet');
    if (el) el.parentNode.removeChild(el);
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  var actions = {
    back: function () { back(); },
    go: function (arg) { go(arg); },
    navroot: function (arg) {
      if (arg === 'new') {
        if (!Store.state.draftRequest) Store.state.draftRequest = newRequest();
        Store.save();
        go('new/1');
      } else {
        go(arg);
      }
    },
    doLogin: function () {
      Store.state.currentUser.name = qs('login-name').value || 'Guest';
      Store.state.currentUser.role = qs('login-role').value;
      Store.state.currentTenantId = qs('login-tenant').value;
      Store.state.onboarded = true;
      Store.log('Signed in');
      Store.save();
      go('home');
    },
    categoryChanged: function () {
      // Re-render step 1 so the sub-category list matches the newly chosen category.
      var d = Store.state.draftRequest;
      d.input.businessUnit = qs('f-bu').value;
      d.input.requester = qs('f-requester').value;
      d.input.category = qs('f-category').value;
      d.input.subCategory = '';
      d.input.productName = qs('f-productname').value;
      Store.save();
      render();
    },
    chipPick: function (val, el) {
      var group = el.getAttribute('data-group');
      document.querySelectorAll('.chip-opt[data-group="' + group + '"]').forEach(function (b) { b.classList.remove('active'); });
      el.classList.add('active');
      var groupEl = qs(group);
      if (groupEl) groupEl.setAttribute('data-val', val);
    },
    wizardNext: function (step) {
      var d = Store.state.draftRequest;
      if (step === '1') {
        d.input.businessUnit = qs('f-bu').value;
        d.input.requester = qs('f-requester').value;
        d.input.category = qs('f-category').value;
        d.input.subCategory = qs('f-subcategory').value;
        d.input.productName = qs('f-productname').value;
        if (!d.input.category || !d.input.productName) { alert('Category and product name are required.'); return; }
        Store.save();
        go('new/2');
      } else if (step === '2') {
        d.input.description = qs('f-description').value;
        d.input.quantity = qs('f-qty').value;
        d.input.uom = qs('f-uom').value;
        d.input.requiredDate = qs('f-reqdate').value;
        d.input.deliveryLocation = qs('f-location').value;
        d.input.origin = qs('f-origin').getAttribute('data-val') || d.input.origin;
        Store.save();
        go('new/3');
      }
    },
    openAdvancedSheet: function () { showSheet(advancedSheetHtml()); },
    saveAdvancedSheet: function () {
      var d = Store.state.draftRequest.input;
      d.historicalPrice = qs('a-histprice').value;
      d.historicalDate = qs('a-histdate').value;
      d.supplierQuotation = qs('a-suppq').value;
      d.principalQuotation = qs('a-princq').value;
      d.commercialTerms = qs('a-terms').value;
      d.warranty = qs('a-warranty').value;
      d.taxTreatment = qs('a-tax').value;
      d.notes = qs('a-notes').value;
      var cat = CalcCore.CATEGORIES[d.category];
      if (cat && cat.principalDiscountPct) {
        var rateModelEl = qs('a-ratemodel');
        var discEl = qs('a-discount'), aprEl = qs('a-apr');
        var purchaseEl = qs('a-purchaseprice'), marginEl = qs('a-marginpct');
        var bufTEl = qs('a-buf-terminal'), bufBEl = qs('a-buf-battery'), bufAEl = qs('a-buf-adapter');
        if (rateModelEl) d.rateModel = rateModelEl.value;
        d.principalDiscountPct = (discEl && discEl.value !== '') ? Number(discEl.value) : null;
        d.vendorFinancingAPR = (aprEl && aprEl.value !== '') ? Number(aprEl.value) : null;
        d.purchasePriceIDR = (purchaseEl && purchaseEl.value !== '') ? Number(purchaseEl.value) : null;
        d.vendorMarginPct = (marginEl && marginEl.value !== '') ? Number(marginEl.value) : null;
        var overrides = {};
        if (bufTEl && bufTEl.value !== '') overrides.terminalBuffer = Number(bufTEl.value);
        if (bufBEl && bufBEl.value !== '') overrides.batteryBuffer = Number(bufBEl.value);
        if (bufAEl && bufAEl.value !== '') overrides.adapterBuffer = Number(bufAEl.value);
        d.bufferOverridesPct = Object.keys(overrides).length ? overrides : null;
      }
      Store.save();
      closeSheet();
      render();
    },
    generateHPS: function () {
      var d = Store.state.draftRequest;
      d.input.currency = qs('f-currency').value;
      d.input.procurementType = qs('f-proctype').value;
      // Run the pipeline: classification -> coverage -> sources -> drivers -> models.
      d.classification = CalcCore.generateClassification(d.input);
      d.coverage = CalcCore.computeCoverage(d.input, false);
      d.sources = CalcCore.generateSources(d.input, d.coverage.label !== 'Sufficient');
      d.costDrivers = CalcCore.generateCostDrivers(d);
      recompute(d);
      upsertRequest(d);
      Store.log('Generated Intelligent HPS', d.input.productName);
      var newId = d.id;
      Store.state.draftRequest = null;
      Store.save();
      go('classify/' + newId);
    },
    openCorrectionSheet: function (id) { showSheet(correctionSheetHtml(Store.getRequest(id))); },
    applyCorrection: function (id) {
      var req = Store.getRequest(id);
      var newCat = qs('c-category').value;
      req.input.category = newCat;
      req.classification = CalcCore.generateClassification(req.input);
      req.classification.corrected = true;
      req.correctionBy = Store.state.currentUser.name;
      req.coverage = CalcCore.computeCoverage(req.input, req.researched);
      req.sources = CalcCore.generateSources(req.input, req.researched);
      req.costDrivers = CalcCore.generateCostDrivers(req);
      recompute(req);
      req.learningEvents.push({ type: 'classification_correction', category: newCat, at: new Date().toISOString(), by: Store.state.currentUser.name, percentError: 0, bias: 0 });
      upsertRequest(req);
      Store.log('Corrected classification', newCat);
      closeSheet();
      render();
    },
    runResearch: function (id) {
      var req = Store.getRequest(id);
      req.researched = true;
      req.coverage = CalcCore.computeCoverage(req.input, true);
      req.sources = CalcCore.generateSources(req.input, true);
      req.costDrivers = CalcCore.generateCostDrivers(req);
      recompute(req);
      upsertRequest(req);
      Store.log('Ran research mission', req.input.productName);
      render();
    },
    scenarioInput: function (arg, el) {
      var key = el.getAttribute('data-key');
      var req = Store.getRequest(arg);
      req.scenario[key] = Number(el.value);
      recompute(req);
      upsertRequest(req);
      var valEl = qs('val-' + key);
      if (valEl) valEl.textContent = fmtPct(Number(el.value));
      var hpsDisplay = qs('scenario-hps-display');
      if (hpsDisplay) hpsDisplay.querySelector('.bold').textContent = CalcCore.fmtIDR(req.hps.recommended);
    },
    resetScenario: function (id) {
      var req = Store.getRequest(id);
      req.scenario = { fx: 0, index: 0, commodity: 0, freight: 0, labor: 0, margin: 0, volumeDiscount: 0 };
      recompute(req);
      upsertRequest(req);
      render();
    },
    submitOutcome: function (id) {
      var req = Store.getRequest(id);
      var outcome = {
        supplierInitialBid: Number(qs('o-initial').value) || null,
        negotiationRounds: Number(qs('o-rounds').value) || 0,
        finalNegotiatedPrice: Number(qs('o-final').value) || null,
        contractPrice: Number(qs('o-final').value) || null,
        selectedSupplier: qs('o-supplier').value,
        actualCost: Number(qs('o-invoice').value) || Number(qs('o-final').value) || null,
        notes: qs('o-notes').value,
      };
      if (!outcome.actualCost) { alert('Provide at least a final negotiated/contract price.'); return; }
      req.outcome = outcome;
      var learn = CalcCore.computeOutcomeLearning(req, outcome);
      req.outcome.percentError = learn.percentError;
      req.outcome.bias = learn.bias;
      var event = Object.assign({ type: 'outcome', category: req.input.category, at: new Date().toISOString(), by: Store.state.currentUser.name }, learn);
      req.learningEvents.push(event);
      upsertRequest(req);
      Store.log('Captured outcome', req.input.productName);
      go('learningevent/' + id);
    },
    advanceApproval: function (id) {
      var req = Store.getRequest(id);
      var role = Store.state.currentUser.role;
      var idx = APPROVAL_STAGES.indexOf(req.approval.stage);
      if (req.approval.stage === 'Procurement Review' && !canReview(role)) { render(); return; }
      if (req.approval.stage === 'Reviewer' && !canReview(role)) { render(); return; }
      if (req.approval.stage === 'Approver' && !canApprove(role)) { render(); return; }
      var next = APPROVAL_STAGES[idx + 1];
      req.approval.stage = next;
      req.approval.history.push({ stage: next, by: Store.state.currentUser.name, at: new Date().toISOString() });
      req.status = next;
      if (next === 'HPS Locked') Store.log('Locked HPS', req.input.productName + ' v' + req.version);
      upsertRequest(req);
      render();
    },
    rejectApproval: function (id) {
      var req = Store.getRequest(id);
      if (!canApprove(Store.state.currentUser.role)) { render(); return; }
      var reason = prompt('Reason for rejection?') || 'No reason given';
      req.status = 'Rejected';
      req.approval.rejectReason = reason;
      req.approval.history.push({ stage: 'Rejected', by: Store.state.currentUser.name, at: new Date().toISOString() });
      upsertRequest(req);
      Store.log('Rejected approval', req.input.productName + ' — ' + reason);
      render();
    },
    proposeGovernanceChange: function () {
      var gov = Store.state.modelGovernance;
      var keys = Object.keys(gov.production);
      var newWeights = {};
      var sum = 0;
      keys.forEach(function (k) { var v = Number(qs('gov-' + k).value) || 0; newWeights[k] = v; sum += v; });
      if (Math.abs(sum - 1) > 0.02) { alert('Weights must sum to approximately 1.00 (currently ' + sum.toFixed(2) + ').'); return; }
      if (!confirm('Apply this production weight change now? This affects all future HPS calculations for this tenant.')) return;
      gov.history.unshift({ at: new Date().toISOString(), by: Store.state.currentUser.name, summary: keys.map(function (k) { return k + ':' + newWeights[k]; }).join(', ') });
      gov.production = newWeights;
      Store.log('Approved model governance change', JSON.stringify(newWeights));
      Store.save();
      render();
    },
    applyMoreSwitch: function () {
      Store.state.currentUser.name = qs('more-name').value || Store.state.currentUser.name;
      Store.state.currentUser.role = qs('more-role').value;
      Store.state.currentTenantId = qs('more-tenant').value;
      Store.log('Switched user/tenant');
      Store.save();
      go('home');
    },
    resetDemoData: function () {
      if (!confirm('This clears all demo requests, providers, and audit history in this browser. Continue?')) return;
      Store.reset();
      go('home');
    },
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    var arg = el.getAttribute('data-arg');
    if (actions[action]) actions[action](arg, el);
  });

  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.getAttribute && el.getAttribute('data-action') === 'scenarioInput') {
      actions.scenarioInput(el.getAttribute('data-arg'), el);
    }
  });

  // <select>/<input> elements report their new value via 'change', not 'click' —
  // needed for the category dropdown (data-action="categoryChanged") in particular.
  document.addEventListener('change', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    if (action === 'scenarioInput') return; // handled by the 'input' listener above
    var arg = el.getAttribute('data-arg');
    if (actions[action]) actions[action](arg, el);
  });

  window.addEventListener('online', render);
  window.addEventListener('offline', render);

})();
