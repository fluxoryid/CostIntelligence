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

test('worker and config agree on pre-release build id', () => {
  const cfg = read('config.js');
  const worker = read('worker.js');
  const id = 'pre-release-hardening-20260918';
  assert.ok(cfg.includes(id));
  assert.ok(worker.includes(id));
  assert.ok(worker.includes("releaseChannel: 'pre-release-testing'"));
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
  for (const f of ['governance-extensions.js','procurement-ux.js','category-cost-ux.js','lkpp-open-data.js','inaproc-intelligence.js','evidence-component-ux.js','document-hub.js','advanced-intelligence.js','workflow-rbac.js','learning-negotiation.js','production-health.js']) {
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

test('LKPP Open Data is context-only and has official JSON fallbacks', () => {
  const worker = read('worker.js');
  const api = read('functions/api/lkpp-open-data.js');
  const ui = read('lkpp-open-data.js');
  const source = read('source-engine.js');
  assert.ok(worker.includes('/api/lkpp-open-data'));
  assert.ok(api.includes('https://data.lkpp.go.id/api/3/action'));
  assert.ok(api.includes('jumlah-produk-tayang-pada-katalog-elektronik.json'));
  assert.ok(api.includes('nilai-perencanaan-dan-realisasi-pengadaan-barang-jasa-2025.json'));
  assert.ok(api.includes('materialUseAllowed: false'));
  assert.ok(api.includes('canSetUnitPrice: false'));
  assert.ok(ui.includes('Nilai agregat tidak pernah diperlakukan sebagai harga unit HPS'));
  assert.ok(source.includes('LKPP_OPEN_DATA'));
  assert.ok(source.includes("role: 'CONTEXT'"));
});

test('manual INAPROC benchmark value without provenance is rejected', () => {
  const app = read('app.js');
  assert.ok(app.includes('hasRequiredInaprocProvenance'));
  assert.ok(app.includes("meta.priceBasis !== 'UNVERIFIED'"));
  assert.ok(app.includes("'REJECTED'"));
});
