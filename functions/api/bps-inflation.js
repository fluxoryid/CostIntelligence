// functions/api/bps-inflation.js — official BPS inflation adapter.
// Preferred source: BPS WebAPI JSON using BPS_API_KEY.
// Production fallback: official www.bps.go.id national press-release page.
// The fallback exists because BPS WebAPI may return an empty HTML response to
// cloud/serverless egress even when the API key is valid.

const DEFAULT_OFFICIAL_RELEASE_URL =
  'https://www.bps.go.id/id/pressrelease/2026/09/01/2611/inflasi-year-on-year--y-on-y--pada-agustus-2026-sebesar-3-19-persen-.html';

export async function onRequestGet(context) {
  const env = (context && context.env) || {};
  const key = env.BPS_API_KEY || null;
  let webApiDiagnostic = key ? null : { stage: 'configuration', reason: 'BPS_API_KEY_not_configured' };

  // 1) Preferred route: official BPS WebAPI JSON.
  if (key) {
    const webApiResult = await tryWebApi(key);
    if (webApiResult.ok) {
      return json(webApiResult.data, 200, { 'Cache-Control': 'public, max-age=21600' });
    }
    webApiDiagnostic = webApiResult.diagnostic || { reason: 'unknown_webapi_failure' };
  }

  // 2) Official-source fallback: BPS national public press release.
  // The environment variable allows operations to override the release URL when
  // BPS publishes the next monthly release, without changing application code.
  const releaseUrl = env.BPS_INFLATION_RELEASE_URL || DEFAULT_OFFICIAL_RELEASE_URL;
  const fallback = await fetchOfficialRelease(releaseUrl);
  if (fallback.ok) {
    fallback.data.webApiDiagnostic = webApiDiagnostic;
    return json(fallback.data, 200, { 'Cache-Control': 'public, max-age=21600' });
  }

  return json({
    error: 'bps_all_official_routes_unavailable',
    sourceState: 'UNAVAILABLE',
    webApiDiagnostic: webApiDiagnostic,
    publicReleaseDiagnostic: fallback.diagnostic,
    note: 'No BPS value is fabricated when both official routes are unavailable.'
  }, 502);
}

async function tryWebApi(key) {
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
      bpsListUrl(key, period.year, period.month, 'inflasi'),
      bpsListUrl(key, period.year, period.month, null)
    ];

    for (const listUrl of urls) {
      const result = await fetchBpsJson(listUrl, 'list');
      if (!result.ok) {
        lastDiagnostic = result.diagnostic;
        continue;
      }
      selected = chooseInflationRelease(extractRows(result.body));
      if (selected) {
        selectedPeriod = period;
        break;
      }
    }
    if (selected) break;
  }

  if (!selected) {
    const latestUrl = 'https://webapi.bps.go.id/v1/api/list/model/pressrelease/lang/ind/domain/0000/page/1/key/' +
      encodeURIComponent(key) + '/';
    const result = await fetchBpsJson(latestUrl, 'latest-list');
    if (result.ok) selected = chooseInflationRelease(extractRows(result.body));
    else lastDiagnostic = result.diagnostic;
  }

  if (!selected || !releaseId(selected)) {
    return { ok: false, diagnostic: lastDiagnostic || { reason: 'inflation_release_not_found' } };
  }

  const id = releaseId(selected);
  const detailUrl = 'https://webapi.bps.go.id/v1/api/view/domain/0000/model/pressrelease/lang/ind/id/' +
    encodeURIComponent(id) + '/key/' + encodeURIComponent(key) + '/';
  const detailResult = await fetchBpsJson(detailUrl, 'detail');
  if (!detailResult.ok) return { ok: false, diagnostic: detailResult.diagnostic };

  const detailBody = detailResult.body;
  const detail = detailBody && detailBody.data && !Array.isArray(detailBody.data)
    ? detailBody.data
    : (detailBody && Array.isArray(detailBody.data) ? (detailBody.data[1] || detailBody.data[0] || {}) : {});

  const parsed = parseInflationText(
    clean(detail.title || selected.title || ''),
    clean(detail.abstract || selected.abstract || '')
  );
  if (parsed.yoy == null) {
    return { ok: false, diagnostic: { stage: 'detail-parse', reason: 'inflation_value_not_parsed', brsId: id } };
  }

  const releaseDate = detail.rl_date || selected.rl_date || null;
  return {
    ok: true,
    data: buildResult({
      parsed: parsed,
      releaseDate: releaseDate,
      brsId: id,
      source: 'BPS Web API — Berita Resmi Statistik (official JSON)',
      sourceMode: 'OFFICIAL_BPS_WEBAPI',
      sourceUrl: detailUrl,
      queryPeriod: selectedPeriod
    })
  };
}

