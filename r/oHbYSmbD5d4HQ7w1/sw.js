// Race-day offline cache: page = stale-while-revalidate, Leaflet + viewed map tiles = cache-first.
const C = 'bm26-v1';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(C).then(c => c.add('./'))); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const sameScope = u.origin === location.origin && u.pathname.startsWith(new URL('./', location).pathname);
  const external = /cdnjs\.cloudflare\.com$|tile\.openstreetmap\.org$/.test(u.hostname);
  if (!sameScope && !external) return;
  e.respondWith(caches.open(C).then(async c => {
    const req = sameScope ? new Request('./' + (u.pathname.endsWith('sw.js') ? 'sw.js' : ''), { cache: 'no-cache' }) : e.request;
    const hit = await c.match(req, { ignoreSearch: sameScope });
    const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; });
    if (hit) { if (sameScope) e.waitUntil(net.catch(() => {})); return hit; }  // ponytail: tile cache unbounded; a race day of panning is a few MB
    return net;
  }));
});
