// R2 Gallery Service Worker
// Cache strategies: static assets (cache-first), API (network-first), images (stale-while-revalidate)

const CACHE_NAME = 'r2-gallery-v1';
const STATIC_CACHE = 'r2-gallery-static-v1';
const IMAGE_CACHE = '2-gallery-images-v1';

// Static assets to precache on install
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

// Install: precache shell assets + enable navigation preload
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  // Enable navigation preload for faster navigations
  if (self.registration.navigationPreload) {
    event.waitUntil(self.registration.navigationPreload.enable());
  }
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  const keepCaches = [STATIC_CACHE, IMAGE_CACHE, CACHE_NAME];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !keepCaches.includes(k)).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: route to appropriate strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http
  if (!url.protocol.startsWith('http')) return;

  // API calls: network-first (always try fresh data)
  if (url.pathname.startsWith('/api/')) {
    // Don't cache file content (large media) or auth endpoints
    if (url.pathname === '/api/file' || url.pathname.startsWith('/api/auth') || url.pathname === '/api/login') {
      return;
    }
    // Cache metadata API responses (search, discover, dirs, exif, etc.)
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Image file requests from R2: stale-while-revalidate
  if (url.pathname === '/api/file' || /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|mp4|webm|mp3|wav)$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const fetchPromise = fetch(request).then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(() => cached);

          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Static assets (JS, CSS, fonts): cache-first
  if (url.pathname.startsWith('/assets/') || /\.(js|css|woff2?|ttf|eot)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Navigation requests (HTML): network-first with navigation preload
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Use navigation preload response if available
          const preloadResponse = await event.preloadResponse;
          if (preloadResponse) return preloadResponse;

          const response = await fetch(request);
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        } catch {
          return caches.match('/') || caches.match(request);
        }
      })()
    );
    return;
  }

  // Everything else: network with cache fallback
  event.respondWith(
    fetch(request)
      .catch(() => caches.match(request))
  );
});

// Listen for messages from the app
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
