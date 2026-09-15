/*
 * calc-core.js
 * HPS Intelligence — pure calculation engine + category reference data.
 * No DOM references. Loaded directly in the browser via <script> and
 * also runnable under Node for automated checks.
 *
 * IMPORTANT — DATA INTEGRITY:
 * baseUnitPriceIDR, driver maxDeltaPct ranges, and should-cost splits below
 * are sandbox-only assumptions retained for test mode. They are not
 * live BPS/BI/LKPP/principal data. Every value derived from them is tagged
 * with a status (LIVE / CACHED / STALE / DEMO / USER PROVIDED / INTERNAL /
 * UNAVAILABLE) and must never be displayed or treated as LIVE.
 */

// ---------------------------------------------------------------------------
// Category reference data
// ---------------------------------------------------------------------------

var CATEGORIES = {
  'IT Hardware': {
    subcategories: ['Server', 'Storage', 'Network Equipment', 'Laptop/Desktop', 'Peripherals'],
    baseUnitPriceIDR: 45000000,
    drivers: [
      { name: 'USD/IDR FX Rate', weight: 0.25, maxDeltaPct: 8 },
      { name: 'Component/Semiconductor Trend', weight: 0.15, maxDeltaPct: 10 },
      { name: 'Principal Price Movement', weight: 0.20, maxDeltaPct: 6 },
      { name: 'Technology Lifecycle', weight: 0.10, maxDeltaPct: 5 },
      { name: 'Freight & Logistics', weight: 0.10, maxDeltaPct: 12 },
      { name: 'Import Duty/Tax', weight: 0.10, maxDeltaPct: 4 },
      { name: 'Local Support & Implementation', weight: 0.05, maxDeltaPct: 5 },
      { name: 'Channel Margin', weight: 0.05, maxDeltaPct: 5 },
    ],
    shouldCostSplit: { material: 0.55, freight: 0.06, insurance: 0.01, customs: 0.08, logistics: 0.03, implementation: 0.05, labor: 0.04, warranty: 0.03, overhead: 0.06, margin: 0.07, tax: 0.02 },
  },
  'Software/SaaS': {
    subcategories: ['License', 'Subscription', 'Cloud Service', 'Maintenance/Support'],
    baseUnitPriceIDR: 3500000,
    drivers: [
      { name: 'Principal List Price', weight: 0.30, maxDeltaPct: 7 },
      { name: 'USD/IDR FX Rate', weight: 0.20, maxDeltaPct: 8 },
      { name: 'Subscription Uplift', weight: 0.15, maxDeltaPct: 6 },
      { name: 'Support Tier', weight: 0.10, maxDeltaPct: 4 },
      { name: 'User/License Quantity Tier', weight: 0.15, maxDeltaPct: 5 },
      { name: 'Contract Term Length', weight: 0.05, maxDeltaPct: 3 },
      { name: 'Discount Structure', weight: 0.05, maxDeltaPct: 5 },
    ],
    shouldCostSplit: { material: 0.60, freight: 0, insurance: 0, customs: 0, logistics: 0, implementation: 0.08, labor: 0.05, warranty: 0.05, overhead: 0.07, margin: 0.10, tax: 0.05 },
  },
  'Manpower/BPO': {
    subcategories: ['Outsourced Staffing', 'Managed Service', 'Project-Based Labor'],
    baseUnitPriceIDR: 6500000,
    drivers: [
      { name: 'UMP/UMK Regional Wage', weight: 0.30, maxDeltaPct: 9 },
      { name: 'Salary Benchmark', weight: 0.15, maxDeltaPct: 6 },
      { name: 'THR & Statutory Benefits', weight: 0.15, maxDeltaPct: 5 },
      { name: 'BPJS Contribution', weight: 0.10, maxDeltaPct: 3 },
      { name: 'Overtime Provision', weight: 0.10, maxDeltaPct: 5 },
      { name: 'Productivity Factor', weight: 0.10, maxDeltaPct: 4 },
      { name: 'Operational Overhead', weight: 0.05, maxDeltaPct: 4 },
      { name: 'Supplier Margin', weight: 0.05, maxDeltaPct: 5 },
    ],
    shouldCostSplit: { material: 0, freight: 0, insurance: 0.02, customs: 0, logistics: 0, implementation: 0, labor: 0.68, warranty: 0, overhead: 0.12, margin: 0.12, tax: 0.06 },
  },
  'Construction': {
    subcategories: ['Civil Works', 'MEP', 'Fit-Out', 'Materials Supply'],
    baseUnitPriceIDR: 8500000,
    drivers: [
      { name: 'Construction Price Index', weight: 0.20, maxDeltaPct: 6 },
      { name: 'Materials Cost', weight: 0.30, maxDeltaPct: 10 },
      { name: 'Equipment Rental', weight: 0.10, maxDeltaPct: 5 },
      { name: 'Labor Cost', weight: 0.20, maxDeltaPct: 6 },
      { name: 'Fuel/Logistics', weight: 0.10, maxDeltaPct: 8 },
      { name: 'Regional Factor', weight: 0.10, maxDeltaPct: 5 },
    ],
    shouldCostSplit: { material: 0.45, freight: 0.05, insurance: 0.02, customs: 0.02, logistics: 0.05, implementation: 0, labor: 0.22, warranty: 0.02, overhead: 0.09, margin: 0.06, tax: 0.02 },
  },
  'Data Center': {
    subcategories: ['Colocation', 'Cloud Infrastructure', 'DC Equipment'],
    baseUnitPriceIDR: 25000000,
    drivers: [
      { name: 'Electricity Tariff', weight: 0.25, maxDeltaPct: 7 },
      { name: 'Cooling/PUE Efficiency', weight: 0.10, maxDeltaPct: 5 },
      { name: 'USD/IDR FX Rate', weight: 0.15, maxDeltaPct: 8 },
      { name: 'Imported Equipment Cost', weight: 0.20, maxDeltaPct: 9 },
      { name: 'Operational Labor', weight: 0.10, maxDeltaPct: 4 },
      { name: 'Building/Facility Overhead', weight: 0.10, maxDeltaPct: 4 },
      { name: 'Support/SLA Tier', weight: 0.10, maxDeltaPct: 4 },
    ],
    shouldCostSplit: { material: 0.30, freight: 0.04, insurance: 0.02, customs: 0.05, logistics: 0.03, implementation: 0.05, labor: 0.10, warranty: 0.03, overhead: 0.28, margin: 0.08, tax: 0.02 },
  },
  'Logistics': {
    subcategories: ['Freight Forwarding', 'Trucking/Distribution', 'Warehousing'],
    baseUnitPriceIDR: 4200000,
    drivers: [
      { name: 'Fuel Price', weight: 0.30, maxDeltaPct: 12 },
      { name: 'Toll & Road Fees', weight: 0.10, maxDeltaPct: 5 },
      { name: 'Distance/Route Factor', weight: 0.15, maxDeltaPct: 6 },
      { name: 'Vehicle Cost/Depreciation', weight: 0.10, maxDeltaPct: 4 },
      { name: 'Labor (Driver/Crew)', weight: 0.15, maxDeltaPct: 6 },
      { name: 'Loading/Unloading', weight: 0.10, maxDeltaPct: 4 },
      { name: 'Regional/Route Risk Factor', weight: 0.10, maxDeltaPct: 5 },
    ],
    shouldCostSplit: { material: 0, freight: 0.40, insurance: 0.03, customs: 0.02, logistics: 0.20, implementation: 0, labor: 0.15, warranty: 0, overhead: 0.10, margin: 0.08, tax: 0.02 },
  },
  'Payment Terminal Rental': {
    subcategories: ['EDC Terminal (Rental)', 'mPOS Terminal (Rental)', 'Terminal + SIM Bundle (Rental)'],
    baseUnitPriceIDR: 3800000,
    rentalTermMonths: 36,
    outputBasis: 'perUnitPerMonth',
    bufferStock: [
      { key: 'terminalBuffer', label: 'Terminal buffer stock (spare units)', defaultPct: 1 },
      { key: 'batteryBuffer', label: 'Battery replacement buffer', defaultPct: 10 },
      { key: 'adapterBuffer', label: 'Adapter/charger replacement buffer', defaultPct: 10 },
    ],
    // Vendor-side cost adjustments applied to the rental rate before buffer
    // stock is layered on. principalDiscountPct reduces the base rate
    // (volume/tenure discount negotiated with the vendor). vendorFinancingAPR
    // represents the vendor's own cost of funds (they finance the terminal
    // purchase from a financing company) which they pass through as embedded
    // interest amortized over the rental term — this is the vendor's cost,
    // not Yokke's, but it is a legitimate component of the rate they charge.
    principalDiscountPct: { defaultPct: 0, label: 'Principal/Vendor Discount' },
    vendorFinancingAPR: { defaultPct: 12, label: 'Vendor Financing Cost (embedded interest)' },
    // Two alternate ways to build the vendor's monthly rate. 'listRateMarkup'
    // (default) treats baseUnitPriceIDR as the vendor's rental sticker rate.
    // 'purchasePriceDepreciation' instead straight-line depreciates an actual
    // terminal purchase price over the rental term and adds vendor margin —
    // useful when a vendor's rental pricing logic is transparently cost-plus.
    defaultRateModel: 'listRateMarkup',
    purchasePriceIDR: { defaultValue: 2400000, label: 'Terminal Purchase Price (per unit, IDR)' },
    vendorMarginPct: { defaultPct: 5, label: 'Vendor Margin' },
    drivers: [
      { name: 'USD/IDR FX Rate', weight: 0.18, maxDeltaPct: 8 },
      { name: 'Principal/OEM Unit Price', weight: 0.16, maxDeltaPct: 7 },
      { name: 'Component/Semiconductor Trend', weight: 0.08, maxDeltaPct: 8 },
      { name: 'Battery & Accessory Replacement Cost', weight: 0.10, maxDeltaPct: 10 },
      { name: 'Connectivity/SIM Cost', weight: 0.07, maxDeltaPct: 6 },
      { name: 'Freight & Logistics', weight: 0.06, maxDeltaPct: 10 },
      { name: 'Field Maintenance & Swap Service', weight: 0.09, maxDeltaPct: 6 },
      { name: 'Vendor Financing Cost (embedded interest)', weight: 0.12, maxDeltaPct: 6 },
      { name: 'Financing/Rental Margin', weight: 0.07, maxDeltaPct: 5 },
      { name: 'Principal/Vendor Discount', weight: 0.05, maxDeltaPct: 5 },
      { name: 'Import Duty/Tax', weight: 0.02, maxDeltaPct: 4 },
    ],
    shouldCostSplit: { material: 0.40, freight: 0.05, insurance: 0.02, customs: 0.05, logistics: 0.03, implementation: 0.04, labor: 0.06, warranty: 0.10, overhead: 0.08, margin: 0.08, tax: 0.02, financing: 0.07 },
  },
  'Other': {
    subcategories: ['General Goods', 'General Services'],
    baseUnitPriceIDR: 5000000,
    drivers: [
      { name: 'General Price Index (Category-specific)', weight: 0.30, maxDeltaPct: 6 },
      { name: 'FX Exposure', weight: 0.20, maxDeltaPct: 6 },
      { name: 'Freight/Logistics', weight: 0.15, maxDeltaPct: 6 },
      { name: 'Labor Component', weight: 0.15, maxDeltaPct: 5 },
      { name: 'Supplier Margin', weight: 0.20, maxDeltaPct: 5 },
    ],
    shouldCostSplit: { material: 0.50, freight: 0.08, insurance: 0.02, customs: 0.03, logistics: 0.05, implementation: 0.05, labor: 0.08, warranty: 0.03, overhead: 0.08, margin: 0.06, tax: 0.02 },
  },
};

