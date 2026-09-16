# HPS Intelligence — Production 2.0 RC Checklist

## Code / build — completed

- [x] Repository contains Worker/static application and official-source adapters.
- [x] Default mode is `HYBRID_STRICT`; synthetic/AI/search-snippet evidence cannot materially set production HPS.
- [x] Evidence-to-component coverage and critical-component approval gate implemented.
- [x] Category-dependent cost structures and evidence requirements implemented.
- [x] Maker-checker workflow/RBAC client plus server-side RLS/RPC implemented.
- [x] Immutable request versions and approved/locked mutation guard implemented.
- [x] Private Document Evidence Hub implemented with SHA-256 duplicate control, version/expiry metadata and safe extraction.
- [x] BI JISDOR/current and historical FX integration implemented without generic third-party substitution.
- [x] BI non-USD reference normalization implemented for supported currencies.
- [x] Kemenkeu Kurs Pajak remains distinct from commercial FX and is used for customs/tax scenarios.
- [x] BPS CPI is category-gated and cannot universally escalate HPS.
- [x] LKPP catalog fallback is treated as catalog/status evidence rather than an inferred product price.
- [x] ESDM evidence is regulation/cost-driver evidence and does not invent one generic tariff.
- [x] Governed learning consumes only server-approved outcomes; new outcomes are pending by default.
- [x] Automated Node test suite and GitHub CI enabled.
- [x] Security model, UAT plan and operations/recovery runbook added.
- [x] `/api/health` and `/api/version` identify runtime health and deployment build.
- [x] Browser configuration contains only the production Supabase URL + publishable key; no service-role credential.

## Live Supabase backend — completed / validated

- [x] Existing `HPS_Intelligence` project `bobrilytsufxtqqqgaym` selected by owner.
- [x] Existing users, requests and audit history migrated into canonical HPS tables.
- [x] Obsolete `requests`, `audit_log`, `model_governance` and `hps_users` tables removed after migration verification.
- [x] Tenant `t1` bootstrapped and existing users mapped to production roles.
- [x] RLS enabled on every public HPS table.
- [x] Core request/version writes restricted to controlled RPCs.
- [x] Anonymous table privileges revoked; authenticated table privileges reduced to required operations only.
- [x] Private `hps-evidence` Storage bucket created with 20 MB limit and MIME allow-list.
- [x] Storage tenant-path RLS policies created.
- [x] Security Advisor reviewed; anonymous SECURITY DEFINER findings eliminated.
- [x] Performance Advisor unindexed-FK and auth-initplan findings remediated.
- [x] Database transactional UAT: Analyst maker → Manager review/approve → Head lock passed.
- [x] Database transactional UAT: maker self-review rejected.
- [x] Database transactional UAT: `BLOCKED` evidence request submission rejected.
- [x] Database transactional UAT: Manager learning approval allowed and Analyst learning approval denied.
- [x] Transactional UAT rolled back with no test records left in production data.

## Live items still requiring runtime/user validation

- [ ] Reconcile intended five-user team roster against six active tenant memberships before disabling/deleting any account.
- [ ] Enable Supabase Auth leaked-password protection.
- [ ] Browser sign-in tested for each intended role.
- [ ] Cross-role visibility/action isolation tested through the browser/PostgREST session.
- [ ] Auditor write attempts tested if an Auditor account is part of the final roster.
- [ ] Private evidence upload/download tested with authorized user and denied for unauthorized context.
- [ ] Duplicate evidence upload rejected by SHA-256 control.
- [ ] Shared request/version state confirmed across two or more browsers/users.
- [ ] Five simultaneous users can save/review without browser-local collision.

## Release validation

- [ ] Cloudflare production deployment returns Worker build `production-complete-20260916-v14`.
- [ ] Deployed `config.js` points to `https://bobrilytsufxtqqqgaym.supabase.co` and uses a publishable key only.
- [ ] In-app Production Readiness Monitor required checks pass.
- [ ] UAT-01 through UAT-24 completed and recorded.
- [ ] Backup/restore availability confirmed for the current Supabase project plan.
- [ ] Business owner/security owner signs off Production 2.0 release.
