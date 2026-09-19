# HPS Intelligence — Production 2.1

A clean, local-first HPS / Owner's Estimate application for procurement intelligence. It is built around **HYBRID_STRICT** evidence control: production calculations do not silently substitute synthetic market prices when evidence is missing.

## Core workflow

User request → category intelligence → source synchronization → source reliability gate → Model A historical escalation → Model B verified comparables → Model C owner should-cost build-up → Model D approved outcome learning → weighted triangulation → confidence → HPS recommendation → vendor comparison → audit dossier → post-award learning.

## What is live-capable

Cloudflare Worker API routes provide active adapters for Bank Indonesia JISDOR, BI-Rate, Kemenkeu Kurs Pajak, BPS, World Bank, ESDM regulation status, and optional EIA Brent. All active adapters use real upstream data or governed official snapshots, or report unavailable; they do not generate substitute numbers. LKPP Open Data / price intelligence is deferred from Production 2.1; the legacy LKPP status fallback is retained only for compatibility and is excluded from production-readiness scoring and material HPS price intelligence.

## Strict production rules

- Model A requires a historical price plus enough verified cost-driver coverage.
- Model B requires at least **3 verified comparable prices** after outlier filtering.
- Model C requires an explicit owner cost build-up / should-cost basis.
- Model D requires at least **3 approved non-demo outcomes** in the same category.
- AI-generated, random, synthetic, search-snippet and low-grade informational prices are prohibited from numerical HPS influence.
- `LIVE` means a materially used model is live-backed; internal/user evidence without material live backing remains `HYBRID`.
- Missing evidence returns `INSUFFICIENT`, `UNAVAILABLE`, or `BLOCKED` rather than a fabricated HPS.

## Files

- `index.html`, `style.css`, `app.js` — enterprise frontend
- `calc-core.js` — classification, strict models, triangulation, confidence and learning math
- `source-engine.js` — source authority/relevance/freshness/auditability/independence scoring
- `providers.js` — live/cached provider adapters
- `functions/api/*` — Cloudflare Pages Functions
- `config.js` — tenant and optional Supabase configuration
- `auth-sync.js`, `cloud-sync.js` — optional Supabase Auth/persistence
- `SUPABASE-SETUP.sql` — multi-tenant baseline schema + RLS
- `SOURCE-GOVERNANCE.md` — reliable/unreliable source policy
- `DEPLOYMENT.md` — deployment steps
- `PRODUCTION-CHECKLIST.md` — go-live controls

## Legal/compliance note

The interface includes an 80% HPS performance-guarantee check for procurements that are actually subject to Indonesia's government procurement regime. It references the consolidated framework of Perpres 16/2018 as amended by Perpres 12/2021 and Perpres 46/2025. Private-company procurements should use the organization's own policy/contract rules unless those government rules are contractually or legally applicable.

## Run locally

Serve the folder over HTTP; do not open `index.html` only as `file://` if you need service workers or API paths.

Example:

```bash
python -m http.server 8080
```

Provider API routes will only work when deployed with the included Cloudflare Pages Functions (or when proxied locally).
