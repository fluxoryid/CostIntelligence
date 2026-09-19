# Release Notes

## Production 2.1 — Core Hardening & Bahasa Indonesia\n\n- Added self-service password recovery: forgot-password request, production-origin redirect, Supabase `PASSWORD_RECOVERY` handling, and governed new-password update UI.\n- Added a dedicated password-reset page with native navigation to avoid mobile/PWA dialog-click failures.\n- Fixed legacy recovery-script interception so native forgot-password links now navigate reliably on mobile.\n- Switched recovery callbacks to the canonical `/password-reset` route to avoid Cloudflare static-HTML 307 canonicalization during auth recovery.\n- Restored stable login password field IDs (`gatePassword` / `authPassword`) after localization had translated the DOM IDs and broken password capture.\n- Exposed the calculation core to the browser runtime as `window.CalcCore`; previously it was exported only to Node tests, causing valid authenticated sessions to fail during application startup.\n- Separated session-validation errors from post-auth application-startup errors.\n- Reset HPS now resets all active numeric calculation/commercial parameters to 0, clears stale historical-date/CPI-proxy controls, resets category-specific cost fields, and forces headline HPS outputs to zero while preserving server history and post-award learning evidence.\n- Supabase is now the sole persistent system of record for application/business data. Browser localStorage persistence for draft form state, learning state, and workflow state has been removed; legacy keys are purged on startup. Cloudflare Worker remains stateless.\n\n- Production UAT Console added for UAT-01–UAT-24 with build-scoped runs, append-only retest evidence, CSV export, tenant RLS, and Procurement Head/Admin final sign-off only after all 24 latest results PASS.

- Browser syntax regression in `cloud-sync.js` corrected; CI/deploy now syntax-check all production browser modules.

- Added explicit value dates/periods for BI-Rate, USD/IDR JISDOR, Kurs Pajak KMK and BPS inflation.
- Added Principal/OEM discount adjustment with two modes: percentage (%) or nominal IDR. The discount reduces the primary cost component before overhead, profit and tax; the component is never allowed to become negative.
- Added **Reset HPS** to set the active HPS calculation to zero without deleting previously saved server history.
- Changed access control so the application shell remains hidden until Supabase validates the login session and confirms active tenant membership.
- Completed the primary application UI conversion to Bahasa Indonesia with a controlled procurement/finance/IT glossary while retaining established technical acronyms and terms where translation would reduce precision.
- Preserved server-side RLS/RPC as the authorization boundary; browser controls remain defense-in-depth only.
- Data INAPROC transaction-history adapter is staged and security-hardened but its production UI remains disabled until an authorized Data Integrator token is configured and validated.
- LKPP Open Data exploration is intentionally deferred from this production release; it is excluded from the active readiness monitor, UAT provider dependency and deployment provider smoke probes.\n- Hardened audit integrity: browser clients no longer insert audit rows directly; authoritative workflow audit events are emitted by server-side RPCs, while tenant users retain read-only audit access.
- Worker build: `production-2.1-20260919-v12`.

## Production 2.0 RC — Enterprise Multi-User Governance

- Completed procurement hierarchy: Jenis Pengadaan → Kategori → Subkategori / pricing profile.
- Added category-dependent owner cost structures for IT hardware, SaaS, BPO, data center, logistics, payment-terminal rental, construction, consulting and general goods/services.
- Added Evidence-to-Component Mapping with confidence scoring, validity/material-use controls, weighted evidence coverage and critical-component approval gate.
- Added maker-checker RBAC workflow: Procurement User → Analyst/Senior → Manager → Procurement Head/Admin, plus read-only Auditor.
- Implemented live server-side Supabase RLS/RPC controls, immutable version history, append-only audit trail and controlled approve/lock transitions.
- Connected production browser configuration to Supabase project `bobrilytsufxtqqqgaym` using a publishable key only; service-role credentials remain excluded from frontend code.
- Migrated the existing Supabase users, requests and audit history into the canonical HPS data model; obsolete legacy application tables were removed only after count/data-preservation checks.
- Core request/version mutations are now RPC-only. Direct authenticated table grants are least-privilege and anonymous HPS table grants are revoked.
- Added private `hps-evidence` Storage with tenant-path RLS, 20 MB size policy and an evidence MIME allow-list.
- Added private Document Evidence Hub for Contract/PO/Invoice/Quotation/BOQ/SOW/rate cards with SHA-256 duplicate control, reference versioning, expiry metadata and safe PDF/Office text extraction.
- Added official BI multi-currency normalization and date-aligned historical FX. USD uses JISDOR; supported non-USD currencies use BI reference rates.
- Kept Kemenkeu Kurs Pajak separate for customs/tax conversion and added a transparent landed-cost scenario with explicit user-verified duty/tax inputs.
- Updated provider provenance: BI wsKursBI is primary for JISDOR/history. When BPS WebAPI/public pages are blocked from the Cloudflare edge, the runtime now falls back only to a provenance-bound last-known-good snapshot of the verified official BPS BRS; it is explicitly `CACHED`, non-synthetic, and becomes `STALE` after its validity window.
- Added governed learning: new negotiation outcomes remain excluded until Manager/Head approval. Model D consumes only outcomes returned by the server as approved.
- Added historical-outcome negotiation decision support with percentile range and HPS cap; it does not auto-select a supplier or auto-approve a negotiation.
- Added `/api/health`, final build identity, automated Node tests, GitHub CI, security model, operations/recovery runbook and 24-case UAT plan.
- Transactional database UAT passed the Analyst-maker → Manager-review/approve → Head-lock lifecycle, maker self-review rejection, evidence-gate rejection and learning-approval RBAC. The UAT transaction was rolled back with no production test records retained.
- Supabase Security/Performance Advisors were reviewed: material RLS/performance findings were remediated. The Free-plan leaked-password-protection limitation is documented as an accepted residual control; password complexity and current-password-on-change controls are enabled.
- Cloudflare remains stateless; Supabase is the shared multi-user system of record.
- Cloudflare Worker deployment is now automated through GitHub Actions with scoped Cloudflare repository secrets. Post-deploy verification confirms the expected Worker build, healthy runtime, intended Supabase project URL, absence of private Supabase credentials, and successful smoke responses from BI JISDOR, BI-Rate, Kurs Pajak, BPS, LKPP and ESDM.
- Production 2.0 RC now remains pending only real-browser/team UAT, Free-plan backup/availability acceptance or upgrade, and final business/security release approval.

## Production Fresh 1.1 — Aqua/Royal Theme

- Applied aqua/sky, cyan, royal-blue and peach visual palette based on the supplied website reference screenshot.
- Changed primary UI typography from Inter to Poppins; JetBrains Mono remains for numeric/audit values.
- Converted the application shell and cards from dark mode to a light enterprise theme while retaining semantic green/amber/red risk states.
- Updated PWA theme/background colors and bumped the service-worker cache version.
- Calculation, provider, evidence-governance and production-guard logic was unchanged in this release.

## Production Fresh 1.0

- Rebuilt as a clean package without legacy folders or embedded Supabase project credentials.
- HYBRID_STRICT became the default calculation mode.
- Added five-factor Source Reliability & Evidence Governance engine.
- Added live/cached adapters for BI JISDOR, BI-Rate, Kemenkeu Kurs Pajak, World Bank, LKPP and ESDM.
- Added optional EIA Brent adapter controlled by `EIA_API_KEY`.
- Added audit-dossier export, provider lineage and runtime source-governance table.
