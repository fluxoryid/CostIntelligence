import { onRequestGet as fxUsdIdr } from './functions/api/fx-usd-idr.js';
import { onRequestGet as biKurs } from './functions/api/bi-kurs.js';
import { onRequestGet as biRate } from './functions/api/bi-rate.js';
import { onRequestGet as kursPajak } from './functions/api/kurs-pajak.js';
import { onRequestGet as wbIndicator } from './functions/api/wb-indicator.js';
import { onRequestGet as bpsInflation } from './functions/api/bps-inflation.js';
import { onRequestGet as bpsInflationHistory } from './functions/api/bps-inflation-history-v3.js';
import { onRequestGet as lkppStatus } from './functions/api/lkpp-status.js';
import { onRequestGet as esdmElectricity } from './functions/api/esdm-electricity.js';
import { onRequestGet as eiaBrent } from './functions/api/eia-brent.js';

const BUILD_ID = 'production-complete-20260916-v14';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
  });
}

function versionHandler() {
  return json({
    service: 'CostIntelligence',
    buildId: BUILD_ID,
    releaseChannel: 'production-rc',
    calculationMode: 'HYBRID_STRICT',
    historicalBpsRoute: true,
    historicalBpsAdapter: 'verified-release-v3-no-store',
    historicalBiRoute: true,
    procurementCategoryDependency: true,
    procurementSubcategoryDependency: true,
    categoryIntelligenceProfile: true,
    categoryDependentCostForms: true,
    categoryEvidenceRequirements: true,
    evidenceToComponentMapping: true,
    componentConfidenceScoring: true,
    componentEvidenceCoverageGate: true,
    approvalWorkflowRbac: true,
    immutableVersionBackendSchema: true,
    multiTenantSupabaseSchema: true,
    documentEvidenceHub: true,
    sha256DuplicateControl: true,
    documentTextExtraction: true,
    multiCurrencyBiNormalization: true,
    landedCostScenario: true,
    governedLearning: true,
    negotiationIntelligence: true,
    productionHealthMonitor: true,
    guidedProcurementFlow: true,
    deployedCodeExpectation: 'worker-production-complete-v14'
  });
}

function healthHandler() {
  return json({
    status: 'healthy',
    service: 'CostIntelligence',
    buildId: BUILD_ID,
    runtime: 'Cloudflare Workers + Static Assets',
    stateless: true,
    timestamp: new Date().toISOString(),
    note: 'Application runtime is healthy. Supabase tenant/auth readiness is validated client-side after authentication.'
  });
}

const API_ROUTES = new Map([
  ['/api/version', versionHandler],
  ['/api/health', healthHandler],
  ['/api/fx-usd-idr', fxUsdIdr],
  ['/api/bi-kurs', biKurs],
  ['/api/bi-rate', biRate],
  ['/api/kurs-pajak', kursPajak],
  ['/api/wb-indicator', wbIndicator],
  ['/api/bps-inflation', bpsInflation],
  ['/api/bps-inflation-history', bpsInflationHistory],
  ['/api/lkpp-status', lkppStatus],
  ['/api/esdm-electricity', esdmElectricity],
  ['/api/eia-brent', eiaBrent],
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const handler = API_ROUTES.get(url.pathname);

    if (handler) {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
      if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'method_not_allowed' }, 405);
      try {
        if (url.pathname === '/api/version' || url.pathname === '/api/health') return handler();
        return await handler({
          request,
          env,
          params: {},
          data: {},
          waitUntil: (promise) => ctx.waitUntil(promise),
          passThroughOnException: () => {},
          next: () => env.ASSETS.fetch(request),
        });
      } catch (error) {
        return json({ error: 'api_handler_failed', message: error instanceof Error ? error.message : String(error) }, 500);
      }
    }

    if (url.pathname.startsWith('/api/')) return json({ error: 'api_route_not_found', path: url.pathname, buildId: BUILD_ID }, 404);
    return env.ASSETS.fetch(request);
  },
};
