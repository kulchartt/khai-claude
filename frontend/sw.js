// sw.js — network-first for everything, cache only as offline fallback
const CACHE = 'mueasong-v7';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
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
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
