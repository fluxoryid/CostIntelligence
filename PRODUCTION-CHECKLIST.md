# HPS Intelligence — Production 2.0 RC Checklist

## Code / build — completed

- [x] Repository contains Worker/static application and official-source adapters.
- [x] Default mode is `HYBRID_STRICT`; synthetic/AI/search-snippet evidence cannot materially set production HPS.
- [x] Evidence-to-component coverage and critical-component approval gate implemented.
- [x] Category-dependent cost structures and evidence requirements implemented.
- [x] Maker-checker workflow/RBAC client plus server-side RLS/RPC contract implemented.
- [x] Immutable request versions and approved/locked mutation guard defined in Supabase schema.
- [x] Private Document Evidence Hub implemented with SHA-256 duplicate control, version/expiry metadata and safe extraction.
- [x] BI JISDOR/current and historical FX integration implemented without generic third-party substitution.
- [x] BI non-USD reference normalization implemented for supported currencies.
- [x] Kemenkeu Kurs Pajak remains distinct from commercial FX and is used for customs/tax scenarios.
- [x] BPS CPI is category-gated and cannot universally escalate HPS.
- [x] LKPP catalog fallback is treated as catalog/status evidence rather than an inferred product price.
- [x] ESDM evidence is regulation/cost-driver evidence and does not invent one generic tariff.
- [x] Governed learning consumes only explicitly approved outcomes; new outcomes are pending by default.
- [x] Automated Node test suite and GitHub CI added.
- [x] Security model, UAT plan and operations/recovery runbook added.
- [x] `/api/health` and `/api/version` identify runtime health and deployment build.
- [x] Browser configuration contains only a placeholder for a Supabase publishable key; no service-role credential.

## Live infrastructure — requires dedicated CostIntelligence Supabase project

- [ ] Owner approves Supabase organization/region and project cost.
- [ ] Dedicated project is created and reaches ACTIVE_HEALTHY.
- [ ] `SUPABASE-SETUP.sql` is applied successfully.
- [ ] `default-org` tenant is bootstrapped.
- [ ] Project URL + publishable key are configured in `config.js`; no private key is committed.
- [ ] Five team users are created/invited and assigned intended roles.
- [ ] Security Advisor has no unresolved material RLS/security finding.
- [ ] Performance Advisor findings are reviewed/remediated where material.
- [ ] Two-user / cross-role / cross-tenant isolation is tested.
- [ ] Auditor write attempts are denied.
- [ ] Manager approval below `APPROVAL READY` is rejected server-side.
- [ ] Procurement Head/Admin can lock an approved version; later mutation is rejected.
- [ ] Evidence Storage is private and unauthorized object access is denied.
- [ ] Duplicate evidence upload is rejected by SHA-256 control.
- [ ] Five simultaneous users can save/review without browser-local collision.

## Release validation

- [ ] Cloudflare production deployment returns Worker build `production-complete-20260916-v14`.
- [ ] In-app Production Readiness Monitor required checks pass.
- [ ] UAT-01 through UAT-24 completed and recorded.
- [ ] Backup/restore availability confirmed for the selected Supabase plan.
- [ ] Business owner/security owner signs off Production 2.0 release.
