// functions/api/lkpp-status.js — Cloudflare Pages Function.
//
// data.lkpp.go.id is a real, confirmed-reachable CKAN 2.10.5 instance —
// unlike BPS, nothing here blocks cloud/serverless IPs. This calls the
// standard CKAN Action API (package_show) to get REAL metadata about the
// "Data E-Katalog" dataset: when it was actually last updated, and the
// direct download link.
//
// Honesty note: that dataset itself is published as an annual XLSX
// workbook, not a live JSON/CSV feed, so this deliberately does NOT
// pretend to extract a single comparable price from it — that would need
// in-Worker spreadsheet parsing and would misrepresent a once-a-year
// aggregate as a live price point. What's genuinely live here is the
// *connection* and the *freshness check* — knowing accurately whether the
// dataset has been updated recently, straight from the source.

export async function onRequestGet(context) {
  try {
    const upstream = await fetch(
      'https://data.lkpp.go.id/api/3/action/package_show?id=data-e-katalog',
      { cf: { cacheTtl: 21600, cacheEverything: true } }
    );
    if (!upstream.ok) {
      return jsonResponse({ error: 'upstream_error', status: upstream.status }, 502);
    }
    const data = await upstream.json();
    if (!data.success || !data.result) {
      return jsonResponse({ error: 'unexpected_upstream_shape' }, 502);
    }
    const pkg = data.result;
    const resource = (pkg.resources || [])[0];
    return jsonResponse({
      dataset: pkg.title || 'Data E-Katalog',
      metadataModified: pkg.metadata_modified || null,
      downloadUrl: resource ? resource.url : null,
      format: resource ? resource.format : null,
      source: 'LKPP Open Data CKAN API (data.lkpp.go.id) — real connection, dataset itself is an annual XLSX, not a live feed',
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
