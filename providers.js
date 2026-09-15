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
  function initBps(cb) { return fetchJson('bps','/api/bps-inflation').then(function(){ if(cb)cb(); }); }
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

  // Patch the existing CalcCore source list so BPS becomes LIVE evidence after
  // /api/bps-inflation succeeds. This keeps BPS as a COST_DRIVER, never a
  // product-price benchmark.
  function patchBpsSource() {
    if (!window.CalcCore || !window.CalcCore.generateSources || window.CalcCore.__bpsPatched) return;
    var original = window.CalcCore.generateSources;
    window.CalcCore.generateSources = function(input, researched) {
      var sources = original(input, researched);
      var bps = state.bps && state.bps.data;
      if (!bps || typeof bps.headlineInflationYoY !== 'number') return sources;
      return sources.map(function(src) {
        if (!/BPS WebAPI/i.test(String(src && src.name || ''))) return src;
        return Object.assign({}, src, {
          sourceKey: 'BPS',
          status: state.bps.status === 'cached' ? 'CACHED' : 'LIVE',
          value: bps.headlineInflationYoY,
          unit: 'percent',
          publishedDate: bps.releaseDate || null,
          retrievedAt: bps.retrievedAt || new Date().toISOString(),
          freshness: state.bps.status === 'cached' ? 'Aging' : 'Fresh',
          trustScore: 100,
          note: 'Official BPS national inflation: ' + bps.headlineInflationYoY + '% y-on-y' +
            (bps.referencePeriod ? ' (' + bps.referencePeriod + ')' : '') +
            (bps.cpi != null ? '; IHK ' + bps.cpi : '') +
            '. Primary domestic inflation cost-driver; not a direct product price.'
        });
      });
    };
    window.CalcCore.__bpsPatched = true;
  }

  patchBpsSource();

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
  // refreshes both World Bank and BPS without requiring a separate UI change.
  window.HPSWB = { init:initMacro, getValue:function(){return get('wb');}, getStatus:function(){return status('wb');} };
  window.HPSBPS = {
    init:initBps,
    getInflation:function(){return get('bps');},
    getStatus:function(){return status('bps');}
  };
  window.HPSLkpp = {
    init:initLkpp,
    getData:function(){return get('lkpp');}, getStatus:function(){return status('lkpp');},
    getEsdmData:function(){return get('esdm');}, getEsdmStatus:function(){return status('esdm');},
    getEiaData:function(){return get('eia');}, getEiaStatus:function(){return status('eia');}
  };
})();
