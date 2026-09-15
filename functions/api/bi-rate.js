// functions/api/bi-rate.js — Cloudflare Pages Function.
//
// Same source page as fx-usd-idr.js's BI scrape (bi.go.id indicator page),
// which also publishes BI-Rate (the policy interest rate) in the same
// clean card format. Separate endpoint for clarity, but Cloudflare's edge
// cache means this rarely triggers a second real fetch to bi.go.id.

export async function onRequestGet(context) {
  try {
    const upstream = await fetch('https://www.bi.go.id/id/statistik/indikator/Default.aspx', {
      cf: { cacheTtl: 3600, cacheEverything: true },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HPSIntelligenceBot/1.0; +procurement tool)' },
    });
    if (!upstream.ok) return jsonResponse({ error: 'upstream_error', status: upstream.status }, 502);
    const html = await upstream.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ');
    const m = text.match(/BI-Rate\s*([\d.,]+)\s*%\s*(\d{1,2}\s+\w+\s+\d{4})/i);
    if (!m) return jsonResponse({ error: 'pattern_not_found' }, 502);
    const rate = parseFloat(m[1].replace(/,/g, '.'));
    if (!isFinite(rate) || rate < 0 || rate > 25) return jsonResponse({ error: 'implausible_value', raw: m[1] }, 502);
    return jsonResponse({
      rate: rate,
      unit: 'percent',
      publishedDateRaw: m[2],
      source: 'Bank Indonesia BI-Rate (scraped from bi.go.id/id/statistik/indikator — official page, no stable API)',
      retrievedAt: new Date().toISOString(),
    }, 200, { 'Cache-Control': 'public, max-age=3600' });
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
