// sw.js — network-first for everything, cache only as offline fallback
const CACHE = 'mueasong-v9';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' })))
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Only handle GET from same origin
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Never intercept API calls
  if (url.pathname.startsWith('/api/')) return;

  // Never cache HTML — always fetch fresh so new version strings load new JS/CSS
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // Network-first for everything else: try network, fall back to cache for offline
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const cloned = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, cloned));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
