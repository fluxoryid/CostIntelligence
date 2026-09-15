// functions/api/kurs-pajak.js — Cloudflare Pages Function.
//
// Scrapes the Ministry of Finance's real, official, server-rendered weekly
// Customs Tax Exchange Rate (Kurs Pajak / KMK Kurs) page — confirmed free
// ("Rp0, tidak dipungut biaya"). This is the rate DJBC/DJP actually use to
// settle import duty, VAT, luxury tax, and export duty — more precise than
// JISDOR for that specific purpose (JISDOR is a market reference; this is
// the legally applicable weekly customs rate, published every Wednesday).
//
// Confirmed structure via manual inspection: a clean HTML table with one
// row per currency (No | Mata Uang | Nilai | Perubahan), 25 currencies,
// USD included. Parses USD by default; ?currency=EUR etc. also supported.

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const wantedCurrency = (url.searchParams.get('currency') || 'USD').toUpperCase();
  try {
    const upstream = await fetch('https://fiskal.kemenkeu.go.id/informasi-publik/kurs-pajak', {
      cf: { cacheTtl: 3600, cacheEverything: true },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HPSIntelligenceBot/1.0; +procurement tool)' },
    });
    if (!upstream.ok) return jsonResponse({ error: 'upstream_error', status: upstream.status }, 502);
    const html = await upstream.text();

    // Effective period, e.g. "09 September 2026 - 15 September 2026"
    const periodMatch = html.match(/Tanggal berlaku:\s*([\d]{1,2}\s+\w+\s+\d{4})\s*-\s*([\d]{1,2}\s+\w+\s+\d{4})/i);

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ');

    // Row shape after tag-stripping: "... (USD) USD <value> <change>..."
    const rowRegex = new RegExp('\\(' + wantedCurrency + '\\)\\s*' + wantedCurrency + '\\s*([\\d.,]+)\\s*(-?[\\d.,]+)', 'i');
    const m = text.match(rowRegex);
    if (!m) return jsonResponse({ error: 'currency_not_found', currency: wantedCurrency }, 404);

    const rate = parseFloat(m[1].replace(/\./g, '').replace(/,/g, '.'));
    if (!isFinite(rate) || rate <= 0) return jsonResponse({ error: 'implausible_value', raw: m[1] }, 502);
    // JPY is quoted per 100 yen on this page (site's own footnote) — normalize to per-1-unit.
    const normalizedRate = wantedCurrency === 'JPY' ? rate / 100 : rate;

    return jsonResponse({
      currency: wantedCurrency,
      pair: wantedCurrency + '/IDR',
      rate: normalizedRate,
      effectivePeriod: periodMatch ? (periodMatch[1] + ' - ' + periodMatch[2]) : null,
      source: 'Kementerian Keuangan — Kurs Pajak (weekly customs/tax settlement rate, DJBC & DJP), fiskal.kemenkeu.go.id — official, free',
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
