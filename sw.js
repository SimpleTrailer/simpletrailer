/* SimpleTrailer Service Worker
 * Strategie:
 *   - KEIN Caching für /api/* — immer frisch (Buchungen, Push, Heartbeat)
 *   - KEIN Caching für unsere eigenen JS-Files (analytics, native-bridge, chat-widget)
 *     → diese aendern sich oft, sollen sofort live nach Deploy wirken
 *   - Network-first für HTML mit Cache-Fallback (offline-tauglich)
 *   - Stale-while-revalidate für Bilder/Fonts (selten geaendert, OK kurz alt)
 */
const CACHE_VERSION = 'st-v8';
const CACHE_STATIC = `${CACHE_VERSION}-static`;
const STATIC_ASSETS = [
  '/',
  '/favicon.svg',
  '/manifest.webmanifest'
];

// Pfade die NIE gecached werden sollen (immer network-first)
const NEVER_CACHE_PATHS = [
  '/analytics.js',
  '/native-bridge.js',
  '/chat-widget.js',
  '/sw.js'
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

  // Nicht cachen: API-Calls, andere Domains, POST/PUT
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.hostname !== self.location.hostname) return;

  // Never-Cache-Liste: immer Network, kein Cache (auch nicht als Fallback)
  if (NEVER_CACHE_PATHS.includes(url.pathname)) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  // Bilder/Fonts: stale-while-revalidate (kurz alt OK)
  if (/\.(svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_STATIC).then((c) => c.put(request, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // CSS + andere JS: Network-first, Cache-Fallback
  if (/\.(css|js)$/.test(url.pathname)) {
    event.respondWith(
      fetch(request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_STATIC).then((c) => c.put(request, clone));
        }
        return res;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // HTML: Network-first, Cache-Fallback fuer Offline
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request) || caches.match('/'))
    );
  }
});
