// Optional EIA Brent crude adapter. Configure EIA_API_KEY in Cloudflare Pages.
// Without a key the endpoint returns 503; the frontend will show UNAVAILABLE.
export async function onRequestGet(context) {
  const key = context.env && context.env.EIA_API_KEY;
  if (!key) return json({ error: 'EIA_API_KEY_not_configured' }, 503);
  const upstreamUrl = 'https://api.eia.gov/v2/seriesid/PET.RBRTE.D?api_key=' + encodeURIComponent(key) + '&out=json';
  try {
    const r = await fetch(upstreamUrl, { cf: { cacheTtl: 21600, cacheEverything: true } });
    if (!r.ok) return json({ error: 'upstream_error', status: r.status }, 502);
    const body = await r.json();
    const rows = body && body.response && body.response.data;
    if (!Array.isArray(rows) || !rows.length) return json({ error: 'unexpected_upstream_shape' }, 502);
    const row = rows[0];
    const value = Number(row.value != null ? row.value : row.price);
    if (!isFinite(value) || value <= 0) return json({ error: 'invalid_value' }, 502);
    return json({
      series: 'PET.RBRTE.D', label: 'Brent Europe Spot Price', value: value,
      unit: (body.response.units || 'USD/barrel'), period: row.period || row.date || null,
      source: 'U.S. Energy Information Administration Open Data API v2',
      retrievedAt: new Date().toISOString()
    }, 200, { 'Cache-Control': 'public, max-age=21600' });
  } catch (e) { return json({ error:'fetch_failed', message:String(e) }, 502); }
}
function json(obj, status, extra) {
  return new Response(JSON.stringify(obj), { status:status, headers:Object.assign({'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}, extra || {}) });
}
