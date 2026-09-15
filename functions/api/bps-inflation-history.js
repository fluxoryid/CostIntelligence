// Historical BPS CPI / inflation lookup for CostIntelligence.
// Purpose: retrieve a national CPI baseline aligned to a historical purchase month.
// Source priority:
//   1) BPS WebAPI press release list/detail using BPS_API_KEY.
//   2) Official bps.go.id press-release archive discovery + page parsing.
//   3) Mathematically derived prior-year CPI only when the latest official BPS
//      release refers to the exact same month one year later.
// No synthetic value is emitted.

const CURRENT_RELEASE_URL =
  'https://www.bps.go.id/id/pressrelease/2026/09/01/2611/inflasi-year-on-year--y-on-y--pada-agustus-2026-sebesar-3-19-persen-.html';

const MONTHS_ID = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember'
];

export async function onRequestGet(context) {
  const reqUrl = new URL(context.request.url);
  const dateRaw = String(reqUrl.searchParams.get('date') || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    return json({
      error: 'date_required_YYYY-MM-DD',
      sourceState: 'UNAVAILABLE',
      example: '/api/bps-inflation-history?date=2025-08-15'
    }, 400);
  }

  const d = new Date(dateRaw + 'T00:00:00Z');
  if (!Number.isFinite(d.getTime())) {
    return json({ error:'invalid_date', sourceState:'UNAVAILABLE' }, 400);
  }
  if (d.getTime() > Date.now()) {
    return json({ error:'historical_date_cannot_be_future', sourceState:'UNAVAILABLE' }, 400);
  }

  const target = { year:d.getUTCFullYear(), month:d.getUTCMonth()+1 };
  const env = context.env || {};
  let webApiDiagnostic = env.BPS_API_KEY ? null : { reason:'BPS_API_KEY_not_configured' };

  if (env.BPS_API_KEY) {
    const api = await tryWebApi(env.BPS_API_KEY, target.year, target.month);
    if (api.ok) return json(api.data, 200, { 'Cache-Control':'public, max-age=21600' });
    webApiDiagnostic = api.diagnostic || { reason:'webapi_unavailable' };
  }

  const archive = await tryPublicArchive(target.year, target.month);
  if (archive.ok) {
    archive.data.webApiDiagnostic = webApiDiagnostic;
    return json(archive.data, 200, { 'Cache-Control':'public, max-age=21600' });
  }

  const derived = await derivePriorYearFromCurrent(target.year, target.month);
  if (derived.ok) {
    derived.data.webApiDiagnostic = webApiDiagnostic;
    derived.data.archiveDiagnostic = archive.diagnostic;
    return json(derived.data, 200, { 'Cache-Control':'public, max-age=21600' });
  }

  return json({
    error:'bps_historical_inflation_unavailable',
    requestedDate:dateRaw,
    requestedReferencePeriod:MONTHS_ID[target.month-1] + ' ' + target.year,
    sourceState:'UNAVAILABLE',
    webApiDiagnostic,
    archiveDiagnostic:archive.diagnostic,
    note:'No historical CPI is fabricated. Older periods may require a separately verified BPS table/publication when the archive cannot be discovered programmatically.'
  }, 404);
}

