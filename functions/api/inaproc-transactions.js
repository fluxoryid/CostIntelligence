// functions/api/inaproc-transactions.js
// Read-only adapter for the official Data INAPROC API Gateway.
// The INAPROC bearer token MUST be stored as a Cloudflare secret
// (INAPROC_API_TOKEN). It is never accepted from browser query parameters
// and is never returned to the client.
//
// Purpose: retrieve E-Purchasing transaction records visible to the
// authorized Data Integrator token, then extract explicit unit-price fields
// for category/product benchmarking. The adapter never fabricates a price.

const BASE_URL = 'https://data.inaproc.id/api/v1/ekatalog/paket-e-purchasing';
const MAX_PAGES = 5;
const MAX_RESULTS = 40;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const env = context.env || {};
  const token = String(env.INAPROC_API_TOKEN || '').trim();

  if (!token) {
    return json({
      error: 'inaproc_token_not_configured',
      sourceState: 'UNAVAILABLE',
      materialUseAllowed: false,
      source: 'Data INAPROC API Gateway',
      note: 'INAPROC_API_TOKEN must be configured as a Cloudflare secret. The token is not stored in browser code.'
    }, 503);
  }

  const kodeKlpd = clean(requestUrl.searchParams.get('kode_klpd'));
  const tahun = clean(requestUrl.searchParams.get('tahun'));
  const query = clean(requestUrl.searchParams.get('q')).toLowerCase();
  const limit = clampInt(requestUrl.searchParams.get('limit'), 1, MAX_LIMIT, DEFAULT_LIMIT);
  const maxPages = clampInt(requestUrl.searchParams.get('max_pages'), 1, MAX_PAGES, 3);

  if (!kodeKlpd || !/^[A-Za-z0-9._-]{2,32}$/.test(kodeKlpd)) {
    return json({ error: 'kode_klpd_required', message: 'Parameter kode_klpd wajib dan harus valid.' }, 400);
  }
  if (!/^20\d{2}$/.test(tahun)) {
    return json({ error: 'tahun_required', message: 'Parameter tahun wajib dalam format YYYY.' }, 400);
  }
  if (!query || query.length < 2) {
    return json({ error: 'query_required', message: 'Parameter q minimal 2 karakter.' }, 400);
  }

  const rows = [];
  const diagnostics = [];
  let cursor = '';
  let pagesFetched = 0;
  let upstreamTotal = null;
  let rateLimit = null;

  try {
    while (pagesFetched < maxPages && rows.length < MAX_RESULTS) {
      const u = new URL(BASE_URL);
      u.searchParams.set('kode_klpd', kodeKlpd);
      u.searchParams.set('tahun', tahun);
      u.searchParams.set('limit', String(limit));
      if (cursor) u.searchParams.set('cursor', cursor);

      const res = await fetchWithRetry(u.toString(), token);
      rateLimit = {
        limit: res.headers.get('x-ratelimit-limit'),
        remaining: res.headers.get('x-ratelimit-remaining'),
        reset: res.headers.get('x-ratelimit-reset')
      };

      const body = await safeJson(res);
      if (!res.ok) {
        return json({
          error: 'inaproc_upstream_error',
          upstreamStatus: res.status,
          upstreamBody: sanitizeUpstreamError(body),
          sourceState: res.status === 401 || res.status === 403 ? 'UNAVAILABLE' : 'DEGRADED',
          materialUseAllowed: false,
          source: 'Data INAPROC API Gateway'
        }, res.status === 401 || res.status === 403 ? 502 : 502);
      }

      pagesFetched += 1;
      const data = extractArray(body);
      const meta = (body && body.meta) || {};
      if (Number.isFinite(Number(meta.total))) upstreamTotal = Number(meta.total);

      for (const record of data) {
        const candidates = collectPriceCandidates(record, {
          kodeKlpd,
          tahun,
          packageReference: firstString(record, PACKAGE_REF_KEYS),
          packageName: firstString(record, PACKAGE_NAME_KEYS)
        });
        for (const item of candidates) {
          const haystack = [
            item.itemName,
            item.category,
            item.vendor,
            item.packageName,
            item.reference
          ].filter(Boolean).join(' ').toLowerCase();
          if (haystack.includes(query)) rows.push(item);
          if (rows.length >= MAX_RESULTS) break;
        }
        if (rows.length >= MAX_RESULTS) break;
      }

      diagnostics.push({
        page: pagesFetched,
        records: data.length,
        matched: rows.length,
        hasMore: Boolean(meta.has_more),
        cursorPresent: Boolean(meta.cursor)
      });

      if (!meta.has_more || !meta.cursor) break;
      cursor = String(meta.cursor);
    }

    const deduped = dedupe(rows).slice(0, MAX_RESULTS);
    const summary = summarizePrices(deduped);

    return json({
      source: 'Data INAPROC API Gateway — E-Purchasing transaction history',
      sourceKey: 'INAPROC_TRANSACTION',
      sourceMode: 'OFFICIAL_INAPROC_API_GATEWAY',
      sourceState: 'LIVE',
      evidenceRole: 'SUPPORTING_PRICE',
      materialUseAllowed: false,
      comparabilityReviewRequired: true,
      kodeKlpd,
      tahun: Number(tahun),
      query,
      count: deduped.length,
      summary,
      items: deduped,
      pagination: {
        pagesFetched,
        maxPages,
        upstreamTotal,
        truncated: rows.length >= MAX_RESULTS || pagesFetched >= maxPages
      },
      rateLimit,
      diagnostics,
      note: 'Harga transaksi INAPROC adalah benchmark resmi yang kuat, tetapi tidak otomatis menjadi HPS. Spesifikasi, kuantitas, lokasi, pajak, ongkir, periode, dan ruang lingkup komersial harus ditelaah sebelum dipakai sebagai pembanding material.',
      retrievedAt: new Date().toISOString()
    }, 200, { 'Cache-Control': 'private, max-age=900' });
  } catch (err) {
    return json({
      error: 'inaproc_fetch_failed',
      message: err instanceof Error ? err.message : String(err),
      sourceState: 'UNAVAILABLE',
      materialUseAllowed: false,
      source: 'Data INAPROC API Gateway'
    }, 502);
  }
}

