# HPS Intelligence — Source Governance

Production HPS must distinguish **source credibility** from **direct price relevance**. A government macro source can be authoritative without being an appropriate direct product-price benchmark.

## Evidence priority

1. Internal executed PO / signed contract / paid invoice — primary price evidence for comparable repeat procurement.
2. Principal/OEM official quotation — primary commercial evidence, triangulated because the seller is not independent.
3. Authorized distributor quotation — strong local-market evidence.
4. Data INAPROC transaction history — strong official E-Purchasing price benchmark after tax-basis and comparability review; authenticated Data Integrator access is required.
5. LKPP / INAPROC / E-Katalog comparable — strong procurement benchmark; catalog/list price is not automatically the negotiated transaction price.
6. BPS — primary Indonesia inflation/statistical cost-driver source.
7. Bank Indonesia JISDOR — official USD/IDR market-reference cost driver.
8. Kementerian Keuangan / DJP Kurs Pajak — official weekly tax/customs FX rate.
9. DJBC / CEISA — customs/tariff/import exposure where authenticated access is available.
10. ESDM — energy/electricity regulation and energy cost drivers; use the correct customer class.
11. Official UMP/UMK/UMSK decree / JDIH — labor escalation.
12. World Bank — macro cross-check/context, not direct product pricing.
13. UN Comtrade — supporting import/trade benchmark after HS-code and unit normalization.
14. U.S. EIA — oil/energy cost-driver benchmark.
15. Route-specific freight/carrier quotation — supporting logistics evidence.

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

- Data INAPROC API Gateway (authenticated Data Integrator): https://data.inaproc.id/
- Bank Indonesia JISDOR / monetary indicator pages: https://www.bi.go.id/
- Kementerian Keuangan / Kurs Pajak: https://fiskal.kemenkeu.go.id/informasi-publik/kurs-pajak
- World Bank API: https://api.worldbank.org/v2/
- ESDM JDIH: https://jdih.esdm.go.id/
- U.S. EIA Open Data API: https://api.eia.gov/v2/

BPS, DJBC/CEISA, UN Comtrade, Data INAPROC transaction history, and some commercial logistics sources require credentials, dataset-specific mapping, licensing, or a separate integration and therefore remain unavailable until configured. The Data INAPROC adapter is staged but disabled in Production 2.1 until an authorized token is validated. The engine does not fabricate replacements.