async function tryWebApi(key, targetYear, targetMonth) {
  const release = nextMonth(targetYear, targetMonth);
  const periods = [release, {year:targetYear, month:targetMonth}];
  let lastDiagnostic = null;

  for (const p of periods) {
    const urls = [
      bpsListUrl(key, p.year, p.month, 'inflasi'),
      bpsListUrl(key, p.year, p.month, null)
    ];
    for (const url of urls) {
      const list = await fetchJsonSafe(url, 'webapi-list');
      if (!list.ok) { lastDiagnostic = list.diagnostic; continue; }
      const rows = extractRows(list.body);
      const selected = chooseTargetRelease(rows, targetYear, targetMonth);
      if (!selected) continue;
      const id = releaseId(selected);
      if (!id) continue;
      const detailUrl = 'https://webapi.bps.go.id/v1/api/view/domain/0000/model/pressrelease/lang/ind/id/' +
        encodeURIComponent(id) + '/key/' + encodeURIComponent(key) + '/';
      const detailResult = await fetchJsonSafe(detailUrl, 'webapi-detail');
      if (!detailResult.ok) { lastDiagnostic = detailResult.diagnostic; continue; }
      const detail = extractDetail(detailResult.body);
      const title = clean(detail.title || selected.title || '');
      const abstract = clean(detail.abstract || selected.abstract || '');
      const parsed = parseInflationText(title, abstract);
      if (!matchesTarget(parsed.referencePeriod, targetYear, targetMonth) || parsed.cpi == null) continue;
      return {
        ok:true,
        data:buildResult(parsed, {
          releaseDate:detail.rl_date || selected.rl_date || null,
          brsId:id,
          source:'BPS Web API — historical national CPI / inflation',
          sourceMode:'OFFICIAL_BPS_WEBAPI_HISTORICAL',
          sourceUrl:detailUrl,
          requestedYear:targetYear,
          requestedMonth:targetMonth
        })
      };
    }
  }
  return { ok:false, diagnostic:lastDiagnostic || {reason:'target_release_not_found_in_webapi'} };
}

async function tryPublicArchive(targetYear, targetMonth) {
  const release = nextMonth(targetYear, targetMonth);
  const archiveUrls = [
    'https://www.bps.go.id/id/pressrelease?keyword=inflasi&year=' + release.year + '&month=' + release.month + '&sort=latest',
    'https://www.bps.go.id/id/pressrelease?keyword=inflasi&year=' + release.year + '&sort=latest',
    'https://www.bps.go.id/id/pressrelease?keyword=inflasi&sort=latest'
  ];
  let lastDiagnostic = null;

  for (const archiveUrl of archiveUrls) {
    try {
      const r = await fetch(archiveUrl, {
        cf:{ cacheTtl:21600, cacheEverything:true },
        headers:{
          'Accept':'text/html,application/xhtml+xml',
          'Accept-Language':'id-ID,id;q=0.9,en;q=0.7',
          'User-Agent':'Mozilla/5.0 (compatible; CostIntelligence/1.3; official BPS archive discovery)'
        }
      });
      const html = await r.text();
      lastDiagnostic = {
        stage:'public-archive', httpStatus:r.status,
        contentType:r.headers.get('content-type') || null,
        bodyLength:html.length, url:archiveUrl
      };
      if (!r.ok || !html.trim()) continue;

      const candidates = extractPressReleaseUrls(html, targetYear, targetMonth);
      lastDiagnostic.candidateCount = candidates.length;
      for (const candidate of candidates.slice(0, 16)) {
        const detail = await fetchReleasePage(candidate);
        if (!detail.ok) continue;
        if (!matchesTarget(detail.data.referencePeriod, targetYear, targetMonth)) continue;
        if (detail.data.cpi == null) continue;
        return {
          ok:true,
          data:buildResult(detail.data, {
            releaseDate:parseReleaseDateFromUrl(candidate) || detail.releaseDate,
            brsId:parseBRSIdFromUrl(candidate),
            source:'BPS — historical Berita Resmi Statistik public release (official bps.go.id)',
            sourceMode:'OFFICIAL_BPS_PUBLIC_ARCHIVE_HISTORICAL',
            sourceUrl:candidate,
            requestedYear:targetYear,
            requestedMonth:targetMonth
          })
        };
      }
    } catch (e) {
      lastDiagnostic = { stage:'public-archive', reason:'fetch_exception', message:String(e), url:archiveUrl };
    }
  }
  return { ok:false, diagnostic:lastDiagnostic || {reason:'archive_discovery_failed'} };
}

