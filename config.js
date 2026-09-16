/* config.js — deployment configuration.
 * Publishable Supabase keys are browser-safe by design; authorization must
 * still be enforced by RLS. Leave values blank to run in local-only mode.
 */
window.HPS_CONFIG = {
  APP_NAME: 'HPS Intelligence',
  APP_VERSION: 'Production Fresh 1.3',
  TENANT_ID: 'default-org',
  CALCULATION_MODE: 'HYBRID_STRICT',
  SUPABASE_URL: '',
  SUPABASE_PUBLISHABLE_KEY: ''
};

/* UX extension loader.
 * Extensions are loaded sequentially because the category-cost form depends on
 * the procurement taxonomy/subcategory extension having finished first.
 * Numerical HPS governance remains in the calculation engine; these extensions
 * only constrain taxonomy and collect explicit user-provided cost evidence.
 */
(function () {
  var files = ['procurement-ux.js', 'category-cost-ux.js'];
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
