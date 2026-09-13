/*
 * calc-core.js
 * HPS Intelligence — pure calculation engine + category reference data.
 * No DOM references. Loaded directly in the browser via <script> and
 * also runnable under Node for automated checks.
 *
 * IMPORTANT — DATA INTEGRITY:
 * baseUnitPriceIDR, driver maxDeltaPct ranges, and should-cost splits below
 * are illustrative DEMO assumptions for this prototype only. They are not
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

function generateSources(input, researched) {
  const now = new Date();
  function daysAgo(n) {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }
  const sources = [];
  sources.push({ name: 'Bank Indonesia — USD/IDR Reference Rate (JISDOR)', status: 'DEMO', publishedDate: daysAgo(1), retrievedAt: now.toISOString(), trustScore: 70, freshness: 'Fresh', note: 'Live BI API requires an authenticated, CORS-proxied connection — not wired up in this prototype. See Settings → Data Providers.' });
  sources.push({ name: 'BPS — Producer/Consumer Price Index (category proxy)', status: researched ? 'DEMO' : 'UNAVAILABLE', publishedDate: daysAgo(20), retrievedAt: now.toISOString(), trustScore: 65, freshness: researched ? 'Aging' : 'Stale' });
  if (input.category === 'Manpower/BPO') {
    sources.push({ name: 'Regional UMP/UMK Wage Decree', status: 'DEMO', publishedDate: daysAgo(200), retrievedAt: now.toISOString(), trustScore: 80, freshness: 'Aging', note: 'Annual, effective-date based — verify the current year decree before finalizing.' });
  }
  if (input.category === 'IT Hardware' || input.category === 'Data Center') {
    sources.push({ name: 'Principal/Distributor Indicative Price List', status: researched ? 'DEMO' : 'UNAVAILABLE', publishedDate: daysAgo(45), retrievedAt: now.toISOString(), trustScore: 72, freshness: 'Aging' });
  }
  if (input.historicalPrice) {
    sources.push({ name: 'Internal Historical Purchase Record', status: 'INTERNAL', publishedDate: input.historicalDate || daysAgo(180), retrievedAt: now.toISOString(), trustScore: 88, freshness: 'Fresh' });
  }
  if (input.supplierQuotation) {
    sources.push({ name: 'Supplier Quotation (as provided)', status: 'USER PROVIDED', publishedDate: daysAgo(2), retrievedAt: now.toISOString(), trustScore: 75, freshness: 'Fresh' });
  }
  if (input.principalQuotation) {
    sources.push({ name: 'Principal Quotation (as provided)', status: 'USER PROVIDED', publishedDate: daysAgo(3), retrievedAt: now.toISOString(), trustScore: 78, freshness: 'Fresh' });
  }
  if (researched) {
    sources.push({ name: 'Market Benchmark Panel (synthetic comparable set)', status: 'DEMO', publishedDate: daysAgo(10), retrievedAt: now.toISOString(), trustScore: 60, freshness: 'Fresh', note: 'Synthetic demo comparables — replace with e-Katalog/distributor/internal PO data via the provider adapter interface.' });
  }
  return sources;
}

// ---------------------------------------------------------------------------
// Step 6 — Cost Driver Engine
// ---------------------------------------------------------------------------

function generateCostDrivers(req) {
  const cat = categoryOf(req.input.category);
  const seed = hashStr(req.id + '|' + req.input.category + '|' + req.input.productName);
  const rnd = mulberry32(seed);
  return cat.drivers.map((d) => ({
    name: d.name,
    weight: d.weight,
    delta: +(((rnd() * 2) - 1) * d.maxDeltaPct).toFixed(2),
    status: 'DEMO',
  }));
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
  if (!p0) return { value: null, status: 'UNAVAILABLE', reason: 'Missing historical purchase price — Model A (Historical Indexation) not used.' };
  let escalation = 0;
  (req.costDrivers || []).forEach((d) => {
    const delta = (d.delta / 100) + scenarioAdjustment(d.name, req.scenario);
    escalation += d.weight * delta;
  });
  const value = p0 * (1 + escalation);
  return { value, status: 'DEMO', basisStatus: 'USER PROVIDED', escalationPct: +(escalation * 100).toFixed(2), basis: p0 };
}

function modelB(req) {
  const base = estimateBasePrice(req.input);
  const rnd = mulberry32(hashStr(req.id + '|B'));
  const n = 7;
  const points = [];
  for (let i = 0; i < n; i++) points.push(base * (1 + ((rnd() * 0.30) - 0.15)));
  const sortedAll = [...points].sort((a, b) => a - b);
  const q1 = percentile(sortedAll, 25), q3 = percentile(sortedAll, 75);
  const iqr = q3 - q1;
  const filtered = points.filter((p) => p >= q1 - 1.5 * iqr && p <= q3 + 1.5 * iqr);
  if (filtered.length < 3) return { value: null, status: 'INSUFFICIENT', reason: 'Insufficient benchmark data points after outlier removal — Model B not used.' };
  const sortedFiltered = [...filtered].sort((a, b) => a - b);
  const median = percentile(sortedFiltered, 50);
  return { value: median, low: Math.min(...filtered), high: Math.max(...filtered), status: 'DEMO', n: filtered.length, points: filtered };
}

function modelC(req) {
  const base = estimateBasePrice(req.input);
  const stack = shouldCostStack(req.input, base);
  return { value: stack.total, status: 'DEMO', stack, base };
}

function modelD(req, learningEvents) {
  const events = (learningEvents || []).filter((e) => e.category === req.input.category);
  if (!req.input.historicalPrice || events.length < 3) {
    return { value: null, status: 'UNAVAILABLE', reason: 'Insufficient internal outcome history for this category (need \u2265 3 prior outcomes). Predictive model reflects correlation only, not causation.' };
  }
  const avgBiasPct = events.reduce((s, e) => s + (e.bias || 0), 0) / events.length;
  const p0 = Number(req.input.historicalPrice);
  const value = p0 * (1 + (avgBiasPct / 100));
  return { value, status: 'DEMO', note: 'Derived from average historical prediction bias observed in this category (correlation, not causal).', sampleSize: events.length };
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

function triangulate(models, weightOverride) {
  const weightsDefault = weightOverride || { A: 0.30, B: 0.30, C: 0.30, D: 0.10 };
  const available = Object.entries(models).filter(([, m]) => m && m.value != null);
  if (available.length === 0) {
    return { recommended: null, low: null, high: null, weightsUsed: {}, error: 'No models produced a usable value — calculation error. Provide a historical price or ensure category benchmarks are available, then retry.' };
  }
  const sumW = available.reduce((s, [k]) => s + (weightsDefault[k] || 0), 0) || 1;
  const recommended = available.reduce((s, [k, m]) => s + ((weightsDefault[k] || 0) / sumW) * m.value, 0);
  const values = available.map(([, m]) => m.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const weightsUsed = {};
  available.forEach(([k]) => { weightsUsed[k] = +(((weightsDefault[k] || 0) / sumW)).toFixed(2); });
  return { recommended, low, high, weightsUsed };
}

// ---------------------------------------------------------------------------
// Step 9 — Confidence Score
// ---------------------------------------------------------------------------

function computeConfidence(req, models, sources, coverage) {
  const available = Object.values(models).filter((m) => m && m.value != null);
  const values = available.map((m) => m.value);
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const variance = values.length ? values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length : 0;
  const cv = mean ? Math.sqrt(variance) / mean : 1;
  const modelAgreement = Math.max(0, 100 * (1 - Math.min(cv, 1)));
  const avgTrust = sources.length ? sources.reduce((s, src) => s + src.trustScore, 0) / sources.length : 40;
  const freshnessScore = sources.length ? (sources.filter((s) => s.freshness === 'Fresh').length / sources.length) * 100 : 30;
  const words = (req.input.description || '').trim().split(/\s+/).filter(Boolean);
  const specSimilarity = words.length >= 8 ? 80 : 50;
  const benchmarkCountScore = models.B && models.B.n ? Math.min(models.B.n * 15, 100) : 20;
  const historicalCoverage = req.input.historicalPrice ? 90 : 20;
  const completeness = coverage.overall;
  const weighted = (avgTrust * 0.15) + (freshnessScore * 0.10) + (specSimilarity * 0.10) + (benchmarkCountScore * 0.15) + (historicalCoverage * 0.15) + (modelAgreement * 0.15) + (completeness * 0.20);
  let score = Math.round(Math.min(Math.max(weighted, 0), 100));
  const hasWeakSource = sources.some((s) => s.status === 'DEMO' || s.status === 'UNAVAILABLE');
  let capped = false;
  if (hasWeakSource && score > 64) { score = 64; capped = true; }
  const label = score >= 85 ? 'Very High' : (score >= 65 ? 'High' : (score >= 40 ? 'Moderate' : 'Low'));
  return { score, label, capped, components: { avgTrust, freshnessScore, specSimilarity, benchmarkCountScore, historicalCoverage, modelAgreement, completeness } };
}

// ---------------------------------------------------------------------------
// Step 10 — Negotiation Intelligence
// ---------------------------------------------------------------------------

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
  return {
    supplierQuote, marketMedian, shouldCost, recommendedHPS: triangulated.recommended,
    targetLow: Math.min(shouldCost || triangulated.low, triangulated.recommended),
    targetHigh: triangulated.recommended,
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
    CATEGORIES, CLASSIFICATION_TEMPLATES, SCENARIO_DRIVER_MAP, RESEARCH_OBJECTIVES, MATURITY_LABELS,
    hashStr, mulberry32, percentile, fmtIDR, categoryOf,
    generateClassification, computeCoverage, generateSources, generateCostDrivers,
    scenarioAdjustment, estimateBasePrice, shouldCostStack, bufferStockCost, bufferStockBreakdown,
    adjustedUnitRate, rateAdjustmentBreakdown, toDisplayBasis, getRateModel, purchaseDepreciationRate,
    modelA, modelB, modelC, modelD, triangulate, computeConfidence,
    generateNegotiation, computeOutcomeLearning, categoryMaturity,
  };
}
