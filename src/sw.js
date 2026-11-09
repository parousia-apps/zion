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
      .then(() => caches.open(MEDIA))
      // Une ancienne version rangeait aussi phrases.json ici : on ne garde que les sons.
      .then((cache) => cache.keys().then((reqs) => Promise.all(reqs.filter((r) => !/\.(mp3|m4a|mp4|ogg|wav|aac)$/i.test(new URL(r.url).pathname)).map((r) => cache.delete(r)))))
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

  // Fichiers son seulement (pas phrases.json, qui doit suivre les mises à jour).
  const media = /\.(mp3|m4a|mp4|ogg|wav|aac)$/i.test(url.pathname);

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

/**
 * Répond à une requête « Range » avec le bon morceau d'un fichier rangé en entier.
 * Le lecteur demande parfois un morceau au-delà de la fin (pour connaître la durée
 * d'un MP3) : il faut alors répondre 416 (« rien à cet endroit »), sinon il abandonne.
 */
async function slice(res, range) {
  const blob = await res.blob(); // découpe sans recopier le fichier en mémoire
  const size = blob.size;
  const m = /bytes=(\d*)-(\d*)/.exec(range || '');
  let start = m && m[1] ? Number(m[1]) : 0;
  let end = m && m[2] ? Number(m[2]) : size - 1;
  if (m && !m[1] && m[2]) {
    // « bytes=-500 » : les 500 derniers octets.
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  }
  end = Math.min(end, size - 1);
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}
