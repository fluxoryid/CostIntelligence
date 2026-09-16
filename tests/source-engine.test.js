const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
const engine = require('../source-engine.js');

test('official primary and cost-driver sources are allowed', () => {
  for (const key of ['INTERNAL_TRANSACTION','BI_JISDOR','KURS_PAJAK','BPS','UMP_JDIH','DJBC_CEISA','ESDM','PRINCIPAL_QUOTE']) {
    const scored = engine.scoreSource(key,{publishedDate:new Date().toISOString()});
    assert.equal(scored.allowed,true,key);
    assert.ok(scored.score >= 70, `${key} score ${scored.score}`);
  }
});

test('synthetic and AI-generated evidence can never influence HPS', () => {
  for (const key of ['SYNTHETIC','AI_GENERATED','SEARCH_SNIPPET']) {
    const src = {sourceKey:key,name:key,publishedDate:new Date().toISOString()};
    assert.equal(engine.canInfluenceHps(src),false,key);
  }
});

test('freshness declines with age', () => {
  const now = new Date();
  const old = new Date(now.getTime()-400*86400000);
  assert.ok(engine.freshnessScore(now.toISOString()) > engine.freshnessScore(old.toISOString()));
});
