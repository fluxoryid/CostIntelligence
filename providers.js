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
  function initLkpp(cb) {
    return Promise.all([
      fetchJson('lkpp','/api/lkpp-status'),
      fetchJson('esdm','/api/esdm-electricity'),
      fetchJson('eia','/api/eia-brent')
    ]).then(function(){ if(cb)cb(); });
  }
  function get(key) { return state[key].data; }
  function status(key) { return state[key].status; }

  window.HPSProviders = { state:state, initAll:function(){return Promise.all([initFx(),initWb(),initLkpp()]);}, get:get, status:status };
  window.HPSFx = {
    init:initFx,
    getRate:function(){return get('fx');}, getStatus:function(){return status('fx');},
    getKursPajak:function(){return get('kursPajak');}, getKursPajakStatus:function(){return status('kursPajak');},
    getBiRate:function(){return get('biRate');}, getBiRateStatus:function(){return status('biRate');}
  };
  window.HPSWB = { init:initWb, getValue:function(){return get('wb');}, getStatus:function(){return status('wb');} };
  window.HPSLkpp = {
    init:initLkpp,
    getData:function(){return get('lkpp');}, getStatus:function(){return status('lkpp');},
    getEsdmData:function(){return get('esdm');}, getEsdmStatus:function(){return status('esdm');},
    getEiaData:function(){return get('eia');}, getEiaStatus:function(){return status('eia');}
  };
})();