var CLASSIFICATION_TEMPLATES = {
  'IT Hardware': { commodity: 'Electronics / IT Equipment', productFamily: 'Compute & Storage Hardware', pricingCharacteristic: 'Import-driven, FX-sensitive', importExposure: 'High', laborExposure: 'Low', commodityExposure: 'Moderate (semiconductor)', techLifecycleExposure: 'High', supplierDependency: 'Principal/distributor dependent' },
  'Software/SaaS': { commodity: 'Software License / Subscription', productFamily: 'Enterprise Software', pricingCharacteristic: 'Principal list-price driven', importExposure: 'Moderate (USD billing)', laborExposure: 'Low', commodityExposure: 'Low', techLifecycleExposure: 'Moderate', supplierDependency: 'Principal dependent' },
  'Manpower/BPO': { commodity: 'Outsourced Labor Service', productFamily: 'Manpower / BPO', pricingCharacteristic: 'Wage-index driven', importExposure: 'Low', laborExposure: 'High', commodityExposure: 'Low', techLifecycleExposure: 'Low', supplierDependency: 'Agency/vendor dependent' },
  'Construction': { commodity: 'Construction Works/Materials', productFamily: 'Civil / MEP / Fit-Out', pricingCharacteristic: 'Materials & labor index driven', importExposure: 'Moderate', laborExposure: 'High', commodityExposure: 'High (materials)', techLifecycleExposure: 'Low', supplierDependency: 'Contractor/subcontractor dependent' },
  'Data Center': { commodity: 'Data Center Infrastructure/Service', productFamily: 'Colocation / Cloud Infrastructure', pricingCharacteristic: 'Energy & FX sensitive', importExposure: 'High (equipment)', laborExposure: 'Moderate', commodityExposure: 'Moderate (energy)', techLifecycleExposure: 'Moderate', supplierDependency: 'Facility/equipment principal dependent' },
  'Logistics': { commodity: 'Freight/Distribution Service', productFamily: 'Logistics & Distribution', pricingCharacteristic: 'Fuel & route sensitive', importExposure: 'Low', laborExposure: 'Moderate', commodityExposure: 'High (fuel)', techLifecycleExposure: 'Low', supplierDependency: 'Carrier/fleet dependent' },
  'Payment Terminal Rental': { commodity: 'Payment Terminal Hardware (Managed Rental)', productFamily: 'EDC / mPOS Terminal Fleet', pricingCharacteristic: 'Import-driven, buffer-stock and consumable-replacement sensitive', importExposure: 'High', laborExposure: 'Moderate (field service/swap)', commodityExposure: 'Moderate (semiconductor, battery)', techLifecycleExposure: 'Moderate', supplierDependency: 'Principal/OEM dependent' },
  'Other': { commodity: 'General Goods/Services', productFamily: 'Unclassified', pricingCharacteristic: 'Mixed exposure', importExposure: 'Unknown', laborExposure: 'Unknown', commodityExposure: 'Unknown', techLifecycleExposure: 'Unknown', supplierDependency: 'Unknown' },
};

var SCENARIO_DRIVER_MAP = {
  'USD/IDR FX Rate': 'fx', 'FX Exposure': 'fx',
  'Component/Semiconductor Trend': 'commodity', 'Materials Cost': 'commodity', 'Construction Price Index': 'commodity', 'General Price Index (Category-specific)': 'commodity', 'Electricity Tariff': 'commodity', 'Fuel Price': 'commodity',
  'Freight & Logistics': 'freight', 'Fuel/Logistics': 'freight', 'Freight/Logistics': 'freight', 'Distance/Route Factor': 'freight',
  'UMP/UMK Regional Wage': 'labor', 'Salary Benchmark': 'labor', 'Labor Cost': 'labor', 'Labor (Driver/Crew)': 'labor', 'Labor Component': 'labor', 'Operational Labor': 'labor',
  'Channel Margin': 'margin', 'Supplier Margin': 'margin',
  'Discount Structure': 'volumeDiscount', 'User/License Quantity Tier': 'volumeDiscount',
};

