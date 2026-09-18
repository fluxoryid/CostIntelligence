// functions/api/lkpp-open-data.js
// Official LKPP Open Data adapter (data.lkpp.go.id).
// Uses CKAN metadata discovery when available and falls back to a curated,
// provenance-bound registry of official JSON resources when the CKAN action
// endpoint is unavailable from a Cloudflare edge.
//
// IMPORTANT: aggregate LKPP datasets are MARKET CONTEXT, not product prices.
// This adapter never converts aggregate transaction values/counts into a unit
// price and never feeds Model B directly.

const CKAN_BASE = 'https://data.lkpp.go.id/api/3/action';

const CURATED = Object.freeze({
  'jumlah-produk-tayang-pada-katalog-elektronik-2025': {
    title: 'Jumlah Produk Tayang pada Katalog Elektronik',
    datasetUrl: 'https://data.lkpp.go.id/dataset/jumlah-produk-tayang-pada-katalog-elektronik-2025',
    resourceUrl: 'https://data.lkpp.go.id/dataset/4b1aec6c-fa31-4f72-8f58-2ddc5f15dd3b/resource/946ec0e0-79c9-4b4d-8be2-05c29170637d/download/jumlah-produk-tayang-pada-katalog-elektronik.json',
    resourceId: '946ec0e0-79c9-4b4d-8be2-05c29170637d',
    year: 2025,
    metadataModified: '2026-03-31T13:45:00Z',
    dataAsOf: '2025-12-31',
    unit: 'produk',
    producer: 'DIREKTORAT PASAR DIGITAL PENGADAAN',
    classification: 'MARKET_CONTEXT',
    hpsRole: 'DISPLAY_ONLY',
    note: 'Jumlah produk tayang pada Katalog Elektronik V6. Bukan harga produk atau nilai transaksi unit.'
  },
  'nilai-perencanaan-dan-realisasi-pengadaan-barang-jasa': {
    title: 'Nilai Perencanaan dan Realisasi Pengadaan Barang/Jasa',
    datasetUrl: 'https://data.lkpp.go.id/dataset/nilai-perencanaan-dan-realisasi-pengadaan-barang-jasa',
    resourceUrl: 'https://data.lkpp.go.id/dataset/f9aab016-0b26-4b5e-abc8-5b61610164ec/resource/9cacaa3a-1a11-4744-b3cb-11fae60697fd/download/nilai-perencanaan-dan-realisasi-pengadaan-barang-jasa-2025.json',
    resourceId: '9cacaa3a-1a11-4744-b3cb-11fae60697fd',
    year: 2025,
    metadataModified: '2026-03-31T04:11:00Z',
    dataAsOf: '2025-12-31',
    unit: 'rupiah',
    producer: 'DIREKTORAT PERENCANAAN TRANSFORMASI, PEMANTAUAN, DAN EVALUASI PENGADAAN',
    classification: 'MARKET_CONTEXT',
    hpsRole: 'CONTEXT',
    note: 'Nilai perencanaan dan realisasi berdasarkan nilai kontrak per K/L/PD. Nilai agregat tidak boleh diperlakukan sebagai harga unit.'
  },
  'persentase-efisiensi-paket-konsolidasi': {
    title: 'Persentase Efisiensi Paket Konsolidasi',
    datasetUrl: 'https://data.lkpp.go.id/dataset/persentase-efisiensi-paket-konsolidasi',
    resourceUrl: 'https://data.lkpp.go.id/dataset/60ba83e0-22ee-497b-9ba5-658d5be5599b/resource/3fc0890a-835d-4c0a-8c05-d277fb462730/download/persentase-efisiensi-paket-konsolidasi-2025.json',
    resourceId: '3fc0890a-835d-4c0a-8c05-d277fb462730',
    year: 2025,
    metadataModified: '2026-03-31T13:00:00Z',
    dataAsOf: '2025-12-31',
    unit: 'persen',
    producer: 'KEDEPUTIAN BIDANG HUKUM DAN PENYELESAIAN SANGGAH',
    classification: 'PROCUREMENT_EFFICIENCY_CONTEXT',
    hpsRole: 'CONTEXT',
    note: 'Efisiensi konsolidasi adalah statistik pengadaan agregat; dapat menjadi konteks negosiasi/strategi, bukan harga pembanding produk.'
  }
});

