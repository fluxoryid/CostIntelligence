// functions/api/fx-usd-idr.js — Cloudflare Pages Function.
//
// Deployed automatically alongside the static site when you upload this
// `functions/` folder to Cloudflare Pages (no separate Worker project, no
// extra setup — Pages Functions just work from this folder path).
//
// Tries Bank Indonesia's own published JISDOR figure FIRST (scraped from
// their real "Indikator" page — see scrapeBiJisdor below), since that is
// the actual official reference rate, not a generic market rate. BI has
// no free, key-free JSON API for this (confirmed: their site is HTML-only;
// official-rate resellers require a paid key), so this parses their real
// published page directly. If that scrape fails for any reason (page
// layout changed, BI's site is down, etc.) it falls back to a genuine
// market-rate proxy (ExchangeRate-API, free/keyless) rather than serving
// stale or fabricated data — the response always says which one was used.

export async function onRequestGet(context) {
  const bi = await scrapeBiJisdor();
  if (bi) {
    return jsonResponse(bi, 200, { 'Cache-Control': 'public, max-age=3600' });
  }
  const fallback = await fetchMarketRateFallback();
  if (fallback) {
    return jsonResponse(fallback, 200, { 'Cache-Control': 'public, max-age=1800' });
  }
  return jsonResponse({ error: 'all_sources_failed' }, 502);
}

// Scrapes Bank Indonesia's real "Indikator" page, which publishes JISDOR
// as a clean, human-readable card: "JISDOR" followed by "Rp 17.611" and a
// date. This is not a stable/documented API — a plausibility check on the
// parsed number guards against silently returning garbage if BI ever
// changes their page layout.
async function scrapeBiJisdor() {
  try {
    const upstream = await fetch('https://www.bi.go.id/id/statistik/indikator/Default.aspx', {
      cf: { cacheTtl: 3600, cacheEverything: true },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HPSIntelligenceBot/1.0; +procurement tool)' },
    });
    if (!upstream.ok) return null;
    const html = await upstream.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ');
    const m = text.match(/JISDOR\s*Rp\s*([\d.,]+)\s*(\d{1,2}\s+\w+\s+\d{4})/i);
    if (!m) return null;
    const rate = parseFloat(m[1].replace(/\./g, '').replace(/,/g, '.'));
    // Plausibility guard: USD/IDR has stayed roughly in this band for
    // years — a parse bug (e.g. accidentally grabbing BI-Rate's "5,75%"
    // instead) would produce an implausible number, which we refuse to
    // present as a real rate rather than silently pass through.
    if (!isFinite(rate) || rate < 5000 || rate > 30000) return null;
    return {
      pair: 'USD/IDR',
      rate: rate,
      source: 'Bank Indonesia JISDOR (scraped from bi.go.id/id/statistik/indikator — official page, no stable API)',
      publishedDateRaw: m[2],
      retrievedAt: new Date().toISOString(),
    };
  } catch (err) {
    return null;
  }
}

async function fetchMarketRateFallback() {
  try {
    const upstream = await fetch('https://open.er-api.com/v6/latest/USD', {
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    if (!upstream.ok) return null;
    const data = await upstream.json();
    if (data.result !== 'success' || !data.rates || typeof data.rates.IDR !== 'number') return null;
    return {
      pair: 'USD/IDR',
      rate: data.rates.IDR,
      source: 'ExchangeRate-API (fallback — open access market reference, BI JISDOR scrape unavailable right now)',
      publishedAt: data.time_last_update_utc || null,
      retrievedAt: new Date().toISOString(),
    };
  } catch (err) {
    return null;
  }
}

function jsonResponse(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, extraHeaders || {}),
  });
}
