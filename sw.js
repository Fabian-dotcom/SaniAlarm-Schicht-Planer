const CACHE_NAME = 'sanialarm-v1';
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/core_2.js',
  './js/ui_2.js',
  './js/metrics.js',
  './js/solver_2.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(response => response || fetch(e.request))
  );
});