export async function onRequestGet(context) {
  const u = new URL(context.request.url);
  const dataset = clean(u.searchParams.get('dataset'));
  const q = clean(u.searchParams.get('q'));

  if (dataset) return getDataset(dataset);
  return searchDatasets(q || 'pengadaan');
}

async function searchDatasets(q) {
  const ckan = await ckanAction('package_search', { q, rows: 20 });
  if (ckan.ok) {
    const results = Array.isArray(ckan.data?.result?.results) ? ckan.data.result.results : [];
    const items = results.map(normalizePackage);
    return json({
      source: 'LKPP Open Data CKAN API',
      sourceKey: 'LKPP_OPEN_DATA',
      sourceState: 'LIVE',
      sourceMode: 'CKAN_PACKAGE_SEARCH',
      query: q,
      count: items.length,
      items,
      materialUseAllowed: false,
      note: 'Hasil pencarian adalah metadata dataset resmi LKPP. Dataset agregat tidak otomatis menjadi harga pembanding HPS.',
      retrievedAt: new Date().toISOString()
    }, 200, { 'Cache-Control': 'public, max-age=3600' });
  }

  const needle = q.toLowerCase();
  const items = Object.entries(CURATED)
    .filter(([slug, d]) => !needle || [slug, d.title, d.note, d.producer].join(' ').toLowerCase().includes(needle))
    .map(([slug, d]) => curatedMetadata(slug, d));

  return json({
    source: 'LKPP Open Data — curated official registry fallback',
    sourceKey: 'LKPP_OPEN_DATA',
    sourceState: items.length ? 'CACHED' : 'UNAVAILABLE',
    sourceMode: 'CURATED_OFFICIAL_METADATA',
    query: q,
    count: items.length,
    items,
    ckanDiagnostic: ckan.error || null,
    materialUseAllowed: false,
    note: 'CKAN action endpoint tidak tersedia dari edge ini. Metadata fallback tetap menunjuk ke dataset/resource resmi LKPP yang telah diverifikasi.',
    retrievedAt: new Date().toISOString()
  }, items.length ? 200 : 502, { 'Cache-Control': 'public, max-age=3600' });
}

async function getDataset(slug) {
  const safe = clean(slug);
  if (!/^[a-z0-9-]{3,160}$/.test(safe)) {
    return json({ error: 'invalid_dataset', message: 'Identifier dataset tidak valid.' }, 400);
  }

  let meta = null;
  let ckanDiagnostic = null;
  const ckan = await ckanAction('package_show', { id: safe });
  if (ckan.ok && ckan.data?.result) meta = normalizePackage(ckan.data.result);
  else ckanDiagnostic = ckan.error || null;

  const curated = CURATED[safe] || null;
  const resource = chooseJsonResource(meta, curated);
  if (!resource) {
    return json({
      error: 'json_resource_not_available',
      dataset: meta || (curated ? curatedMetadata(safe, curated) : null),
      sourceState: meta ? 'LIVE' : 'UNAVAILABLE',
      materialUseAllowed: false,
      note: 'Dataset ditemukan tetapi resource JSON yang aman untuk dibaca otomatis tidak tersedia pada adapter ini.',
      ckanDiagnostic
    }, 404);
  }

  const fetched = await fetchJsonResource(resource.url);
  if (!fetched.ok) {
    return json({
      error: 'lkpp_resource_unavailable',
      dataset: meta || curatedMetadata(safe, curated),
      sourceState: 'UNAVAILABLE',
      materialUseAllowed: false,
      resourceUrl: resource.url,
      resourceStatus: fetched.status,
      resourceError: fetched.error,
      ckanDiagnostic
    }, 502);
  }

  const rows = Array.isArray(fetched.data) ? fetched.data : [fetched.data];
  const classification = classifyDataset(meta, curated, rows);

  return json({
    source: 'LKPP Open Data',
    sourceKey: 'LKPP_OPEN_DATA',
    sourceState: 'LIVE',
    sourceMode: curated && resource.url === curated.resourceUrl ? 'OFFICIAL_JSON_RESOURCE_CURATED' : 'CKAN_JSON_RESOURCE',
    dataset: meta || curatedMetadata(safe, curated),
    classification,
    evidenceRole: classification.hpsRole,
    materialUseAllowed: false,
    rowCount: rows.length,
    fields: inferFields(rows),
    rows: rows.slice(0, 250),
    truncated: rows.length > 250,
    resource: {
      id: resource.id || null,
      format: 'JSON',
      url: resource.url
    },
    ckanDiagnostic,
    note: classification.note,
    retrievedAt: new Date().toISOString()
  }, 200, { 'Cache-Control': 'public, max-age=3600' });
}

