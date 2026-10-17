// KaryaOS service worker: makes the app installable, opens the app shell without a network, and tells the page
// when a new version is ready (the page shows "New version, tap to refresh"; nothing reloads on its own).
//
// What it never touches: the API (/api), live updates (/socket.io) and uploaded files (/uploads). Those always go
// to the network, so a cached copy can never show someone stale data or another person's work.
//
// Bump CACHE_VERSION when this file's caching rules change. The hashed /assets/* files change name on every build,
// so a normal deploy needs no bump: the new index.html points at the new files.
const CACHE_VERSION = 'v4';
const SHELL_CACHE = `karya-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `karya-assets-${CACHE_VERSION}`;
const SHELL_FILES = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page asks for this when the person taps Refresh on the "new version" bar.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

const NEVER_CACHE = /^\/(api|socket\.io|uploads)(\/|$)/;

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || NEVER_CACHE.test(url.pathname)) return;

  // Pages: the network first, so a deploy shows at once; the saved shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || Response.error())),
    );
    return;
  }

  // Built files have a content hash in their name: once saved, a copy is always right.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Icons, manifest and other static files: the saved copy at once, refreshed in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    }),
  );
});
