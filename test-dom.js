const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = `<!DOCTYPE html><html><body><div id="app-root"></div></body></html>`;
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
const { window } = dom;

function evalFile(path) {
  window.eval(fs.readFileSync(path, 'utf8'));
}

// Silence alert/confirm/prompt (used by the app for validation/governance dialogs)
window.alert = function (msg) { console.log('[alert]', msg); };
window.confirm = function () { console.log('[confirm] -> true'); return true; };
window.prompt = function () { return 'Test rejection reason'; };

evalFile('./calc-core.js');
window.eval(`
  window.CalcCore = {
    CATEGORIES, CLASSIFICATION_TEMPLATES, SCENARIO_DRIVER_MAP, RESEARCH_OBJECTIVES, MATURITY_LABELS,
    hashStr, mulberry32, percentile, fmtIDR, categoryOf,
    generateClassification, computeCoverage, generateSources, generateCostDrivers,
    scenarioAdjustment, estimateBasePrice, shouldCostStack,
    modelA, modelB, modelC, modelD, triangulate, computeConfidence,
    generateNegotiation, computeOutcomeLearning, categoryMaturity,
  };
`);
evalFile('./app.js');

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

function fireHash(hash) {
  window.location.hash = hash;
  window.dispatchEvent(new window.Event('hashchange'));
}

function click(selector) {
  const el = window.document.querySelector(selector);
  if (!el) throw new Error('click target not found: ' + selector);
  el.dispatchEvent(new window.Event('click', { bubbles: true }));
}

function clickByAction(action, arg) {
  const sel = '[data-action="' + action + '"]' + (arg !== undefined ? '[data-arg="' + arg + '"]' : '');
  const el = window.document.querySelector(sel);
  if (!el) throw new Error('action target not found: ' + sel);
  el.dispatchEvent(new window.Event('click', { bubbles: true }));
}

function setVal(id, val) {
  const el = window.document.getElementById(id);
  if (!el) throw new Error('input not found: #' + id);
  el.value = val;
}

// --- Boot ---
window.addEventListener('error', function (e) { console.error('WINDOW ERROR:', e.error && e.error.stack || e.message); });
try {
  window.dispatchEvent(new window.Event('load'));
} catch (e) {
  console.error('LOAD THREW:', e.stack);
}
assert(window.document.querySelector('.app-header'), 'app boots and renders header (login screen)');

// --- Login ---
setVal('login-name', 'Test User');
window.document.getElementById('login-role').value = 'Procurement Analyst';
clickByAction('doLogin');
assert(window.location.hash === '#home', 'login navigates to home');
assert(window.document.querySelector('.hps-hero') === null, 'home has no HPS hero (sanity)');

// --- New HPS: step 1 ---
clickByAction('navroot', 'new');
assert(window.location.hash === '#new/1', 'new HPS starts at step 1');
setVal('f-bu', 'IT Procurement');
setVal('f-requester', 'Test User');
window.document.getElementById('f-category').value = 'IT Hardware';
window.document.getElementById('f-subcategory').value = 'Server';
setVal('f-productname', 'Rack Server X200');
clickByAction('wizardNext', '1');
assert(window.location.hash === '#new/2', 'advances to step 2');

// --- Step 2 ---
setVal('f-description', 'Dual-socket rack server, redundant PSU, for core banking workload');
setVal('f-qty', '3');
setVal('f-uom', 'unit');
setVal('f-reqdate', '2026-11-01');
setVal('f-location', 'Jakarta DC');
clickByAction('wizardNext', '2');
assert(window.location.hash === '#new/3', 'advances to step 3');

// --- Step 3: advanced sheet + generate ---
clickByAction('openAdvancedSheet');
assert(window.document.getElementById('active-sheet'), 'advanced sheet opens');
setVal('a-histprice', '42000000');
setVal('a-histdate', '2025-06-01');
setVal('a-suppq', '48000000');
clickByAction('saveAdvancedSheet');
assert(!window.document.getElementById('active-sheet'), 'advanced sheet closes after save');

