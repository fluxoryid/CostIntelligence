// Historical BPS adapter v3.
// For verified historical periods, try exact official BPS release pages (ID and EN)
// and parse the national headline values from the page at request time.
// Numerical HPS inputs are never hard-coded. If direct official pages cannot be
// parsed, delegate to the broader v2 discovery/derived logic.
// Historical API responses are deliberately no-store so a newly deployed parser
// cannot be masked by a previously cached derived response.

import { onRequestGet as fallbackHistorical } from './bps-inflation-history-v2.js';

const VERIFIED_RELEASES = {
  '2025-08': [
    'https://www.bps.go.id/id/pressrelease/2025/09/01/2459/inflasi-y-on-y-pada-bulan-agustus-2025-sebesar-2-31-persen--inflasi-provinsi-y-on-y-tertinggi-terjadi-di-provinsi-sumatera-utara-sebesar-4-42-persen-dan-inflasi-kabupaten-kota-y-on-y-tertinggi-terjadi-di-kabupaten-deli-serdang-sebesar-5-79-persen-.html',
    'https://www.bps.go.id/en/pressrelease/2025/09/01/2459/consumer-price-index.html'
  ]
};

const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const NO_STORE = { 'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0' };

export async function onRequestGet(context) {
  const reqUrl = new URL(context.request.url);
  const dateRaw = String(reqUrl.searchParams.get('date') || '').trim();
  const m = dateRaw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return rewrapNoStore(await fallbackHistorical(context));

  const year = Number(m[1]);
  const month = Number(m[2]);
  const key = m[1] + '-' + m[2];
  const urls = VERIFIED_RELEASES[key] || [];
  const diagnostics = [];

  for (const url of urls) {
    const direct = await fetchAndParse(url, year, month);
    if (direct.ok) {
      direct.data.requestedDate = dateRaw;
      return json(direct.data, 200, NO_STORE);
    }
    diagnostics.push(direct.diagnostic);
  }

  const fallback = await fallbackHistorical(context);
  if (!urls.length || (fallback && fallback.status !== 404)) {
    if (fallback && fallback.status >= 200 && fallback.status < 300 && urls.length) {
      try {
        const body = await fallback.clone().json();
        body.verifiedReleaseDiagnostics = diagnostics;
        body.responseCachePolicy = 'NO_STORE';
        return json(body, fallback.status, NO_STORE);
      } catch (e) {}
    }
    return rewrapNoStore(fallback);
  }

  let fallbackBody = null;
  try { fallbackBody = await fallback.clone().json(); } catch (e) {}
  return json({
    error:'bps_historical_inflation_unavailable',
    requestedDate:dateRaw,
    requestedReferencePeriod:MONTHS_ID[month-1] + ' ' + year,
    sourceState:'UNAVAILABLE',
    verifiedReleaseDiagnostics:diagnostics,
    fallbackDiagnostic:fallbackBody,
    responseCachePolicy:'NO_STORE',
    note:'No historical CPI is fabricated. Exact official BPS release pages and fallback discovery paths were unavailable or not parseable.'
  }, 404, NO_STORE);
}

async function rewrapNoStore(response) {
  if (!response) return json({error:'empty_fallback_response'}, 502, NO_STORE);
  try {
    const body = await response.clone().json();
    body.responseCachePolicy = 'NO_STORE';
    return json(body, response.status, NO_STORE);
  } catch (e) {
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin':'*',
        ...NO_STORE
      }
    });
  }
}

