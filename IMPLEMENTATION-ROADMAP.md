# HPS Intelligence — Production Implementation Roadmap

Status date: 2026-09-19

This roadmap separates **code-complete**, **backend-validated**, and **release-complete**. Production 2.1 core has now been promoted after owner approval and automated deployment/runtime verification.

| Phase | Scope | Status |
|---|---|---|
| 1 | Strict HPS calculation baseline; no synthetic production evidence; Model A/B/C/D guardrails | DONE |
| 2 | Source Reliability Engine, evidence tiers, LIVE/CACHED/STALE/UNAVAILABLE governance | DONE |
| 3 | Official macro/source adapters: BI/JISDOR, Kurs Pajak, BPS, ESDM and World Bank; historical BI/BPS baseline. Legacy LKPP status fallback is retained only for compatibility; LKPP Open Data / price intelligence is deferred from Production 2.1. | DONE |
| 4 | Procurement type → category dependency and guided procurement flow | DONE |
| 5 | Category → subcategory / pricing profile intelligence | DONE |
| 6 | Category-dependent cost-component forms and category evidence requirements | DONE |
| 7 | Component calculation bridge into deterministic HPS / Model C and audit context | DONE |
| 8 | Evidence-to-component mapping, component confidence, weighted evidence coverage and critical-component gate | DONE |
| 9 | Approval workflow, RBAC, maker-checker, reviewer comments, immutable approved versions, rejection/rework loop | BACKEND VALIDATED — transactional maker/checker, evidence-gate, approve and lock UAT passed |
| 10 | Supabase production backend: multi-tenant data model, Auth, RLS, cloud persistence, audit-event ledger, private Storage and user administration | DONE — existing `HPS_Intelligence` project migrated, secured and connected |
| 11 | Document Evidence Hub: Contract/PO/Invoice/Quotation/BOQ/SOW/rate-card upload, safe extraction, SHA-256 duplicate/version/expiry controls and component linking | LIVE BACKEND READY — private Storage provisioned; browser upload/access UAT pending |
| 12 | Advanced Procurement Intelligence: official BI multi-currency/current/historical normalization and transparent landed-cost/import scenario with explicit duty/tax inputs | DONE — production Worker runtime verified |
| 13 | Governed Learning & Negotiation Intelligence: approved-outcome learning, category maturity, negotiation range/target and human approval queue | BACKEND VALIDATED — Manager approval and Analyst denial UAT passed; browser UAT pending |
| 14 | Production Hardening & Release: automated tests, security model, monitoring/health, backup/restore runbook, UAT plan and release controls | RUNTIME/BACKEND/CI VALIDATED — real-browser/five-user UAT, backup acceptance and final release approval pending |

## Current release state

The repository is now **Production 2.1** with Worker build `production-2.1-20260919-v12`. GitHub Actions deploys the Cloudflare Worker automatically using scoped repository secrets and performs post-deploy runtime smoke verification.

Production 2.1 adds mandatory validated credential access, parameter value dates for BI-Rate/JISDOR/Kurs Pajak/BPS, Principal/OEM discount adjustment by percentage or nominal IDR, Reset HPS, and Bahasa Indonesia UI. LKPP Open Data exploration is deferred. The Data INAPROC adapter is retained but its production UI remains disabled until an authorized token is validated.

Live Supabase project `HPS_Intelligence` (`bobrilytsufxtqqqgaym`) is now the backend for tenant `t1`. Legacy application tables were migrated into the canonical HPS model and then removed. The live public schema now contains only CostIntelligence/HPS tables. Existing request/version/audit history was preserved during migration.

The six active tenant memberships are confirmed as intentional: the owner plus five team members.

The database now enforces:

- authenticated tenant membership and role mapping;
- server-side maker/checker controls;
- evidence-gated submit/approve transitions;
- immutable request versions and approved/locked HPS controls;
- RPC-only request/version workflow mutations;
- Manager/Head-only learning approval;
- private `hps-evidence` Storage with tenant-path RLS;
- least-privilege table grants; and
- append-only audit behavior for application actors.

Authentication hardening on the current Supabase Free plan is set to a 12-character minimum with lowercase, uppercase, digits and symbols, with the current password required for password changes. Supabase leaked-password protection is Pro-only and therefore remains an explicitly accepted Free-plan residual control rather than an implementation defect.

Security Advisor was re-run. The three remaining `authenticated_security_definer_function_executable` notices correspond exactly to the intentionally exposed workflow/learning RPCs; those functions perform authenticated tenant/role authorization internally. Performance Advisor now reports only informational unused-index notices, expected before production traffic; the indexes are retained for anticipated HPS query paths.

