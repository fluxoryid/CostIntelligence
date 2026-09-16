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

A transactional database UAT was run with rollback: Analyst maker → Manager review/approve → Procurement Head lock succeeded; maker self-review was rejected; a `BLOCKED` evidence request could not be submitted; governed learning approval succeeded for Manager and was denied to Analyst. No UAT records remained afterward.

## Remaining release gates

1. Verify the deployed Cloudflare Worker serves build `production-complete-20260916-v14` and the new Supabase browser configuration.
2. Execute browser UAT for sign-in, private document upload/access, shared request visibility and concurrent team usage.
3. Reconcile the intended five-user roster against the six currently active Supabase tenant memberships before deleting or disabling any account.
4. Enable Supabase Auth leaked-password protection; current Security Advisor reports it disabled.
5. Confirm backup/restore availability for the project plan and record operational owner acceptance.
6. Complete the final business/security release approval before changing Production 2.0 RC to Production 2.0.

## Release principle

No unavailable official source may be replaced with synthetic production evidence. Approved/locked HPS versions are immutable, learning consumes only explicitly server-approved outcomes, and production authorization is enforced server-side through Supabase RLS/RPC rather than trusting browser controls.
