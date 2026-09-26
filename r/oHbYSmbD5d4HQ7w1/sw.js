// Race-day offline cache: page = network-first w/ 3 s cache fallback, Leaflet + viewed map tiles = cache-first.
const C = 'bm26-v2';
const LF = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(C).then(c => c.addAll(['./', LF + 'leaflet.css', LF + 'leaflet.js'])));
});
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const page = e.request.mode === 'navigate' && u.origin === location.origin;
  const external = /(^|\.)cdnjs\.cloudflare\.com$|(^|\.)tile\.openstreetmap\.org$/.test(u.hostname);
  if (!page && !external) return;
  e.respondWith(caches.open(C).then(async c => {
    const key = page ? './' : e.request;
    const hit = await c.match(key, { ignoreSearch: page });
    const refresh = () => fetch(page ? new Request('./', { cache: 'no-cache' }) : e.request)
      .then(r => { if (r.ok || r.type === 'opaque') c.put(key, r.clone()); return r; });
    if (hit && !page) return hit;                          // ponytail: tile cache unbounded; a race day of panning is a few MB
    if (!hit) return refresh();
    // page: network-first so redeploys land immediately, cached copy if the crowd network stalls >3 s
    const net = refresh();
    e.waitUntil(net.catch(() => {}));
    return Promise.race([net, new Promise(r => setTimeout(() => r(hit), 3000))]).catch(() => hit);
  }));
});
