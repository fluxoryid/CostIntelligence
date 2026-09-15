/* config.js — deployment configuration.
 * Publishable Supabase keys are browser-safe by design; authorization must
 * still be enforced by RLS. Leave values blank to run in local-only mode.
 */
window.HPS_CONFIG = {
  APP_NAME: 'HPS Intelligence',
  APP_VERSION: 'Production Fresh 1.1',
  TENANT_ID: 'default-org',
  CALCULATION_MODE: 'HYBRID_STRICT',
  SUPABASE_URL: '',
  SUPABASE_PUBLISHABLE_KEY: ''
};

/* UX extension loader.
 * Loaded separately so procurement taxonomy/flow guidance can evolve without
 * changing the calculation engine. The feature validates Jenis Pengadaan ->
 * Kategori Pengadaan dependencies after app.js restores persisted form data.
 */
(function () {
  var s = document.createElement('script');
  s.src = 'procurement-ux.js';
  s.async = true;
  document.head.appendChild(s);
})();
