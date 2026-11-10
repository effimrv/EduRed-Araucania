// Service Worker: deja la aplicación disponible sin conexión (caché de la capa de interfaz).
const VERSION = 'edured-v2';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/styles.css', './assets/icon.svg',
  './js/app.js', './js/core/auth.js', './js/core/rbac.js', './js/core/repository.js', './js/core/sync.js',
  './js/domain/models.js', './js/domain/rules.js', './js/domain/reports.js', './js/domain/servicios.js',
  './js/data/seed.js', './js/ui/componentes.js', './js/ui/vistas.js',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(claves.filter((c) => c !== VERSION).map((c) => caches.delete(c))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') return;
  evento.respondWith(
    caches.match(evento.request).then((enCache) => {
      const red = fetch(evento.request)
        .then((respuesta) => {
          const copia = respuesta.clone();
          caches.open(VERSION).then((cache) => cache.put(evento.request, copia));
          return respuesta;
        })
        .catch(() => enCache);
      return enCache ?? red;
    }),
  );
});
