# HPS Intelligence — Source Governance

Production HPS must distinguish **source credibility** from **direct price relevance**. A government macro source can be authoritative without being an appropriate direct product-price benchmark.

## Evidence priority

1. Internal executed PO / signed contract / paid invoice — primary price evidence for comparable repeat procurement.
2. Principal/OEM official quotation — primary commercial evidence, triangulated because the seller is not independent.
3. Authorized distributor quotation — strong local-market evidence.
4. LKPP / INAPROC / E-Katalog comparable — strong procurement benchmark; catalog/list price is not automatically the negotiated transaction price.
5. BPS — primary Indonesia inflation/statistical cost-driver source.
6. Bank Indonesia JISDOR — official USD/IDR market-reference cost driver.
7. Kementerian Keuangan / DJP Kurs Pajak — official weekly tax/customs FX rate.
8. DJBC / CEISA — customs/tariff/import exposure where authenticated access is available.
9. ESDM — energy/electricity regulation and energy cost drivers; use the correct customer class.
10. Official UMP/UMK/UMSK decree / JDIH — labor escalation.
11. World Bank — macro cross-check/context, not direct product pricing.
12. UN Comtrade — supporting import/trade benchmark after HS-code and unit normalization.
13. U.S. EIA — oil/energy cost-driver benchmark.
14. Route-specific freight/carrier quotation — supporting logistics evidence.

## Prohibited as production price evidence

- AI-generated prices without attributable primary evidence
- random / synthetic / demo benchmark arrays
- search-engine snippets
- anonymous/unverifiable websites
- social media/forum claims
- marketplace listings with unknown specification, warranty, seller status or tax treatment

Those sources may assist discovery or contextual research, but they are not permitted to set the production HPS.

## Confidence formula

Each source is scored on:

- Source authority: 25%
- Price relevance: 30%
- Freshness: 20%
- Auditability/traceability: 15%
- Independent corroboration / independence: 10%

Classification:

- 90–100: VERIFIED PRIMARY
- 80–89: HIGH CONFIDENCE
- 70–79: ACCEPTABLE
- 50–69: SUPPORTING ONLY
- <50: INFORMATIONAL / REJECTED depending on policy

`source-engine.js` enforces the classification and blocks REJECTED/INFORMATIONAL sources from numerical HPS influence.

## Official reference endpoints used by this package

- Bank Indonesia JISDOR / monetary indicator pages: https://www.bi.go.id/
- Kementerian Keuangan / Kurs Pajak: https://fiskal.kemenkeu.go.id/informasi-publik/kurs-pajak
- World Bank API: https://api.worldbank.org/v2/
- ESDM JDIH: https://jdih.esdm.go.id/
- U.S. EIA Open Data API: https://api.eia.gov/v2/

BPS, DJBC/CEISA, UN Comtrade, and some commercial logistics sources require credentials, dataset-specific mapping, licensing, or a separate integration and therefore remain unavailable until configured. Research integrations for LKPP Open Data and authenticated INAPROC transaction history are intentionally deferred from this production release. The engine does not fabricate replacements.