async function derivePriorYearFromCurrent(targetYear, targetMonth) {
  const page = await fetchReleasePage(CURRENT_RELEASE_URL);
  if (!page.ok || page.data.cpi == null || page.data.yoy == null) {
    return { ok:false, diagnostic:{reason:'current_release_unavailable_for_prior_year_derivation'} };
  }
  const currentPeriod = parseReferencePeriod(page.data.referencePeriod);
  if (!currentPeriod || currentPeriod.month !== targetMonth || currentPeriod.year !== targetYear + 1) {
    return { ok:false, diagnostic:{reason:'target_not_exact_prior_year_same_month'} };
  }
  const baseline = page.data.cpi / (1 + page.data.yoy / 100);
  const parsed = {
    yoy:null,
    cpi:Math.round(baseline * 100) / 100,
    mom:null,
    ytd:null,
    referencePeriod:MONTHS_ID[targetMonth-1] + ' ' + targetYear,
    title:'Derived historical CPI baseline from official BPS same-month YoY relationship'
  };
  return {
    ok:true,
    data:buildResult(parsed, {
      releaseDate:parseReleaseDateFromUrl(CURRENT_RELEASE_URL),
      brsId:parseBRSIdFromUrl(CURRENT_RELEASE_URL),
      source:'BPS — mathematically derived prior-year CPI from official same-month YoY release',
      sourceMode:'OFFICIAL_BPS_YOY_DERIVED_BASELINE',
      sourceUrl:CURRENT_RELEASE_URL,
      requestedYear:targetYear,
      requestedMonth:targetMonth,
      derived:true,
      note:'Historical CPI = current CPI / (1 + official YoY inflation). Valid only because the target is exactly the same month one year earlier.'
    })
  };
}

function buildResult(parsed, meta) {
  const comparableBase = meta.requestedYear >= 2024 ? '2022=100' : null;
  return {
    requestedReferencePeriod:MONTHS_ID[meta.requestedMonth-1] + ' ' + meta.requestedYear,
    cpi:parsed.cpi,
    headlineInflationYoY:parsed.yoy,
    inflationMoM:parsed.mom,
    inflationYTD:parsed.ytd,
    unit:'percent',
    referencePeriod:parsed.referencePeriod,
    releaseDate:meta.releaseDate || null,
    brsId:meta.brsId || null,
    title:parsed.title || null,
    source:meta.source,
    sourceMode:meta.sourceMode,
    sourceUrl:meta.sourceUrl,
    sourceState:'LIVE',
    evidenceRole:'OFFICIAL_DOMESTIC_CPI_HISTORICAL_BASELINE',
    cpiBase:comparableBase,
    cpiRatioMaterialUseAllowed:meta.requestedYear >= 2024,
    derived:!!meta.derived,
    note:meta.note || (meta.requestedYear >= 2024
      ? 'BPS national CPI baseline. From 2024 the CPI calculation uses base year 2022=100; ratio comparisons with current 2024+ CPI are methodologically aligned.'
      : 'Historical BPS CPI found, but direct ratio comparison to 2024+ CPI is blocked because the CPI base-year regime may differ.'),
    retrievedAt:new Date().toISOString()
  };
}

async function fetchReleasePage(url) {
  try {
    const r = await fetch(url, {
      cf:{cacheTtl:21600, cacheEverything:true},
      headers:{
        'Accept':'text/html,application/xhtml+xml',
        'Accept-Language':'id-ID,id;q=0.9,en;q=0.7',
        'User-Agent':'Mozilla/5.0 (compatible; CostIntelligence/1.3; BPS historical verification)'
      }
    });
    const html = await r.text();
    if (!r.ok || !html.trim()) return {ok:false};
    const text = clean(html);
    const title = extractHtmlTitle(html) || extractInflationTitle(text) || '';
    const parsed = parseInflationText(title, text);
    if (parsed.cpi == null) return {ok:false};
    return {ok:true, data:parsed, releaseDate:parseReleaseDateFromText(text)};
  } catch (e) {
    return {ok:false};
  }
}