async function fetchWithRetry(url, token) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    last = await fetch(url, {
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/json',
        'User-Agent': 'CostIntelligence/2.1 (official INAPROC read-only adapter)'
      }
    });
    if (last.ok) return last;
    if (last.status !== 429 && last.status < 500) return last;
    if (attempt < 2) await sleep(500 * Math.pow(2, attempt));
  }
  return last;
}

function collectPriceCandidates(value, context, depth = 0, out = []) {
  if (depth > 7 || value == null) return out;
  if (Array.isArray(value)) {
    for (const entry of value) collectPriceCandidates(entry, context, depth + 1, out);
    return out;
  }
  if (typeof value !== 'object') return out;

  const priceEntry = firstNumericEntry(value, PRICE_KEYS);
  if (priceEntry) {
    const itemName = firstString(value, ITEM_NAME_KEYS) || context.packageName || null;
    const category = firstString(value, CATEGORY_KEYS) || null;
    const quantity = firstNumber(value, QTY_KEYS);
    const transactionDate = normalizeDate(firstString(value, DATE_KEYS));
    const vendor = firstString(value, VENDOR_KEYS);
    const reference = firstString(value, REFERENCE_KEYS) || context.packageReference || null;

    // Only emit records where the field explicitly looks like a unit/product
    // price. Total package value, budget, tax and freight are intentionally
    // excluded from PRICE_KEYS.
    out.push({
      itemName,
      category,
      unitPrice: priceEntry.value,
      priceField: priceEntry.key,
      quantity,
      vendor,
      transactionDate,
      packageName: context.packageName || null,
      reference,
      kodeKlpd: context.kodeKlpd,
      tahun: Number(context.tahun),
      sourceUrl: BASE_URL,
      comparabilityStatus: 'REVIEW_REQUIRED'
    });
  }

  for (const [key, child] of Object.entries(value)) {
    if (child && typeof child === 'object') {
      const next = {
        ...context,
        packageReference: context.packageReference || (/paket|package/i.test(key) ? firstString(child, PACKAGE_REF_KEYS) : null),
        packageName: context.packageName || (/paket|package/i.test(key) ? firstString(child, PACKAGE_NAME_KEYS) : null)
      };
      collectPriceCandidates(child, next, depth + 1, out);
    }
  }
  return out;
}

