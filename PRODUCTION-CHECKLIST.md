# HPS Intelligence — Production 2.1 Checklist

## Production 2.1 core additions — completed

- [x] BI-Rate value date displayed.
- [x] USD/IDR JISDOR value date displayed.
- [x] Kurs Pajak KMK effective period displayed.
- [x] BPS inflation reference period and release date displayed.
- [x] Principal/OEM discount supports percentage or nominal IDR and is included in HPS calculation.
- [x] Reset HPS sets the active HPS calculation state to zero without deleting server history.
- [x] Application shell is credential-gated until Supabase authentication and active tenant membership are validated.
- [x] Primary UI translated to Bahasa Indonesia with controlled procurement terminology.
- [x] LKPP Open Data integration deferred from this release by owner direction.
- [x] Data INAPROC adapter remains staged with production UI disabled pending authorized token validation.

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
- [x] BPS Cloudflare-edge resilience uses a provenance-bound official BRS last-known-good snapshot when both official live routes are blocked; state is `CACHED`, never `LIVE`, and expires to `STALE` after 30 September 2026.
- [x] LKPP Open Data / price intelligence is deferred. The legacy LKPP status fallback remains compatibility-only and is excluded from material HPS price intelligence and Production 2.1 readiness scoring.
- [x] ESDM evidence is regulation/cost-driver evidence and does not invent one generic tariff.
- [x] Governed learning consumes only server-approved outcomes; new outcomes are pending by default.
- [x] Automated Node test suite and GitHub CI enabled.
- [x] Security model, UAT plan and operations/recovery runbook added.
- [x] `/api/health` and `/api/version` identify runtime health and deployment build.
- [x] Production provider smoke checks run after deployment for active Production 2.1 sources: BI JISDOR, BI-Rate, Kurs Pajak, BPS and ESDM.
- [x] Browser configuration contains only the production Supabase URL + publishable key; no service-role credential.

## Live Supabase backend — completed / validated

- [x] Existing `HPS_Intelligence` project `bobrilytsufxtqqqgaym` selected by owner.
- [x] Existing users, requests and audit history migrated into canonical HPS tables.
- [x] Obsolete `requests`, `audit_log`, `model_governance` and `hps_users` tables removed after migration verification.
- [x] Tenant `t1` bootstrapped and existing users mapped to production roles.
- [x] Six active memberships confirmed by owner as the intended roster: owner + five team members.
- [x] RLS enabled on every public HPS table.\n- [x] Audit log is server-managed: authenticated browser roles have SELECT only; workflow RPCs create authoritative audit events.
- [x] Core request/version writes restricted to controlled RPCs.
- [x] Anonymous table privileges revoked; authenticated table privileges reduced to required operations only.
- [x] Private `hps-evidence` Storage bucket created with 20 MB limit and MIME allow-list.
- [x] Storage tenant-path RLS policies created.
- [x] Security Advisor reviewed; anonymous SECURITY DEFINER findings eliminated.
- [x] The three remaining authenticated SECURITY DEFINER notices are intentional API RPCs (`hps_save_draft`, `hps_transition_request`, `hps_approve_learning_outcome`) and each performs authenticated tenant/role validation internally.
- [x] Password policy hardened to minimum 12 characters with lowercase, uppercase, digits and symbols; current password is required when changing a password.
- [x] Leaked-password protection reviewed. It is unavailable on the current Supabase Free plan and is recorded as an accepted residual control until a Pro-plan upgrade.
- [x] Performance Advisor unindexed-FK and auth-initplan findings remediated. Remaining notices are informational unused-index notices expected on the currently small dataset; indexes are retained for production query paths.
- [x] Database transactional UAT: Analyst maker → Manager review/approve → Head lock passed.
- [x] Database transactional UAT: maker self-review rejected.
- [x] Database transactional UAT: `BLOCKED` evidence request submission rejected.
- [x] Database transactional UAT: Manager learning approval allowed and Analyst learning approval denied.
- [x] Cross-tenant isolation and anonymous-access denial verified at the database/RLS layer.
- [x] Transactional UAT rolled back with no test records left in production data.

## Free-plan operational residuals

- [x] Supabase Free-plan backup limitation reviewed against current Supabase documentation.
- [ ] Establish a recurring off-site logical database export using `supabase db dump` / `pg_dump` before full production reliance.
- [ ] Establish a separate backup/export procedure for evidence files in Supabase Storage; database backups do not restore Storage objects.
- [ ] Upgrade to Pro if automatic daily backups, downloadable backup history, non-pausing availability, leaked-password protection or PITR are required by policy.

## Live items still requiring runtime/user validation

- [ ] Browser sign-in tested for each intended role.
- [ ] Cross-role visibility/action isolation tested through real browser/PostgREST sessions.
- [ ] Private evidence upload/download tested with authorized user and denied for unauthorized context.
- [ ] Duplicate evidence upload rejected by SHA-256 control.
- [ ] Shared request/version state confirmed across two or more browsers/users.
- [ ] Five simultaneous team users can save/review without browser-local collision.

## Release validation

- [x] Production 2.1 deployment workflow completed successfully after the release-verification step was corrected to derive the expected build from `config.js`.
- [x] Post-deploy runtime reports release channel `production`, build `production-2.1-20260919-v4`, and health `healthy`.
- [x] Provider smoke probes return HTTP 200 for active Production 2.1 sources: JISDOR, BI-Rate, Kurs Pajak, BPS and ESDM.

- [x] Cloudflare production deployment returns Worker build `production-2.1-20260919-v4` and post-deploy `/api/version` verification passes.
- [x] Deployed `config.js` points to `https://bobrilytsufxtqqqgaym.supabase.co` and uses a publishable key only; post-deploy smoke test finds no private Supabase credential markers.
- [ ] In-app Production Readiness Monitor required checks pass.
- [x] Governed Production UAT Console implemented with append-only attempts, tenant RLS and Head/Admin sign-off gate.\n- [x] UAT Console backend lifecycle transaction passed: Analyst run + 24 PASS attempts → Procurement Head/Admin sign-off → authoritative audit event; validation data rolled back with zero residual rows.\n- [ ] UAT-01 through UAT-24 completed and recorded.
- [ ] Owner accepts the Free-plan backup/availability residuals or upgrades the project before final production reliance.
- [x] Business owner authorized promotion to Production 2.1 on 19 Sep 2026.
- [ ] Security owner sign-off / residual-risk acceptance remains an operational governance item if required by company policy.