A transactional database UAT was run with rollback: Analyst maker → Manager review/approve → Procurement Head lock succeeded; maker self-review was rejected; a `BLOCKED` evidence request could not be submitted; governed learning approval succeeded for Manager and was denied to Analyst; anonymous access and cross-tenant isolation were also verified. No UAT records remained afterward.

Cloudflare production deployment has also been runtime-verified. `/api/version` returns build `production-2.1-20260919-v12` with release channel `production`, `/api/health` returns `healthy`, and deployed `config.js` points to the intended Supabase project with no private Supabase credential markers. Provider smoke checks return HTTP 200 for BI JISDOR, BI-Rate, Kurs Pajak, BPS, ESDM and the retained legacy LKPP status fallback. The LKPP status fallback is not used as Production 2.1 product-price intelligence and does not re-open the deferred LKPP Open Data scope. BPS currently uses a provenance-bound `CACHED` last-known-good snapshot of the official 1 September 2026 BRS because both the BPS WebAPI and public page block the Cloudflare edge; the snapshot is explicitly non-synthetic and becomes `STALE` after 30 September 2026.

## Free-plan operational constraint

Supabase documents automatic daily backup history for Pro/Team/Enterprise projects. For Free-plan projects, Supabase recommends regular off-site logical exports using `supabase db dump`; Storage objects require a separate backup/export process because database backups contain Storage metadata rather than the object contents. Free projects may also be paused after low activity. These are operational residuals to accept or eliminate by upgrading before full production reliance.

## Remaining operational validation / hardening

1. Execute real-browser UAT for sign-in, private document upload/access, shared request visibility and concurrent team usage.
2. Establish/accept the Free-plan database + Storage backup procedure, or upgrade Supabase if automatic backup/PITR/non-pausing availability is required.
3. Complete UAT-01 through UAT-24 and record the results.
4. Complete remaining browser/team UAT and security-owner residual-risk acceptance if required by company policy; these no longer block the owner's Production 2.1 go-live decision.

## Release principle

No unavailable official source may be replaced with synthetic production evidence. Approved/locked HPS versions are immutable, learning consumes only explicitly server-approved outcomes, and production authorization is enforced server-side through Supabase RLS/RPC rather than trusting browser controls.
\n\n## Production UAT Console\nBuild `production-2.1-20260919-v12` adds a build-scoped UAT-01–UAT-24 console backed by tenant-isolated Supabase tables. Test attempts are append-only; retest evidence is preserved; final sign-off is restricted to Procurement Head/Admin and requires the latest result for all 24 cases to be PASS.\n\n\n## Password Recovery Hotfix\nBuild `production-2.1-20260919-v12` adds self-service password recovery to the production login shell, including explicit production-origin reset redirects, handling of Supabase `PASSWORD_RECOVERY`, password-policy validation, and in-app password update.\n\n\n## Dedicated Password Reset Page\nBuild `production-2.1-20260919-v12` replaces JavaScript-only forgot-password navigation with a native link to `password-reset.html`, improving reliability on Android browsers/PWA shells while keeping the Supabase recovery session and governed password update flow.\n\n\n## Native Reset Link Intercept Fix\nBuild `production-2.1-20260919-v12` prevents the legacy modal recovery handler from cancelling native navigation to `password-reset.html`.\n\n\n## Canonical Password Reset Route\nBuild `production-2.1-20260919-v12` uses `/password-reset` as the recovery callback and native navigation target, avoiding the Cloudflare `.html` → clean-URL 307 during Supabase recovery.\n\n\n## Login Password Field ID Hotfix\nBuild `production-2.1-20260919-v12` restores stable technical DOM IDs for login password inputs and adds regression coverage so Bahasa localization cannot alter authentication field identifiers.\n\n\n## Browser CalcCore Export Hotfix\nBuild `production-2.1-20260919-v12` exposes the shared calculation engine as `window.CalcCore` in browsers while keeping the same Node test export. Authentication validation and application-startup errors are now separated diagnostically.\n\n\n## Full HPS Reset\nBuild `production-2.1-20260919-v12` expands the Reset HPS control so all active numeric HPS and commercial-comparison parameters become 0, category-specific cost inputs are zeroed, stale historical controls are cleared, and HPS headline outputs are forced to zero without deleting server history or post-award learning evidence.\n\n\n## Supabase-Only Persistence\nBuild `production-2.1-20260919-v12` makes Supabase the sole persistent system of record for application/business data. Persistent browser localStorage for drafts, learning and workflow state is removed and legacy keys are purged. Cloudflare remains stateless; sessionStorage may be used only for ephemeral request/tab pointers.\n