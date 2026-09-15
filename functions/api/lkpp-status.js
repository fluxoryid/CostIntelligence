// functions/api/lkpp-status.js — governed LKPP source status adapter.
//
// Primary source: LKPP Open Data CKAN API (data.lkpp.go.id).
// Some Cloudflare edge locations can receive HTTP 525 from data.lkpp.go.id,
// which indicates a TLS handshake failure between Cloudflare and the LKPP
// origin. That is an upstream transport issue, not evidence that LKPP data is
// invalid or unavailable to normal browsers.
//
// Fallback source: LKPP PPID's official Katalog Elektronik V6 information
// page, which links to https://katalog.inaproc.id/. The fallback is deliberately
// treated as an official source-status / catalog-availability check only. It is
// NOT converted into a synthetic product price and never fabricates metadata.

export async function onRequestGet(context) {
  const ckan = await fetchCkanDataset();
  if (ckan.ok) {
    return jsonResponse({
      dataset: ckan.dataset,
      metadataModified: ckan.metadataModified,
      downloadUrl: ckan.downloadUrl,
      format: ckan.format,
      source: 'LKPP Open Data CKAN API (data.lkpp.go.id)',
      sourceMode: 'PRIMARY_CKAN',
      sourceState: 'LIVE',
      evidenceRole: 'SUPPORTING_BENCHMARK_STATUS',
      note: 'Dataset metadata/freshness only; annual XLSX is not treated as a live comparable product price.',
      retrievedAt: new Date().toISOString(),
    }, 200, { 'Cache-Control': 'public, max-age=21600' });
  }

  const ppid = await fetchOfficialPpid();
  if (ppid.ok) {
    return jsonResponse({
      dataset: 'Katalog Elektronik V6',
      metadataModified: null,
      downloadUrl: 'https://katalog.inaproc.id/',
      format: 'WEB',
      source: 'LKPP PPID — Katalog Elektronik V6 (official fallback)',
      sourceMode: 'OFFICIAL_PPID_FALLBACK',
      sourceState: 'LIVE',
      evidenceRole: 'OFFICIAL_CATALOG_STATUS_ONLY',
      note: 'Primary CKAN endpoint was unavailable from this Cloudflare edge. Fallback confirms the official LKPP catalog reference only; no product price is inferred.',
      primaryEndpointStatus: ckan.status || null,
      primaryEndpointError: ckan.error || null,
      retrievedAt: new Date().toISOString(),
    }, 200, { 'Cache-Control': 'public, max-age=3600' });
  }

  return jsonResponse({
    error: 'lkpp_sources_unavailable',
    primaryEndpointStatus: ckan.status || null,
    primaryEndpointError: ckan.error || null,
    fallbackEndpointStatus: ppid.status || null,
    fallbackEndpointError: ppid.error || null,
    retrievedAt: new Date().toISOString(),
  }, 502);
}

async function fetchCkanDataset() {
  try {
    const upstream = await fetch(
      'https://data.lkpp.go.id/api/3/action/package_show?id=data-e-katalog',
      {
        cf: { cacheTtl: 21600, cacheEverything: true },
        headers: { 'Accept': 'application/json', 'User-Agent': 'HPS-Intelligence/1.1' },
      }
    );

    if (!upstream.ok) {
      return { ok: false, status: upstream.status, error: 'upstream_http_error' };
    }

    const data = await upstream.json();
    if (!data || !data.success || !data.result) {
      return { ok: false, status: upstream.status, error: 'unexpected_upstream_shape' };
    }

    const pkg = data.result;
    const resource = Array.isArray(pkg.resources) && pkg.resources.length ? pkg.resources[0] : null;
    return {
      ok: true,
      status: upstream.status,
      dataset: pkg.title || 'Data E-Katalog',
      metadataModified: pkg.metadata_modified || null,
      downloadUrl: resource ? resource.url : null,
      format: resource ? resource.format : null,
    };
  } catch (err) {
    return { ok: false, status: null, error: 'fetch_failed: ' + String(err) };
  }
}

async function fetchOfficialPpid() {
  try {
    const upstream = await fetch(
      'https://ppid.lkpp.go.id/information/public/523/katalog-elektronik-v6',
      {
        cf: { cacheTtl: 3600, cacheEverything: true },
        headers: { 'Accept': 'text/html,application/xhtml+xml', 'User-Agent': 'HPS-Intelligence/1.1' },
      }
    );

    if (!upstream.ok) {
      return { ok: false, status: upstream.status, error: 'upstream_http_error' };
    }

    const html = await upstream.text();
    const hasCatalogReference = /Katalog\s+Elektronik\s+V\.?6/i.test(html) || /katalog\.inaproc\.id/i.test(html);
    if (!hasCatalogReference) {
      return { ok: false, status: upstream.status, error: 'official_reference_not_found' };
    }

    return { ok: true, status: upstream.status };
  } catch (err) {
    return { ok: false, status: null, error: 'fetch_failed: ' + String(err) };
  }
}

function jsonResponse(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }, extraHeaders || {}),
  });
}
