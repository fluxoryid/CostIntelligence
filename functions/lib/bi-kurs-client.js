// Bank Indonesia wsKursBI client for Cloudflare Workers/Pages Functions.
// Source: https://www.bi.go.id/biwebservice/wskursbi.asmx
// Normalizes the legacy ASP.NET DataSet XML response into JSON without
// fabricating values. Raw fields are preserved for auditability.

const BASE = 'https://www.bi.go.id/biwebservice/wskursbi.asmx';

const SERIES = {
  jisdor: {
    label: 'JISDOR',
    latest: { op: 'getSubKursJisdor1', params: [] },
    date: { op: 'getSubKursJisdor2', params: ['tgl'] },
    range: { op: 'getSubKursJisdor3', params: ['mts', 'startDate', 'endDate'] },
    allDate: { op: 'getSubKursJisdor4', params: ['startDate'] },
    evidenceRole: 'OFFICIAL_FX_REFERENCE_USD_IDR',
    hpsUsage: 'MATERIAL_WHEN_USD_EXPOSED'
  },
  transaction: {
    label: 'Kurs Transaksi BI',
    latest: { op: 'getSubKursLokal1', params: [] },
    date: { op: 'getSubKursLokal2', params: ['tgl'] },
    range: { op: 'getSubKursLokal3', params: ['mts', 'startdate', 'enddate'] },
    allDate: { op: 'getSubKursLokal4', params: ['startdate'] },
    evidenceRole: 'OFFICIAL_BI_TRANSACTION_RATE',
    hpsUsage: 'SUPPORTING_FX_BAND_OR_SETTLEMENT_REFERENCE'
  },
  reference: {
    label: 'Kurs Acuan Non-USD/IDR',
    latest: { op: 'getSubKursNonUSD_IDR1', params: [] },
    date: { op: 'getSubKursNonUSD_IDR2', params: ['tgl'] },
    range: { op: 'getSubKursNonUSD_IDR3', params: ['mts', 'startdate', 'enddate'] },
    allDate: { op: 'getSubKursNonUSD_IDR4', params: ['startdate'] },
    evidenceRole: 'OFFICIAL_FX_REFERENCE_NON_USD_IDR',
    hpsUsage: 'MATERIAL_WHEN_NON_USD_EXPOSED'
  },
  uka: {
    label: 'Kurs Uang Kertas Asing (UKA)',
    latest: { op: 'getSubKursAsing1', params: [] },
    date: { op: 'getSubKursAsing2', params: ['tgl'] },
    range: { op: 'getSubKursAsing3', params: ['mts', 'startdate', 'enddate'] },
    allDate: { op: 'getSubKursAsing4', params: ['startdate'] },
    evidenceRole: 'OFFICIAL_CASH_FX_REFERENCE',
    hpsUsage: 'SUPPORTING_ONLY_EXCEPT_CASH_TRAVEL_USE_CASES'
  }
};

export async function fetchBiKurs(options) {
  const seriesKey = String(options && options.series || 'jisdor').toLowerCase();
  const mode = normalizeMode(options && options.mode || 'latest');
  const series = SERIES[seriesKey];
  if (!series) throw new Error('unsupported_series');
  const spec = series[mode];
  if (!spec) throw new Error('unsupported_mode');

  const params = buildParams(seriesKey, mode, spec.params, options || {});
  const query = new URLSearchParams(params).toString();
  const url = BASE + '/' + spec.op + (query ? '?' + query : '');

  const upstream = await fetch(url, {
    cf: { cacheTtl: mode === 'latest' ? 1800 : 21600, cacheEverything: true },
    headers: {
      'Accept': 'application/xml,text/xml;q=0.9,*/*;q=0.1',
      'User-Agent': 'Mozilla/5.0 (compatible; CostIntelligence/1.2; official Bank Indonesia data client)'
    }
  });

  const xml = await upstream.text();
  if (!upstream.ok) {
    const err = new Error('bi_upstream_http_error');
    err.status = upstream.status;
    err.upstreamUrl = url;
    throw err;
  }
  if (!xml.trim()) {
    const err = new Error('bi_empty_response');
    err.status = upstream.status;
    err.upstreamUrl = url;
    throw err;
  }

  const rows = parseDataSetRows(xml).map(function(row) {
    return normalizeRow(row, seriesKey);
  });

  return {
    series: seriesKey,
    seriesLabel: series.label,
    mode: mode,
    operation: spec.op,
    query: sanitizeQuery(params),
    records: rows,
    recordCount: rows.length,
    source: 'Bank Indonesia wsKursBI Web Service (official)',
    sourceUrl: BASE,
    sourceState: rows.length ? 'LIVE' : 'UNAVAILABLE',
    evidenceRole: series.evidenceRole,
    hpsUsage: series.hpsUsage,
    retrievedAt: new Date().toISOString()
  };
}

export function pickLatestJisdor(records) {
  const rows = Array.isArray(records) ? records.filter(Boolean) : [];
  if (!rows.length) return null;
  return rows.slice().sort(function(a, b) {
    return dateValue(b.date) - dateValue(a.date);
  })[0] || null;
}

