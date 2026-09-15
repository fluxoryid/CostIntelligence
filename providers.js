/* providers.js — live provider adapters with last-known-good caching.
 * The adapters never fabricate values. A failed upstream call returns
 * cached data when available; otherwise the source remains unavailable.
 */
(function () {
  'use strict';
  var PREFIX = 'hps_provider_v1_';
  var state = {
    fx: {status:'connecting', data:null},
    kursPajak: {status:'connecting', data:null},
    biRate: {status:'connecting', data:null},
    wb: {status:'connecting', data:null},
    bps: {status:'connecting', data:null},
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
    'Other': {material:'conditional', role:'COST_DRIVER', reason:'BPS CPI may be used as a general-price proxy only when no more specific category index exists, the historical baseline period is aligned, and a reviewer explicitly accepts the proxy.'}
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
      if(cb)cb(data);
    });
  }
  function initMacro(cb) {
    return Promise.all([initWb(), initBps()]).then(function(){ if(cb)cb(); });
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

  // Patch the existing CalcCore source list so BPS becomes official evidence after
  // /api/bps-inflation succeeds. BPS CPI is never treated as a product-price
  // benchmark; category policy determines whether it is contextual or can be a
  // conditional general-price driver.
  function patchBpsSource() {
    if (!window.CalcCore || !window.CalcCore.generateSources || window.CalcCore.__bpsPatched) return;
    var original = window.CalcCore.generateSources;
    window.CalcCore.generateSources = function(input, researched) {
      var sources = original(input, researched);
      var bps = state.bps && state.bps.data;
      if (!bps || typeof bps.headlineInflationYoY !== 'number') return sources;
      var policy = categoryPolicy(input && input.category);
      var effective = bpsEffectiveStatus();
      var sourceStatus = effective === 'cached' ? 'CACHED' : effective === 'stale' ? 'STALE' : effective === 'online' ? 'LIVE' : 'UNAVAILABLE';
      return sources.map(function(src) {
        if (!/BPS WebAPI/i.test(String(src && src.name || ''))) return src;
        return Object.assign({}, src, {
          sourceKey: 'BPS',
          name: 'BPS — National CPI / Inflation',
          status: sourceStatus,
          value: bps.headlineInflationYoY,
          unit: 'percent YoY',
          publishedDate: bps.releaseDate || null,
          retrievedAt: bps.retrievedAt || new Date().toISOString(),
          freshness: sourceStatus === 'LIVE' ? 'Fresh' : sourceStatus === 'CACHED' ? 'Aging' : 'Stale',
          trustScore: 100,
          sourceMode: bps.sourceMode || null,
          sourceUrl: bps.sourceUrl || null,
          evidenceRole: bps.evidenceRole || 'OFFICIAL_DOMESTIC_INFLATION_PRIMARY',
          materialUseAllowed: policy.material,
          categoryPolicy: policy,
          note: 'Official BPS national inflation: ' + bps.headlineInflationYoY + '% y-on-y' +
            (bps.referencePeriod ? ' (' + bps.referencePeriod + ')' : '') +
            (bps.cpi != null ? '; IHK ' + bps.cpi : '') +
            (bps.inflationMoM != null ? '; m-to-m ' + bps.inflationMoM + '%' : '') +
            (bps.inflationYTD != null ? '; y-to-d ' + bps.inflationYTD + '%' : '') +
            '. Category policy: ' + policy.reason
        });
      });
    };
    window.CalcCore.__bpsPatched = true;
  }

  patchBpsSource();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderBpsTicker);
  else renderBpsTicker();

  window.HPSProviders = {
    state:state,
    initAll:function(){return Promise.all([initFx(),initWb(),initBps(),initLkpp()]);},
    get:get,
    status:status
  };
  window.HPSFx = {
    init:initFx,
    getRate:function(){return get('fx');}, getStatus:function(){return status('fx');},
    getKursPajak:function(){return get('kursPajak');}, getKursPajakStatus:function(){return status('kursPajak');},
    getBiRate:function(){return get('biRate');}, getBiRateStatus:function(){return status('biRate');}
  };
  // Existing app calls HPSWB.init during every sync; initMacro intentionally
  // refreshes both World Bank and BPS without requiring a separate UI action.
  window.HPSWB = { init:initMacro, getValue:function(){return get('wb');}, getStatus:function(){return status('wb');} };
  window.HPSBPS = {
    init:initBps,
    getInflation:function(){return get('bps');},
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