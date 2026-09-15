// HPS Intelligence — production shell service worker.
// API calls stay network-first; provider adapters manage last-known-good data.
var CACHE_NAME = 'hps-intelligence-production-fresh-v2-aqua-20260914';
var SHELL_FILES = [
  './','./index.html','./style.css','./calc-core.js','./source-engine.js','./providers.js','./config.js',
  './auth-sync.js','./cloud-sync.js','./app.js','./manifest.json','./icon-192.png','./icon-512.png'
];
self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(SHELL_FILES); }));
  self.skipWaiting();
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); })); }));
  self.clients.claim();
});
self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  var url = new URL(event.request.url);
  if (url.pathname.indexOf('/api/') === 0) {
    event.respondWith(fetch(event.request).catch(function(){ return new Response(JSON.stringify({error:'network_unavailable'}), {status:503, headers:{'Content-Type':'application/json'}}); }));
    return;
  }
  event.respondWith(fetch(event.request).then(function (r) {
    var clone=r.clone(); caches.open(CACHE_NAME).then(function(c){c.put(event.request,clone);}); return r;
  }).catch(function () { return caches.match(event.request).then(function(c){return c || caches.match('./index.html');}); }));
});
