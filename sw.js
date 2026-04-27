/* SimpleTrailer Service Worker
 * Strategie: Network-first für API + dynamische Inhalte,
 * Cache-first für Assets (CSS, JS, Bilder, Fonts).
 * KEIN Caching für /api/* — Buchungs-/Zahlungs-Daten sollen immer frisch sein.
 */
const CACHE_VERSION = 'st-v3';
const CACHE_STATIC = `${CACHE_VERSION}-static`;
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Nicht cachen: API-Calls, Stripe, Supabase, andere Domains, POST/PUT
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.hostname !== self.location.hostname) return;

  // Cache-first für statische Assets
  if (/\.(css|js|svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_STATIC).then((c) => c.put(request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Network-first für HTML — Fallback auf Cache wenn offline
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request) || caches.match('/'))
    );
  }
});
