const test = require('node:test');
const assert = require('node:assert/strict');

global.window = { addEventListener(){} };
global.document = { readyState:'loading', addEventListener(){}, getElementById(){ return null; } };
global.localStorage = { getItem(){return null;}, setItem(){} };
global.sessionStorage = { getItem(){return null;}, setItem(){} };

const wf = require('../workflow-rbac.js');

test('Procurement User can submit but cannot approve', () => {
  assert.deepEqual(wf.allowedActions('Procurement User','DRAFT'),['SUBMIT']);
  assert.ok(!wf.allowedActions('Procurement User','UNDER_REVIEW').includes('APPROVE'));
});

test('Analyst can review/return but cannot approve', () => {
  assert.ok(wf.allowedActions('Analyst/Senior','SUBMITTED').includes('START_REVIEW'));
  assert.ok(wf.allowedActions('Analyst/Senior','UNDER_REVIEW').includes('RETURN'));
  assert.ok(!wf.allowedActions('Analyst/Senior','UNDER_REVIEW').includes('APPROVE'));
});

test('Manager approves while Head locks', () => {
  assert.ok(wf.allowedActions('Manager','UNDER_REVIEW').includes('APPROVE'));
  assert.ok(!wf.allowedActions('Manager','APPROVED').includes('LOCK'));
  assert.ok(wf.allowedActions('Procurement Head/Admin','APPROVED').includes('LOCK'));
});

test('transition preview follows controlled lifecycle', () => {
  assert.equal(wf.transitionPreview('DRAFT','SUBMIT'),'SUBMITTED');
  assert.equal(wf.transitionPreview('SUBMITTED','START_REVIEW'),'UNDER_REVIEW');
  assert.equal(wf.transitionPreview('UNDER_REVIEW','RETURN'),'REWORK');
  assert.equal(wf.transitionPreview('UNDER_REVIEW','APPROVE'),'APPROVED');
  assert.equal(wf.transitionPreview('APPROVED','LOCK'),'LOCKED');
});
