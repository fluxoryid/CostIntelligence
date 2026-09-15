// functions/api/bps-inflation.js — official BPS Web API adapter.
// Requires BPS_API_KEY in Cloudflare Worker environment variables/secrets.
// Uses BPS WebAPI path-segment routing (not query-string routing).

export async function onRequestGet(context) {
  const key = context.env && context.env.BPS_API_KEY;
  if (!key) {
    return json({
      error: 'BPS_API_KEY_not_configured',
      message: 'Configure the BPS Web API App ID as BPS_API_KEY in Cloudflare.',
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
    let lastDiagnostic = null;

    for (const period of candidates) {
      const urls = [
        // Preferred filtered request.
        bpsListUrl(key, period.year, period.month, 'inflasi'),
        // Fallback: some BPS deployments are more tolerant without keyword.
        bpsListUrl(key, period.year, period.month, null)
      ];

      for (const listUrl of urls) {
        const result = await fetchBpsJson(listUrl, 'list');
        if (!result.ok) {
          lastDiagnostic = result.diagnostic;
          continue;
        }

        const rows = extractRows(result.body);
        selected = chooseInflationRelease(rows);
        if (selected) {
          selectedPeriod = period;
          break;
        }
      }

      if (selected) break;
    }

    // Final fallback: ask for the latest press releases without date filters and
    // locally select an inflation release. This keeps the adapter resilient to
    // BPS filter-routing changes while still using the official Web API.
    if (!selected) {
      const latestUrl = 'https://webapi.bps.go.id/v1/api/list/model/pressrelease/lang/ind/domain/0000/page/1/key/' + encodeURIComponent(key) + '/';
      const result = await fetchBpsJson(latestUrl, 'latest-list');
      if (result.ok) selected = chooseInflationRelease(extractRows(result.body));
      else lastDiagnostic = result.diagnostic;
    }

    if (!selected || !releaseId(selected)) {
      return json({
        error: 'bps_inflation_release_not_found',
        sourceState: 'UNAVAILABLE',
        diagnostic: lastDiagnostic
      }, 404);
    }

    const id = releaseId(selected);
    const detailUrl = 'https://webapi.bps.go.id/v1/api/view/domain/0000/model/pressrelease/lang/ind/id/' +
      encodeURIComponent(id) + '/key/' + encodeURIComponent(key) + '/';

    const detailResult = await fetchBpsJson(detailUrl, 'detail');
    if (!detailResult.ok) {
      return json({
        error: 'bps_detail_upstream_error',
        sourceState: 'UNAVAILABLE',
        diagnostic: detailResult.diagnostic
      }, 502);
    }

    const detailBody = detailResult.body;
    const detail = detailBody && detailBody.data && !Array.isArray(detailBody.data)
      ? detailBody.data
      : (detailBody && Array.isArray(detailBody.data) ? (detailBody.data[1] || detailBody.data[0] || {}) : {});

    const title = clean(detail.title || selected.title || '');
    const abstract = clean(detail.abstract || selected.abstract || '');
    const combined = (title + ' ' + abstract).replace(/\s+/g, ' ').trim();

    // Current BPS titles commonly look like:
    // "Inflasi year-on-year (y-on-y) pada Agustus 2026 sebesar 3,19 persen ..."
    // Allow year digits between the measure label and the value.
    const yoy = firstPercent(combined, [
      /(?:inflasi\s+)?year-on-year\s*\(y-on-y\)[\s\S]{0,220}?sebesar\s*([0-9]+(?:[.,][0-9]+)?)\s*persen/i,
      /(?:inflasi\s+)?y-on-y[\s\S]{0,220}?sebesar\s*([0-9]+(?:[.,][0-9]+)?)\s*persen/i,
      /inflasi\s+tahunan[\s\S]{0,220}?sebesar\s*([0-9]+(?:[.,][0-9]+)?)\s*persen/i
    ]);

    const cpi = firstNumber(combined, [
      /Indeks Harga Konsumen\s*\(IHK\)[\s\S]{0,80}?sebesar\s*([0-9]+(?:[.,][0-9]+)?)/i,
      /IHK[\s\S]{0,80}?sebesar\s*([0-9]+(?:[.,][0-9]+)?)/i
    ]);

    const mom = signedMeasure(combined, /month-to-month\s*\(m-to-m\)/i);
    const ytd = signedMeasure(combined, /year-to-date\s*\(y-to-d\)/i);
    const ref = title.match(/pada\s+([A-Za-zÀ-ÿ]+\s+\d{4})/i);

    if (yoy == null) {
      return json({
        error: 'bps_inflation_value_not_parsed',
        title: title,
        brsId: id,
        releaseDate: detail.rl_date || selected.rl_date || null,
        sourceState: 'UNAVAILABLE',
        note: 'BPS Web API connection succeeded, but the current release wording did not match the inflation parser.'
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
      brsId: id,
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

function bpsListUrl(key, year, month, keyword) {
  let url = 'https://webapi.bps.go.id/v1/api/list/model/pressrelease/lang/ind/domain/0000' +
    '/year/' + encodeURIComponent(year) +
    '/month/' + encodeURIComponent(month) +
    '/page/1';
  if (keyword) url += '/keyword/' + encodeURIComponent(keyword);
  url += '/key/' + encodeURIComponent(key) + '/';
  return url;
}

async function fetchBpsJson(url, stage) {
  try {
    const r = await fetch(url, {
      cf: { cacheTtl: 21600, cacheEverything: true },
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'HPS-Intelligence/1.1 (official BPS WebAPI client)'
      }
    });

    const text = await r.text();
    const diagnostic = {
      stage: stage,
      httpStatus: r.status,
      contentType: r.headers.get('content-type') || null,
      bodyLength: text.length
    };

    if (!r.ok) return { ok: false, diagnostic: diagnostic };
    if (!text.trim()) {
      diagnostic.reason = 'empty_response_body';
      return { ok: false, diagnostic: diagnostic };
    }

    try {
      const body = JSON.parse(text);
      if (body && String(body.status || '').toLowerCase() === 'error') {
        diagnostic.reason = body.message || 'bps_returned_error';
        return { ok: false, diagnostic: diagnostic };
      }
      return { ok: true, body: body, diagnostic: diagnostic };
    } catch (e) {
      diagnostic.reason = 'non_json_response';
      diagnostic.bodyPreview = text.slice(0, 160);
      return { ok: false, diagnostic: diagnostic };
    }
  } catch (e) {
    return {
      ok: false,
      diagnostic: { stage: stage, reason: 'fetch_exception', message: String(e) }
    };
  }
}

function extractRows(body) {
  if (!body) return [];
  if (Array.isArray(body.data)) {
    // BPS list endpoints commonly return data as [metadata, rows].
    for (let i = body.data.length - 1; i >= 0; i--) {
      if (Array.isArray(body.data[i])) return body.data[i];
    }
    // Some variants return rows directly in data.
    if (body.data.length && typeof body.data[0] === 'object') return body.data;
  }
  if (Array.isArray(body.result)) return body.result;
  return [];
}

function chooseInflationRelease(rows) {
  if (!Array.isArray(rows)) return null;
  const inflation = rows.filter(function (row) {
    const t = clean((row && row.title) || '').toLowerCase();
    return t.includes('inflasi');
  });
  if (!inflation.length) return null;

  return inflation.find(function (row) {
    const t = clean((row && row.title) || '').toLowerCase();
    return t.includes('year-on-year') || t.includes('y-on-y');
  }) || inflation[0];
}

function releaseId(row) {
  return row && (row.brs_id || row.id || row.pressrelease_id || row.press_release_id);
}

function clean(value) {
  return String(value == null ? '' : value)
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toDecimal(value) {
  if (value == null) return null;
  const s = String(value).trim();
  // Percentages from Indonesian prose use comma as decimal separator.
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function firstPercent(text, regexes) {
  for (const re of regexes) {
    const m = String(text || '').match(re);
    if (m) {
      const n = toDecimal(m[1]);
      if (n != null) return n;
    }
  }
  return null;
}

function firstNumber(text, regexes) {
  return firstPercent(text, regexes);
}

function signedMeasure(text, labelRegex) {
  const source = String(text || '');
  const m = labelRegex.exec(source);
  if (!m) return null;
  const start = Math.max(0, m.index - 100);
  const end = Math.min(source.length, m.index + m[0].length + 180);
  const windowText = source.slice(start, end);
  const numberMatch = windowText.match(/sebesar\s*([0-9]+(?:[.,][0-9]+)?)\s*persen/i);
  if (!numberMatch) return null;
  const n = toDecimal(numberMatch[1]);
  if (n == null) return null;
  return /deflasi/i.test(windowText) ? -n : n;
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
