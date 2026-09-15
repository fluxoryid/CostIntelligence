// functions/api/bps-inflation.js — official BPS Web API adapter.
// Requires BPS_API_KEY in Cloudflare Worker environment variables/secrets.
// BPS Web API is free after registration and returns JSON.

export async function onRequestGet(context) {
  const key = context.env && context.env.BPS_API_KEY;
  if (!key) {
    return json({
      error: 'BPS_API_KEY_not_configured',
      message: 'Register for a free BPS Web API key and configure it as BPS_API_KEY in Cloudflare.',
      registrationUrl: 'https://webapi.bps.go.id/developer',
      documentationUrl: 'https://webapi.bps.go.id/documentation/',
      sourceState: 'UNAVAILABLE'
    }, 503);
  }

  try {
    const now = new Date();
    const candidates = [];
    for (let offset = 0; offset < 4; offset++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
      candidates.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
    }

    let selected = null;
    let selectedPeriod = null;

    for (const period of candidates) {
      const listUrl = 'https://webapi.bps.go.id/v1/api/list' +
        '?model=pressrelease&lang=ind&domain=0000' +
        '&year=' + encodeURIComponent(period.year) +
        '&month=' + encodeURIComponent(period.month) +
        '&keyword=' + encodeURIComponent('inflasi') +
        '&key=' + encodeURIComponent(key);

      const r = await fetch(listUrl, {
        cf: { cacheTtl: 21600, cacheEverything: true },
        headers: { 'Accept': 'application/json' }
      });
      if (!r.ok) {
        return json({ error: 'bps_upstream_error', status: r.status, sourceState: 'UNAVAILABLE' }, 502);
      }

      const body = await r.json();
      if (body && body.status === 'OK' && Array.isArray(body.data) && Array.isArray(body.data[1])) {
        const rows = body.data[1];
        selected = rows.find(function (row) {
          const t = String((row && row.title) || '').toLowerCase();
          return t.includes('inflasi') && (t.includes('year-on-year') || t.includes('y-on-y'));
        }) || rows.find(function (row) {
          return String((row && row.title) || '').toLowerCase().includes('inflasi');
        });
        if (selected) {
          selectedPeriod = period;
          break;
        }
      }
    }

    if (!selected || !selected.brs_id) {
      return json({ error: 'bps_inflation_release_not_found', sourceState: 'UNAVAILABLE' }, 404);
    }

    const detailUrl = 'https://webapi.bps.go.id/v1/view' +
      '?model=pressrelease&lang=ind&domain=0000' +
      '&id=' + encodeURIComponent(selected.brs_id) +
      '&key=' + encodeURIComponent(key);

    const dr = await fetch(detailUrl, {
      cf: { cacheTtl: 21600, cacheEverything: true },
      headers: { 'Accept': 'application/json' }
    });
    if (!dr.ok) {
      return json({ error: 'bps_detail_upstream_error', status: dr.status, sourceState: 'UNAVAILABLE' }, 502);
    }

    const detailBody = await dr.json();
    const detail = detailBody && detailBody.data ? detailBody.data : {};
    const title = clean(detail.title || selected.title || '');
    const abstract = clean(detail.abstract || '');
    const combined = title + ' ' + abstract;

    const yoy = parsePercent(combined, /inflasi\s+(?:year-on-year\s*\(y-on-y\)|y-on-y)[^0-9]{0,120}(?:sebesar|tercatat sebesar)?\s*([0-9]+(?:[.,][0-9]+)?)\s*persen/i);
    const cpi = parseNumber(combined, /Indeks Harga Konsumen\s*\(IHK\)\s*sebesar\s*([0-9]+(?:[.,][0-9]+)?)/i);
    const mom = parseSignedPercent(combined, /(inflasi|deflasi)\s+month-to-month\s*\(m-to-m\)[^0-9]{0,120}(?:sebesar|tercatat sebesar)?\s*([0-9]+(?:[.,][0-9]+)?)\s*persen/i);
    const ytd = parseSignedPercent(combined, /(inflasi|deflasi)\s+year-to-date\s*\(y-to-d\)[^0-9]{0,120}(?:sebesar|tercatat sebesar)?\s*([0-9]+(?:[.,][0-9]+)?)\s*persen/i);
    const ref = title.match(/pada\s+([A-Za-zÀ-ÿ]+\s+\d{4})/i);

    if (yoy == null) {
      return json({
        error: 'bps_inflation_value_not_parsed',
        title: title,
        brsId: selected.brs_id,
        releaseDate: detail.rl_date || selected.rl_date || null,
        sourceState: 'UNAVAILABLE'
      }, 502);
    }

    return json({
      headlineInflationYoY: yoy,
      cpi: cpi,
      inflationMoM: mom,
      inflationYTD: ytd,
      unit: 'percent',
      referencePeriod: ref ? ref[1] : null,
      releaseDate: detail.rl_date || selected.rl_date || null,
      brsId: selected.brs_id,
      title: title,
      source: 'BPS Web API — Berita Resmi Statistik (official JSON)',
      sourceMode: 'OFFICIAL_BPS_WEBAPI',
      sourceState: 'LIVE',
      evidenceRole: 'OFFICIAL_DOMESTIC_INFLATION_PRIMARY',
      queryPeriod: selectedPeriod,
      retrievedAt: new Date().toISOString()
    }, 200, { 'Cache-Control': 'public, max-age=21600' });
  } catch (err) {
    return json({ error: 'bps_fetch_failed', message: String(err), sourceState: 'UNAVAILABLE' }, 502);
  }
}

function clean(value) {
  return String(value == null ? '' : value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumber(text, re) {
  const m = String(text || '').match(re);
  if (!m) return null;
  const n = Number(String(m[1]).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function parsePercent(text, re) {
  const m = String(text || '').match(re);
  if (!m) return null;
  const n = Number(String(m[1]).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function parseSignedPercent(text, re) {
  const m = String(text || '').match(re);
  if (!m) return null;
  const n = Number(String(m[2]).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return String(m[1]).toLowerCase() === 'deflasi' ? -n : n;
}

function json(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }, extraHeaders || {})
  });
}
