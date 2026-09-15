global.window = {};
const S = require('./source-engine.js');
function assert(cond,msg){ if(!cond) throw new Error('FAIL: '+msg); console.log('OK: '+msg); }
let official=S.scoreSource('BI_JISDOR',{retrievedAt:new Date().toISOString()});
let ai=S.scoreSource('AI_GENERATED',{retrievedAt:new Date().toISOString()});
let market=S.scoreSource('MARKETPLACE',{retrievedAt:new Date().toISOString()});
assert(official.score>=90 && official.allowed,'Official JISDOR ranks as verified/high-grade evidence');
assert(ai.grade==='REJECTED' && !ai.allowed,'AI-generated prices are rejected');
assert(!market.allowed,'Marketplace listing is blocked from direct HPS influence');
let enriched=S.enrich({name:'Bank Indonesia — USD/IDR Reference Rate (JISDOR)',status:'LIVE',value:17611,retrievedAt:new Date().toISOString()});
assert(enriched.governance.key==='BI_JISDOR','Source inference identifies Bank Indonesia JISDOR');
assert(S.canInfluenceHps(enriched),'Official live FX may influence HPS as a cost driver');
console.log('\nAll source-governance checks passed.');
