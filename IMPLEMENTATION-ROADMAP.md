# HPS Intelligence — Production Implementation Roadmap

Status date: 2026-09-16

This roadmap separates **code-complete**, **backend-validated**, and **release-complete**. Production 2.0 is promoted only after the remaining browser/runtime UAT and owner release approval are complete.

| Phase | Scope | Status |
|---|---|---|
| 1 | Strict HPS calculation baseline; no synthetic production evidence; Model A/B/C/D guardrails | DONE |
| 2 | Source Reliability Engine, evidence tiers, LIVE/CACHED/STALE/UNAVAILABLE governance | DONE |
| 3 | Official macro/source adapters: BI/JISDOR, Kurs Pajak, BPS, ESDM, LKPP, World Bank; historical BI/BPS baseline | DONE |
| 4 | Procurement type → category dependency and guided procurement flow | DONE |
| 5 | Category → subcategory / pricing profile intelligence | DONE |
| 6 | Category-dependent cost-component forms and category evidence requirements | DONE |
| 7 | Component calculation bridge into deterministic HPS / Model C and audit context | DONE |
| 8 | Evidence-to-component mapping, component confidence, weighted evidence coverage and critical-component gate | DONE |
| 9 | Approval workflow, RBAC, maker-checker, reviewer comments, immutable approved versions, rejection/rework loop | BACKEND VALIDATED — transactional maker/checker, evidence-gate, approve and lock UAT passed |
| 10 | Supabase production backend: multi-tenant data model, Auth, RLS, cloud persistence, audit-event ledger, private Storage and user administration | DONE — existing `HPS_Intelligence` project migrated, secured and connected |
| 11 | Document Evidence Hub: Contract/PO/Invoice/Quotation/BOQ/SOW/rate-card upload, safe extraction, SHA-256 duplicate/version/expiry controls and component linking | LIVE BACKEND READY — private Storage provisioned; browser upload/access UAT pending |
| 12 | Advanced Procurement Intelligence: official BI multi-currency/current/historical normalization and transparent landed-cost/import scenario with explicit duty/tax inputs | CODE COMPLETE — production Worker runtime verification pending |
| 13 | Governed Learning & Negotiation Intelligence: approved-outcome learning, category maturity, negotiation range/target and human approval queue | BACKEND VALIDATED — Manager approval and Analyst denial UAT passed; browser UAT pending |
| 14 | Production Hardening & Release: automated tests, security model, monitoring/health, backup/restore runbook, UAT plan and release controls | BACKEND/CI VALIDATED — runtime/five-user UAT and final release approval pending |

## Current release state

The repository remains **Production 2.0 RC** with Worker build `production-complete-20260916-v14`.

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

## Free-plan operational constraint

Supabase documents automatic daily backup history for Pro/Team/Enterprise projects. For Free-plan projects, Supabase recommends regular off-site logical exports using `supabase db dump`; Storage objects require a separate backup/export process because database backups contain Storage metadata rather than the object contents. Free projects may also be paused after low activity. These are operational residuals to accept or eliminate by upgrading before full production reliance.

## Remaining release gates

1. Verify the deployed Cloudflare Worker serves build `production-complete-20260916-v14` and the new Supabase browser configuration.
2. Execute real-browser UAT for sign-in, private document upload/access, shared request visibility and concurrent team usage.
3. Establish/accept the Free-plan database + Storage backup procedure, or upgrade Supabase if automatic backup/PITR/non-pausing availability is required.
4. Complete UAT-01 through UAT-24 and record the results.
5. Complete the final business/security release approval before changing Production 2.0 RC to Production 2.0.

## Release principle

No unavailable official source may be replaced with synthetic production evidence. Approved/locked HPS versions are immutable, learning consumes only explicitly server-approved outcomes, and production authorization is enforced server-side through Supabase RLS/RPC rather than trusting browser controls.
