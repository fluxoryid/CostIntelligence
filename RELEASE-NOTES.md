# Release Notes

## Production 2.0 RC — Enterprise Multi-User Governance

- Completed procurement hierarchy: Jenis Pengadaan → Kategori → Subkategori / pricing profile.
- Added category-dependent owner cost structures for IT hardware, SaaS, BPO, data center, logistics, payment-terminal rental, construction, consulting and general goods/services.
- Added Evidence-to-Component Mapping with confidence scoring, validity/material-use controls, weighted evidence coverage and critical-component approval gate.
- Added maker-checker RBAC workflow: Procurement User → Analyst/Senior → Manager → Procurement Head/Admin, plus read-only Auditor.
- Defined server-side Supabase RLS/RPC controls, immutable version history, append-only audit trail and controlled approve/lock transitions.
- Added private Document Evidence Hub for Contract/PO/Invoice/Quotation/BOQ/SOW/rate cards with SHA-256 duplicate control, reference versioning, expiry metadata and safe PDF/Office text extraction.
- Added official BI multi-currency normalization and date-aligned historical FX. USD uses JISDOR; supported non-USD currencies use BI reference rates.
- Kept Kemenkeu Kurs Pajak separate for customs/tax conversion and added a transparent landed-cost scenario with explicit user-verified duty/tax inputs.
- Updated provider provenance: BI wsKursBI is primary for JISDOR/history; BPS public official release is the production fallback when BPS WebAPI is unavailable from the Cloudflare edge.
- Added governed learning: new negotiation outcomes remain excluded until Manager/Head approval. Learning activates only from approved auditable outcomes.
- Added historical-outcome negotiation decision support with percentile range and HPS cap; it does not auto-select a supplier or auto-approve a negotiation.
- Added `/api/health`, final build identity, automated Node tests, GitHub CI, security model, operations/recovery runbook and 24-case UAT plan.
- Cloudflare remains stateless; Supabase is designed as the shared multi-user system of record.
- Production 2.0 RC is code-complete. Live multi-user promotion requires owner-approved creation/configuration of the dedicated CostIntelligence Supabase project and completion of role/RLS/UAT validation.

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
