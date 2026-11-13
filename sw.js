const CACHE_NAME = 'sanialarm-v3';
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/core.js',
  './js/ui.js',
  './js/metrics.js',
  './js/solver.js',
  './SaniAlarm-Komplett-2026-11-12.saniteam'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Alte Caches (v1 mit falschen Dateinamen) aufräumen
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(response => response || fetch(e.request))
  );
});
