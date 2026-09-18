/* config.js — deployment configuration.
 * Only publishable Supabase keys belong in browser code. Authorization is
 * enforced with RLS/RPC. Service-role credentials must never be placed here.
 */
window.HPS_CONFIG = {
  APP_NAME: 'HPS Intelligence',
  APP_VERSION: 'Pra-Rilis 2.1 — Pengujian',
  TENANT_ID: 't1',
  CALCULATION_MODE: 'HYBRID_STRICT',
  ALLOW_SELF_SIGNUP: false,
  EXPECTED_WORKER_BUILD: 'pre-release-hardening-20260918',
  SUPABASE_URL: 'https://bobrilytsufxtqqqgaym.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_K8O1eFVrt2nvl2N3l_q9ow_cRQXFGM2'
};

/* Production extensions are loaded sequentially. They wait for window load
 * before attaching to the UI, so auth-sync/cloud-sync/app.js are available by
 * the time workflow/document/health initialization executes.
 */
(function () {
  var files = [
    'governance-extensions.js',
    'procurement-ux.js',
    'category-cost-ux.js',
    'inaproc-intelligence.js',
    'evidence-component-ux.js',
    'document-hub.js',
    'advanced-intelligence.js',
    'workflow-rbac.js',
    'learning-negotiation.js',
    'production-health.js'
  ];
  function loadNext(index) {
    if (index >= files.length) return;
    var s = document.createElement('script');
    s.src = files[index];
    s.async = false;
    s.onload = function () { loadNext(index + 1); };
    s.onerror = function () { console.error('[HPS] Failed to load extension', files[index]); loadNext(index + 1); };
    document.head.appendChild(s);
  }
  loadNext(0);
})();
