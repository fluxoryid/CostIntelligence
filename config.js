/* config.js — deployment configuration.
 * Publishable Supabase keys are browser-safe by design; authorization must
 * still be enforced by RLS. Leave values blank to run in local-only mode.
 */
window.HPS_CONFIG = {
  APP_NAME: 'HPS Intelligence',
  APP_VERSION: 'Production Fresh 1.0',
  TENANT_ID: 'default-org',
  CALCULATION_MODE: 'HYBRID_STRICT',
  SUPABASE_URL: '',
  SUPABASE_PUBLISHABLE_KEY: ''
};