function extractPressReleaseUrls(html, targetYear, targetMonth) {
  let text = String(html || '')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&');
  const release = nextMonth(targetYear, targetMonth);
  const urls = [];
  const re = /(?:https?:\/\/www\.bps\.go\.id)?(\/id\/pressrelease\/\d{4}\/\d{2}\/\d{2}\/[^"'<>\s]+)/gi;
  let m;
  while ((m = re.exec(text))) {
    let u = m[0].startsWith('http') ? m[0] : 'https://www.bps.go.id' + m[1];
    u = u.replace(/&quot;.*$/i, '').replace(/[),]+$/g, '');
    if (u.indexOf('/' + release.year + '/') === -1 && u.indexOf('/' + targetYear + '/') === -1) continue;
    if (!urls.includes(u)) urls.push(u);
  }
  return urls.sort(function(a,b){
    const ai = /inflasi|ihk/i.test(a) ? 0 : 1;
    const bi = /inflasi|ihk/i.test(b) ? 0 : 1;
    return ai - bi;
  });
}

function chooseTargetRelease(rows, targetYear, targetMonth) {
  if (!Array.isArray(rows)) return null;
  const targetLabel = (MONTHS_ID[targetMonth-1] + ' ' + targetYear).toLowerCase();
  const candidates = rows.filter(function(row){
    const t = clean((row && row.title) || '').toLowerCase();
    return t.includes('inflasi') && t.includes(targetLabel.toLowerCase());
  });
  return candidates.find(function(row){
    const t = clean((row && row.title) || '').toLowerCase();
    return t.includes('year-on-year') || t.includes('y-on-y');
  }) || candidates[0] || null;
}

function parseInflationText(title, body) {
  const combined = clean((title || '') + ' ' + (body || ''));
  const yoy = firstPercent(combined, [
    /(?:terjadi\s+)?inflasi\s+year[- ]on[- ]year\s*\(y-on-y\)[\s\S]{0,220}?(?:sebesar|tercatat sebesar)\s*([0-9]+(?:[.,][0-9]+)?)\s*persen/i,
    /inflasi\s+y-on-y[\s\S]{0,220}?(?:sebesar|tercatat sebesar)\s*([0-9]+(?:[.,][0-9]+)?)\s*persen/i
  ]);
  const cpi = firstPercent(combined, [
    /Indeks Harga Konsumen\s*\(IHK\)[\s\S]{0,100}?(?:sebesar|tercatat sebesar)\s*([0-9]+(?:[.,][0-9]+)?)/i,
    /IHK[\s\S]{0,100}?(?:sebesar|tercatat sebesar)\s*([0-9]+(?:[.,][0-9]+)?)/i
  ]);
  const mom = measureAfterLabel(combined, /month[- ]to[- ]month\s*\(m-to-m\)/i);
  const ytd = measureAfterLabel(combined, /year\s*(?:-| )?to\s*(?:-| )?date\s*\(y-to-d\)/i);
  const ref = combined.match(/(?:pada\s+|bulan\s+)(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})/i);
  return {
    yoy, cpi, mom, ytd,
    referencePeriod:ref ? titleCaseMonth(ref[1]) + ' ' + ref[2] : null,
    title:title || null
  };
}

function measureAfterLabel(text, labelRegex) {
  const source = String(text || '');
  const m = labelRegex.exec(source);
  if (!m) return null;
  const after = source.slice(m.index + m[0].length, m.index + m[0].length + 220);
  const numberMatch = after.match(/(?:tercatat\s+)?sebesar\s*([0-9]+(?:[.,][0-9]+)?)\s*persen/i);
  if (!numberMatch) return null;
  const n = toDecimal(numberMatch[1]);
  if (n == null) return null;
  const before = source.slice(Math.max(0, m.index - 100), m.index);
  return /deflasi[^.;]{0,100}$/i.test(before) ? -n : n;
}

function bpsListUrl(key, year, month, keyword) {
  let url = 'https://webapi.bps.go.id/v1/api/list/model/pressrelease/lang/ind/domain/0000' +
    '/year/' + encodeURIComponent(year) + '/month/' + encodeURIComponent(month) + '/page/1';
  if (keyword) url += '/keyword/' + encodeURIComponent(keyword);
  return url + '/key/' + encodeURIComponent(key) + '/';
}

