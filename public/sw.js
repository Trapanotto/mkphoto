// MKPHOTO Service Worker: App-Dateien, Modelle und Texturen offline; Geodaten mit begrenztem Cache.
const VERSION = 'mkphoto-v2';
const APP = `${VERSION}-app`;
const GEO = `${VERSION}-geo`;
const GEO_MAX = 2500; // max. Anzahl gecachter Kacheln

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './logo.svg'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(VERSION)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - GEO_MAX; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Geodaten von swisstopo: Cache zuerst, dann Netz (Kacheln ändern sich selten)
  if (/geo\.admin\.ch$/.test(url.hostname)) {
    e.respondWith((async () => {
      const cache = await caches.open(GEO);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) { cache.put(req, res.clone()); if (Math.random() < 0.02) trim(cache); }
      return res;
    })().catch(() => fetch(req)));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // Modelle, Texturen, Assets: Cache zuerst; HTML: Netz zuerst
  const isPage = req.mode === 'navigate';
  e.respondWith((async () => {
    const cache = await caches.open(APP);
    if (isPage) {
      try { const res = await fetch(req); cache.put(req, res.clone()); return res; } catch { return (await cache.match(req)) || cache.match('./'); }
    }
    const hit = await cache.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && !url.pathname.includes('/@')) cache.put(req, res.clone());
    return res;
  })());
});