export function parseDataSetRows(xml) {
  const text = String(xml || '');
  const rows = [];
  const rowRe = /<(Table\d*)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let rowMatch;
  while ((rowMatch = rowRe.exec(text))) {
    const body = rowMatch[2];
    const row = {};
    const fieldRe = /<([A-Za-z_][\w:.-]*)\b[^>]*>([\s\S]*?)<\/\1>/g;
    let fieldMatch;
    while ((fieldMatch = fieldRe.exec(body))) {
      const key = stripPrefix(fieldMatch[1]);
      const value = decodeXml(stripTags(fieldMatch[2])).trim();
      if (value !== '') row[key] = value;
    }
    if (Object.keys(row).length) rows.push(row);
  }

  // Some DataSet serializations use element names other than Table/Table1.
  // If no table rows were found, inspect direct children under NewDataSet.
  if (!rows.length) {
    const ds = text.match(/<NewDataSet\b[^>]*>([\s\S]*?)<\/NewDataSet>/i);
    if (ds) {
      const childRe = /<([A-Za-z_][\w:.-]*)\b[^>]*>([\s\S]*?)<\/\1>/g;
      let child;
      while ((child = childRe.exec(ds[1]))) {
        const body = child[2];
        if (!/<[A-Za-z_][\w:.-]*\b[^>]*>/.test(body)) continue;
        const row = {};
        const fieldRe = /<([A-Za-z_][\w:.-]*)\b[^>]*>([\s\S]*?)<\/\1>/g;
        let field;
        while ((field = fieldRe.exec(body))) {
          const key = stripPrefix(field[1]);
          const value = decodeXml(stripTags(field[2])).trim();
          if (value !== '') row[key] = value;
        }
        if (Object.keys(row).length) rows.push(row);
      }
    }
  }
  return rows;
}

function normalizeRow(raw, seriesKey) {
  const keys = Object.keys(raw || {});
  const currencyRaw = valueByKeyPattern(raw, keys, /(^|_)(mts|currency|kode.*mata)/i);
  const dateRaw = valueByKeyPattern(raw, keys, /(^|_)(tgl|tanggal|date)/i);
  const buyRaw = valueByKeyPattern(raw, keys, /(beli|buy)/i);
  const sellRaw = valueByKeyPattern(raw, keys, /(jual|sell)/i);
  const rateRaw = valueByKeyPattern(raw, keys, /(^|_)(kurs|rate|nilai)(_|$)/i);
  const nominalRaw = valueByKeyPattern(raw, keys, /(nominal|unit)/i);

  const buy = parseNumber(buyRaw);
  const sell = parseNumber(sellRaw);
  let rate = parseNumber(rateRaw);
  if (seriesKey === 'jisdor' && rate == null) rate = sell;
  const mid = buy != null && sell != null ? (buy + sell) / 2 : null;
  if (rate == null && mid != null) rate = mid;

  return {
    currency: currencyRaw ? String(currencyRaw).toUpperCase() : null,
    date: normalizeReturnedDate(dateRaw),
    rate: rate,
    buy: buy,
    sell: sell,
    mid: mid,
    nominal: parseNumber(nominalRaw),
    raw: raw
  };
}

function buildParams(seriesKey, mode, paramNames, options) {
  const out = {};
  const currency = String(options.currency || options.mts || '').trim().toUpperCase();
  const date = normalizeInputDate(options.date || options.tgl || options.startDate || options.startdate || '');
  const start = normalizeInputDate(options.start || options.startDate || options.startdate || '');
  const end = normalizeInputDate(options.end || options.endDate || options.enddate || '');

  if (mode === 'range') {
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('currency_required_3_letter_code');
    if (!start || !end) throw new Error('start_and_end_required_YYYY-MM-DD');
  }
  if ((mode === 'date' || mode === 'allDate') && !date) throw new Error('date_required_YYYY-MM-DD');

  paramNames.forEach(function(name) {
    if (name === 'mts') out[name] = currency;
    else if (name === 'tgl') out[name] = date;
    else if (/^start/i.test(name)) out[name] = mode === 'range' ? start : date;
    else if (/^end/i.test(name)) out[name] = end;
  });
  return out;
}

function normalizeMode(mode) {
  const m = String(mode || 'latest').replace(/[-_\s]/g, '').toLowerCase();
  if (m === 'latest') return 'latest';
  if (m === 'date') return 'date';
  if (m === 'range') return 'range';
  if (m === 'alldate' || m === 'all') return 'allDate';
  return mode;
}

function normalizeInputDate(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{2})[-/]?(\d{2})[-/]?(\d{4})$/);
  if (dmy) return dmy[3] + '-' + dmy[2] + '-' + dmy[1];
  return '';
}

function normalizeReturnedDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : s;
}

function parseNumber(value) {
  if (value == null || value === '') return null;
  let s = String(value).trim().replace(/\s+/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    const parts = s.split(',');
    s = parts.length === 2 && parts[1].length <= 2 ? parts[0] + '.' + parts[1] : parts.join('');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function valueByKeyPattern(raw, keys, re) {
  const key = keys.find(function(k) { return re.test(k); });
  return key ? raw[key] : null;
}

function stripPrefix(name) {
  return String(name || '').replace(/^.*:/, '');
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ');
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function dateValue(value) {
  const t = value ? new Date(value).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

function sanitizeQuery(params) {
  const out = {};
  Object.keys(params || {}).forEach(function(k) { out[k] = params[k]; });
  return out;
}

export { SERIES, BASE };
