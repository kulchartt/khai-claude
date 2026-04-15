const CACHE_NAME = 'mueasong-v6';

// Install: skip waiting immediately — no pre-caching of HTML
self.addEventListener('install', (e) => {
  e.waitUntil(self.skipWaiting());
});

// Activate: clean old caches and claim all clients
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - HTML (index.html, /) → network-first, fallback to cache (for offline)
// - JS / CSS           → network-first, fallback to cache
// - API / uploads      → skip SW entirely (pass through)
// - images / fonts     → cache-first with network update (safe to cache long-term)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Skip API calls and uploaded files — never intercept
  if (url.pathname.includes('/api/') || url.pathname.includes('/uploads/')) return;
  // Skip external CDN resources (socket.io, qrcode, etc.)
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isHTML = path.endsWith('.html') || path === '/' || path.endsWith('/');
  const isAsset = path.endsWith('.js') || path.endsWith('.css');

  if (isHTML || isAsset) {
    // Network-first: always try network, fall back to cache only if offline
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(res => {
          // Cache successful response for offline fallback
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Images & other static assets: cache-first (they rarely change)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