const PRICE_KEYS = [
  'harga_satuan',
  'harga_satuan_produk',
  'unit_price',
  'harga_produk',
  'harga_negosiasi',
  'harga_nego',
  'harga_kesepakatan',
  'harga_final',
  'nilai_satuan',
  'harga_tayang'
];

const ITEM_NAME_KEYS = [
  'nama_produk',
  'nama_barang',
  'nama_item',
  'item_name',
  'produk',
  'barang_jasa',
  'uraian_produk',
  'uraian_barang'
];

const CATEGORY_KEYS = [
  'nama_kategori',
  'kategori_produk',
  'kategori',
  'nama_komoditas',
  'komoditas',
  'jenis_produk'
];

const QTY_KEYS = ['kuantitas', 'quantity', 'qty', 'jumlah', 'volume'];
const DATE_KEYS = ['tanggal_transaksi', 'tgl_transaksi', 'tanggal_pesanan', 'tanggal_transaksi_paket', 'tanggal', 'created_at', 'updated_at'];
const VENDOR_KEYS = ['nama_penyedia', 'penyedia', 'nama_vendor', 'vendor', 'nama_toko'];
const REFERENCE_KEYS = ['id_produk', 'kode_produk', 'product_id', 'id_paket', 'kode_paket', 'nomor_paket', 'no_paket', 'id'];
const PACKAGE_REF_KEYS = ['id_paket', 'kode_paket', 'nomor_paket', 'no_paket', 'id'];
const PACKAGE_NAME_KEYS = ['nama_paket', 'paket', 'nama_pengadaan', 'judul_paket'];

function firstString(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  const map = keyMap(obj);
  for (const wanted of keys) {
    const actual = map[wanted];
    if (!actual) continue;
    const v = obj[actual];
    if (v == null) continue;
    if (typeof v === 'string' || typeof v === 'number') {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return null;
}

function firstNumber(obj, keys) {
  const entry = firstNumericEntry(obj, keys);
  return entry ? entry.value : null;
}

function firstNumericEntry(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  const map = keyMap(obj);
  for (const wanted of keys) {
    const actual = map[wanted];
    if (!actual) continue;
    const n = toNumber(obj[actual]);
    if (Number.isFinite(n) && n > 0) return { key: actual, value: n };
  }
  return null;
}

function keyMap(obj) {
  const out = {};
  for (const key of Object.keys(obj || {})) out[String(key).toLowerCase()] = key;
  return out;
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  let s = value.trim().replace(/\s+/g, '');
  if (!s) return NaN;
  if (/^Rp/i.test(s)) s = s.replace(/^Rp/i, '');
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^-?\d+(,\d+)$/.test(s)) s = s.replace(',', '.');
  s = s.replace(/[^0-9.-]/g, '');
  return Number(s);
}

function normalizeDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const iso = s.match(/^(20\d{2}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : s;
}

function extractArray(body) {
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.data)) return body.data;
  if (body && body.data && Array.isArray(body.data.items)) return body.data.items;
  if (body && body.data && Array.isArray(body.data.data)) return body.data.data;
  return [];
}

function summarizePrices(items) {
  const prices = items.map(x => Number(x.unitPrice)).filter(x => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!prices.length) return { count: 0, min: null, median: null, max: null };
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  return { count: prices.length, min: prices[0], median, max: prices[prices.length - 1] };
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const x of items) {
    const k = [x.reference || '', x.itemName || '', x.unitPrice, x.transactionDate || '', x.vendor || ''].join('|');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function sanitizeUpstreamError(body) {
  if (body == null) return null;
  if (typeof body === 'string') return body.slice(0, 500);
  const clone = {};
  for (const key of ['error', 'message', 'detail', 'success']) if (key in body) clone[key] = body[key];
  return clone;
}

async function safeJson(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch (_) { return text.slice(0, 1000); }
}

function clean(v) { return String(v == null ? '' : v).trim(); }
function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function json(obj, status = 200, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      ...(extraHeaders || {})
    }
  });
}
