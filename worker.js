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

const BUILD_ID = 'procurement-category-dependency-20260916-v5';

function versionHandler() {
  return new Response(JSON.stringify({
    service: 'CostIntelligence',
    buildId: BUILD_ID,
    historicalBpsRoute: true,
    historicalBpsAdapter: 'verified-release-v3-no-store',
    historicalBiRoute: true,
    procurementCategoryDependency: true,
    guidedProcurementFlow: true,
    deployedCodeExpectation: 'worker-with-procurement-ux-v5'
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(),
    },
  });
}

const API_ROUTES = new Map([
  ['/api/version', versionHandler],
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

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const handler = API_ROUTES.get(url.pathname);

    if (handler) {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }

      try {
        if (url.pathname === '/api/version') return handler();
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
        return new Response(JSON.stringify({
          error: 'api_handler_failed',
          message: error instanceof Error ? error.message : String(error),
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }
    }

    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({
        error: 'api_route_not_found',
        path: url.pathname,
        buildId: BUILD_ID
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
      });
    }

    return env.ASSETS.fetch(request);
  },
};