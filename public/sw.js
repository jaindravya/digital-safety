/**
 * @file public/sw.js
 * @description Privacy-first Service Worker enabling Android & iOS standalone home-screen
 * installation for Unseen while intentionally NEVER caching personal `/api/*` scan payloads.
 *
 * Primary Use Cases:
 * 1. Satisfying Chrome on Android installability criteria ("Install Unseen App").
 * 2. Ensuring zero ephemeral audit responses or uploaded creator photos persist in SW caches.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass all requests directly to network; never cache sensitive creator scans locally.
  if (event.request.url.includes('/api/')) {
    return;
  }
});
