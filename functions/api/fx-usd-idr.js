import { fetchBiKurs, pickLatestJisdor } from '../lib/bi-kurs-client.js';

// USD/IDR provider for CostIntelligence.
// Production priority is strictly official Bank Indonesia evidence:
// 1) Bank Indonesia wsKursBI official web service (JISDOR)
// 2) Bank Indonesia official indicator page fallback
// If both fail, the provider is UNAVAILABLE. A third-party market rate is not
// silently substituted into HPS because it is not JISDOR.

export async function onRequestGet() {
  const ws = await fetchWsJisdor();
  if (ws) return jsonResponse(ws, 200, { 'Cache-Control': 'public, max-age=1800' });

  const scraped = await scrapeBiJisdor();
  if (scraped) return jsonResponse(scraped, 200, { 'Cache-Control': 'public, max-age=3600' });

  return jsonResponse({
    error: 'official_bi_jisdor_unavailable',
    sourceState: 'UNAVAILABLE',
    evidenceRole: 'OFFICIAL_FX_REFERENCE_USD_IDR',
    materialUseAllowed: false,
    note: 'No third-party market rate is substituted for JISDOR in production HPS.'
  }, 502);
}

async function fetchWsJisdor() {
  try {
    const data = await fetchBiKurs({ series: 'jisdor', mode: 'latest' });
    const row = pickLatestJisdor(data.records);
    if (!row || typeof row.rate !== 'number') return null;
    if (!isFinite(row.rate) || row.rate < 5000 || row.rate > 30000) return null;
    return {
      pair: 'USD/IDR',
      rate: row.rate,
      source: 'Bank Indonesia JISDOR — wsKursBI official web service',
      sourceMode: 'OFFICIAL_BI_WSKURSBI',
      sourceState: 'LIVE',
      evidenceRole: 'OFFICIAL_FX_REFERENCE_USD_IDR',
      materialUseAllowed: true,
      publishedDateRaw: row.date,
      operation: data.operation,
      retrievedAt: new Date().toISOString()
    };
  } catch (err) {
    return null;
  }
}

async function scrapeBiJisdor() {
  try {
    const upstream = await fetch('https://www.bi.go.id/id/statistik/indikator/Default.aspx', {
      cf: { cacheTtl: 3600, cacheEverything: true },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CostIntelligence/1.2; official BI page fallback)' }
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
    if (!isFinite(rate) || rate < 5000 || rate > 30000) return null;
    return {
      pair: 'USD/IDR',
      rate,
      source: 'Bank Indonesia JISDOR — official indicator page fallback',
      sourceMode: 'OFFICIAL_BI_PAGE_FALLBACK',
      sourceState: 'LIVE',
      evidenceRole: 'OFFICIAL_FX_REFERENCE_USD_IDR',
      materialUseAllowed: true,
      publishedDateRaw: m[2],
      retrievedAt: new Date().toISOString()
    };
  } catch (err) {
    return null;
  }
}

function jsonResponse(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }, extraHeaders || {})
  });
}
