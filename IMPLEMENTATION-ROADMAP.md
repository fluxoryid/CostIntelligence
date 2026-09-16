# HPS Intelligence — Production Implementation Roadmap

Status date: 2026-09-16

This roadmap separates **code-complete** from **live-production-complete**. A phase is marked DONE only after the behavior that depends on external infrastructure has been provisioned and validated.

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
| 9 | Approval workflow, RBAC, maker-checker, reviewer comments, immutable approved versions, rejection/rework loop | CODE COMPLETE — live RPC/RLS validation pending Phase 10 |
| 10 | Supabase production backend: multi-tenant data model, Auth, RLS, cloud persistence, audit-event ledger, private Storage and organization/user administration | SCHEMA/CLIENT COMPLETE — dedicated Supabase project provisioning requires owner approval |
| 11 | Document Evidence Hub: Contract/PO/Invoice/Quotation/BOQ/SOW/rate-card upload, safe extraction, SHA-256 duplicate/version/expiry controls and component linking | CODE COMPLETE — live private Storage validation pending Phase 10 |
| 12 | Advanced Procurement Intelligence: official BI multi-currency/current/historical normalization and transparent landed-cost/import scenario with explicit duty/tax inputs | CODE COMPLETE |
| 13 | Governed Learning & Negotiation Intelligence: approved-outcome learning, category maturity, negotiation range/target and human approval queue | CODE COMPLETE — live learning approval validation pending Phase 10 |
| 14 | Production Hardening & Release: automated tests, security model, monitoring/health, backup/restore runbook, UAT plan and release controls | CODE/CI COMPLETE — live Supabase security advisors, role-isolation UAT and five-user UAT pending |

## Current release state

The repository is now at **Production 2.0 RC** with Worker build `production-complete-20260916-v14`. Automated GitHub CI is enabled and the current test run passes.

The remaining implementation blocker is not application code: it is **live infrastructure provisioning and validation**. A dedicated CostIntelligence Supabase project must be created before Phases 9–11, 13 and 14 can be promoted from code-complete to live-production-complete.

## Remaining live gates

1. Create a dedicated CostIntelligence Supabase project in the owner-approved organization/region.
2. Apply `SUPABASE-SETUP.sql`, bootstrap the tenant and configure the browser with project URL + publishable key only.
3. Create/invite the five team users and assign roles.
4. Run Supabase Security/Performance Advisors and remediate material findings.
5. Execute UAT including cross-role RLS isolation, immutable-version, private-Storage and five-simultaneous-user tests.
6. Record business/security release approval and promote Production 2.0 RC to Production 2.0.

## Release principle

No unavailable official source may be replaced with synthetic production evidence. Approved/locked HPS versions are immutable, learning consumes only explicitly approved outcomes, and production authorization is enforced server-side through Supabase RLS/RPC rather than trusting browser controls.
