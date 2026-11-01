// Service worker (v15): instalar la app, jugar sin conexión y avisos.
// - Al instalarse guarda todos los archivos del juego (no las etapas del personaje: esas se guardan al usarse).
// - Red primero: con conexión siempre se juega la última versión; sin conexión, la copia guardada del MISMO archivo.
//   Solo las páginas (navegación) caen en index.html; un .js nunca recibe HTML (bug de la v13).
// - Al cambiar VERSION, la página avisa que hay una versión nueva (ver ui/extras.js).
const VERSION = 'oathbreak-v15';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'ui/img/icon-192.png', 'ui/img/icon-512.png',
  'ui/main.js', 'ui/kit.js', 'ui/art.js', 'ui/room.js', 'ui/report.js', 'ui/fight.js', 'ui/errors.js', 'ui/extras.js',
  'ui/onboarding.js', 'ui/account.js', 'ui/cloud.js',
  'ui/tabs/base.js', 'ui/tabs/misiones.js', 'ui/tabs/arena.js', 'ui/tabs/guarida.js', 'ui/tabs/social.js', 'ui/tabs/personaje.js',
  'src/game.js', 'src/config.js', 'src/core.js', 'src/character.js', 'src/combat.js', 'src/systems.js', 'src/lair.js', 'src/social.js',
  'src/season.js', 'src/objectives.js', 'src/effects.js', 'src/economy.js', 'src/events.js', 'src/catalog.js', 'src/migrate.js',
  'src/reports.js', 'src/telemetry.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' }))))));
});
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
  await self.clients.claim();
})()));
// La página pide activar la versión nueva cuando el jugador toca "Actualizar".
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // la nube y las fuentes van directo
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await cache.match('index.html')) ?? Response.error();
      return Response.error();
    }
  })());
});

// Tocar un aviso abre (o enfoca) el juego.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => cs[0]?.focus() ?? self.clients.openWindow('./')));
});
