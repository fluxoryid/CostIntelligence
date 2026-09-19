const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(name){ return fs.readFileSync(path.join(__dirname,'..',name),'utf8'); }

test('browser config contains only a publishable Supabase credential', () => {
  const cfg = read('config.js');
  assert.ok(!/SUPABASE_(SERVICE[_-]?ROLE|SECRET|ADMIN|PRIVATE)[A-Z0-9_]*/i.test(cfg));
  assert.match(cfg,/SUPABASE_PUBLISHABLE_KEY:\s*'(?:|sb_publishable_[A-Za-z0-9_-]+)'/);
  assert.match(cfg,/ALLOW_SELF_SIGNUP:\s*false/);
});

test('worker and config agree on Production 2.1 build id', () => {
  const cfg = read('config.js');
  const worker = read('worker.js');
  const id = 'production-2.1-20260919-v6';
  assert.ok(cfg.includes(id));
  assert.ok(worker.includes(id));
  assert.ok(worker.includes("releaseChannel: 'production'"));
});

test('Supabase schema enables RLS and immutable versions', () => {
  const sql = read('SUPABASE-SETUP.sql');
  for (const table of ['hps_requests','hps_request_versions','hps_reviews','hps_documents','hps_component_evidence','hps_audit_log','hps_learning_outcomes']) {
    assert.ok(sql.includes(`alter table public.${table} enable row level security`),table);
  }
  assert.ok(sql.includes('hps_request_versions_immutable'));
  assert.ok(sql.includes('hps_transition_request'));
  assert.match(sql,/values\s*\(\s*'hps-evidence'\s*,\s*'hps-evidence'\s*,\s*false/i);
});

test('production extensions are all loaded', () => {
  const cfg = read('config.js');
  for (const f of ['governance-extensions.js','procurement-ux.js','category-cost-ux.js','evidence-component-ux.js','document-hub.js','advanced-intelligence.js','workflow-rbac.js','learning-negotiation.js','production-health.js','uat-console.js']) {
    assert.ok(cfg.includes(f),f);
  }
});


test('BPS edge fallback is a provenance-bound official cache, never synthetic', () => {
  const bps = read('functions/api/bps-inflation.js');
  assert.ok(bps.includes('VERIFIED_OFFICIAL_RELEASE_LKG'));
  assert.ok(bps.includes("sourceMode: 'VERIFIED_OFFICIAL_BPS_RELEASE_LKG'"));
  assert.ok(bps.includes("sourceState: sourceState"));
  assert.ok(bps.includes("synthetic: false"));
  assert.ok(bps.includes("aiGenerated: false"));
  assert.ok(bps.includes("validThrough: '2026-09-30'"));
});


test('application shell is credential-gated before HPS access', () => {
  const html = read('index.html');
  const css = read('style.css');
  const app = read('app.js');
  const auth = read('auth-sync.js');
  assert.ok(html.includes('id="authAccessGate"'));
  assert.ok(html.includes('auth-locked'));
  assert.ok(css.includes('body.auth-locked > main'));
  assert.ok(app.includes("showAccessGate('"));
  assert.ok(app.includes("user.active !== false"));
  assert.ok(app.includes("user.role !== 'No Tenant Access'"));
  assert.ok(auth.includes('c.auth.signOut()'));
});

test('parameter dates, principal discount and Reset HPS are wired into calculation UI', () => {
  const html = read('index.html');
  const app = read('app.js');
  assert.ok(html.includes('id="tickerBiRateDate"'));
  assert.ok(html.includes('id="tickerFxDate"'));
  assert.ok(html.includes('id="tickerKursPajakDate"'));
  assert.ok(html.includes('id="tickerBpsDate"'));
  assert.ok(html.includes('id="principalDiscountMode"'));
  assert.ok(html.includes('id="principalDiscountValue"'));
  assert.ok(html.includes('id="btnResetHps"'));
  assert.ok(app.includes('principalDiscountMode'));
  assert.ok(app.includes('primaryDiscountBase'));
  assert.ok(app.includes('hpsResetMode = true'));
  assert.ok(app.includes("req.hps.recommended = 0"));
});

test('Bahasa Indonesia localization layer is present and procurement terminology is governed', () => {
  const html = read('index.html');
  const lang = read('bahasa-id.js');
  assert.ok(html.includes('bahasa-id.js'));
  for (const phrase of ['Bukti Pendukung','Tata Kelola Sumber','Faktor Pendorong Biaya','Kepala Pengadaan/Admin']) {
    assert.ok(lang.includes(phrase), phrase);
  }
});

test('INAPROC transaction intelligence requires server secret and valid tenant session', () => {
  const worker = read('worker.js');
  const api = read('functions/api/inaproc-transactions.js');
  const ui = read('inaproc-intelligence.js');
  const source = read('source-engine.js');
  assert.ok(worker.includes('/api/inaproc-transactions'));
  assert.ok(api.includes('INAPROC_API_TOKEN'));
  assert.ok(api.includes('validateAppUser'));
  assert.ok(api.includes('/auth/v1/user'));
  assert.ok(api.includes('hps_tenant_members'));
  assert.ok(api.includes('materialUseAllowed: false'));
  assert.ok(ui.includes("UNVERIFIED"));
  assert.ok(ui.includes('Gunakan sebagai Pembanding'));
  assert.ok(source.includes('INAPROC_TRANSACTION'));
});

test('Production 2.1 keeps INAPROC UI disabled until authenticated token validation is explicitly enabled', () => {
  const cfg = read('config.js');
  const worker = read('worker.js');
  assert.ok(cfg.includes('INAPROC_TRANSACTION_ENABLED: false'));
  assert.ok(cfg.includes("files.splice(3, 0, 'inaproc-intelligence.js')"));
  assert.ok(worker.includes('inaprocTransactionIntelligence: false'));
  assert.ok(worker.includes('inaprocTransactionAdapterStaged: true'));
  assert.ok(!worker.includes('/api/lkpp-open-data'));
});

test('manual INAPROC benchmark value without provenance is rejected', () => {
  const app = read('app.js');
  assert.ok(app.includes('hasRequiredInaprocProvenance'));
  assert.ok(app.includes("meta.priceBasis !== 'UNVERIFIED'"));
  assert.ok(app.includes("'REJECTED'"));
});


test('audit log is server-managed and browser code cannot insert audit rows directly', () => {
  const app = read('app.js');
  const cloud = read('cloud-sync.js');
  const sql = read('SUPABASE-SETUP.sql');
  assert.ok(!app.includes('HPSCloud.pushAuditLog({'));
  assert.ok(!cloud.includes("from('hps_audit_log').insert"));
  assert.ok(sql.includes('drop policy if exists hps_audit_insert on public.hps_audit_log;'));
  assert.ok(sql.includes('grant select on table public.hps_audit_log to authenticated;'));
  assert.ok(!sql.includes('grant select,insert on table public.hps_audit_log to authenticated;'));
});


test('Production UAT Console is build-scoped, append-only and tenant governed', () => {
  const cfg = read('config.js');
  const worker = read('worker.js');
  const cloud = read('cloud-sync.js');
  const ui = read('uat-console.js');
  const sql = read('SUPABASE-SETUP.sql');
  assert.ok(cfg.includes("'uat-console.js'"));
  assert.ok(worker.includes('uatConsole: true'));
  assert.ok(cloud.includes("from('hps_uat_runs')"));
  assert.ok(cloud.includes("from('hps_uat_attempts')"));
  assert.ok(ui.includes("UAT-24"));
  assert.ok(ui.includes("latest result for every case is PASS"));
  assert.ok(sql.includes('create table if not exists public.hps_uat_runs'));
  assert.ok(sql.includes('create table if not exists public.hps_uat_attempts'));
  assert.ok(sql.includes('hps_uat_attempts_immutable'));
  assert.ok(sql.includes('All 24 latest UAT results must be PASS before sign-off'));
  assert.ok(sql.includes('alter table public.hps_uat_runs enable row level security'));
  assert.ok(sql.includes('alter table public.hps_uat_attempts enable row level security'));
  assert.ok(sql.includes("grant update(status,signoff_note) on table public.hps_uat_runs to authenticated"));
});


test('password recovery flow is wired to production Supabase Auth', () => {
  const html = read('index.html');
  const auth = read('auth-sync.js');
  const recovery = read('password-recovery.js');
  const worker = read('worker.js');
  assert.ok(html.includes('id="gateForgotPassword"'));
  assert.ok(html.includes('id="passwordResetDialog"'));
  assert.ok(html.includes('id="passwordRecoveryDialog"'));
  assert.ok(html.includes('password-recovery.js'));
  assert.ok(auth.includes('resetPasswordForEmail'));
  assert.ok(auth.includes('updateUser({password:password})'));
  assert.ok(auth.includes("event==='PASSWORD_RECOVERY'") || recovery.includes("event==='PASSWORD_RECOVERY'"));
  assert.ok(recovery.includes('window.location.origin') || auth.includes('window.location.origin'));
  assert.ok(worker.includes('passwordRecoveryFlow: true'));
});


test('dedicated password reset page is wired for mobile-safe navigation', () => {
  const html = read('index.html');
  const resetHtml = read('password-reset.html');
  const resetJs = read('password-reset-page.js');
  const auth = read('auth-sync.js');
  const worker = read('worker.js');
  assert.ok(html.includes('href="password-reset.html"'));
  assert.ok(resetHtml.includes('id="sendReset"'));
  assert.ok(resetHtml.includes('id="savePassword"'));
  assert.ok(resetHtml.includes('password-reset-page.js'));
  assert.ok(resetJs.includes("event==='PASSWORD_RECOVERY'"));
  assert.ok(auth.includes("password-reset.html"));
  assert.ok(worker.includes('dedicatedPasswordResetPage: true'));
});