async function fetchJsonSafe(url, stage) {
  try {
    const r = await fetch(url, {
      cf:{cacheTtl:21600, cacheEverything:true},
      headers:{'Accept':'application/json','User-Agent':'CostIntelligence/1.3 BPS client'}
    });
    const text = await r.text();
    const diagnostic = {stage, httpStatus:r.status, contentType:r.headers.get('content-type') || null, bodyLength:text.length};
    if (!r.ok || !text.trim()) {
      diagnostic.reason = !text.trim() ? 'empty_response_body' : 'http_error';
      return {ok:false, diagnostic};
    }
    try {
      const body = JSON.parse(text);
      if (body && String(body.status || '').toLowerCase() === 'error') {
        diagnostic.reason = body.message || 'bps_returned_error';
        return {ok:false, diagnostic};
      }
      return {ok:true, body, diagnostic};
    } catch (e) {
      diagnostic.reason = 'non_json_response';
      return {ok:false, diagnostic};
    }
  } catch (e) {
    return {ok:false, diagnostic:{stage, reason:'fetch_exception', message:String(e)}};
  }
}

function extractRows(body) {
  if (!body) return [];
  if (Array.isArray(body.data)) {
    for (let i=body.data.length-1; i>=0; i--) if (Array.isArray(body.data[i])) return body.data[i];
    if (body.data.length && typeof body.data[0] === 'object') return body.data;
  }
  return Array.isArray(body.result) ? body.result : [];
}
function extractDetail(body) {
  if (!body || !body.data) return {};
  if (!Array.isArray(body.data)) return body.data;
  return body.data[1] || body.data[0] || {};
}
function releaseId(row) { return row && (row.brs_id || row.id || row.pressrelease_id || row.press_release_id); }

function nextMonth(year, month) {
  return month === 12 ? {year:year+1, month:1} : {year, month:month+1};
}
function matchesTarget(referencePeriod, year, month) {
  const p = parseReferencePeriod(referencePeriod);
  return !!p && p.year === year && p.month === month;
}
function parseReferencePeriod(s) {
  const m = String(s || '').match(/(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})/i);
  if (!m) return null;
  const month = MONTHS_ID.map(function(x){return x.toLowerCase();}).indexOf(m[1].toLowerCase()) + 1;
  return month ? {month, year:Number(m[2])} : null;
}
function titleCaseMonth(s) {
  const idx = MONTHS_ID.map(function(x){return x.toLowerCase();}).indexOf(String(s).toLowerCase());
  return idx >= 0 ? MONTHS_ID[idx] : s;
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
function toDecimal(value) {
  if (value == null) return null;
  const s = String(value).trim();
  let normalized = s;
  if (s.includes(',') && s.includes('.')) normalized = s.replace(/\./g,'').replace(',','.');
  else if (s.includes(',')) normalized = s.replace(',','.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
function extractHtmlTitle(html) {
  const m = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? clean(m[1].replace(/\s*-\s*Badan Pusat Statistik[\s\S]*$/i,'')) : null;
}
function extractInflationTitle(text) {
  const m = String(text || '').match(/Inflasi[^.]{0,260}persen\.?/i);
  return m ? clean(m[0]) : null;
}
function parseReleaseDateFromUrl(url) {
  const m = String(url || '').match(/\/pressrelease\/(\d{4})\/(\d{2})\/(\d{2})\//i);
  return m ? m[1] + '-' + m[2] + '-' + m[3] : null;
}
function parseBRSIdFromUrl(url) {
  const m = String(url || '').match(/\/pressrelease\/\d{4}\/\d{2}\/\d{2}\/(\d+)\//i);
  return m ? m[1] : null;
}
function parseReleaseDateFromText(text) {
  const months = {januari:1,februari:2,maret:3,april:4,mei:5,juni:6,juli:7,agustus:8,september:9,oktober:10,november:11,desember:12};
  const m = String(text || '').match(/Tanggal Rilis\s*:?\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
  if (!m || !months[m[2].toLowerCase()]) return null;
  return m[3] + '-' + String(months[m[2].toLowerCase()]).padStart(2,'0') + '-' + String(Number(m[1])).padStart(2,'0');
}
function clean(value) {
  return String(value == null ? '' : value)
    .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'")
    .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&')
    .replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
}
function json(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers:Object.assign({'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}, extraHeaders || {})
  });
}