// ---------------------------------------------------------------------------
// Utilities: deterministic pseudo-random (seeded), hashing, percentile
// ---------------------------------------------------------------------------

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sortedArr, p) {
  if (!sortedArr || sortedArr.length === 0) return null;
  if (sortedArr.length === 1) return sortedArr[0];
  const idx = (p / 100) * (sortedArr.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
}

function fmtIDR(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

function categoryOf(name) {
  return CATEGORIES[name] || CATEGORIES['Other'];
}

// ---------------------------------------------------------------------------
// Step 2 — AI Classification (deterministic template + heuristic confidence)
// ---------------------------------------------------------------------------

function generateClassification(input) {
  const t = CLASSIFICATION_TEMPLATES[input.category] || CLASSIFICATION_TEMPLATES['Other'];
  let confidence = 55;
  const words = (input.description || '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 8) confidence += 15;
  if (input.historicalPrice) confidence += 10;
  if (input.subCategory) confidence += 10;
  if (CATEGORIES[input.category]) confidence += 5;
  confidence = Math.min(confidence, 95);
  return Object.assign({}, t, {
    costDriverFamily: input.category,
    confidence,
    corrected: false,
  });
}

// ---------------------------------------------------------------------------
// Step 3 — Knowledge Coverage
// ---------------------------------------------------------------------------

function computeCoverage(input, researched) {
  const words = (input.description || '').trim().split(/\s+/).filter(Boolean);
  const productKnowledge = words.length >= 8 ? 80 : (words.length > 0 ? 50 : 20);
  const categoryKnowledge = CATEGORIES[input.category] ? 85 : 30;
  const historicalData = input.historicalPrice ? 90 : 15;
  const marketCoverage = researched ? 78 : 40;
  const costDriverKnowledge = CATEGORIES[input.category] ? 80 : 35;
  const sourceFreshness = researched ? 80 : 50;
  const overall = Math.round((productKnowledge + categoryKnowledge + historicalData + marketCoverage + costDriverKnowledge + sourceFreshness) / 6);
  const label = overall >= 70 ? 'Sufficient' : (overall >= 40 ? 'Research Required' : 'Low Confidence');
  return { productKnowledge, categoryKnowledge, historicalData, marketCoverage, costDriverKnowledge, sourceFreshness, overall, label };
}

// ---------------------------------------------------------------------------
// Step 4/5 — Research + Source Validation
// ---------------------------------------------------------------------------

var RESEARCH_OBJECTIVES = [
  'Product definition', 'Manufacturer/principal', 'Technical attributes affecting price',
  'Country of origin', 'Pricing model', 'Raw material/component dependencies',
  'FX exposure', 'Freight/logistics exposure', 'Labor exposure', 'Energy exposure',
  'Applicable market indices', 'Comparable products', 'Lifecycle/support costs',
  'Historical market changes', 'Credible benchmark sources',
];


// ---------------------------------------------------------------------------
// Production evidence policy
// ---------------------------------------------------------------------------
// HYBRID_STRICT is the default for new production requests. It never invents
// numerical evidence. DEMO_SANDBOX remains available for testing/training and
// preserves the prototype's deterministic synthetic behaviour.
var CALCULATION_MODES = {
  HYBRID_STRICT: 'HYBRID_STRICT',
  DEMO_SANDBOX: 'DEMO_SANDBOX',
};

var ACCEPTED_EVIDENCE_STATUSES = ['LIVE', 'CACHED', 'INTERNAL', 'USER PROVIDED', 'VERIFIED'];

function calculationModeOf(req) {
  return (req && req.calculationMode) || (req && req.input && req.input.calculationMode) || CALCULATION_MODES.HYBRID_STRICT;
}

function isDemoMode(req) {
  return calculationModeOf(req) === CALCULATION_MODES.DEMO_SANDBOX;
}

function isAcceptedEvidenceStatus(status) {
  return ACCEPTED_EVIDENCE_STATUSES.indexOf(status) !== -1;
}

function parseMarketBenchmarks(input) {
  const raw = input && input.marketBenchmarks;
  if (!raw) return [];
  const vals = Array.isArray(raw) ? raw : String(raw).split(/[;,\n]+/);
  return vals.map(function (v) {
    if (typeof v === 'object' && v !== null) {
      const value = Number(v.value != null ? v.value : v.price);
      return isFinite(value) && value > 0 ? {
        value: value,
        status: v.status || 'USER PROVIDED',
        source: v.source || 'Verified benchmark supplied by user',
        observedAt: v.observedAt || null,
      } : null;
    }
    const n = Number(String(v).trim().replace(/[^0-9.-]/g, ''));
    return isFinite(n) && n > 0 ? { value: n, status: 'USER PROVIDED', source: 'Verified benchmark supplied by user', observedAt: null } : null;
  }).filter(Boolean);
}

function findSource(req, predicate) {
  return ((req && req.sources) || []).filter(predicate)[0] || null;
}

function sourceValue(req, predicate) {
  const src = findSource(req, predicate);
  if (!src || !isAcceptedEvidenceStatus(src.status) || typeof src.value !== 'number') return null;
  return { value: src.value, status: src.status, source: src.name, retrievedAt: src.retrievedAt };
}

function assessRuntimeMode(req, models) {
  const used = Object.keys(models || {}).map(function (k) { return models[k]; }).filter(function (m) { return m && m.value != null; });
  if (!used.length) return { mode: 'BLOCKED', reason: 'No evidence-backed model produced a usable value.' };
  if (used.some(function (m) { return m.status === 'DEMO'; })) return { mode: 'DEMO', reason: 'Synthetic evidence affects the recommendation.' };
  if (used.some(function (m) { return ['HYBRID', 'PARTIAL', 'CACHED', 'STALE'].indexOf(m.status) !== -1; })) return { mode: 'HYBRID', reason: 'Recommendation uses verified evidence with incomplete/stale coverage.' };
  // LIVE is reserved for a recommendation whose *materially used model* is
  // live-backed. Merely having an unrelated live provider in the source
  // registry must not upgrade a user/internal-only recommendation to LIVE.
  const hasLive = used.some(function (m) { return m.status === 'LIVE'; });
  return { mode: hasLive ? 'LIVE' : 'HYBRID', reason: hasLive ? 'Recommendation contains no synthetic numerical evidence and at least one materially used model is live-backed.' : 'Recommendation contains no synthetic numerical evidence but relies on internal/user-provided evidence.' };
}

function generateSources(input, researched) {
  const now = new Date();
  function daysAgo(n) {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }
  const tmpl = CLASSIFICATION_TEMPLATES[input.category] || CLASSIFICATION_TEMPLATES['Other'];
  const sources = [];
  // Tier classification follows the master-skill doc's §31 scheme:
  // A = official government/regulator/principal/audited internal transaction
  // B = established international institution/recognized benchmark
  // C = established commercial market intelligence provider
  // D = marketplace/distributor listing
  // E = unverified internet source (never used to independently set an HPS)
  sources.push({ name: 'Bank Indonesia — USD/IDR Reference Rate (JISDOR)', status: 'UNAVAILABLE', tier: 'A', publishedDate: daysAgo(1), retrievedAt: now.toISOString(), trustScore: 70, freshness: 'Fresh', note: 'BI does not publish a free, key-free JSON API for JISDOR — live override now scrapes their real published indicator page directly (bi.go.id), with a market-rate fallback if that page layout ever changes. See Settings → Data Providers.' });
  // BPS WebAPI is real and well documented (webapi.bps.go.id/developer/) —
  // free registration, JSON, covers IHK/CPI, inflation, IHPB, wage index,
  // construction stats, producer prices, export/import, PDRB, regional
  // stats. The practical blocker: BPS sits behind Cloudflare bot-detection
  // that rejects requests from cloud-provider/serverless IPs — including
  // Cloudflare Workers/Pages Functions themselves — so a same-stack proxy
  // (the approach used for the FX rate below) does not work unmodified;
  // it would need a residential-IP relay.
  sources.push({ name: 'BPS WebAPI — IHK/Inflasi, IHPB, Indeks Upah, Statistik Konstruksi', status: 'UNAVAILABLE', tier: 'A', publishedDate: daysAgo(20), retrievedAt: now.toISOString(), trustScore: 65, freshness: researched ? 'Aging' : 'Stale', note: 'Official BPS WebAPI requires a registered API key and dataset-specific query mapping. This package does not fabricate BPS values when that adapter is not configured.' });
  if (input.category === 'Manpower/BPO' || input.category === 'Construction') {
    sources.push({ name: 'Kemnaker + JDIH Pemprov — UMP/UMK/UMSK Wage Decree', status: 'UNAVAILABLE', tier: 'A', publishedDate: daysAgo(200), retrievedAt: now.toISOString(), trustScore: 80, freshness: 'Aging', note: 'Annual, effective-date based, published per-province as PDF/web decrees — no structured API exists; verify the current year decree before finalizing.' });
  }
  if (input.category === 'IT Hardware' || input.category === 'Data Center') {
    sources.push({ name: 'Principal/Distributor Indicative Price List', status: 'UNAVAILABLE', tier: 'A', publishedDate: daysAgo(45), retrievedAt: now.toISOString(), trustScore: 72, freshness: 'Aging' });
  }
  if (/^High/.test(tmpl.importExposure)) {
    sources.push({ name: 'DJBC/CEISA 4.0 — Customs Value (NDPBM) & HS Tariff', status: 'UNAVAILABLE', tier: 'A', publishedDate: daysAgo(30), retrievedAt: now.toISOString(), trustScore: 75, freshness: 'Aging', note: 'Real OAuth2.0 Open API exists (apis-gw.beacukai.go.id), but requires registration as a DJBC "Pengguna Jasa" (importer/PPJK) business account — not an anonymous public endpoint.' });
    sources.push({ name: 'Kementerian Keuangan — Kurs Pajak (Weekly Customs/Tax Settlement Rate)', status: 'UNAVAILABLE', tier: 'A', publishedDate: daysAgo(3), retrievedAt: now.toISOString(), trustScore: 98, freshness: 'Fresh', note: 'Real, free, official weekly customs/tax rate (fiskal.kemenkeu.go.id) used by DJBC/DJP to settle import duty, VAT and PPh — more precise than JISDOR for actual customs exposure, not just a market reference.' });
    sources.push({ name: 'UN Comtrade — International Trade Price Benchmark', status: 'UNAVAILABLE', tier: 'B', publishedDate: daysAgo(60), retrievedAt: now.toISOString(), trustScore: 70, freshness: 'Stale', note: 'Real API exists but the free tier requires a registered subscription key with a limited call quota — not wired up in this prototype.' });
    sources.push({ name: 'Freightos (FBX) — Ocean/Air Freight Benchmark', status: 'UNAVAILABLE', tier: 'C', publishedDate: daysAgo(7), retrievedAt: now.toISOString(), trustScore: 68, freshness: 'Aging', note: 'Commercial/licensed data product — needs a paid Freightos API subscription, not a free public endpoint. Treat as a benchmark, never a guaranteed executable quote.' });
  }
  if (input.category === 'Logistics') {
    sources.push({ name: 'Baltic Exchange — Dry Bulk/Tanker Shipping Indices', status: 'UNAVAILABLE', tier: 'C', publishedDate: daysAgo(7), retrievedAt: now.toISOString(), trustScore: 65, freshness: 'Aging', note: 'Commercial/licensed market data — most relevant for bulk commodities, heavy equipment, and tanker-related shipping exposure; check access rights before relying on it.' });
  }
  if (tmpl.commodityExposure && /energy|fuel/i.test(tmpl.commodityExposure)) {
    sources.push({ name: 'Kementerian ESDM — Electricity Tariff Regulation & Energy Reference Price', status: 'UNAVAILABLE', tier: 'A', publishedDate: daysAgo(15), retrievedAt: now.toISOString(), trustScore: 74, freshness: 'Aging', note: 'Real, free, accessible: the electricity tariff regulation (Permen ESDM No. 7/2024, jdih.esdm.go.id) publishes the full base tariff table and adjustment formula (referencing kurs, ICP, inflation, HBA). ICP itself is published monthly as real press releases, but has no stable single-page/RSS feed to scrape reliably — see live override below for the regulation connection check.' });
    sources.push({ name: 'EIA — Brent/WTI Crude & Petroleum Product Prices', status: 'UNAVAILABLE', tier: 'B', publishedDate: daysAgo(2), retrievedAt: now.toISOString(), trustScore: 78, freshness: 'Fresh', note: 'Official EIA Open Data API v2. Configure EIA_API_KEY in Cloudflare to activate the Brent adapter. Use as a cost driver, not a direct proxy for landed logistics cost.' });
  }
  if (input.historicalPrice) {
    sources.push({ name: 'Internal Historical Purchase Record', status: 'INTERNAL', tier: 'A', value: Number(input.historicalPrice), publishedDate: input.historicalDate || daysAgo(180), retrievedAt: now.toISOString(), trustScore: 88, freshness: 'Fresh' });
  }
  if (input.supplierQuotation) {
    sources.push({ name: 'Supplier Quotation (as provided)', status: 'USER PROVIDED', tier: 'A', value: Number(input.supplierQuotation), publishedDate: daysAgo(2), retrievedAt: now.toISOString(), trustScore: 75, freshness: 'Fresh' });
  }
  if (input.principalQuotation) {
    sources.push({ name: 'Principal Quotation (as provided)', status: 'USER PROVIDED', tier: 'A', value: Number(input.principalQuotation), publishedDate: daysAgo(3), retrievedAt: now.toISOString(), trustScore: 78, freshness: 'Fresh' });
  }
  if (researched) {
    sources.push({ name: 'LKPP Open Data — Procurement/Tender Benchmark (SIRUP/E-Katalog)', status: 'UNAVAILABLE', tier: 'A', publishedDate: daysAgo(14), retrievedAt: now.toISOString(), trustScore: 76, freshness: 'Fresh', note: 'Real CKAN Action API at data.lkpp.go.id, confirmed reachable — live override below pulls the real dataset metadata (last-updated date, direct download link). The underlying E-Katalog transaction dataset itself is only published as an annual XLSX, not a live JSON feed, so the parsed value is a freshness/link check, not an extracted price.' });
    sources.push({ name: 'World Bank Indicators — Macro/Commodity Sanity Check', status: 'UNAVAILABLE', tier: 'B', publishedDate: daysAgo(30), retrievedAt: now.toISOString(), trustScore: 66, freshness: 'Aging', note: 'api.worldbank.org/v2 is genuinely free and keyless — see live override below once wired up (fx-sync.js pattern). Macro validation only, not a primary Indonesia item-pricing source.' });
    sources.push({ name: 'Bank Indonesia — BI-Rate (Financing/Cost of Money)', status: 'UNAVAILABLE', tier: 'A', publishedDate: daysAgo(1), retrievedAt: now.toISOString(), trustScore: 80, freshness: 'Fresh', note: 'Live scrape of the same bi.go.id indicator page as JISDOR — useful for pricing financing cost, leasing, or long payment-term exposure.' });
    if (tmpl.commodityExposure && /energy|fuel|materials/i.test(tmpl.commodityExposure)) {
      sources.push({ name: 'World Bank Commodity Markets (Pink Sheet)', status: 'UNAVAILABLE', tier: 'B', publishedDate: daysAgo(30), retrievedAt: now.toISOString(), trustScore: 68, freshness: 'Aging', note: 'Published monthly as an Excel workbook, not a REST API — would need a scheduled download+parse job rather than a simple live proxy. Use for long-term commodity trend/reasonableness, not a spot price.' });
    }
    sources.push({ name: 'Satu Data Indonesia — Cross-Ministry Supplemental Data', status: 'UNAVAILABLE', tier: 'A', publishedDate: daysAgo(25), retrievedAt: now.toISOString(), trustScore: 58, freshness: 'Aging', note: 'CKAN-based portal (data.go.id); coverage and structure vary widely by ministry/agency dataset — validate each dataset individually before relying on it.' });
  }
  // Production policy: unconnected placeholders are never labelled DEMO
  // unless the request explicitly opted into DEMO_SANDBOX. Live override
  // functions below may upgrade a matching source to LIVE/CACHED/STALE.
  if ((input.calculationMode || CALCULATION_MODES.HYBRID_STRICT) !== CALCULATION_MODES.DEMO_SANDBOX) {
    return sources.map(function (src) {
      if (src.status !== 'DEMO') return src;
      return Object.assign({}, src, {
        status: 'UNAVAILABLE',
        freshness: src.freshness || 'Stale',
        note: (src.note ? src.note + ' ' : '') + 'Production guard: no numerical value from this source is used until a verified adapter or uploaded evidence is available.',
      });
    });
  }
  return sources;
}

// Pure post-processing step: layers a real fetched USD/IDR rate onto the
// synthetic JISDOR source entry above, without making generateSources()
// itself async/impure (it stays deterministic and unit-testable). Called
// by app.js after a live rate has been fetched via the Cloudflare Pages
// Function proxy (see fx-sync.js). Never fabricates a LIVE status on its
// own — if liveFx is null/missing, the source remains unavailable
// unchanged.
function applyLiveFxOverride(sources, liveFx) {
  if (!liveFx || typeof liveFx.rate !== 'number') return sources;
  const ageHours = (Date.now() - new Date(liveFx.retrievedAt).getTime()) / 36e5;
  const status = ageHours <= 6 ? 'LIVE' : (ageHours <= 48 ? 'CACHED' : 'STALE');
  const freshness = ageHours <= 6 ? 'Fresh' : (ageHours <= 48 ? 'Aging' : 'Stale');
  const isOfficialJisdor = /Bank Indonesia JISDOR/i.test(liveFx.source || '');
  return sources.map(function (s) {
    if (s.name !== 'Bank Indonesia — USD/IDR Reference Rate (JISDOR)') return s;
    return Object.assign({}, s, {
      name: isOfficialJisdor ? 'Bank Indonesia — USD/IDR Reference Rate (JISDOR)' : 'USD/IDR Market Reference Rate (fallback)',
      status: isOfficialJisdor ? status : 'INFORMATIONAL',
      value: liveFx.rate,
      publishedDate: liveFx.publishedDateRaw || (liveFx.publishedAt || liveFx.retrievedAt || '').slice(0, 10),
      retrievedAt: liveFx.retrievedAt,
      trustScore: isOfficialJisdor ? 98 : 45,
      freshness: freshness,
      note: isOfficialJisdor
        ? 'Official live JISDOR observation parsed from Bank Indonesia’s published indicator page. Source: ' + liveFx.source + '.'
        : 'Live fallback market USD/IDR reference because the BI JISDOR page could not be parsed. Source: ' + (liveFx.source || 'external FX provider') + '. Treat as market reference, not official JISDOR.',
    });
  });
}

// ---------------------------------------------------------------------------
// Step 6 — Cost Driver Engine
// ---------------------------------------------------------------------------

function generateCostDrivers(req) {
  const cat = categoryOf(req.input.category);
  if (isDemoMode(req)) {
    const seed = hashStr(req.id + '|' + req.input.category + '|' + req.input.productName);
    const rnd = mulberry32(seed);
    return cat.drivers.map((d) => ({
      name: d.name,
      weight: d.weight,
      delta: +(((rnd() * 2) - 1) * d.maxDeltaPct).toFixed(2),
      status: 'DEMO',
      source: 'Deterministic sandbox generator',
    }));
  }

  const observations = (req.input.costDriverObservations || []);
  const fx = sourceValue(req, function (src) { return /USD\/IDR/.test(src.name); });
  const historicalFx = Number(req.input.historicalFxRate);

  return cat.drivers.map(function (d) {
    let delta = null, status = 'UNAVAILABLE', source = 'No verified observation supplied';
    const obs = observations.filter(function (o) { return o && o.name === d.name; })[0];
    if (obs) {
      if (isFinite(Number(obs.deltaPct))) delta = Number(obs.deltaPct);
      else if (isFinite(Number(obs.currentValue)) && isFinite(Number(obs.baselineValue)) && Number(obs.baselineValue) !== 0) {
        delta = ((Number(obs.currentValue) / Number(obs.baselineValue)) - 1) * 100;
      }
      if (delta != null) {
        status = obs.status || 'USER PROVIDED';
        source = obs.source || 'Verified cost-driver observation supplied by user';
      }
    }

    if (delta == null && d.name === 'USD/IDR FX Rate' && fx && historicalFx > 0) {
      delta = ((fx.value / historicalFx) - 1) * 100;
      status = fx.status === 'LIVE' ? 'LIVE' : fx.status;
      source = fx.source + ' vs user-provided historical FX baseline';
    }

    if (delta == null && /Principal/.test(d.name) && Number(req.input.principalQuotation) > 0 && Number(req.input.historicalPrice) > 0) {
      delta = ((Number(req.input.principalQuotation) / Number(req.input.historicalPrice)) - 1) * 100;
      status = 'USER PROVIDED';
      source = 'Principal quotation vs historical purchase price';
    }

    return {
      name: d.name,
      weight: d.weight,
      delta: delta == null ? 0 : +(delta.toFixed(2)),
      status: status,
      source: source,
      verified: delta != null && status !== 'DEMO' && status !== 'UNAVAILABLE',
    };
  });
}

function scenarioAdjustment(driverName, scenario) {
  const key = SCENARIO_DRIVER_MAP[driverName];
  if (!key || !scenario) return 0;
  return (scenario[key] || 0) / 100;
}

function estimateBasePrice(input) {
  const cat = categoryOf(input.category);
  const qty = Math.max(1, Number(input.quantity) || 1);
  const unitRate = adjustedUnitRate(input, cat);
  const coreTotal = unitRate * qty;
  if (cat.bufferStock) {
    return coreTotal + bufferStockCost(input, cat, qty, unitRate);
  }
  return coreTotal;
}

// Applies vendor-side rate adjustments to the category base rate.
// For rentalTermMonths categories, baseUnitPriceIDR is a PER-UNIT-PER-MONTH
// rate (not a one-time purchase price). Order mirrors how a vendor actually
// builds a rental quote: start from list rate, net off the principal/tenure
// discount, then add back their own cost of funds (they financed the
// terminal purchase from a financing company, amortized straight-line over
// the contract term and expressed as a monthly add-on per unit).
function getRateModel(input, cat) {
  return input.rateModel || cat.defaultRateModel || 'listRateMarkup';
}

function listRateMarkupRate(input, cat) {
  let rate = cat.baseUnitPriceIDR;
  if (cat.principalDiscountPct) {
    const discPct = (input.principalDiscountPct != null ? Number(input.principalDiscountPct) : cat.principalDiscountPct.defaultPct) / 100;
    rate = rate * (1 - discPct);
  }
  if (cat.vendorFinancingAPR && cat.rentalTermMonths) {
    const apr = (input.vendorFinancingAPR != null ? Number(input.vendorFinancingAPR) : cat.vendorFinancingAPR.defaultPct) / 100;
    const termYears = cat.rentalTermMonths / 12;
    // Simple interest on the discounted unit cost over the full term,
    // spread evenly across each month of the rental period.
    const totalInterestPerUnit = rate * apr * termYears;
    const financingPerMonth = totalInterestPerUnit / cat.rentalTermMonths;
    rate = rate + financingPerMonth;
  }
  return rate;
}

// Alternate rate build-up: straight-line depreciate an actual terminal
// purchase price over the rental term, add the vendor's financing cost on
// the (discounted) purchase price, then apply the vendor's margin on top of
// their all-in cost. Distinct from listRateMarkup, which starts from a
// rental sticker rate rather than a purchase price.
function purchaseDepreciationRate(input, cat) {
  const purchasePrice = input.purchasePriceIDR != null ? Number(input.purchasePriceIDR) : cat.purchasePriceIDR.defaultValue;
  const discPct = (input.principalDiscountPct != null ? Number(input.principalDiscountPct) : cat.principalDiscountPct.defaultPct) / 100;
  const discountedPrice = purchasePrice * (1 - discPct);
  const termMonths = cat.rentalTermMonths;
  const baseMonthly = discountedPrice / termMonths;
  const apr = (input.vendorFinancingAPR != null ? Number(input.vendorFinancingAPR) : cat.vendorFinancingAPR.defaultPct) / 100;
  const termYears = termMonths / 12;
  const totalInterest = discountedPrice * apr * termYears;
  const financingPerMonth = totalInterest / termMonths;
  const netCost = baseMonthly + financingPerMonth;
  const marginPct = (input.vendorMarginPct != null ? Number(input.vendorMarginPct) : cat.vendorMarginPct.defaultPct) / 100;
  const marginAmount = netCost * marginPct;
  const finalRate = netCost + marginAmount;
  return { purchasePrice, discPct, discountedPrice, baseMonthly, apr, financingPerMonth, netCost, marginPct, marginAmount, finalRate };
}

function adjustedUnitRate(input, cat) {
  if (getRateModel(input, cat) === 'purchasePriceDepreciation' && cat.purchasePriceIDR) {
    return purchaseDepreciationRate(input, cat).finalRate;
  }
  return listRateMarkupRate(input, cat);
}

// Buffer stock / consumable-replacement add-on (e.g. Payment Terminal Rental:
// spare terminal units, battery and adapter/charger replacement stock).
// Each buffer is a percentage of the core unit count, costed at the same
// per-unit base price unless the category defines a different unit cost.
function bufferStockCost(input, cat, qty, unitRate) {
  const defs = cat.bufferStock || [];
  const overrides = (input.bufferOverridesPct) || {};
  const rate = unitRate != null ? unitRate : cat.baseUnitPriceIDR;
  let total = 0;
  defs.forEach((b) => {
    const pct = (overrides[b.key] != null ? Number(overrides[b.key]) : b.defaultPct) / 100;
    total += rate * qty * pct;
  });
  return total;
}

// Per-line breakdown of the buffer stock add-on, for display in the UI.
function bufferStockBreakdown(input) {
  const cat = categoryOf(input.category);
  if (!cat.bufferStock) return null;
  const qty = Math.max(1, Number(input.quantity) || 1);
  const unitRate = adjustedUnitRate(input, cat);
  const overrides = (input.bufferOverridesPct) || {};
  const lines = cat.bufferStock.map((b) => {
    const pct = (overrides[b.key] != null ? Number(overrides[b.key]) : b.defaultPct);
    const amount = unitRate * qty * (pct / 100);
    return { key: b.key, label: b.label, pct, amount, status: overrides[b.key] != null ? 'USER PROVIDED' : 'DEMO' };
  });
  const coreTotal = unitRate * qty;
  const bufferTotal = lines.reduce((s, l) => s + l.amount, 0);
  const rateAdjustments = rateAdjustmentBreakdown(input, cat);
  return { lines, coreTotal, bufferTotal, grandTotal: coreTotal + bufferTotal, rentalTermMonths: cat.rentalTermMonths || null, unitRate, rateAdjustments, outputBasis: cat.outputBasis || null };
}

// Explicit line-by-line view of how list rate -> discounted -> financed rate,
// for display so the discount and financing cost are never hidden inside a
// single opaque number.
function rateAdjustmentBreakdown(input, cat) {
  if (!cat.principalDiscountPct && !cat.vendorFinancingAPR) return null;
  if (getRateModel(input, cat) === 'purchasePriceDepreciation' && cat.purchasePriceIDR) {
    const d = purchaseDepreciationRate(input, cat);
    const lines = [
      { label: cat.principalDiscountPct.label, pct: -d.discPct * 100, amount: -(d.purchasePrice * d.discPct), status: input.principalDiscountPct != null ? 'USER PROVIDED' : 'DEMO', note: 'Applied to purchase price, not the monthly rate', kind: 'discount' },
      { label: 'Straight-line depreciation (\u00f7 ' + cat.rentalTermMonths + ' months)', pct: null, amount: d.baseMonthly, status: 'CALCULATED', note: 'Discounted purchase price \u00f7 rental term', kind: 'neutral' },
      { label: cat.vendorFinancingAPR.label, pct: d.apr * 100, amount: d.financingPerMonth, status: input.vendorFinancingAPR != null ? 'USER PROVIDED' : 'DEMO', note: 'Simple interest on discounted purchase price, amortized over ' + cat.rentalTermMonths + ' months', kind: 'surcharge' },
      { label: cat.vendorMarginPct.label, pct: d.marginPct * 100, amount: d.marginAmount, status: input.vendorMarginPct != null ? 'USER PROVIDED' : 'DEMO', note: 'Markup on vendor\u2019s all-in monthly cost', kind: 'surcharge' },
    ];
    return { rateModel: 'purchasePriceDepreciation', purchasePrice: d.purchasePrice, listRate: d.baseMonthly, lines, finalRate: d.finalRate };
  }
  const listRate = cat.baseUnitPriceIDR;
  let rate = listRate;
  const lines = [];
  if (cat.principalDiscountPct) {
    const discPct = (input.principalDiscountPct != null ? Number(input.principalDiscountPct) : cat.principalDiscountPct.defaultPct) / 100;
    const amount = -(rate * discPct);
    rate = rate + amount;
    lines.push({ label: cat.principalDiscountPct.label, pct: -discPct * 100, amount, status: input.principalDiscountPct != null ? 'USER PROVIDED' : 'DEMO', kind: 'discount' });
  }
  if (cat.vendorFinancingAPR && cat.rentalTermMonths) {
    const apr = (input.vendorFinancingAPR != null ? Number(input.vendorFinancingAPR) : cat.vendorFinancingAPR.defaultPct) / 100;
    const termYears = cat.rentalTermMonths / 12;
    const financingPerMonth = (rate * apr * termYears) / cat.rentalTermMonths;
    rate = rate + financingPerMonth;
    lines.push({ label: cat.vendorFinancingAPR.label, pct: apr * 100, amount: financingPerMonth, status: input.vendorFinancingAPR != null ? 'USER PROVIDED' : 'DEMO', note: 'Vendor\u2019s cost of funds, amortized over ' + cat.rentalTermMonths + ' months', kind: 'surcharge' });
  }
  return { rateModel: 'listRateMarkup', listRate, lines, finalRate: rate };
}

function shouldCostStack(input, base) {
  const cat = categoryOf(input.category);
  const split = cat.shouldCostSplit;
  const stack = {};
  let total = 0;
  Object.keys(split).forEach((k) => {
    const v = Math.round(base * split[k]);
    stack[k] = v;
    total += v;
  });
  stack.total = total;
  return stack;
}

// ---------------------------------------------------------------------------
// Step 7 — HPS Calculation Models
// ---------------------------------------------------------------------------

function modelA(req) {
  const p0 = Number(req.input.historicalPrice);
  if (!p0) return { value: null, status: 'UNAVAILABLE', reason: 'Missing historical purchase price — Model A not used.' };

  if (isDemoMode(req)) {
    let escalation = 0;
    (req.costDrivers || []).forEach(function (d) {
      escalation += d.weight * ((d.delta / 100) + scenarioAdjustment(d.name, req.scenario));
    });
    return { value: p0 * (1 + escalation), status: 'DEMO', basisStatus: 'USER PROVIDED', escalationPct: +(escalation * 100).toFixed(2), basis: p0, driverCoverage: 1 };
  }

  const usable = (req.costDrivers || []).filter(function (d) { return d && d.verified && isAcceptedEvidenceStatus(d.status); });
  const coverage = usable.reduce(function (sum, d) { return sum + Number(d.weight || 0); }, 0);
  if (coverage < 0.15) {
    return { value: null, status: 'INSUFFICIENT', reason: 'Historical price exists, but verified cost-driver coverage is below 15%. Supply a historical FX baseline or verified driver observations.', driverCoverage: coverage };
  }
  let escalation = 0;
  usable.forEach(function (d) { escalation += d.weight * (d.delta / 100); });
  // Scenario values are an explicit user-controlled what-if overlay. They
  // may affect an otherwise verified baseline even when the corresponding
  // live driver is unavailable; they are never treated as observed evidence.
  let scenarioOverlay = 0;
  (req.costDrivers || []).forEach(function (d) { scenarioOverlay += d.weight * scenarioAdjustment(d.name, req.scenario); });
  escalation += scenarioOverlay;
  const status = scenarioOverlay !== 0 ? 'HYBRID' : (coverage >= 0.75 && usable.every(function (d) { return d.status === 'LIVE' || d.status === 'INTERNAL' || d.status === 'USER PROVIDED' || d.status === 'VERIFIED'; }) ? 'LIVE' : 'HYBRID');
  return { value: p0 * (1 + escalation), status: status, basisStatus: 'INTERNAL', escalationPct: +(escalation * 100).toFixed(2), scenarioOverlayPct: +(scenarioOverlay * 100).toFixed(2), basis: p0, driverCoverage: +coverage.toFixed(2), usedDrivers: usable.map(function (d) { return d.name; }) };
}

function modelB(req) {
  if (isDemoMode(req)) {
    const base = estimateBasePrice(req.input);
    const rnd = mulberry32(hashStr(req.id + '|B'));
    const points = [];
    for (let i = 0; i < 7; i++) points.push(base * (1 + ((rnd() * 0.30) - 0.15)));
    const sortedAll = [...points].sort((a, b) => a - b);
    const q1 = percentile(sortedAll, 25), q3 = percentile(sortedAll, 75), iqr = q3 - q1;
    const filtered = points.filter((p) => p >= q1 - 1.5 * iqr && p <= q3 + 1.5 * iqr);
    const sortedFiltered = [...filtered].sort((a, b) => a - b);
    return { value: percentile(sortedFiltered, 50), low: Math.min(...filtered), high: Math.max(...filtered), status: 'DEMO', n: filtered.length, points: filtered };
  }

  const observations = parseMarketBenchmarks(req.input).filter(function (o) { return isAcceptedEvidenceStatus(o.status); });
  if (observations.length < 3) return { value: null, status: 'INSUFFICIENT', reason: 'Model B requires at least 3 verified comparable prices. Synthetic comparables are disabled in production mode.', n: observations.length };
  const points = observations.map(function (o) { return o.value; });
  const sortedAll = [...points].sort((a, b) => a - b);
  const q1 = percentile(sortedAll, 25), q3 = percentile(sortedAll, 75), iqr = q3 - q1;
  const filteredObs = observations.filter(function (o) { return o.value >= q1 - 1.5 * iqr && o.value <= q3 + 1.5 * iqr; });
  if (filteredObs.length < 3) return { value: null, status: 'INSUFFICIENT', reason: 'Fewer than 3 verified comparables remain after outlier removal.', n: filteredObs.length };
  const filtered = filteredObs.map(function (o) { return o.value; });
  const sortedFiltered = [...filtered].sort((a, b) => a - b);
  const statuses = filteredObs.map(function (o) { return o.status; });
  const status = statuses.every(function (st) { return st === 'LIVE'; }) ? 'LIVE' : 'USER PROVIDED';
  return { value: percentile(sortedFiltered, 50), low: Math.min(...filtered), high: Math.max(...filtered), status: status, n: filtered.length, points: filtered, observations: filteredObs };
}

function modelC(req) {
  if (isDemoMode(req)) {
    const base = estimateBasePrice(req.input);
    const stack = shouldCostStack(req.input, base);
    return { value: stack.total, status: 'DEMO', stack, base };
  }
  const base = Number(req.input.shouldCostBase);
  if (!base || base <= 0) return { value: null, status: 'UNAVAILABLE', reason: 'Verified should-cost base is not supplied. Hard-coded category base prices are disabled in production mode.' };
  const stack = shouldCostStack(req.input, base);
  return { value: stack.total, status: 'USER PROVIDED', stack, base, note: 'Total is driven by the verified should-cost base. Category split is explanatory allocation and does not inflate the total.' };
}

function modelD(req, learningEvents) {
  const all = (learningEvents || []).filter(function (e) { return e.category === req.input.category; });
  const events = isDemoMode(req) ? all : all.filter(function (e) { return e.approvedForLearning === true && e.sourceMode !== 'DEMO'; });
  if (!req.input.historicalPrice || events.length < 3) {
    return { value: null, status: 'UNAVAILABLE', reason: 'Need at least 3 approved, non-demo outcome learning events in this category for Model D.' };
  }
  const avgBiasPct = events.reduce((s, e) => s + (e.bias || 0), 0) / events.length;
  const p0 = Number(req.input.historicalPrice);
  const value = p0 * (1 + (avgBiasPct / 100));
  return { value, status: isDemoMode(req) ? 'DEMO' : 'INTERNAL', note: 'Derived from approved historical prediction bias; correlation, not causation.', sampleSize: events.length };
}

// ---------------------------------------------------------------------------
// Step 8 — Triangulation
// ---------------------------------------------------------------------------

// For rental categories, model B/C/triangulated values are computed as
// (per-unit-per-month rate x quantity) — i.e. total monthly fleet cost.
// This converts a total figure back to the agreed display basis
// (per unit per month) for categories where outputBasis is set.
function toDisplayBasis(totalValue, input) {
  if (totalValue == null) return totalValue;
  const cat = categoryOf(input.category);
  if (cat.outputBasis === 'perUnitPerMonth') {
    const qty = Math.max(1, Number(input.quantity) || 1);
    return totalValue / qty;
  }
  return totalValue;
}

function triangulate(models, weightOverride, calculationMode) {
  const weightsDefault = weightOverride || { A: 0.30, B: 0.30, C: 0.30, D: 0.10 };
  const strict = (calculationMode || CALCULATION_MODES.HYBRID_STRICT) !== CALCULATION_MODES.DEMO_SANDBOX;
  const available = Object.entries(models).filter(function (entry) {
    const m = entry[1];
    if (!m || m.value == null) return false;
    if (strict && m.status === 'DEMO') return false;
    return true;
  });
  if (available.length === 0) {
    return { recommended: null, low: null, high: null, weightsUsed: {}, weightsExact: {}, error: 'No evidence-backed model produced a usable value. Add verified market benchmarks, a verified should-cost base, or enough historical driver evidence.' };
  }
  const sumW = available.reduce((s, entry) => s + (weightsDefault[entry[0]] || 0), 0) || 1;
  const recommended = available.reduce((s, entry) => s + ((weightsDefault[entry[0]] || 0) / sumW) * entry[1].value, 0);
  const values = available.map((entry) => entry[1].value);
  const low = Math.min(...values), high = Math.max(...values);
  const weightsUsed = {}, weightsExact = {};
  available.forEach(function (entry) {
    const k = entry[0], w = (weightsDefault[k] || 0) / sumW;
    weightsExact[k] = w; weightsUsed[k] = +(w.toFixed(2));
  });
  return { recommended, low, high, weightsUsed, weightsExact };
}

// ---------------------------------------------------------------------------
// Step 9 — Confidence Score
// ---------------------------------------------------------------------------

function computeConfidence(req, models, sources, coverage) {
  const available = Object.values(models).filter((m) => m && m.value != null && (!isDemoMode(req) ? m.status !== 'DEMO' : true));
  const values = available.map((m) => m.value);
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const variance = values.length ? values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length : 0;
  const cv = mean ? Math.sqrt(variance) / mean : 1;
  const modelAgreement = Math.max(0, 100 * (1 - Math.min(cv, 1)));
  const acceptedSources = (sources || []).filter(function (src) {
    if (!isAcceptedEvidenceStatus(src.status) || typeof src.value !== 'number') return false;
    if (src.governance && (!src.governance.allowed || src.governance.role === 'CONTEXT' || src.governance.role === 'DISCOVERY_ONLY' || src.governance.role === 'REJECTED')) return false;
    return true;
  });
  const avgTrust = acceptedSources.length ? acceptedSources.reduce((s, src) => s + src.trustScore, 0) / acceptedSources.length : 40;
  const freshnessScore = acceptedSources.length ? (acceptedSources.filter((s) => s.freshness === 'Fresh').length / acceptedSources.length) * 100 : 30;
  const words = (req.input.description || '').trim().split(/\s+/).filter(Boolean);
  const specSimilarity = words.length >= 8 ? 80 : 50;
  const benchmarkCountScore = models.B && models.B.n ? Math.min(models.B.n * 15, 100) : 15;
  const historicalCoverage = req.input.historicalPrice ? 90 : 20;
  const completeness = coverage.overall;
  const weighted = (avgTrust * 0.15) + (freshnessScore * 0.10) + (specSimilarity * 0.10) + (benchmarkCountScore * 0.15) + (historicalCoverage * 0.15) + (modelAgreement * 0.15) + (completeness * 0.20);
  let score = Math.round(Math.min(Math.max(weighted, 0), 100));
  const hasDemoModel = available.some((m) => m.status === 'DEMO');
  const hasPartialModel = available.some((m) => m.status === 'HYBRID' || m.status === 'PARTIAL');
  let capped = false;
  if (hasDemoModel && score > 64) { score = 64; capped = true; }
  else if (hasPartialModel && score > 79) { score = 79; capped = true; }
  const label = score >= 90 ? 'Very High' : (score >= 80 ? 'High' : (score >= 70 ? 'Moderate' : (score >= 60 ? 'Low' : 'Insufficient Data')));
  return { score, label, capped, components: { avgTrust, freshnessScore, specSimilarity, benchmarkCountScore, historicalCoverage, modelAgreement, completeness, acceptedSourceCount: acceptedSources.length } };
}

// Same pattern as applyLiveFxOverride, for the World Bank Indicators line.
// api.worldbank.org/v2 is genuinely free and keyless (confirmed), unlike
// most of the other sources above — a real candidate for live wiring, not
// just a cosmetic DEMO tag.
function applyLiveWbOverride(sources, liveWb) {
  if (!liveWb || typeof liveWb.value !== 'number') return sources;
  const ageHours = (Date.now() - new Date(liveWb.retrievedAt).getTime()) / 36e5;
  const status = ageHours <= 24 ? 'LIVE' : (ageHours <= 168 ? 'CACHED' : 'STALE');
  const freshness = ageHours <= 24 ? 'Fresh' : (ageHours <= 168 ? 'Aging' : 'Stale');
  return sources.map(function (s) {
    if (s.name !== 'World Bank Indicators — Macro/Commodity Sanity Check') return s;
    return Object.assign({}, s, {
      status: status,
      value: liveWb.value,
      publishedDate: liveWb.year ? (liveWb.year + '-01-01') : s.publishedDate,
      retrievedAt: liveWb.retrievedAt,
      trustScore: 74,
      freshness: freshness,
      note: 'Live: ' + (liveWb.indicatorLabel || 'World Bank indicator') + ' for Indonesia = ' + liveWb.value + ' (year ' + liveWb.year + '), via api.worldbank.org/v2 — free, official, keyless.',
    });
  });
}

// Same pattern again, for the LKPP line — but deliberately lighter-touch:
// this only ever upgrades freshness/link metadata to a real value, never
// fabricates a parsed price from the underlying annual XLSX dataset (see
// functions/api/lkpp-status.js for why).
function applyLiveLkppOverride(sources, liveLkpp) {
  if (!liveLkpp || !liveLkpp.metadataModified) return sources;
  const ageDays = (Date.now() - new Date(liveLkpp.retrievedAt).getTime()) / 864e5;
  const status = ageDays <= 7 ? 'LIVE' : (ageDays <= 30 ? 'CACHED' : 'STALE');
  const freshness = ageDays <= 7 ? 'Fresh' : (ageDays <= 30 ? 'Aging' : 'Stale');
  return sources.map(function (s) {
    if (s.name !== 'LKPP Open Data — Procurement/Tender Benchmark (SIRUP/E-Katalog)') return s;
    return Object.assign({}, s, {
      status: status,
      publishedDate: (liveLkpp.metadataModified || '').slice(0, 10),
      retrievedAt: liveLkpp.retrievedAt,
      freshness: freshness,
      note: 'Live connection confirmed to data.lkpp.go.id \u2014 dataset "' + liveLkpp.dataset + '" last updated ' + (liveLkpp.metadataModified || '').slice(0, 10) + '. Published as ' + (liveLkpp.format || 'XLSX') + ', not a live feed \u2014 this confirms real freshness, not a live price.',
    });
  });
}

// Same pattern, for the Kurs Pajak (customs/tax settlement rate) line —
// scraped from Kemenkeu's real, free, official weekly table (see
// functions/api/kurs-pajak.js).
function applyLiveKursPajakOverride(sources, liveKursPajak) {
  if (!liveKursPajak || typeof liveKursPajak.rate !== 'number') return sources;
  const ageHours = (Date.now() - new Date(liveKursPajak.retrievedAt).getTime()) / 36e5;
  const status = ageHours <= 24 ? 'LIVE' : (ageHours <= 168 ? 'CACHED' : 'STALE');
  const freshness = ageHours <= 24 ? 'Fresh' : (ageHours <= 168 ? 'Aging' : 'Stale');
  return sources.map(function (s) {
    if (s.name !== 'Kementerian Keuangan — Kurs Pajak (Weekly Customs/Tax Settlement Rate)') return s;
    return Object.assign({}, s, {
      status: status,
      value: liveKursPajak.rate,
      retrievedAt: liveKursPajak.retrievedAt,
      trustScore: 98,
      freshness: freshness,
      note: 'Live: ' + liveKursPajak.pair + ' = ' + liveKursPajak.rate + ' (effective ' + (liveKursPajak.effectivePeriod || 'this week') + '), via ' + (liveKursPajak.source || 'Kemenkeu Kurs Pajak') + '.',
    });
  });
}

// Same pattern, for the BI-Rate line.
function applyLiveBiRateOverride(sources, liveBiRate) {
  if (!liveBiRate || typeof liveBiRate.rate !== 'number') return sources;
  const ageHours = (Date.now() - new Date(liveBiRate.retrievedAt).getTime()) / 36e5;
  const status = ageHours <= 24 ? 'LIVE' : (ageHours <= 168 ? 'CACHED' : 'STALE');
  const freshness = ageHours <= 24 ? 'Fresh' : (ageHours <= 168 ? 'Aging' : 'Stale');
  return sources.map(function (s) {
    if (s.name !== 'Bank Indonesia — BI-Rate (Financing/Cost of Money)') return s;
    return Object.assign({}, s, {
      status: status,
      value: liveBiRate.rate,
      publishedDate: liveBiRate.publishedDateRaw || s.publishedDate,
      retrievedAt: liveBiRate.retrievedAt,
      trustScore: 98,
      freshness: freshness,
      note: 'Live: BI-Rate = ' + liveBiRate.rate + '% (published ' + liveBiRate.publishedDateRaw + '), via ' + (liveBiRate.source || 'bi.go.id') + '.',
    });
  });
}

// Same pattern, lighter-touch like LKPP: confirms the ESDM electricity
// regulation is genuinely reachable and reports real freshness, without
// fabricating a specific tariff figure from what is fundamentally a
// base document that only changes on a new regulation, not on a schedule.
function applyLiveEsdmOverride(sources, liveEsdm) {
  if (!liveEsdm || !liveEsdm.regulation) return sources;
  return sources.map(function (s) {
    if (s.name.indexOf('Kementerian ESDM') !== 0) return s;
    return Object.assign({}, s, {
      status: 'LIVE',
      retrievedAt: liveEsdm.retrievedAt,
      freshness: 'Fresh',
      note: 'Live connection confirmed to jdih.esdm.go.id \u2014 ' + liveEsdm.regulation + ' is genuinely reachable' + (liveEsdm.lastModifiedHeader ? ' (server last-modified: ' + liveEsdm.lastModifiedHeader + ')' : '') + '. This confirms reachability/freshness of the base regulation and formula, not a live-extracted tariff number \u2014 see the regulation itself for exact Rp/kWh figures per customer class.',
    });
  });
}

function applyLiveEiaOverride(sources, liveEia) {
  if (!liveEia || typeof liveEia.value !== 'number') return sources;
  const ageHours = (Date.now() - new Date(liveEia.retrievedAt).getTime()) / 36e5;
  const status = ageHours <= 24 ? 'LIVE' : (ageHours <= 168 ? 'CACHED' : 'STALE');
  return sources.map(function (s) {
    if (s.name.indexOf('EIA —') !== 0) return s;
    return Object.assign({}, s, {
      status: status,
      value: liveEia.value,
      unit: liveEia.unit || 'USD/barrel',
      publishedDate: liveEia.period || s.publishedDate,
      retrievedAt: liveEia.retrievedAt,
      trustScore: 90,
      freshness: status === 'LIVE' ? 'Fresh' : (status === 'CACHED' ? 'Aging' : 'Stale'),
      note: 'Official EIA Brent observation: ' + liveEia.value + ' ' + (liveEia.unit || 'USD/barrel') + '. Cost-driver context only.'
    });
  });
}

// ---------------------------------------------------------------------------
// Step 10 — Negotiation Intelligence
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Calculation Trace (doc §42 Auditability / §44.D) — makes the "Weighted
// Multi-Source Model" (§25) an explicit, reproducible, line-by-line trace
// instead of a black-box number. Reads req.hps.weightsUsed directly (the
// exact renormalized weights triangulate() actually applied) rather than
// recomputing them, so this can never silently drift from the real answer.
// ---------------------------------------------------------------------------

const MODEL_LABELS = {
  A: 'Historical Price Escalation',
  B: 'Market Benchmark',
  C: 'Should-Cost Model',
  D: 'Predictive/Learning Model',
};

function buildCalculationTrace(req) {
  const hps = req.hps;
  if (!hps || !hps.models) return null;
  const weightsDisplay = hps.weightsUsed || {};
  const weightsExact = hps.weightsExact || weightsDisplay;
  const rows = ['A', 'B', 'C', 'D'].map(function (key) {
    const m = hps.models[key];
    const displayWeight = weightsDisplay[key] || 0;
    const exactWeight = weightsExact[key] != null ? weightsExact[key] : displayWeight;
    const available = !!(m && m.value != null);
    return {
      model: key,
      label: MODEL_LABELS[key],
      value: available ? m.value : null,
      weight: displayWeight,
      // Contribution uses the exact (unrounded) weight so the rows always
      // sum to the real recommended value — the displayed weight % is
      // rounded for readability, but the math never is.
      contribution: available ? m.value * exactWeight : null,
      status: available ? 'AVAILABLE' : 'UNAVAILABLE',
      reason: (m && m.reason) || null,
    };
  });
  return {
    methodology: 'Weighted Multi-Source Model',
    rows: rows,
    recommended: hps.recommended,
    low: hps.low,
    high: hps.high,
  };
}

function generateNegotiation(req, models, triangulated) {
  const supplierQuote = req.input.supplierQuotation ? Number(req.input.supplierQuotation) : null;
  const marketMedian = models.B.value;
  const shouldCost = models.C.value;
  const levers = [];
  (req.costDrivers || []).forEach((d) => {
    if (Math.abs(d.delta) >= 5) {
      levers.push(`${d.name} moved ${d.delta > 0 ? '+' : ''}${d.delta}% — ${d.delta > 0 ? 'anchor on cost-sharing or a rate-lock clause' : 'request pass-through of the favorable movement'}.`);
    }
  });
  if (supplierQuote && triangulated.recommended && supplierQuote > triangulated.recommended) {
    const gap = ((supplierQuote - triangulated.recommended) / triangulated.recommended) * 100;
    levers.push(`Supplier quotation is ${gap.toFixed(1)}% above the recommended HPS — request justification or a re-quote.`);
  }
  if (levers.length === 0) levers.push('No single driver moved enough to be a standalone lever — negotiate on bundled volume/term commitments instead.');
  // Three distinct negotiation reference points (doc §29), not one generic
  // "target range": Opening Target is the buyer's aggressive-but-realistic
  // opening ask (anchored to should-cost/HPS-low, whichever is more
  // conservative); Closing Range is the realistic settlement band between
  // that opening ask and the recommended HPS; Walk-Away Price is the
  // ceiling Procurement should accept only with business/criticality
  // sign-off, not a target to negotiate toward.
  const openingTarget = Math.min(shouldCost != null ? shouldCost : triangulated.low, triangulated.low);
  const closingLow = Math.min(shouldCost != null ? shouldCost : triangulated.low, triangulated.recommended);
  const closingHigh = triangulated.recommended;
  const walkAwayPrice = triangulated.high;
  return {
    supplierQuote, marketMedian, shouldCost, recommendedHPS: triangulated.recommended,
    openingTarget, closingLow, closingHigh, walkAwayPrice,
    // Back-compat aliases (kept so nothing else in the codebase silently breaks).
    targetLow: closingLow, targetHigh: closingHigh,
    levers,
  };
}

// ---------------------------------------------------------------------------
// Step 15 — Outcome Learning
// ---------------------------------------------------------------------------

function computeOutcomeLearning(req, outcome) {
  const hps = req.hps.recommended;
  const actual = Number(outcome.actualCost || outcome.contractPrice || outcome.finalNegotiatedPrice || outcome.awardPrice);
  const absoluteError = Math.abs(actual - hps);
  const percentError = actual ? +((absoluteError / actual) * 100).toFixed(2) : null;
  const bias = actual ? +(((actual - hps) / actual) * 100).toFixed(2) : null;
  const savingVsInitial = outcome.supplierInitialBid ? +(((Number(outcome.supplierInitialBid) - actual) / Number(outcome.supplierInitialBid)) * 100).toFixed(2) : null;
  return { absoluteError, percentError, bias, savingVsInitial, actual, hps };
}

// ---------------------------------------------------------------------------
// AI Brain — category maturity heuristic (0-6). Explicitly a heuristic
// visualization, not a claim of model sentience or true ML maturity.
// ---------------------------------------------------------------------------

function categoryMaturity(category, requests) {
  const catReqs = requests.filter((r) => r.input.category === category);
  if (catReqs.length === 0) return 0;
  const withOutcome = catReqs.filter((r) => r.outcome);
  const mapes = withOutcome.map((r) => r.outcome.percentError).filter((v) => v != null);
  const avgMape = mapes.length ? mapes.reduce((a, b) => a + b, 0) / mapes.length : null;
  if (withOutcome.length >= 5 && avgMape != null && avgMape < 10) return 6;
  if (withOutcome.length >= 3 && avgMape != null && avgMape < 15) return 5;
  if (withOutcome.length >= 1) return 4;
  if (catReqs.length >= 4) return 3;
  if (catReqs.length >= 2) return 2;
  return 1;
}

var MATURITY_LABELS = [
  'No Knowledge', 'Basic Classification', 'Category Knowledge', 'Market Intelligence',
  'Historical Learning', 'Predictive Procurement', 'Controlled Autonomous Intelligence',
];

// ---------------------------------------------------------------------------
// Export for Node (tests) — harmless no-op in the browser
// ---------------------------------------------------------------------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CATEGORIES, CLASSIFICATION_TEMPLATES, SCENARIO_DRIVER_MAP, RESEARCH_OBJECTIVES, MATURITY_LABELS, CALCULATION_MODES,
    hashStr, mulberry32, percentile, fmtIDR, categoryOf, calculationModeOf, isDemoMode, isAcceptedEvidenceStatus, parseMarketBenchmarks, assessRuntimeMode,
    generateClassification, computeCoverage, generateSources, applyLiveFxOverride, generateCostDrivers,
    scenarioAdjustment, estimateBasePrice, shouldCostStack, bufferStockCost, bufferStockBreakdown,
    adjustedUnitRate, rateAdjustmentBreakdown, toDisplayBasis, getRateModel, purchaseDepreciationRate, applyLiveWbOverride, buildCalculationTrace, applyLiveLkppOverride, applyLiveKursPajakOverride, applyLiveBiRateOverride, applyLiveEsdmOverride, applyLiveEiaOverride,
    modelA, modelB, modelC, modelD, triangulate, computeConfidence,
    generateNegotiation, computeOutcomeLearning, categoryMaturity,
  };
}
