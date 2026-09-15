// functions/api/wb-indicator.js — Cloudflare Pages Function.
//
// Proxies api.worldbank.org/v2, which is genuinely free and keyless
// (confirmed) — unlike most other sources in this app's source list, this
// one is a real live candidate, not just a cosmetic DEMO tag. Defaults to
// Indonesia's annual consumer-price inflation rate (indicator
// FP.CPI.TOTL.ZG) as a macro/escalation sanity-check figure; pass
// ?indicator=CODE&country=ISO3 to fetch a different series.

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const indicator = url.searchParams.get('indicator') || 'FP.CPI.TOTL.ZG';
  const country = url.searchParams.get('country') || 'IDN';
  const upstreamUrl = 'https://api.worldbank.org/v2/country/' + encodeURIComponent(country) +
    '/indicator/' + encodeURIComponent(indicator) + '?format=json&per_page=5&mrnev=1';
  try {
    const upstream = await fetch(upstreamUrl, { cf: { cacheTtl: 21600, cacheEverything: true } });
    if (!upstream.ok) {
      return jsonResponse({ error: 'upstream_error', status: upstream.status }, 502);
    }
    const data = await upstream.json();
    // World Bank's v2 API has a famously awkward wire format: a healthy
    // response is [meta, rows]; an invalid indicator/country still returns
    // HTTP 200 with a one-element array carrying a message block instead
    // of rows. Never trust the status code alone here.
    if (!Array.isArray(data) || data.length < 2 || !Array.isArray(data[1]) || !data[1].length) {
      return jsonResponse({ error: 'unexpected_upstream_shape' }, 502);
    }
    const row = data[1][0];
    if (row.value == null) {
      return jsonResponse({ error: 'no_recent_value' }, 502);
    }
    return jsonResponse({
      indicator: indicator,
      indicatorLabel: row.indicator && row.indicator.value,
      country: country,
      value: row.value,
      year: row.date,
      source: 'World Bank Open Data API (api.worldbank.org/v2) — free, official, no key',
      retrievedAt: new Date().toISOString(),
    }, 200, { 'Cache-Control': 'public, max-age=21600' });
  } catch (err) {
    return jsonResponse({ error: 'fetch_failed', message: String(err) }, 502);
  }
}

function jsonResponse(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, extraHeaders || {}),
  });
}
