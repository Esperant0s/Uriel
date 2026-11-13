// Hands Uriel's sync short-lived passwords for Cloudflare's TURN relay, so two devices that can't reach each other
// directly (mobile data, guest Wi-Fi, routers that don't loop back) still link (#39). The API token stays here as a
// Worker secret and never ships inside the app. Sync only sends small JSON messages, so the free tier is plenty.
const TTL = 12 * 3600;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'GET') return json({ error: 'not found' }, 404);
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: TTL }),
    });
    if (!res.ok) return json({ error: `cloudflare answered ${res.status}` }, 502);
    const data = await res.json();
    // browsers refuse port 53, so those addresses would only slow the connection down
    const iceServers = [].concat(data.iceServers || [])
      .map((s) => ({ ...s, urls: [].concat(s.urls || []).filter((u) => !/:53(\?|$)/.test(u)) }))
      .filter((s) => s.urls.length);
    return json({ iceServers, ttl: TTL });
  },
};
