const C = require('./calc-core.js');

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

// 1. Category weight/split integrity
Object.entries(C.CATEGORIES).forEach(([name, cat]) => {
  const wsum = cat.drivers.reduce((s, d) => s + d.weight, 0);
  assert(Math.abs(wsum - 1) < 1e-6, `${name} driver weights sum to 1 (got ${wsum})`);
  const ssum = Object.values(cat.shouldCostSplit).reduce((s, v) => s + v, 0);
  assert(Math.abs(ssum - 1) < 1e-6, `${name} should-cost split sums to 1 (got ${ssum})`);
});

// 2. Full pipeline for a request WITH historical price (IT Hardware)
function makeReq(overrides) {
  const input = Object.assign({
    category: 'IT Hardware', subCategory: 'Server', productName: 'Rack Server X200',
    description: 'Dual-socket rack server with redundant PSU for core banking workload',
    quantity: 3, uom: 'unit', currency: 'IDR', historicalPrice: 42000000, historicalDate: '2025-06-01',
    supplierQuotation: 48000000,
  }, overrides || {});
  return {
    id: 'req_test_1', input,
    scenario: { fx: 0, index: 0, commodity: 0, freight: 0, labor: 0, margin: 0, volumeDiscount: 0 },
  };
}

let req = makeReq();
req.classification = C.generateClassification(req.input);
assert(req.classification.commodity === 'Electronics / IT Equipment', 'classification maps IT Hardware correctly');

req.coverage = C.computeCoverage(req.input, false);
assert(req.coverage.overall >= 0 && req.coverage.overall <= 100, 'coverage overall in range');

req.sources = C.generateSources(req.input, req.coverage.label !== 'Sufficient');
assert(req.sources.length >= 3, 'sources generated (>=3)');
assert(req.sources.some(s => s.status === 'INTERNAL'), 'internal source present when historical price given');
assert(req.sources.some(s => s.status === 'USER PROVIDED'), 'user provided source present when supplier quote given');

req.costDrivers = C.generateCostDrivers(req);
const dwsum = req.costDrivers.reduce((s, d) => s + d.weight, 0);
assert(Math.abs(dwsum - 1) < 1e-6, 'generated cost driver weights sum to 1');

const A = C.modelA(req), B = C.modelB(req), Cc = C.modelC(req), D = C.modelD(req, []);
assert(A.value != null, 'Model A produces a value when historical price present');
assert(B.value != null, 'Model B produces a value');
assert(Cc.value != null, 'Model C produces a value');
assert(D.value == null && D.status === 'UNAVAILABLE', 'Model D unavailable with <3 learning events');

const tri = C.triangulate({ A, B, C: Cc, D });
assert(tri.recommended != null && tri.recommended > 0, 'triangulated recommended HPS is a positive number');
assert(tri.low <= tri.recommended && tri.recommended <= tri.high, 'recommended within [low, high]');

const conf = C.computeConfidence(req, { A, B, C: Cc, D }, req.sources, req.coverage);
assert(conf.score >= 0 && conf.score <= 100, 'confidence score in range');
assert(conf.capped === true, 'confidence capped due to DEMO/UNAVAILABLE sources present');

const neg = C.generateNegotiation(req, { A, B, C: Cc, D }, tri);
assert(neg.levers.length > 0, 'negotiation levers generated');

// 3. Scenario simulation changes Model A output
req.hps = { recommended: tri.recommended };
const A_base = C.modelA(req).value;
req.scenario.fx = 10; // +10% FX
const A_fx = C.modelA(req).value;
assert(A_fx > A_base, `scenario FX +10% increases Model A value (${A_base} -> ${A_fx})`);
req.scenario.fx = 0;

// 4. Request WITHOUT historical price -> Model A unavailable, error state surfaced
let req2 = makeReq({ historicalPrice: null, historicalDate: '' });
req2.costDrivers = C.generateCostDrivers(req2);
const A2 = C.modelA(req2);
assert(A2.value == null && /Missing historical/.test(A2.reason), 'Model A correctly unavailable without historical price');

// 5. Outcome learning + category maturity
req.hps = tri;
const outcome = { supplierInitialBid: 48000000, actualCost: 41500000 };
const learn = C.computeOutcomeLearning(req, outcome);
assert(learn.percentError != null, 'outcome learning computes percent error');
assert(learn.savingVsInitial > 0, 'saving vs initial bid computed positive when actual < initial bid');

const fakeReqsForMaturity = [req, req, req, req, req];
const maturity = C.categoryMaturity('IT Hardware', fakeReqsForMaturity.map(r => ({ input: r.input, outcome: null })));
assert(maturity === 3, `maturity level 3 for 4+ requests with no outcomes yet (got ${maturity})`);

// 6. Determinism: same request id + category + name -> same cost drivers
const reqA = makeReq(); reqA.id = 'same_id';
const reqB = makeReq(); reqB.id = 'same_id';
const dA = C.generateCostDrivers(reqA);
const dB = C.generateCostDrivers(reqB);
assert(JSON.stringify(dA) === JSON.stringify(dB), 'cost driver generation is deterministic given same seed inputs');

console.log('\nAll calc-core sanity checks passed.');