async function fetchOfficialRelease(url) {
  try {
    const r = await fetch(url, {
      cf: { cacheTtl: 21600, cacheEverything: true },
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.7',
        'User-Agent': 'Mozilla/5.0 (compatible; HPSIntelligence/1.1; official BPS source verification)'
      }
    });
    const html = await r.text();
    const diagnostic = {
      stage: 'official-public-release',
      httpStatus: r.status,
      contentType: r.headers.get('content-type') || null,
      bodyLength: html.length,
      url: url
    };
    if (!r.ok) return { ok: false, diagnostic: diagnostic };
    if (!html.trim()) {
      diagnostic.reason = 'empty_response_body';
      return { ok: false, diagnostic: diagnostic };
    }

    const text = clean(html);
    const title = extractHtmlTitle(html) || extractInflationTitle(text) || '';
    const parsed = parseInflationText(title, text);
    if (parsed.yoy == null) {
      diagnostic.reason = 'inflation_value_not_parsed';
      diagnostic.bodyPreview = text.slice(0, 240);
      return { ok: false, diagnostic: diagnostic };
    }

    const releaseDate = parseReleaseDateFromUrl(url) || parseReleaseDateFromText(text);
    const brsId = parseBRSIdFromUrl(url);
    return {
      ok: true,
      data: buildResult({
        parsed: parsed,
        releaseDate: releaseDate,
        brsId: brsId,
        source: 'BPS — Berita Resmi Statistik public release (official bps.go.id)',
        sourceMode: 'OFFICIAL_BPS_PUBLIC_RELEASE_FALLBACK',
        sourceUrl: url,
        queryPeriod: null
      })
    };
  } catch (e) {
    return { ok: false, diagnostic: { stage: 'official-public-release', reason: 'fetch_exception', message: String(e), url: url } };
  }
}

function buildResult(args) {
  const parsed = args.parsed;
  const ageDays = releaseAgeDays(args.releaseDate);
  const state = ageDays != null && ageDays > 45 ? 'STALE' : 'LIVE';
  return {
    headlineInflationYoY: parsed.yoy,
    cpi: parsed.cpi,
    inflationMoM: parsed.mom,
    inflationYTD: parsed.ytd,
    unit: 'percent',
    referencePeriod: parsed.referencePeriod,
    releaseDate: args.releaseDate,
    releaseAgeDays: ageDays,
    brsId: args.brsId || null,
    title: parsed.title || null,
    source: args.source,
    sourceMode: args.sourceMode,
    sourceUrl: args.sourceUrl,
    sourceState: state,
    evidenceRole: 'OFFICIAL_DOMESTIC_INFLATION_PRIMARY',
    queryPeriod: args.queryPeriod || null,
    note: state === 'STALE'
      ? 'Official BPS primary source, but release is older than 45 days and must not be treated as current inflation.'
      : 'Official BPS primary domestic inflation source. This is a cost driver, not a direct product-price benchmark.',
    retrievedAt: new Date().toISOString()
  };
}

