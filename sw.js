// Service worker de l'Agenda Studios.
// - Fichiers de l'appli (HTML, CSS, JS, police) : servis depuis le cache, mis à jour en arrière-plan.
// - Données (API Google Apps Script) : JAMAIS interceptées ni mises en cache ici.
// Pour forcer un nettoyage complet après une grosse modification, changer le numéro de CACHE_NAME.
const CACHE_NAME = 'agenda-studios-shell-v1';
const PRECACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './fonts/inter-latin-wght-normal.woff2'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API Google et tout ce qui est externe : réseau direct

  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      // Pour la page elle-même, on ignore ?week=... ; pour les autres fichiers, on garde le ?v=
      cache.match(req, { ignoreSearch: req.mode === 'navigate' }).then(cached => {
        const network = fetch(req)
          .then(res => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});
