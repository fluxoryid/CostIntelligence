// Production historical BPS adapter v2.
// Adds a verified official-release registry for periods where the public BPS
// archive page is client-rendered and therefore does not expose detail links to
// Cloudflare Workers. Values are always parsed from the official BPS page at
// request time; nothing is hard-coded as a numerical HPS input.

import { onRequestGet as legacyHistorical } from './bps-inflation-history.js';

const VERIFIED_RELEASES = {
  '2025-08': 'https://www.bps.go.id/id/pressrelease/2025/09/01/2459/inflasi-y-on-y-pada-bulan-agustus-2025-sebesar-2-31-persen--inflasi-provinsi-y-on-y-tertinggi-terjadi-di-provinsi-sumatera-utara-sebesar-4-42-persen-dan-inflasi-kabupaten-kota-y-on-y-tertinggi-terjadi-di-kabupaten-deli-serdang-sebesar-5-79-persen-.html'
};

const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

export async function onRequestGet(context) {
  const reqUrl = new URL(context.request.url);
  const dateRaw = String(reqUrl.searchParams.get('date') || '').trim();
  const m = dateRaw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return legacyHistorical(context);

  const key = m[1] + '-' + m[2];
  const directUrl = VERIFIED_RELEASES[key];
  if (!directUrl) return legacyHistorical(context);

  const direct = await fetchVerifiedRelease(directUrl, Number(m[1]), Number(m[2]));
  if (direct.ok) {
    direct.data.requestedDate = dateRaw;
    return json(direct.data, 200, {
      'Cache-Control': 'public, max-age=21600'
    });
  }

  // Preserve the broader WebAPI/archive/derived logic as a second stage.
  const legacy = await legacyHistorical(context);
  if (legacy && legacy.status !== 404) return legacy;

  // If both fail, expose the direct-release diagnostic rather than pretending
  // that a historical value was found.
  let legacyBody = null;
  try { legacyBody = await legacy.clone().json(); } catch (e) {}
  return json({
    error: 'bps_historical_inflation_unavailable',
    requestedDate: dateRaw,
    requestedReferencePeriod: MONTHS[Number(m[2]) - 1] + ' ' + m[1],
    sourceState: 'UNAVAILABLE',
    verifiedReleaseDiagnostic: direct.diagnostic,
    legacyDiagnostic: legacyBody,
    note: 'No historical CPI is fabricated. The verified official release and the general historical discovery paths were both unavailable.'
  }, 404);
}

async function fetchVerifiedRelease(url, year, month) {
  try {
    const r = await fetch(url, {
      cf: { cacheTtl: 21600, cacheEverything: true },
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.7',
        'User-Agent': 'Mozilla/5.0 (compatible; CostIntelligence/1.3.1; verified BPS historical release)'
      }
    });
    const html = await r.text();
    const diagnostic = {
      stage: 'verified-public-release',
      httpStatus: r.status,
      contentType: r.headers.get('content-type') || null,
      bodyLength: html.length,
      url
    };
    if (!r.ok || !html.trim()) {
      diagnostic.reason = !r.ok ? 'upstream_http_error' : 'empty_response_body';
      return { ok: false, diagnostic };
    }

    const text = clean(html);
    const parsed = parseNationalInflation(text, year, month);
    if (parsed.cpi == null || parsed.yoy == null) {
      diagnostic.reason = 'national_inflation_not_parsed';
      diagnostic.bodyPreview = text.slice(0, 300);
      return { ok: false, diagnostic };
    }

    return {
      ok: true,
      data: {
        requestedReferencePeriod: MONTHS[month - 1] + ' ' + year,
        cpi: parsed.cpi,
        headlineInflationYoY: parsed.yoy,
        inflationMoM: parsed.mom,
        inflationYTD: parsed.ytd,
        unit: 'percent',
        referencePeriod: MONTHS[month - 1] + ' ' + year,
        releaseDate: parseReleaseDateFromUrl(url),
        brsId: parseBRSIdFromUrl(url),
        title: parsed.title,
        source: 'BPS — verified historical Berita Resmi Statistik public release (official bps.go.id)',
        sourceMode: 'OFFICIAL_BPS_VERIFIED_RELEASE_HISTORICAL',
        sourceUrl: url,
        sourceState: 'LIVE',
        evidenceRole: 'OFFICIAL_DOMESTIC_CPI_HISTORICAL_BASELINE',
        cpiBase: year >= 2024 ? '2022=100' : null,
        cpiRatioMaterialUseAllowed: year >= 2024,
        derived: false,
        note: year >= 2024
          ? 'Official national BPS CPI baseline parsed live from a verified BRS URL. CPI base is aligned to the 2022=100 regime used from 2024 onward.'
          : 'Official national BPS CPI baseline parsed live from a verified BRS URL; cross-base CPI ratios remain blocked until methodology is aligned.',
        retrievedAt: new Date().toISOString()
      }
    };
  } catch (e) {
    return { ok: false, diagnostic: { stage: 'verified-public-release', reason: 'fetch_exception', message: String(e), url } };
  }
}

