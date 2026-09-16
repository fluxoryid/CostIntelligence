/* config.js — deployment configuration.
 * Publishable Supabase keys are browser-safe by design; authorization must
 * still be enforced by RLS. Leave values blank to run in local-only mode.
 */
window.HPS_CONFIG = {
  APP_NAME: 'HPS Intelligence',
  APP_VERSION: 'Production Fresh 1.4',
  TENANT_ID: 'default-org',
  CALCULATION_MODE: 'HYBRID_STRICT',
  SUPABASE_URL: '',
  SUPABASE_PUBLISHABLE_KEY: ''
};

/* UX extension loader.
 * Extensions are loaded sequentially because category-cost forms depend on
 * procurement taxonomy/subcategory, and component evidence mapping depends on
 * the rendered category-cost structure. Numerical HPS governance remains in
 * the deterministic engine; these extensions constrain taxonomy and collect
 * explicit user/reviewer evidence.
 */
(function () {
  var files = ['procurement-ux.js', 'category-cost-ux.js', 'evidence-component-ux.js'];
  function loadNext(index) {
    if (index >= files.length) return;
    var s = document.createElement('script');
    s.src = files[index];
    s.async = false;
    s.onload = function () { loadNext(index + 1); };
    document.head.appendChild(s);
  }
  loadNext(0);
})();
