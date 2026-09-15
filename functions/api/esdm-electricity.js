// functions/api/esdm-electricity.js — Cloudflare Pages Function.
//
// Confirms live reachability of the actual primary regulation — Permen
// ESDM No. 7/2024 on jdih.esdm.go.id (NOT PLN's blocked customer portal,
// a different domain entirely). This regulation contains the complete
// base electricity tariff table for every customer class and the full
// tariff-adjustment formula.
//
// Honesty note, same as LKPP: this base regulation changes only when a
// new Permen supersedes it (infrequent), not on a schedule we can predict.
// So rather than pretending to extract a specific Rp/kWh figure and call
// it "live" (which would be misleading for something that only changes
// on a new regulation, not daily/monthly), this checks that the document
// is still genuinely reachable and reports its real HTTP freshness
// headers — a live connection status, not a fabricated live price.

export async function onRequestGet(context) {
  try {
    const url = 'https://jdih.esdm.go.id/common/dokumen-external/Permen%20ESDM%20Nomor%207%20Tahun%202024.pdf';
    const upstream = await fetch(url, {
      method: 'HEAD',
      cf: { cacheTtl: 86400, cacheEverything: true },
    });
    if (!upstream.ok) {
      return jsonResponse({ error: 'upstream_error', status: upstream.status }, 502);
    }
    return jsonResponse({
      regulation: 'Permen ESDM No. 7 Tahun 2024 \u2014 Tarif Tenaga Listrik PT PLN (Persero)',
      documentUrl: url,
      lastModifiedHeader: upstream.headers.get('last-modified') || null,
      contentLength: upstream.headers.get('content-length') || null,
      source: 'jdih.esdm.go.id (ESDM\u2019s own regulation repository \u2014 not PLN\u2019s blocked customer site)',
      note: 'Confirms the base tariff regulation and its full adjustment formula (Lampiran IX: %TA = f(kurs, ICP, inflasi, HBA)) are genuinely reachable. This is a reachability/freshness check, not a live-extracted tariff figure \u2014 the base table only changes when a new Permen supersedes this one.',
      retrievedAt: new Date().toISOString(),
    }, 200, { 'Cache-Control': 'public, max-age=86400' });
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
