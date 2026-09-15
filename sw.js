// HPS Intelligence — production rollout service worker.
// During active production rollout we intentionally do NOT intercept fetches.
// This prevents an older cached UI/JS bundle from masking a newer Cloudflare deployment.
// The service worker remains installable for PWA compatibility; offline caching can be
// re-enabled after the deployment baseline is stable.
var CACHE_NAME = 'hps-intelligence-production-network-only-20260915-v1';

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// Deliberately no fetch handler.
// All HTML, CSS, JS and API calls go directly to the current Cloudflare deployment.