function normalizePackage(pkg) {
  const extras = {};
  (pkg.extras || []).forEach(x => { if (x && x.key) extras[x.key] = x.value; });
  const resources = (pkg.resources || []).map(r => ({
    id: r.id || null,
    name: r.name || null,
    format: String(r.format || '').toUpperCase(),
    url: r.url || null,
    lastModified: r.last_modified || null,
    datastoreActive: !!r.datastore_active
  }));
  return {
    id: pkg.id || null,
    slug: pkg.name || null,
    title: pkg.title || pkg.name || null,
    notes: stripHtml(pkg.notes || ''),
    organization: pkg.organization?.title || pkg.organization?.name || null,
    author: pkg.author || null,
    maintainer: pkg.maintainer || null,
    metadataModified: pkg.metadata_modified || null,
    metadataCreated: pkg.metadata_created || null,
    unit: extras['Satuan'] || extras['satuan'] || null,
    dataType: extras['Jenis Data'] || extras['jenis_data'] || null,
    priorityYear: Number(extras['prioritas_tahun']) || extras['prioritas_tahun'] || null,
    producer: extras['Unit Eselon II Produsen Data'] || extras['Unit Eselon 2'] || extras['Unit Eselon I Produsen Data'] || null,
    resources,
    datasetUrl: 'https://data.lkpp.go.id/dataset/' + encodeURIComponent(pkg.name || pkg.id || '')
  };
}

function curatedMetadata(slug, d) {
  return {
    id: null,
    slug,
    title: d.title,
    notes: d.note,
    organization: 'Pusat Data dan Informasi — LKPP',
    author: 'Walidata LKPP',
    maintainer: 'Walidata LKPP',
    metadataModified: d.metadataModified,
    metadataCreated: null,
    unit: d.unit,
    dataType: 'Statistik',
    priorityYear: d.year,
    producer: d.producer,
    dataAsOf: d.dataAsOf,
    resources: [{ id:d.resourceId, name:d.title + '.json', format:'JSON', url:d.resourceUrl, lastModified:d.metadataModified, datastoreActive:false }],
    datasetUrl: d.datasetUrl,
    classification: d.classification,
    hpsRole: d.hpsRole
  };
}

