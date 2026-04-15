const CACHE_NAME = 'mueasong-v3';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// Install: cache only HTML and manifest (not JS/CSS — they change often)
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - JS / CSS → always network-first (never stale)
// - API / uploads → skip SW entirely
// - everything else → cache-first with network fallback
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Skip API and uploaded files
  if (url.pathname.includes('/api/') || url.pathname.includes('/uploads/')) return;

  // JS and CSS: always fetch from network so code updates appear immediately
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Everything else: cache-first with network fallback
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
