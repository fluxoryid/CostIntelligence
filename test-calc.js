const C = require('./calc-core.js');
function assert(cond, msg) { if (!cond) throw new Error('FAIL: ' + msg); console.log('OK: ' + msg); }

Object.entries(C.CATEGORIES).forEach(([name, cat]) => {
  const wsum = cat.drivers.reduce((s, d) => s + d.weight, 0);
  assert(Math.abs(wsum - 1) < 1e-6, `${name} driver weights sum to 1`);
  const ssum = Object.values(cat.shouldCostSplit).reduce((s, v) => s + v, 0);
  assert(Math.abs(ssum - 1) < 1e-6, `${name} should-cost split sums to 1`);
});

function makeReq(overrides, mode='HYBRID_STRICT') {
  const input = Object.assign({
    category: 'IT Hardware', subCategory: 'Server', productName: 'Rack Server X200',
    description: 'Dual-socket rack server with redundant PSU for core banking workload',
    quantity: 3, uom: 'unit', currency: 'IDR', historicalPrice: 42000000, historicalDate: '2025-06-01',
    historicalFxRate: 16000, principalQuotation: 44500000, supplierQuotation: 48000000,
    marketBenchmarks: '44000000,45000000,45500000,46000000', shouldCostBase: 44800000,
    calculationMode: mode,
  }, overrides || {});
  return { id:'req_test_1', calculationMode:mode, input, sources:[{name:'USD/IDR Market Reference Rate (live)',status:'LIVE',value:16800,trustScore:85,freshness:'Fresh',retrievedAt:new Date().toISOString()}], scenario:{fx:0,index:0,commodity:0,freight:0,labor:0,margin:0,volumeDiscount:0} };
}

let req=makeReq();
req.coverage=C.computeCoverage(req.input,true);

const strictSources = C.generateSources(req.input, true);
assert(!strictSources.some(s => s.status === 'DEMO'), 'Hybrid Strict source registry does not cosmetically label unconnected providers as DEMO');
const overriddenSources = C.applyLiveFxOverride(strictSources, { rate: 16800, source: 'Bank Indonesia JISDOR (official)', publishedDateRaw: '14 September 2026', retrievedAt: new Date().toISOString() });
assert(overriddenSources.some(s => s.status === 'LIVE' && /Bank Indonesia/.test(s.name)), 'verified live FX adapter upgrades matching source to LIVE');
req.costDrivers=C.generateCostDrivers(req);
assert(req.costDrivers.every(d => d.status !== 'DEMO'), 'Hybrid Strict generates no synthetic cost-driver deltas');
assert(req.costDrivers.find(d => d.name==='USD/IDR FX Rate').status==='LIVE', 'FX driver derives from live current rate vs historical baseline');
const A=C.modelA(req), B=C.modelB(req), Cc=C.modelC(req), D=C.modelD(req,[]);
assert(A.value != null && A.status !== 'DEMO', 'Model A uses verified evidence only');
assert(B.value != null && B.status !== 'DEMO' && B.n >= 3, 'Model B uses supplied verified comparables');
assert(Cc.value === 44800000 && Cc.status === 'USER PROVIDED', 'Model C uses verified should-cost base, not hard-coded category base');
assert(D.value == null, 'Model D unavailable without approved learning events');
const tri=C.triangulate({A,B,C:Cc,D}, null, req.calculationMode);
assert(tri.recommended > 0, 'strict triangulation returns evidence-backed HPS');
const mode=C.assessRuntimeMode(req,{A,B,C:Cc,D});
assert(mode.mode !== 'DEMO', 'runtime mode is never DEMO for strict verified request');


let weak=makeReq({marketBenchmarks:[
  {value:44000000,status:'REJECTED',source:'AI-generated'},
  {value:45000000,status:'USER PROVIDED',source:'Supplier 1'},
  {value:45500000,status:'USER PROVIDED',source:'Supplier 2'}
]});
weak.costDrivers=C.generateCostDrivers(weak);
const weakB=C.modelB(weak);
assert(weakB.value==null && weakB.n===2,'Model B ignores rejected comparables and still requires three eligible observations');

let sparse=makeReq({historicalFxRate:'', principalQuotation:'', marketBenchmarks:'', shouldCostBase:''});
sparse.sources=[]; sparse.coverage=C.computeCoverage(sparse.input,false); sparse.costDrivers=C.generateCostDrivers(sparse);
const sparseModels={A:C.modelA(sparse),B:C.modelB(sparse),C:C.modelC(sparse),D:C.modelD(sparse,[])};
const sparseTri=C.triangulate(sparseModels,null,sparse.calculationMode);
assert(sparseTri.recommended == null, 'strict mode blocks HPS when evidence is insufficient instead of fabricating a value');

let demo=makeReq({marketBenchmarks:'',shouldCostBase:'',historicalFxRate:'',principalQuotation:''},'DEMO_SANDBOX');
demo.sources=[]; demo.coverage=C.computeCoverage(demo.input,false); demo.costDrivers=C.generateCostDrivers(demo);
assert(demo.costDrivers.some(d=>d.status==='DEMO'),'Demo Sandbox intentionally retains synthetic drivers');
const demoModels={A:C.modelA(demo),B:C.modelB(demo),C:C.modelC(demo),D:C.modelD(demo,[])};
assert(demoModels.B.status==='DEMO' && demoModels.C.status==='DEMO','synthetic benchmark/should-cost are confined to Demo Sandbox');
const demoTri=C.triangulate(demoModels,null,demo.calculationMode);
assert(demoTri.recommended > 0,'Demo Sandbox remains usable for training/testing');
console.log('\nAll calc-core v2 production-guard checks passed.');