function chooseJsonResource(meta, curated) {
  if (meta && Array.isArray(meta.resources)) {
    const jsonRes = meta.resources.find(r => r.format === 'JSON' && /^https:\/\/data\.lkpp\.go\.id\//i.test(String(r.url || '')));
    if (jsonRes) return { id:jsonRes.id, url:jsonRes.url };
  }
  if (curated) return { id:curated.resourceId, url:curated.resourceUrl };
  return null;
}

function classifyDataset(meta, curated, rows) {
  if (curated) {
    return {
      type: curated.classification,
      hpsRole: curated.hpsRole,
      canSetUnitPrice: false,
      note: curated.note
    };
  }
  const title = String(meta?.title || '').toLowerCase();
  const unit = String(meta?.unit || '').toLowerCase();
  const fields = inferFields(rows).map(x => x.toLowerCase());
  const explicitUnitPriceField = fields.some(f => /harga_satuan|unit_price|harga_produk|harga_negosiasi|harga_final/.test(f));

  if (explicitUnitPriceField && /produk|katalog|transaksi/.test(title)) {
    return {
      type: 'POTENTIAL_PRICE_DATA',
      hpsRole: 'REVIEW_REQUIRED',
      canSetUnitPrice: false,
      note: 'Dataset memiliki field yang menyerupai harga unit, tetapi tetap memerlukan telaah spesifikasi, basis pajak, kuantitas, lokasi, periode dan ruang lingkup sebelum dapat dipetakan sebagai pembanding HPS.'
    };
  }
  if (/rupiah|persen|produk|paket|indeks|skor/.test(unit) || /nilai|jumlah|persentase|indeks|monitoring|realisasi|perencanaan/.test(title)) {
    return {
      type: 'MARKET_CONTEXT',
      hpsRole: 'CONTEXT',
      canSetUnitPrice: false,
      note: 'Dataset agregat/statistik resmi LKPP. Boleh digunakan sebagai konteks pasar/pengadaan, tetapi tidak sebagai harga unit pembanding HPS.'
    };
  }
  return {
    type: 'DISPLAY_ONLY',
    hpsRole: 'DISPLAY_ONLY',
    canSetUnitPrice: false,
    note: 'Dataset resmi LKPP ditampilkan untuk informasi. Tidak ada dasar yang cukup untuk menjadikannya harga material HPS.'
  };
}

async function ckanAction(action, params) {
  try {
    const u = new URL(CKAN_BASE + '/' + action);
    Object.entries(params || {}).forEach(([k, v]) => { if (v != null && v !== '') u.searchParams.set(k, String(v)); });
    const res = await fetch(u.toString(), {
      cf: { cacheTtl: 3600, cacheEverything: true },
      headers: { Accept:'application/json', 'User-Agent':'CostIntelligence/2.1 LKPP-Open-Data' }
    });
    if (!res.ok) return { ok:false, status:res.status, error:'ckan_http_' + res.status };
    const data = await res.json();
    if (!data || data.success !== true) return { ok:false, status:res.status, error:'ckan_unsuccessful' };
    return { ok:true, status:res.status, data };
  } catch (err) {
    return { ok:false, status:null, error:'ckan_fetch_failed: ' + String(err) };
  }
}

async function fetchJsonResource(url) {
  if (!/^https:\/\/data\.lkpp\.go\.id\//i.test(String(url || ''))) {
    return { ok:false, status:null, error:'resource_host_not_allowed' };
  }
  try {
    const res = await fetch(url, {
      cf: { cacheTtl: 3600, cacheEverything: true },
      headers: { Accept:'application/json', 'User-Agent':'CostIntelligence/2.1 LKPP-Open-Data' }
    });
    if (!res.ok) return { ok:false, status:res.status, error:'resource_http_' + res.status };
    return { ok:true, status:res.status, data:await res.json() };
  } catch (err) {
    return { ok:false, status:null, error:'resource_fetch_failed: ' + String(err) };
  }
}

function inferFields(rows) {
  const keys = new Set();
  (rows || []).slice(0, 50).forEach(row => {
    if (row && typeof row === 'object' && !Array.isArray(row)) Object.keys(row).forEach(k => keys.add(k));
  });
  return [...keys];
}

function stripHtml(s) { return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function clean(v) { return String(v == null ? '' : v).trim(); }
function json(obj, status = 200, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type':'application/json',
      'Access-Control-Allow-Origin':'*',
      'Cache-Control':'no-store',
      ...(extraHeaders || {})
    }
  });
}
