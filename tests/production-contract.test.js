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

test('worker and config agree on final build id', () => {
  const cfg = read('config.js');
  const worker = read('worker.js');
  const id = 'production-complete-20260916-v14';
  assert.ok(cfg.includes(id));
  assert.ok(worker.includes(id));
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
  for (const f of ['governance-extensions.js','procurement-ux.js','category-cost-ux.js','evidence-component-ux.js','document-hub.js','advanced-intelligence.js','workflow-rbac.js','learning-negotiation.js','production-health.js']) {
    assert.ok(cfg.includes(f),f);
  }
});
