# HPS Intelligence — Production Implementation Roadmap

Status date: 2026-09-16

This roadmap tracks major production phases. Existing scaffolding is counted as partial only when it still requires production-grade completion, integration, security controls, or UAT.

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
| 9 | Approval workflow, RBAC, maker-checker, reviewer comments, immutable approved versions, rejection/rework loop | REMAINING |
| 10 | Supabase production backend: multi-tenant data model, Auth, RLS, cloud persistence, audit-event ledger and organization/user administration | REMAINING |
| 11 | Document Evidence Hub: upload Contract/PO/Invoice/Quotation/BOQ/SOW/rate card; metadata/extraction; hash/version; component linking; duplicate and expiry controls | REMAINING |
| 12 | Advanced Procurement Intelligence: category-specific official/live drivers, multi-currency normalization, historical-date normalization, landed-cost/import logic, wage/energy/logistics indices and automated applicability rules | REMAINING |
| 13 | Governed Learning & Negotiation Intelligence: approved-outcome learning, category maturity, supplier/comparable normalization, negotiation target/range, exception reasoning and autonomous recommendation with human approval | REMAINING |
| 14 | Production Hardening & Release: automated tests, security review, RLS tests, performance/mobile PWA testing, backup/restore, monitoring/alerts, UAT, release checklist and operational runbook | REMAINING |

## Remaining count

After Phase 8, **6 major phases remain: Phase 9 through Phase 14**.

Some remaining phases already have scaffolding in the repository (for example `auth-sync.js`, `cloud-sync.js`, Supabase setup assets, vendor comparison and audit export). They are still counted as remaining until they are integrated, secured, tested and production-approved.

## Release principle

A phase is marked DONE only when its production behavior is deterministic, auditable, non-synthetic, testable, and does not silently downgrade to unverified evidence.
