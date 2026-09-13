// HPS Intelligence — minimal app-shell service worker.
// Caches the static shell so the prototype can be installed and reopened
// without a network connection. It does NOT cache or fabricate any live
// data — this app has no real live data sources in the prototype (see
// Settings > Data Providers).

var CACHE_NAME = 'hps-intelligence-shell-v1';
var SHELL_FILES = [
  './',
  './index.html',
  './style.css',
  './calc-core.js',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL_FILES);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).catch(function () {
        return caches.match('./index.html');
      });
    })
  );
});
