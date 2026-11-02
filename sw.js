// Service worker (v15.1): instalar la app, jugar sin conexión y avisos.
// - Al instalarse guarda todos los archivos del juego (si falta uno, la instalación falla y se reintenta en la próxima
//   visita: antes quedaba instalado a medias y sin conexión faltaban módulos).
// - Código y páginas: red primero (con conexión siempre se juega la última versión); sin conexión, la copia guardada del
//   MISMO archivo. Solo las páginas (navegación) caen en index.html; un .js nunca recibe HTML (bug de la v13).
//   Las páginas esperan a la red como máximo NAV_TIMEOUT: con señal mala se abre la copia guardada.
// - Etapas del personaje (.webp) y fuentes: caché propia que sobrevive a las versiones; se sirve al instante y se
//   refresca en segundo plano. Las 40 etapas se bajan una sola vez, al instalar (sin conexión, la Arena muestra rivales
//   de cualquier etapa).
// - Al cambiar VERSION, la página avisa que hay una versión nueva (ver ui/extras.js).
const VERSION = 'oathbreak-v15.1';
const MEDIA = 'oathbreak-media-v1'; // no se borra al cambiar VERSION
const NAV_TIMEOUT = 4000;
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'ui/img/icon-192.png', 'ui/img/icon-512.png',
  'ui/main.js', 'ui/kit.js', 'ui/art.js', 'ui/room.js', 'ui/report.js', 'ui/fight.js', 'ui/errors.js', 'ui/extras.js',
  'ui/onboarding.js', 'ui/account.js', 'ui/cloud.js',
  'ui/tabs/base.js', 'ui/tabs/misiones.js', 'ui/tabs/arena.js', 'ui/tabs/guarida.js', 'ui/tabs/social.js', 'ui/tabs/personaje.js',
  'src/game.js', 'src/config.js', 'src/core.js', 'src/character.js', 'src/combat.js', 'src/systems.js', 'src/lair.js', 'src/social.js',
  'src/season.js', 'src/objectives.js', 'src/effects.js', 'src/economy.js', 'src/events.js', 'src/catalog.js', 'src/migrate.js',
  'src/reports.js', 'src/telemetry.js',
];
const STAGES = ['hero', 'villain'].flatMap((f) => Array.from({ length: 10 }, (_, i) => {
  const s = String(i + 1).padStart(2, '0');
  return [`ui/img/${f}/s${s}.webp`, `ui/img/${f}/s${s}_av.webp`];
}).flat());
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
    // Etapas: lo que falte, sin frenar la instalación si alguna no baja. Con "ahorro de datos", solo al usarse.
    if (self.navigator.connection?.saveData) return;
    const m = await caches.open(MEDIA);
    await Promise.allSettled(STAGES.map(async (u) => { if (!(await m.match(u))) await m.add(u); }));
  })());
});
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== VERSION && k !== MEDIA) await caches.delete(k);
  await self.clients.claim();
})()));
// La página pide activar la versión nueva cuando el jugador toca "Actualizar".
// También manda las fuentes que usó en la primera visita (todavía sin service worker que las guarde), para tenerlas
// sin conexión: solo de los hosts de fuentes, y sin volver a bajar las que ya están.
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') return self.skipWaiting();
  if (e.data?.type !== 'media' || !Array.isArray(e.data.urls)) return;
  e.waitUntil(cacheFonts(e.data.urls.slice(0, 20)));
});
// Guarda las hojas de Google Fonts y los archivos de fuente que nombran (la hoja permite CORS: se puede leer).
async function cacheFonts(urls) {
  const m = await caches.open(MEDIA);
  const put = async (href, mode) => {
    if (await m.match(href)) return null;
    const res = await fetch(href, { mode });
    if (res.ok || res.type === 'opaque') await m.put(href, res.clone());
    return res;
  };
  await Promise.allSettled(urls.map(async (u) => {
    const url = new URL(u, location.href);
    if (!FONT_HOSTS.includes(url.hostname)) return;
    if (url.hostname === 'fonts.gstatic.com') return put(url.href, 'cors');
    const res = await put(url.href, 'cors').catch(() => put(url.href, 'no-cors'));
    const css = res?.ok ? await res.text() : (await (await m.match(url.href))?.text().catch(() => '')) ?? '';
    const files = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)'"]+)\)/g)].map((x) => x[1]).slice(0, 20);
    await Promise.allSettled(files.map((f) => put(f, 'cors')));
  }));
}

const isMedia = (url) => FONT_HOSTS.includes(url.hostname) || (url.origin === location.origin && /\.(webp|png|woff2?)$/.test(url.pathname));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isMedia(url)) return e.respondWith(staleWhileRevalidate(e, req));
  if (url.origin !== location.origin) return; // la nube va directo
  e.respondWith(networkFirst(e, req));
});

// Imágenes y fuentes: la copia guardada al instante; la red la actualiza para la próxima vez.
async function staleWhileRevalidate(e, req) {
  const cache = await caches.open(MEDIA);
  const hit = await caches.match(req); // también los íconos del SHELL
  const net = fetch(req).then((res) => {
    // Las fuentes de Google llegan "opacas" (sin CORS en el <link>): se guardan igual.
    if (res.ok || res.type === 'opaque') return cache.put(req, res.clone()).then(() => res);
    return res;
  });
  if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
  return net.catch(() => Response.error());
}

async function networkFirst(e, req) {
  const cache = await caches.open(VERSION);
  const nav = req.mode === 'navigate';
  // Las páginas se guardan con una sola clave ('./'): ?ref=… o #pestaña no crean copias nuevas.
  const key = nav ? new Request('./') : req;
  const net = fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') e.waitUntil(cache.put(key, res.clone()));
    return res;
  });
  net.catch(() => {}); // si gana la copia guardada, el error de red no queda suelto
  try {
    if (!nav) return await net;
    // Con señal mala, no dejar al jugador mirando una pantalla en blanco: a los NAV_TIMEOUT ms, la copia guardada.
    let timer;
    const slow = new Promise((resolve) => { timer = setTimeout(resolve, NAV_TIMEOUT); });
    const res = await Promise.race([net, slow.then(() => cache.match(key))]);
    clearTimeout(timer);
    return res ?? (await net);
  } catch {
    if (nav) return (await cache.match(key)) ?? (await cache.match('index.html')) ?? Response.error();
    return (await cache.match(req)) ?? Response.error();
  }
}

// Tocar un aviso abre (o enfoca) el juego.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow('./'))));
});
