// Offline cache: terrain tiles and libraries are kept forever, map data refreshes in the background, the page itself comes from the network when it can.
const V = 'ad-v1', TILES = 'ad-tiles-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== V && k !== TILES) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url), same = u.origin === location.origin;
  if (same && /\/(tiles|alti)\//.test(u.pathname) || /cdn\.jsdelivr|unpkg|cdnjs/.test(u.host)) {   // never changes: cache first
    e.respondWith(caches.open(TILES).then(async c => (await c.match(r)) || fetch(r).then(res => { if (res.ok || res.type === 'opaque') c.put(r, res.clone()); return res; })));
  } else if (same && /\.js$/.test(u.pathname)) {                                                     // map data: stale while revalidate
    e.respondWith(caches.open(V).then(async c => { const hit = await c.match(r), net = fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; }).catch(() => hit); return hit || net; }));
  } else if (same) {                                                                                  // the page: network first, cache when offline
    e.respondWith(fetch(r).then(res => { if (res.ok) caches.open(V).then(c => c.put(r, res.clone())); return res; }).catch(() => caches.match(r)));
  }
});
