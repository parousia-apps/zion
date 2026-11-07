/* Service worker de Zion : le jeu marche sans connexion.
 *
 * Analogie : un petit serveur cache installé dans le navigateur.
 * - À l'installation, on range l'essentiel (code, personnages 3D, illustrations) :
 *   la liste PRECACHE est écrite au moment du build par vite.config.ts.
 * - Les voix et les chants (lourds) sont rangés au fur et à mesure qu'on les écoute.
 * - La page elle-même est demandée au réseau d'abord (pour recevoir les mises à jour),
 *   puis au cache si on est hors ligne.
 */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CORE = `zion-core-${VERSION}`;
const MEDIA = 'zion-media';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CORE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  // Les anciennes versions du jeu sont supprimées ; les voix déjà écoutées restent.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('zion-core-') && k !== CORE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // statistiques de visite, etc. : pas de cache

  // La page : réseau d'abord, cache si hors ligne.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CORE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  const media = url.pathname.startsWith('/audio/') || /\.(mp3|m4a|mp4|ogg|wav|aac)$/i.test(url.pathname);

  // Les voix et les chants se lisent par morceaux (requêtes « Range »).
  if (req.headers.has('range')) {
    if (!media) return;
    event.respondWith(
      caches.match(url.pathname).then((hit) => {
        if (hit) return slice(hit, req.headers.get('range'));
        // Pas encore rangé : on lit depuis le réseau tout de suite, et on range le fichier entier en arrière-plan.
        event.waitUntil(saveMedia(url.pathname));
        return fetch(req);
      }),
    );
    return;
  }

  // Le reste : cache d'abord, sinon réseau (et on garde une copie des voix et des chants).
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && media) {
            const copy = res.clone();
            caches.open(MEDIA).then((c) => c.put(url.pathname, copy));
          }
          return res;
        }),
    ),
  );
});

async function saveMedia(path) {
  const cache = await caches.open(MEDIA);
  if (await cache.match(path)) return;
  const res = await fetch(path);
  if (res.ok) await cache.put(path, res);
}

/** Répond à une requête « Range » avec le bon morceau d'un fichier rangé en entier. */
async function slice(res, range) {
  const buf = await res.arrayBuffer();
  const size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(range || '');
  const start = m && m[1] ? Number(m[1]) : 0;
  const end = Math.min(m && m[2] ? Number(m[2]) : size - 1, size - 1);
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}