function parseInflationText(title, body) {
  const combined = clean((title || '') + ' ' + (body || ''));
  const yoy = firstPercent(combined, [
    /(?:terjadi\s+)?inflasi\s+year-on-year\s*\(y-on-y\)[\s\S]{0,220}?sebesar\s*([0-9]+(?:[.,][0-9]+)?)\s*persen/i,
    /(?:inflasi\s+)?year-on-year\s*\(y-on-y\)[\s\S]{0,220}?sebesar\s*([0-9]+(?:[.,][0-9]+)?)\s*persen/i,
    /inflasi\s+y-on-y[\s\S]{0,220}?sebesar\s*([0-9]+(?:[.,][0-9]+)?)\s*persen/i
  ]);
  const cpi = firstPercent(combined, [
    /Indeks Harga Konsumen\s*\(IHK\)[\s\S]{0,80}?sebesar\s*([0-9]+(?:[.,][0-9]+)?)/i,
    /IHK[\s\S]{0,80}?sebesar\s*([0-9]+(?:[.,][0-9]+)?)/i
  ]);
  const mom = signedMeasure(combined, /month[- ]to[- ]month\s*\(m-to-m\)/i);
  const ytd = signedMeasure(combined, /year\s*to\s*date\s*\(y-to-d\)/i);
  const ref = combined.match(/pada\s+([A-Za-zÀ-ÿ]+\s+\d{4})/i);
  return {
    yoy: yoy,
    cpi: cpi,
    mom: mom,
    ytd: ytd,
    referencePeriod: ref ? ref[1] : null,
    title: title || null
  };
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
    return { ok: false, diagnostic: { stage: stage, reason: 'fetch_exception', message: String(e) } };
  }
}

function extractRows(body) {
  if (!body) return [];
  if (Array.isArray(body.data)) {
    for (let i = body.data.length - 1; i >= 0; i--) {
      if (Array.isArray(body.data[i])) return body.data[i];
    }
    if (body.data.length && typeof body.data[0] === 'object') return body.data;
  }
  if (Array.isArray(body.result)) return body.result;
  return [];
}

function chooseInflationRelease(rows) {
  if (!Array.isArray(rows)) return null;
  const inflation = rows.filter(function (row) {
    return clean((row && row.title) || '').toLowerCase().includes('inflasi');
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

function extractHtmlTitle(html) {
  const m = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? clean(m[1].replace(/\s*-\s*Badan Pusat Statistik[\s\S]*$/i, '')) : null;
}

function extractInflationTitle(text) {
  const m = String(text || '').match(/Inflasi\s+year-on-year\s*\(y-on-y\)[^.]{0,180}?persen\.?/i);
  return m ? clean(m[0]) : null;
}

function parseReleaseDateFromUrl(url) {
  const m = String(url || '').match(/\/pressrelease\/(\d{4})\/(\d{2})\/(\d{2})\//i);
  return m ? (m[1] + '-' + m[2] + '-' + m[3]) : null;
}

function parseBRSIdFromUrl(url) {
  const m = String(url || '').match(/\/pressrelease\/\d{4}\/\d{2}\/\d{2}\/(\d+)\//i);
  return m ? m[1] : null;
}

function parseReleaseDateFromText(text) {
  const months = { januari:1, februari:2, maret:3, april:4, mei:5, juni:6, juli:7, agustus:8, september:9, oktober:10, november:11, desember:12 };
  const m = String(text || '').match(/Tanggal Rilis\s*:?\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
  if (!m) return null;
  const mo = months[String(m[2]).toLowerCase()];
  if (!mo) return null;
  return m[3] + '-' + String(mo).padStart(2, '0') + '-' + String(Number(m[1])).padStart(2, '0');
}

function releaseAgeDays(dateString) {
  if (!dateString) return null;
  const t = new Date(dateString + (dateString.length === 10 ? 'T00:00:00Z' : '')).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
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
  let normalized = s;
  if (s.includes(',') && s.includes('.')) normalized = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) normalized = s.replace(',', '.');
  const n = Number(normalized);
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

function signedMeasure(text, labelRegex) {
  const source = String(text || '');
  const m = labelRegex.exec(source);
  if (!m) return null;
  const start = Math.max(0, m.index - 120);
  const end = Math.min(source.length, m.index + m[0].length + 220);
  const windowText = source.slice(start, end);
  const numberMatch = windowText.match(/(?:sebesar|tercatat sebesar)\s*([0-9]+(?:[.,][0-9]+)?)\s*persen/i);
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
