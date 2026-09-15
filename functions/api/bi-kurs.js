import { fetchBiKurs, SERIES } from '../lib/bi-kurs-client.js';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const series = String(url.searchParams.get('series') || 'jisdor').toLowerCase();
  const mode = String(url.searchParams.get('mode') || 'latest');
  const currency = url.searchParams.get('currency') || url.searchParams.get('mts') || '';
  const date = url.searchParams.get('date') || '';
  const start = url.searchParams.get('start') || '';
  const end = url.searchParams.get('end') || '';

  if (!SERIES[series]) {
    return json({
      error: 'unsupported_series',
      supportedSeries: Object.keys(SERIES),
      examples: examples()
    }, 400);
  }

  try {
    const data = await fetchBiKurs({ series, mode, currency, date, start, end });
    return json(data, data.recordCount ? 200 : 404, {
      'Cache-Control': mode === 'latest' ? 'public, max-age=1800' : 'public, max-age=21600'
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /^unsupported_|required_|currency_/.test(message) || /_required_/.test(message) ? 400 : 502;
    return json({
      error: message,
      upstreamStatus: err && err.status || null,
      source: 'Bank Indonesia wsKursBI Web Service (official)',
      sourceState: 'UNAVAILABLE',
      examples: examples()
    }, status);
  }
}

function examples() {
  return {
    latestJisdor: '/api/bi-kurs?series=jisdor&mode=latest',
    jisdorByDate: '/api/bi-kurs?series=jisdor&mode=date&date=2026-09-14',
    jisdorRange: '/api/bi-kurs?series=jisdor&mode=range&currency=USD&start=2026-09-01&end=2026-09-14',
    latestTransactionRate: '/api/bi-kurs?series=transaction&mode=latest',
    transactionRange: '/api/bi-kurs?series=transaction&mode=range&currency=EUR&start=2026-09-01&end=2026-09-14',
    latestNonUsdReference: '/api/bi-kurs?series=reference&mode=latest',
    nonUsdReferenceRange: '/api/bi-kurs?series=reference&mode=range&currency=JPY&start=2026-09-01&end=2026-09-14',
    latestUka: '/api/bi-kurs?series=uka&mode=latest'
  };
}

function json(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }, extraHeaders || {})
  });
}
