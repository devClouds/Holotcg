// Service worker de Holo: la app funciona sin conexión y guarda las últimas fichas consultadas.
const SHELL_CACHE = 'holo-shell-v1';
const API_CACHE = 'holo-api-v1';
const SHELL = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL_CACHE && k !== API_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Archivos de la app: se sirven al momento desde la caché y se renuevan en segundo plano
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.open(SHELL_CACHE).then(async cache => {
        const cached = await cache.match(req, { ignoreSearch: true });
        const fresh = fetch(req).then(res => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fresh;
      })
    );
    return;
  }

  // Datos de TCGdex: primero la red; sin conexión, la última copia guardada
  if (url.hostname === 'api.tcgdex.net') {
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(API_CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then(r => r || Response.error()))
    );
  }
});
