# Release Notes

## Production Fresh 1.1 — Aqua/Royal Theme

- Applied aqua/sky, cyan, royal-blue and peach visual palette based on the supplied website reference screenshot.
- Changed primary UI typography from Inter to Poppins; JetBrains Mono remains for numeric/audit values.
- Converted the application shell and cards from dark mode to a light enterprise theme while retaining semantic green/amber/red risk states.
- Updated PWA theme/background colors and bumped the service-worker cache version.
- Calculation, provider, evidence-governance and production-guard logic is unchanged.

— Production Fresh 1.0

- Rebuilt as a clean package without prior legacy UI folders or embedded Supabase project credentials.
- Enterprise dark interface retained and production inputs start blank.
- HYBRID_STRICT is the default calculation mode.
- Added five-factor Source Reliability & Evidence Governance engine.
- Added benchmark source-type gate: low-grade marketplace/search/AI comparables are rejected before Model B.
- Added live/cached adapters for BI JISDOR, BI-Rate, Kemenkeu Kurs Pajak, World Bank, LKPP and ESDM.
- Added optional EIA Brent adapter controlled by `EIA_API_KEY`.
- Added local-first approved outcome learning; Model D activates after 3 approved non-demo category outcomes.
- Added optional multi-tenant Supabase persistence with RLS setup SQL and no hard-coded project credentials.
- Added audit-dossier export, provider lineage and runtime source-governance table.
- Updated government-procurement legal note to the consolidated Perpres 16/2018 jo. 12/2021 jo. 46/2025 framework; apply only where that regime governs the procurement.