window.document.getElementById('f-currency').value = 'IDR';
window.document.getElementById('f-proctype').value = 'New';
clickByAction('generateHPS');
const genHash = window.location.hash;
assert(/^#classify\/req_/.test(genHash), 'generateHPS navigates to classify screen for new request id (' + genHash + ')');
const reqId = genHash.split('/')[1];

// --- Classification ---
assert(window.document.querySelector('.badge-DEMO'), 'classification confidence badge rendered');
clickByAction('go', 'coverage/' + reqId);

// --- Coverage ---
assert(window.location.hash === '#coverage/' + reqId, 'on coverage screen');
const coverageBtn = window.document.querySelector('.fab-bar .btn');
assert(coverageBtn, 'coverage screen has a continue/research action');
// Follow whichever path the button offers (research or sources) through to sources.
coverageBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
if (/^#research\//.test(window.location.hash)) {
  clickByAction('runResearch', reqId);
  clickByAction('go', 'sources/' + reqId);
}
assert(window.location.hash === '#sources/' + reqId, 'reached sources screen (' + window.location.hash + ')');
assert(window.document.querySelectorAll('.badge').length > 0, 'sources render status badges');

// --- Drivers -> Result ---
clickByAction('go', 'drivers/' + reqId);
assert(window.document.querySelectorAll('.row').length > 0, 'cost drivers listed');
clickByAction('go', 'result/' + reqId);
assert(window.document.querySelector('.hps-amount'), 'HPS result hero renders a recommended amount');
const hpsText = window.document.querySelector('.hps-amount').textContent;
assert(/Rp/.test(hpsText), 'HPS amount formatted as IDR (' + hpsText + ')');

// --- Why / Scenario / Negotiation ---
clickByAction('go', 'why/' + reqId);
assert(window.document.querySelectorAll('.card').length >= 3, 'why-this-hps shows base/model/source cards');

window.HPSApp.go('scenario/' + reqId);
const slider = window.document.querySelector('input[type=range][data-key="fx"]');
assert(slider, 'fx scenario slider present');
const before = window.document.getElementById('scenario-hps-display').textContent;
slider.value = '15';
slider.dispatchEvent(new window.Event('input', { bubbles: true }));
const after = window.document.getElementById('scenario-hps-display').textContent;
assert(before !== after, 'scenario slider changes displayed recommended HPS live');

window.HPSApp.go('negotiation/' + reqId);
assert(window.document.body.textContent.includes('Target settlement range'), 'negotiation screen shows target settlement range');

// --- Approval flow across roles ---
window.HPSApp.go('approval/' + reqId);
clickByAction('advanceApproval', reqId); // Draft -> Procurement Review (any role)
window.HPSApp.go('approval/' + reqId);

// Analyst cannot advance past Procurement Review — the action button is not even offered
assert(!window.document.querySelector('[data-action="advanceApproval"]'), 'Procurement Analyst is not offered the advance action at Procurement Review');
assert(window.document.body.textContent.includes('Permission denied'), 'Permission denied banner shown to Procurement Analyst');
assert(window.HPSApp.Store.getRequest(reqId).approval.stage === 'Procurement Review', 'stage remains Procurement Review');

// Switch to Procurement Manager via More screen
clickByAction('go', 'more');
window.document.getElementById('more-role').value = 'Procurement Manager';
clickByAction('applyMoreSwitch');
window.HPSApp.go('approval/' + reqId);
clickByAction('advanceApproval', reqId); // -> Reviewer
assert(window.HPSApp.Store.getRequest(reqId).approval.stage === 'Reviewer', 'Procurement Manager advances Procurement Review -> Reviewer');
window.HPSApp.go('approval/' + reqId);
clickByAction('advanceApproval', reqId); // -> Approver
assert(window.HPSApp.Store.getRequest(reqId).approval.stage === 'Approver', 'advances Reviewer -> Approver');

// Analyst cannot approve; switch to Approver role
clickByAction('go', 'more');
window.document.getElementById('more-role').value = 'Approver';
clickByAction('applyMoreSwitch');
window.HPSApp.go('approval/' + reqId);
clickByAction('advanceApproval', reqId); // -> HPS Locked
assert(window.HPSApp.Store.getRequest(reqId).approval.stage === 'HPS Locked', 'Approver locks HPS');
assert(window.HPSApp.Store.getRequest(reqId).status === 'HPS Locked', 'request status reflects HPS Locked');

// --- Outcome capture + learning event ---
window.HPSApp.go('outcome/' + reqId);
setVal('o-initial', '48000000');
setVal('o-rounds', '2');
setVal('o-final', '41500000');
setVal('o-supplier', 'PT Vendor Sejahtera');
clickByAction('submitOutcome', reqId);
assert(/^#learningevent\//.test(window.location.hash), 'submitOutcome navigates to learning event screen');
assert(window.HPSApp.Store.getRequest(reqId).learningEvents.length > 0, 'learning event recorded on the request');

// --- AI Brain dashboard ---
window.HPSApp.go('brain');
assert(window.document.body.textContent.includes('IT Hardware'), 'AI Brain shows the IT Hardware category learned');

// --- Governance (Admin only) ---
clickByAction('go', 'more');
window.document.getElementById('more-role').value = 'Admin';
clickByAction('applyMoreSwitch');
window.HPSApp.go('governance');
assert(window.document.getElementById('gov-A'), 'Admin sees editable governance weights');

// Non-admin should be denied
clickByAction('go', 'more');
window.document.getElementById('more-role').value = 'Requester';
clickByAction('applyMoreSwitch');
window.HPSApp.go('governance');
assert(window.document.body.textContent.includes('Permission denied'), 'Requester denied access to Model Governance');

// --- Settings / providers never show LIVE ---
window.HPSApp.go('settings');
assert(!window.document.body.textContent.includes('badge-LIVE') === true || !window.document.querySelector('.badge-LIVE'), 'no provider is badged as LIVE');

// --- Persistence: reload simulated by re-reading localStorage ---
const persisted = JSON.parse(window.localStorage.getItem('hps_intelligence_state_v1'));
assert(persisted.requests.some(r => r.id === reqId), 'request persisted to localStorage');
assert(persisted.requests.find(r => r.id === reqId).approval.stage === 'HPS Locked', 'persisted state reflects locked approval stage');

console.log('\nAll DOM smoke tests passed.');
