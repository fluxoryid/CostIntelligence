/* source-engine.js
 * Source Reliability & Evidence Governance for HPS Intelligence.
 * Credibility and pricing relevance are scored separately. Low-quality
 * evidence can be displayed for context but is never allowed to set HPS.
 */
(function () {
  'use strict';

  var REGISTRY = {
    INTERNAL_TRANSACTION: {
      label: 'Internal signed Contract / PO / Invoice', authority: 98, priceRelevance: 100,
      auditability: 100, independence: 90, role: 'PRIMARY_PRICE', allowed: true,
      note: 'Best evidence for repeat procurement when specification, quantity, date and commercial terms are normalized.'
    },
    BI_JISDOR: {
      label: 'Bank Indonesia — JISDOR', authority: 100, priceRelevance: 80,
      auditability: 100, independence: 100, role: 'COST_DRIVER', allowed: true,
      note: 'Official USD/IDR market reference. Use for FX escalation, not as direct product price.'
    },
    KURS_PAJAK: {
      label: 'Kementerian Keuangan / DJP — Kurs Pajak', authority: 100, priceRelevance: 85,
      auditability: 100, independence: 100, role: 'COST_DRIVER', allowed: true,
      note: 'Official weekly tax/customs conversion rate. Use for import/tax exposure.'
    },
    BPS: {
      label: 'BPS — CPI / Inflation / Wage / Construction Statistics', authority: 100, priceRelevance: 70,
      auditability: 100, independence: 100, role: 'COST_DRIVER', allowed: true,
      note: 'Primary Indonesia statistical source for inflation and relevant indices.'
    },
    UMP_JDIH: {
      label: 'Official UMP / UMK / UMSK Decree — JDIH', authority: 100, priceRelevance: 90,
      auditability: 100, independence: 100, role: 'COST_DRIVER', allowed: true,
      note: 'Primary labor escalation source. Must match year and operating location.'
    },
    DJBC_CEISA: {
      label: 'DJBC / CEISA — Tariff, Customs & Import Data', authority: 100, priceRelevance: 90,
      auditability: 100, independence: 100, role: 'COST_DRIVER', allowed: true,
      note: 'Primary source for import duty and customs exposure when credentials are available.'
    },
    ESDM: {
      label: 'Kementerian ESDM — Energy / Electricity Regulation', authority: 100, priceRelevance: 78,
      auditability: 100, independence: 100, role: 'COST_DRIVER', allowed: true,
      note: 'Use class-specific electricity or energy parameters; do not apply one generic tariff to all procurements.'
    },
    LKPP: {
      label: 'LKPP / INAPROC / E-Katalog', authority: 98, priceRelevance: 82,
      auditability: 98, independence: 98, role: 'SUPPORTING_PRICE', allowed: true,
      note: 'Strong procurement benchmark, but listed/catalog price is not automatically a negotiated transaction price.'
    },
    INAPROC_TRANSACTION: {
      label: 'Data INAPROC — Riwayat Transaksi E-Purchasing', authority: 100, priceRelevance: 86,
      auditability: 100, independence: 100, role: 'SUPPORTING_PRICE', allowed: true,
      note: 'Official transaction-history benchmark. Specification, quantity, location, tax, freight, date and commercial scope must be normalized before material HPS use.'
    },
    LKPP_OPEN_DATA: {
      label: 'LKPP Open Data — Statistik & Konteks Pasar Pengadaan', authority: 100, priceRelevance: 45,
      auditability: 100, independence: 100, role: 'CONTEXT', allowed: true,
      note: 'Official LKPP open data. Aggregate values/counts/indices are context only and must never be interpreted as product unit prices.'
    },
    PRINCIPAL_QUOTE: {
      label: 'Principal / OEM Official Quotation', authority: 92, priceRelevance: 98,
      auditability: 92, independence: 60, role: 'PRIMARY_PRICE', allowed: true,
      note: 'Highly relevant commercial evidence; triangulate because the source is also the seller.'
    },
    AUTH_DISTRIBUTOR_QUOTE: {
      label: 'Authorized Distributor Quotation', authority: 88, priceRelevance: 95,
      auditability: 88, independence: 70, role: 'PRIMARY_PRICE', allowed: true,
      note: 'Strong local-market evidence when authorization, scope and validity period are verified.'
    },
    SUPPLIER_QUOTE: {
      label: 'Supplier Quotation', authority: 76, priceRelevance: 88,
      auditability: 82, independence: 60, role: 'SUPPORTING_PRICE', allowed: true,
      note: 'Useful market signal. Require triangulation and comparable specification/terms.'
    },
    WORLD_BANK: {
      label: 'World Bank Open Data', authority: 94, priceRelevance: 55,
      auditability: 96, independence: 100, role: 'CONTEXT', allowed: true,
      note: 'Credible macro cross-check; not a direct product-price source.'
    },
    UN_COMTRADE: {
      label: 'UN Comtrade', authority: 94, priceRelevance: 70,
      auditability: 95, independence: 100, role: 'SUPPORTING_PRICE', allowed: true,
      note: 'Useful import/trade benchmark after HS-code, quantity and unit normalization.'
    },
    EIA: {
      label: 'U.S. EIA — Energy Prices', authority: 94, priceRelevance: 65,
      auditability: 96, independence: 100, role: 'COST_DRIVER', allowed: true,
      note: 'Strong energy benchmark; use as cost driver, not as direct landed-logistics price.'
    },
    FREIGHT_QUOTE: {
      label: 'Freight Forwarder / Carrier Quotation', authority: 78, priceRelevance: 92,
      auditability: 84, independence: 72, role: 'SUPPORTING_PRICE', allowed: true,
      note: 'Good route-specific logistics evidence if Incoterm, weight/volume and validity are documented.'
    },
    MARKETPLACE: {
      label: 'Marketplace / E-commerce Listing', authority: 45, priceRelevance: 58,
      auditability: 45, independence: 55, role: 'INFORMATIONAL', allowed: false,
      note: 'Directional only. Seller identity, warranty, tax and specification are often not comparable.'
    },
    SEARCH_SNIPPET: {
      label: 'Search Engine Snippet', authority: 20, priceRelevance: 30,
      auditability: 10, independence: 40, role: 'DISCOVERY_ONLY', allowed: false,
      note: 'May help discover a source, but must never become pricing evidence.'
    },
    NEWS_BLOG: {
      label: 'News / Blog / Forum', authority: 35, priceRelevance: 35,
      auditability: 30, independence: 55, role: 'CONTEXT', allowed: false,
      note: 'Context only unless the underlying primary source is retrieved and verified.'
    },
    AI_GENERATED: {
      label: 'AI-generated Price', authority: 0, priceRelevance: 0,
      auditability: 0, independence: 0, role: 'REJECTED', allowed: false,
      note: 'Prohibited as production HPS evidence.'
    },
    SYNTHETIC: {
      label: 'Random / Synthetic / Demo Number', authority: 0, priceRelevance: 0,
      auditability: 0, independence: 0, role: 'REJECTED', allowed: false,
      note: 'Testing only; prohibited in production calculations.'
    }
  };

  function clamp(n) { return Math.max(0, Math.min(100, Number(n) || 0)); }

  function freshnessScore(observedAt, publishedDate) {
    var raw = observedAt || publishedDate;
    if (!raw) return 60;
    var t = new Date(raw).getTime();
    if (!isFinite(t)) return 60;
    var days = Math.max(0, (Date.now() - t) / 86400000);
    if (days <= 7) return 100;
    if (days <= 30) return 90;
    if (days <= 90) return 80;
    if (days <= 180) return 70;
    if (days <= 365) return 55;
    return 35;
  }

  function grade(score, allowed) {
    if (!allowed || score < 30) return 'REJECTED';
    if (score >= 90) return 'VERIFIED PRIMARY';
    if (score >= 80) return 'HIGH CONFIDENCE';
    if (score >= 70) return 'ACCEPTABLE';
    if (score >= 50) return 'SUPPORTING ONLY';
    return 'INFORMATIONAL';
  }

  function scoreSource(sourceKey, observation) {
    var def = REGISTRY[sourceKey] || REGISTRY.NEWS_BLOG;
    var fresh = freshnessScore(observation && observation.retrievedAt, observation && observation.publishedDate);
    var score = (def.authority * 0.25) + (def.priceRelevance * 0.30) + (fresh * 0.20) +
      (def.auditability * 0.15) + (def.independence * 0.10);
    score = Math.round(clamp(score));
    return {
      key: sourceKey,
      label: def.label,
      authority: def.authority,
      priceRelevance: def.priceRelevance,
      freshness: fresh,
      auditability: def.auditability,
      independence: def.independence,
      score: score,
      grade: grade(score, def.allowed),
      role: def.role,
      allowed: !!def.allowed,
      note: def.note
    };
  }

  function inferKey(source) {
    var name = String((source && source.name) || '').toLowerCase();
    if (/internal historical|invoice|purchase order|signed contract/.test(name)) return 'INTERNAL_TRANSACTION';
    if (/jisdor|bank indonesia.*usd/.test(name)) return 'BI_JISDOR';
    if (/kurs pajak|kementerian keuangan/.test(name)) return 'KURS_PAJAK';
    if (/bps/.test(name)) return 'BPS';
    if (/ump|umk|umsk|kemnaker|jdih pemprov/.test(name)) return 'UMP_JDIH';
    if (/djbc|ceisa|customs/.test(name)) return 'DJBC_CEISA';
    if (/esdm/.test(name)) return 'ESDM';
    if (/inaproc.*transaction|riwayat transaksi.*inaproc|e-purchasing transaction/.test(name)) return 'INAPROC_TRANSACTION';
    if (/lkpp open data|data\.lkpp\.go\.id|statistik.*lkpp/.test(name)) return 'LKPP_OPEN_DATA';
    if (/lkpp|inaproc|e-katalog|e-katalog/.test(name)) return 'LKPP';
    if (/principal|oem/.test(name)) return 'PRINCIPAL_QUOTE';
    if (/authorized distributor/.test(name)) return 'AUTH_DISTRIBUTOR_QUOTE';
    if (/supplier quotation|verified comparable/.test(name)) return 'SUPPLIER_QUOTE';
    if (/world bank/.test(name)) return 'WORLD_BANK';
    if (/un comtrade/.test(name)) return 'UN_COMTRADE';
    if (/eia/.test(name)) return 'EIA';
    if (/freight|carrier/.test(name)) return 'FREIGHT_QUOTE';
    if (/marketplace|e-commerce/.test(name)) return 'MARKETPLACE';
    if (/search|google/.test(name)) return 'SEARCH_SNIPPET';
    if (/synthetic|demo|random/.test(name)) return 'SYNTHETIC';
    if (/ai-generated|chatgpt-generated/.test(name)) return 'AI_GENERATED';
    return 'NEWS_BLOG';
  }

  function enrich(source) {
    var key = (source && source.sourceKey) || inferKey(source);
    return Object.assign({}, source || {}, { governance: scoreSource(key, source || {}) });
  }

  function canInfluenceHps(source) {
    var e = source && source.governance ? source : enrich(source);
    if (!e.governance.allowed) return false;
    if (e.governance.grade === 'REJECTED' || e.governance.grade === 'INFORMATIONAL') return false;
    return ['PRIMARY_PRICE', 'SUPPORTING_PRICE', 'COST_DRIVER'].indexOf(e.governance.role) !== -1;
  }

  function registryRows() {
    return Object.keys(REGISTRY).map(function (key) {
      var def = REGISTRY[key];
      return Object.assign({ key: key }, def, scoreSource(key, {}));
    });
  }

  window.HPSSourceEngine = {
    REGISTRY: REGISTRY,
    freshnessScore: freshnessScore,
    scoreSource: scoreSource,
    inferKey: inferKey,
    enrich: enrich,
    canInfluenceHps: canInfluenceHps,
    registryRows: registryRows
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.HPSSourceEngine;
  }
})();
