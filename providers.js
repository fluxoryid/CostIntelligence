/* providers.js — live provider adapters with last-known-good caching.
 * The adapters never fabricate values. A failed upstream call returns
 * cached data when available; otherwise the source remains unavailable.
 */
(function () {
  'use strict';
  var PREFIX = 'hps_provider_v1_';
  var HISTORY_DATE_KEY = 'hps_historical_purchase_date_v1';
  var CPI_PROXY_KEY = 'hps_allow_bps_cpi_proxy_v1';

  var state = {
    fx: {status:'connecting', data:null},
    kursPajak: {status:'connecting', data:null},
    biRate: {status:'connecting', data:null},
    wb: {status:'connecting', data:null},
    bps: {status:'connecting', data:null},
    historicalBps: {status:'idle', data:null},
    historicalFx: {status:'idle', data:null},
    lkpp: {status:'connecting', data:null},
    esdm: {status:'connecting', data:null},
    eia: {status:'connecting', data:null}
  };

  // CPI is a valid official macro cost driver, but it is not a universal
  // procurement escalator. These rules prevent broad CPI from displacing a
  // more specific driver such as JISDOR, UMP/UMK, ESDM tariff, fuel, principal
  // pricing, or a construction/material index.
  var BPS_CATEGORY_POLICY = {
    'IT Hardware': {material:false, role:'CONTEXT', reason:'Use JISDOR, principal/OEM pricing, semiconductor/component movement, freight and import-cost evidence for material HPS escalation.'},
    'Software/SaaS': {material:false, role:'CONTEXT', reason:'Use principal list-price/subscription uplift and contract currency. Broad CPI is contextual only.'},
    'Manpower/BPO': {material:false, role:'CONTEXT', reason:'Use current UMP/UMK/UMSK, statutory benefits and role-specific salary evidence. CPI must not replace the wage decree.'},
    'Construction': {material:false, role:'CONTEXT', reason:'Use construction/material indices, regional labor and project-specific inputs. General CPI is not a construction price index.'},
    'Data Center': {material:false, role:'CONTEXT', reason:'Use ESDM electricity/tariff-adjustment parameters, FX, imported equipment and labor. CPI may be an input to the tariff mechanism but should not be applied again to the whole HPS.'},
    'Logistics': {material:false, role:'CONTEXT', reason:'Use fuel, route, toll, labor and freight evidence. General CPI is a sanity check only.'},
    'Payment Terminal Rental': {material:false, role:'CONTEXT', reason:'Use FX, OEM terminal price, financing cost, replacement parts, connectivity, logistics and field-service evidence.'},
    'Other': {material:'conditional', role:'COST_DRIVER', reason:'BPS CPI may be used as a general-price proxy only when no more specific category index exists, the CPI base period is comparable, and a reviewer explicitly accepts the proxy.'}
  };

  function cacheGet(key) {
    try { return JSON.parse(localStorage.getItem(PREFIX + key) || 'null'); } catch (e) { return null; }
  }
  function cacheSet(key, data) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify({savedAt:new Date().toISOString(), data:data})); } catch (e) {}
  }
  function fetchJson(key, url, callback) {
    state[key].status = 'connecting';
    return fetch(url, {headers:{'Accept':'application/json'}}).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      if (!data || data.error) throw new Error(data && data.error || 'invalid response');
      state[key] = {status:'online', data:data}; cacheSet(key, data); return data;
    }).catch(function () {
      var cached = cacheGet(key);
      if (cached && cached.data) state[key] = {status:'cached', data:cached.data};
      else state[key] = {status:'offline', data:null};
      return state[key].data;
    }).then(function (data) { if (callback) callback(data); return data; });
  }

  function initFx(cb) {
    return Promise.all([
      fetchJson('fx','/api/fx-usd-idr'),
      fetchJson('kursPajak','/api/kurs-pajak'),
      fetchJson('biRate','/api/bi-rate')
    ]).then(function () { if (cb) cb(); });
  }
  function initWb(cb) { return fetchJson('wb','/api/wb-indicator').then(function(){ if(cb)cb(); }); }
  function initBps(cb) {
    return fetchJson('bps','/api/bps-inflation').then(function(data){
      renderBpsTicker();
      renderHistoricalStatus();
      if(cb)cb(data);
    });
  }
  function initMacro(cb) {
    return Promise.all([initWb(), initBps()]).then(function(){
      return syncHistoricalFromUi();
    }).then(function(){ if(cb)cb(); });
  }
  function initLkpp(cb) {
    return Promise.all([
      fetchJson('lkpp','/api/lkpp-status'),
      fetchJson('esdm','/api/esdm-electricity'),
      fetchJson('eia','/api/eia-brent')
    ]).then(function(){ if(cb)cb(); });
  }
  function get(key) { return state[key].data; }
  function status(key) { return state[key].status; }

  function bpsEffectiveStatus() {
    var data = get('bps');
    if (data && data.sourceState === 'STALE') return 'stale';
    if (data && data.sourceState === 'UNAVAILABLE') return 'offline';
    return status('bps');
  }
  function categoryPolicy(category) {
    return BPS_CATEGORY_POLICY[category] || BPS_CATEGORY_POLICY.Other;
  }

  function ensureBpsTicker() {
    var strip = document.querySelector('.macro-strip');
    if (!strip) return null;
    var existing = document.getElementById('tickerBps');
    if (existing) return existing;
    var wrap = document.createElement('div');
    wrap.className = 'flex items-center gap-1.5 whitespace-nowrap';
    wrap.innerHTML = '<span class="text-slate-400 font-medium">BPS Inflation:</span>' +
      '<span class="font-mono-num text-cyan-400 font-semibold" id="tickerBps">—</span>';
    strip.appendChild(wrap);
    return document.getElementById('tickerBps');
  }
  function renderBpsTicker() {
    var ticker = ensureBpsTicker();
    if (!ticker) return;
    var bps = get('bps');
    var st = bpsEffectiveStatus();
    if (bps && typeof bps.headlineInflationYoY === 'number') {
      ticker.textContent = Number(bps.headlineInflationYoY).toLocaleString('id-ID', {minimumFractionDigits:2, maximumFractionDigits:2}) + '% YoY' +
        (bps.referencePeriod ? ' · ' + bps.referencePeriod : '') +
        (st === 'stale' ? ' · STALE' : '');
      ticker.title = (bps.source || 'BPS') + (bps.releaseDate ? ' · release ' + bps.releaseDate : '');
    } else {
      ticker.textContent = st === 'connecting' ? 'CONNECTING' : st === 'cached' ? 'CACHED' : st === 'stale' ? 'STALE' : 'UNAVAILABLE';
    }
  }

  function installHistoricalUi() {
    if (document.getElementById('historicalPurchaseDate')) return;
    var histFx = document.getElementById('historicalFxRate');
    if (!histFx || !histFx.parentElement || !histFx.parentElement.parentElement) return;
    var grid = histFx.parentElement.parentElement;
    var panel = document.createElement('div');
    panel.className = 'sm:col-span-2 p-3 rounded-lg border border-slate-800 bg-slate-950/50';
    panel.innerHTML =
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
        '<div><label class="block text-slate-400 mb-1 font-medium">Historical Purchase / Contract Date</label>' +
        '<input type="date" id="historicalPurchaseDate" class="field font-mono-num" /></div>' +
        '<div><label class="block text-slate-400 mb-1 font-medium">Automatic Historical Intelligence</label>' +
        '<div id="historicalIntelligenceStatus" class="min-h-[38px] px-3 py-2 rounded border border-slate-800 text-slate-400 bg-slate-900">Enter historical date to retrieve BI JISDOR and BPS CPI baseline.</div></div>' +
      '</div>' +
      '<label class="mt-3 flex items-start gap-2 text-[11px] text-slate-400">' +
        '<input type="checkbox" id="allowBpsCpiProxy" class="mt-0.5" />' +
        '<span><strong class="text-slate-300">Allow BPS CPI proxy for Model A</strong> — only for Category “Other”, only with comparable 2022=100 CPI periods, and only when no more specific index exists.</span>' +
      '</label>' +
      '<div id="historicalPolicyNote" class="mt-2 text-[10px] text-slate-500"></div>';
    grid.insertBefore(panel, grid.children[2] || null);

    var dateEl = document.getElementById('historicalPurchaseDate');
    var proxyEl = document.getElementById('allowBpsCpiProxy');
    try {
      dateEl.value = localStorage.getItem(HISTORY_DATE_KEY) || '';
      proxyEl.checked = localStorage.getItem(CPI_PROXY_KEY) === 'true';
    } catch (e) {}

    dateEl.addEventListener('change', function(){
      try { localStorage.setItem(HISTORY_DATE_KEY, dateEl.value || ''); } catch (e) {}
      syncHistorical(dateEl.value);
    });
    proxyEl.addEventListener('change', function(){
      try { localStorage.setItem(CPI_PROXY_KEY, proxyEl.checked ? 'true' : 'false'); } catch (e) {}
      renderHistoricalStatus();
      triggerRecalculate();
    });
    var cat = document.getElementById('engineCategory');
    if (cat) cat.addEventListener('change', function(){ renderHistoricalStatus(); });
    renderHistoricalStatus();
    if (dateEl.value) setTimeout(function(){ syncHistorical(dateEl.value); }, 300);
  }

  function dateMinusDays(dateString, days) {
    var d = new Date(dateString + 'T00:00:00Z');
    if (!isFinite(d.getTime())) return '';
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0,10);
  }

  function fetchHistoricalFx(dateString) {
    if (!dateString) return Promise.resolve(null);
    state.historicalFx = {status:'connecting', data:null};
    var start = dateMinusDays(dateString, 7);
    var url = '/api/bi-kurs?series=jisdor&mode=range&currency=USD&start=' + encodeURIComponent(start) + '&end=' + encodeURIComponent(dateString);
    return fetch(url, {headers:{'Accept':'application/json'}}).then(function(r){
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function(data){
      var rows = (data && data.records) || [];
      rows = rows.filter(function(x){ return x && typeof x.rate === 'number' && x.date && x.date <= dateString; });
      rows.sort(function(a,b){ return String(b.date).localeCompare(String(a.date)); });
      if (!rows.length) throw new Error('no_historical_jisdor');
      var result = {
        rate:rows[0].rate,
        date:rows[0].date,
        source:'Bank Indonesia JISDOR — wsKursBI historical range',
        sourceMode:'OFFICIAL_BI_WSKURSBI_HISTORICAL',
        sourceState:'LIVE',
        evidenceRole:'OFFICIAL_FX_HISTORICAL_BASELINE',
        retrievedAt:new Date().toISOString()
      };
      state.historicalFx = {status:'online', data:result};
      cacheSet('historicalFx_' + dateString, result);
      var input = document.getElementById('historicalFxRate');
      if (input) {
        input.value = Math.round(result.rate);
        input.dispatchEvent(new Event('input', {bubbles:true}));
        input.dispatchEvent(new Event('change', {bubbles:true}));
      }
      return result;
    }).catch(function(){
      var cached = cacheGet('historicalFx_' + dateString);
      if (cached && cached.data) state.historicalFx = {status:'cached', data:cached.data};
      else state.historicalFx = {status:'offline', data:null};
      return state.historicalFx.data;
    });
  }

  function fetchHistoricalBps(dateString) {
    if (!dateString) return Promise.resolve(null);
    state.historicalBps = {status:'connecting', data:null};
    return fetch('/api/bps-inflation-history?date=' + encodeURIComponent(dateString), {headers:{'Accept':'application/json'}}).then(function(r){
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function(data){
      if (!data || data.error || typeof data.cpi !== 'number') throw new Error('invalid historical BPS response');
      state.historicalBps = {status:'online', data:data};
      cacheSet('historicalBps_' + dateString, data);
      return data;
    }).catch(function(){
      var cached = cacheGet('historicalBps_' + dateString);
      if (cached && cached.data) state.historicalBps = {status:'cached', data:cached.data};
      else state.historicalBps = {status:'offline', data:null};
      return state.historicalBps.data;
    });
  }

  function syncHistorical(dateString) {
    if (!dateString) {
      state.historicalFx = {status:'idle', data:null};
      state.historicalBps = {status:'idle', data:null};
      renderHistoricalStatus();
      return Promise.resolve();
    }
    renderHistoricalStatus();
    return Promise.all([fetchHistoricalFx(dateString), fetchHistoricalBps(dateString)]).then(function(){
      renderHistoricalStatus();
      triggerRecalculate();
    });
  }
  function syncHistoricalFromUi() {
    var dateEl = document.getElementById('historicalPurchaseDate');
    return dateEl && dateEl.value ? syncHistorical(dateEl.value) : Promise.resolve();
  }

  function currentCpiComparable() {
    var bps = get('bps');
    if (!bps || typeof bps.cpi !== 'number') return false;
    var m = String(bps.referencePeriod || '').match(/(\d{4})/);
    return !!m && Number(m[1]) >= 2024;
  }
  function cpiDeltaPct() {
    var hist = state.historicalBps.data;
    var current = get('bps');
    if (!hist || !current || typeof hist.cpi !== 'number' || typeof current.cpi !== 'number') return null;
    if (!hist.cpiRatioMaterialUseAllowed || !currentCpiComparable() || hist.cpi === 0) return null;
    return ((current.cpi / hist.cpi) - 1) * 100;
  }
  function cpiProxyAccepted() {
    var el = document.getElementById('allowBpsCpiProxy');
    var category = document.getElementById('engineCategory');
    return !!(el && el.checked && category && category.value === 'Other');
  }

  function renderHistoricalStatus() {
    var box = document.getElementById('historicalIntelligenceStatus');
    var note = document.getElementById('historicalPolicyNote');
    var proxy = document.getElementById('allowBpsCpiProxy');
    var category = document.getElementById('engineCategory');
    if (!box) return;

    var fx = state.historicalFx.data;
    var hb = state.historicalBps.data;
    var parts = [];
    if (state.historicalFx.status === 'connecting') parts.push('BI historical FX: connecting');
    else if (fx) parts.push('BI JISDOR ' + Number(fx.rate).toLocaleString('id-ID') + ' (' + fx.date + ')');
    else if (state.historicalFx.status === 'offline') parts.push('BI historical FX: unavailable');

    if (state.historicalBps.status === 'connecting') parts.push('BPS historical CPI: connecting');
    else if (hb) parts.push('BPS CPI ' + Number(hb.cpi).toLocaleString('id-ID', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' (' + (hb.referencePeriod || hb.requestedReferencePeriod || '') + ')');
    else if (state.historicalBps.status === 'offline') parts.push('BPS historical CPI: unavailable');

    var delta = cpiDeltaPct();
    if (delta != null) parts.push('CPI change to current: ' + (delta >= 0 ? '+' : '') + delta.toFixed(2) + '%');
    box.textContent = parts.length ? parts.join(' · ') : 'Enter historical date to retrieve BI JISDOR and BPS CPI baseline.';

    var isOther = category && category.value === 'Other';
    var comparable = hb && hb.cpiRatioMaterialUseAllowed && currentCpiComparable();
    if (proxy) proxy.disabled = !(isOther && comparable);
    if (note) {
      var policy = categoryPolicy(category ? category.value : 'Other');
      note.textContent = isOther
        ? (comparable ? 'CPI proxy is eligible but remains opt-in. ' : 'CPI proxy cannot be used materially because the historical/current CPI base period is not confirmed comparable. ') + policy.reason
        : 'BPS CPI is context only for this category. ' + policy.reason;
    }
  }

  function triggerRecalculate() {
    var hist = document.getElementById('historicalFxRate');
    if (hist) hist.dispatchEvent(new Event('input', {bubbles:true}));
  }

  // Patch CalcCore sources so current BPS data and automatically retrieved
  // historical baselines are represented in the audit trail.
  function patchBpsSource() {
    if (!window.CalcCore || !window.CalcCore.generateSources || window.CalcCore.__bpsPatched) return;
    var original = window.CalcCore.generateSources;
    window.CalcCore.generateSources = function(input, researched) {
      var sources = original(input, researched);
      var bps = state.bps && state.bps.data;
      var policy = categoryPolicy(input && input.category);
      if (bps && typeof bps.headlineInflationYoY === 'number') {
        var effective = bpsEffectiveStatus();
        var sourceStatus = effective === 'cached' ? 'CACHED' : effective === 'stale' ? 'STALE' : effective === 'online' ? 'LIVE' : 'UNAVAILABLE';
        sources = sources.map(function(src) {
          if (!/BPS WebAPI/i.test(String(src && src.name || ''))) return src;
          return Object.assign({}, src, {
            sourceKey:'BPS',
            name:'BPS — National CPI / Inflation',
            status:sourceStatus,
            value:bps.headlineInflationYoY,
            unit:'percent YoY',
            publishedDate:bps.releaseDate || null,
            retrievedAt:bps.retrievedAt || new Date().toISOString(),
            freshness:sourceStatus === 'LIVE' ? 'Fresh' : sourceStatus === 'CACHED' ? 'Aging' : 'Stale',
            trustScore:100,
            sourceMode:bps.sourceMode || null,
            sourceUrl:bps.sourceUrl || null,
            evidenceRole:bps.evidenceRole || 'OFFICIAL_DOMESTIC_INFLATION_PRIMARY',
            materialUseAllowed:policy.material,
            categoryPolicy:policy,
            note:'Official BPS national inflation: ' + bps.headlineInflationYoY + '% y-on-y' +
              (bps.referencePeriod ? ' (' + bps.referencePeriod + ')' : '') +
              (bps.cpi != null ? '; IHK ' + bps.cpi : '') +
              (bps.inflationMoM != null ? '; m-to-m ' + bps.inflationMoM + '%' : '') +
              (bps.inflationYTD != null ? '; y-to-d ' + bps.inflationYTD + '%' : '') +
              '. Category policy: ' + policy.reason
          });
        });
      }

      var hb = state.historicalBps.data;
      if (hb && typeof hb.cpi === 'number') {
        sources.push({
          sourceKey:'BPS', name:'BPS — Historical National CPI Baseline',
          status:state.historicalBps.status === 'cached' ? 'CACHED' : 'LIVE',
          value:hb.cpi, unit:'CPI index', publishedDate:hb.releaseDate || null,
          retrievedAt:hb.retrievedAt || new Date().toISOString(), freshness:'Fresh', trustScore:100,
          sourceMode:hb.sourceMode || null, sourceUrl:hb.sourceUrl || null,
          evidenceRole:'OFFICIAL_DOMESTIC_CPI_HISTORICAL_BASELINE',
          materialUseAllowed:cpiProxyAccepted() && hb.cpiRatioMaterialUseAllowed === true,
          note:'Historical CPI baseline aligned to ' + (hb.referencePeriod || hb.requestedReferencePeriod || 'selected historical month') + '. CPI ratio is material only when explicitly accepted for Category Other.'
        });
      }

      var hf = state.historicalFx.data;
      if (hf && typeof hf.rate === 'number') {
        sources.push({
          sourceKey:'BI_JISDOR', name:'Bank Indonesia — Historical USD/IDR JISDOR Baseline',
          status:state.historicalFx.status === 'cached' ? 'CACHED' : 'LIVE',
          value:hf.rate, unit:'IDR per USD', publishedDate:hf.date || null,
          retrievedAt:hf.retrievedAt || new Date().toISOString(), freshness:'Fresh', trustScore:100,
          sourceMode:hf.sourceMode, evidenceRole:hf.evidenceRole,
          materialUseAllowed:true,
          note:'Automatically retrieved historical JISDOR on or immediately before the selected historical purchase date.'
        });
      }
      return sources;
    };
    window.CalcCore.__bpsPatched = true;
  }

  function patchHistoricalCostDrivers() {
    if (!window.CalcCore || !window.CalcCore.generateCostDrivers || window.CalcCore.__historicalIntelPatched) return;
    var original = window.CalcCore.generateCostDrivers;
    window.CalcCore.generateCostDrivers = function(req) {
      var drivers = original(req);
      var hf = state.historicalFx.data;
      if (hf && typeof hf.rate === 'number') {
        drivers = drivers.map(function(d){
          if (d && d.name === 'USD/IDR FX Rate' && d.verified) {
            return Object.assign({}, d, { source:(d.source || 'Bank Indonesia JISDOR') + '; historical baseline automatically sourced from BI wsKursBI dated ' + hf.date });
          }
          return d;
        });
      }

      var delta = cpiDeltaPct();
      if (req && req.input && req.input.category === 'Other' && cpiProxyAccepted() && delta != null) {
        var hb = state.historicalBps.data;
        var cb = get('bps');
        drivers = drivers.map(function(d){
          if (!d || d.name !== 'General Price Index (Category-specific)') return d;
          return Object.assign({}, d, {
            delta:+delta.toFixed(2), status:'LIVE', verified:true,
            source:'BPS national CPI ratio: ' + (hb.referencePeriod || hb.requestedReferencePeriod) + ' CPI ' + hb.cpi + ' → ' + (cb.referencePeriod || 'current') + ' CPI ' + cb.cpi + '; explicitly accepted as general-price proxy.'
          });
        });
      }
      return drivers;
    };
    window.CalcCore.__historicalIntelPatched = true;
  }

  patchBpsSource();
  patchHistoricalCostDrivers();

  function onReady() {
    renderBpsTicker();
    installHistoricalUi();
    renderHistoricalStatus();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();

  window.HPSProviders = {
    state:state,
    initAll:function(){return Promise.all([initFx(),initWb(),initBps(),initLkpp(),syncHistoricalFromUi()]);},
    get:get,
    status:status
  };
  window.HPSFx = {
    init:initFx,
    getRate:function(){return get('fx');}, getStatus:function(){return status('fx');},
    getKursPajak:function(){return get('kursPajak');}, getKursPajakStatus:function(){return status('kursPajak');},
    getBiRate:function(){return get('biRate');}, getBiRateStatus:function(){return status('biRate');},
    getHistoricalRate:function(){return get('historicalFx');}
  };
  // Existing app calls HPSWB.init during every sync; initMacro refreshes World
  // Bank, current BPS, and date-aligned historical intelligence.
  window.HPSWB = { init:initMacro, getValue:function(){return get('wb');}, getStatus:function(){return status('wb');} };
  window.HPSBPS = {
    init:initBps,
    getInflation:function(){return get('bps');},
    getHistoricalInflation:function(){return get('historicalBps');},
    syncHistorical:syncHistorical,
    getStatus:bpsEffectiveStatus,
    getCategoryPolicy:categoryPolicy,
    CATEGORY_POLICY:BPS_CATEGORY_POLICY,
    renderTicker:renderBpsTicker
  };
  window.HPSLkpp = {
    init:initLkpp,
    getData:function(){return get('lkpp');}, getStatus:function(){return status('lkpp');},
    getEsdmData:function(){return get('esdm');}, getEsdmStatus:function(){return status('esdm');},
    getEiaData:function(){return get('eia');}, getEiaStatus:function(){return status('eia');}
  };
})();