async function fetchAndParse(url, year, month) {
  try {
    const r = await fetch(url, {
      cf:{cacheTtl:21600, cacheEverything:true},
      headers:{
        'Accept':'text/html,application/xhtml+xml',
        'Accept-Language':'id-ID,id;q=0.9,en;q=0.8',
        'User-Agent':'Mozilla/5.0 (compatible; CostIntelligence/1.3.3; BPS historical official-release verifier)'
      }
    });
    const html = await r.text();
    const diagnostic = {
      stage:'verified-release-v3',
      httpStatus:r.status,
      contentType:r.headers.get('content-type') || null,
      bodyLength:html.length,
      url
    };
    if (!r.ok || !html.trim()) {
      diagnostic.reason = !r.ok ? 'upstream_http_error' : 'empty_response_body';
      return {ok:false, diagnostic};
    }

    const text = clean(html);
    const parsed = /\/en\//i.test(url)
      ? parseEnglish(text, year, month)
      : parseIndonesian(text, year, month);

    if (parsed.yoy == null || parsed.cpi == null) {
      diagnostic.reason = 'national_headline_not_parsed';
      diagnostic.hasTargetMonth = new RegExp((/\/en\//i.test(url) ? MONTHS_EN[month-1] : MONTHS_ID[month-1]) + '\\s+' + year, 'i').test(text);
      diagnostic.bodyPreview = text.slice(0, 400);
      return {ok:false, diagnostic};
    }

    return {
      ok:true,
      data:{
        requestedReferencePeriod:MONTHS_ID[month-1] + ' ' + year,
        cpi:parsed.cpi,
        headlineInflationYoY:parsed.yoy,
        inflationMoM:parsed.mom,
        inflationYTD:parsed.ytd,
        unit:'percent',
        referencePeriod:MONTHS_ID[month-1] + ' ' + year,
        releaseDate:parseReleaseDateFromUrl(url),
        brsId:parseBRSIdFromUrl(url),
        title:parsed.title,
        source:'BPS — verified historical Berita Resmi Statistik public release (official bps.go.id)',
        sourceMode:'OFFICIAL_BPS_VERIFIED_RELEASE_HISTORICAL_V3',
        sourceUrl:url,
        sourceState:'LIVE',
        evidenceRole:'OFFICIAL_DOMESTIC_CPI_HISTORICAL_BASELINE',
        cpiBase:year >= 2024 ? '2022=100' : null,
        cpiRatioMaterialUseAllowed:year >= 2024,
        derived:false,
        responseCachePolicy:'NO_STORE',
        note:'Official national BPS CPI baseline parsed directly from a verified BPS release page. No numerical value is hard-coded.',
        retrievedAt:new Date().toISOString()
      }
    };
  } catch (e) {
    return {ok:false, diagnostic:{stage:'verified-release-v3', reason:'fetch_exception', message:String(e), url}};
  }
}

function parseIndonesian(text, year, month) {
  const monthName = MONTHS_ID[month-1];
  const period = monthName + '\\s+' + year;
  const yoy = firstNumber(text, [
    new RegExp('Pada\\s+' + period + '[^.;]{0,100}?inflasi\\s+(?:year[- ]on[- ]year\\s*\\(y-on-y\\)|y-on-y)[^.;]{0,100}?sebesar\\s*([0-9]+(?:[.,][0-9]+)?)\\s*persen','i'),
    new RegExp('inflasi\\s+y-on-y[^.;]{0,80}?' + period + '[^.;]{0,100}?sebesar\\s*([0-9]+(?:[.,][0-9]+)?)\\s*persen','i'),
    new RegExp('inflasi\\s+(?:year[- ]on[- ]year\\s*\\(y-on-y\\)|y-on-y)[^.;]{0,160}?sebesar\\s*([0-9]+(?:[.,][0-9]+)?)\\s*persen','i')
  ]);
  const cpi = firstNumber(text, [
    /Indeks Harga Konsumen\s*\(IHK\)\s*(?:sebesar|tercatat sebesar)\s*([0-9]+(?:[.,][0-9]+)?)/i,
    /IHK\s*(?:sebesar|tercatat sebesar)\s*([0-9]+(?:[.,][0-9]+)?)/i
  ]);
  const mom = signedMetric(text, /(inflasi|deflasi)\s+month[- ]to[- ]month\s*\(m-to-m\)[^.;]{0,160}?sebesar\s*([0-9]+(?:[.,][0-9]+)?)\s*persen/i);
  const ytd = signedMetric(text, /(inflasi|deflasi)\s+year[- ]to[- ]date\s*\(y-to-d\)[^.;]{0,160}?sebesar\s*([0-9]+(?:[.,][0-9]+)?)\s*persen/i);
  const titleMatch = text.match(new RegExp('Inflasi[^.]{0,260}?' + period + '[^.]{0,260}?persen\\.?','i'));
  return {yoy,cpi,mom,ytd,title:titleMatch ? clean(titleMatch[0]) : ('BPS national CPI / inflation ' + monthName + ' ' + year)};
}

function parseEnglish(text, year, month) {
  const monthName = MONTHS_EN[month-1];
  const period = monthName + '\\s+' + year;
  const yoy = firstNumber(text, [
    new RegExp('year[- ]on[- ]year\\s*\\(y-on-y\\)[^.;]{0,80}?inflation\\s+rate[^.;]{0,100}?(?:was|of)\\s*([0-9]+(?:[.,][0-9]+)?)\\s*percent','i'),
    new RegExp('inflation\\s+rate[^.;]{0,100}?' + period + '[^.;]{0,100}?(?:was|of)\\s*([0-9]+(?:[.,][0-9]+)?)\\s*percent','i')
  ]);
  const cpi = firstNumber(text, [
    /Consumer Price Index\s*\(CPI\)\s*(?:of|was)\s*([0-9]+(?:[.,][0-9]+)?)/i,
    /CPI\s*(?:of|was)\s*([0-9]+(?:[.,][0-9]+)?)/i
  ]);
  const mom = signedMetricEnglish(text, /month[- ]to[- ]month\s*\(m-to-m\)[^.;]{0,100}?(inflation|deflation)\s+rate[^.;]{0,80}?was\s*([0-9]+(?:[.,][0-9]+)?)\s*percent/i);
  const ytd = signedMetricEnglish(text, /year[- ]to[- ]date\s*\(y-to-d\)[^.;]{0,100}?(inflation|deflation)\s+rate[^.;]{0,80}?was\s*([0-9]+(?:[.,][0-9]+)?)\s*percent/i);
  const titleMatch = text.match(new RegExp('[^.]{0,80}year[- ]on[- ]year[^.]{0,160}?' + period + '[^.]{0,160}?percent\\.?','i'));
  return {yoy,cpi,mom,ytd,title:titleMatch ? clean(titleMatch[0]) : ('BPS national CPI / inflation ' + monthName + ' ' + year)};
}

function signedMetric(text, regex) {
  const m = String(text || '').match(regex);
  if (!m) return null;
  const n = toNumber(m[2]);
  return n == null ? null : (/deflasi/i.test(m[1]) ? -n : n);
}
function signedMetricEnglish(text, regex) {
  const m = String(text || '').match(regex);
  if (!m) return null;
  const n = toNumber(m[2]);
  return n == null ? null : (/deflation/i.test(m[1]) ? -n : n);
}
function firstNumber(text, patterns) {
  for (const p of patterns) {
    const m = String(text || '').match(p);
    if (m) {
      const n = toNumber(m[1]);
      if (n != null) return n;
    }
  }
  return null;
}
function toNumber(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (s.includes(',')) {
    const n = Number(s.replace(/\./g,'').replace(',','.'));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function clean(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&ndash;|&#8211;/gi,'-')
    .replace(/&mdash;|&#8212;/gi,'-')
    .replace(/\u00a0/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function parseReleaseDateFromUrl(url) {
  const m = String(url || '').match(/\/pressrelease\/(\d{4})\/(\d{2})\/(\d{2})\//i);
  return m ? (m[1] + '-' + m[2] + '-' + m[3]) : null;
}
function parseBRSIdFromUrl(url) {
  const m = String(url || '').match(/\/pressrelease\/\d{4}\/\d{2}\/\d{2}\/(\d+)\//i);
  return m ? m[1] : null;
}
function json(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers:Object.assign({'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}, extraHeaders || {})
  });
}