function parseNationalInflation(text, year, month) {
  const monthName = MONTHS[month - 1];
  const label = monthName + '\\s+' + year;
  const titleMatch = text.match(new RegExp('Inflasi[^.]{0,220}' + label + '[^.]{0,260}?persen\\.?', 'i'));

  const yoy = firstNumber(text, [
    new RegExp('(?:Pada\\s+)?' + label + '[^.;]{0,180}?inflasi\\s+year[- ]on[- ]year\\s*\\(y-on-y\\)[^.;]{0,120}?sebesar\\s*([0-9]+(?:[.,][0-9]+)?)\\s*persen', 'i'),
    new RegExp('inflasi\\s+y-on-y[^.;]{0,120}?' + label + '[^.;]{0,120}?sebesar\\s*([0-9]+(?:[.,][0-9]+)?)\\s*persen', 'i'),
    new RegExp(label + '[^.;]{0,220}?inflasi[^.;]{0,80}?sebesar\\s*([0-9]+(?:[.,][0-9]+)?)\\s*persen', 'i')
  ]);

  const cpi = firstNumber(text, [
    new RegExp(label + '[^.;]{0,240}?Indeks Harga Konsumen\\s*\\(IHK\\)\\s*sebesar\\s*([0-9]+(?:[.,][0-9]+)?)', 'i'),
    new RegExp('Indeks Harga Konsumen\\s*\\(IHK\\)\\s*sebesar\\s*([0-9]+(?:[.,][0-9]+)?)', 'i')
  ]);

  const mom = signedMetric(text, new RegExp('(inflasi|deflasi)\\s+month[- ]to[- ]month\\s*\\(m-to-m\\)[^.;]{0,120}?' + label + '[^.;]{0,100}?sebesar\\s*([0-9]+(?:[.,][0-9]+)?)\\s*persen', 'i'));
  const ytd = signedMetric(text, new RegExp('(inflasi|deflasi)\\s+year[- ]to[- ]date\\s*\\(y-to-d\\)[^.;]{0,120}?' + label + '[^.;]{0,100}?sebesar\\s*([0-9]+(?:[.,][0-9]+)?)\\s*persen', 'i'));

  return {
    yoy,
    cpi,
    mom,
    ytd,
    title: titleMatch ? clean(titleMatch[0]) : ('BPS national CPI / inflation ' + monthName + ' ' + year)
  };
}

function signedMetric(text, regex) {
  const m = String(text || '').match(regex);
  if (!m) return null;
  const n = toNumber(m[2]);
  if (n == null) return null;
  return /deflasi/i.test(m[1]) ? -n : n;
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
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function clean(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
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
    headers: Object.assign({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }, extraHeaders || {})
  });
}
