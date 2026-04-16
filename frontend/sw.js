// sw.js — network-first for everything, cache only as offline fallback
const CACHE = 'mueasong-v8';

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

  // Network-first for everything: try network, fall back to cache for offline
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
