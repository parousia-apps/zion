import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Service worker (jeu hors ligne) : après le build, on écrit dist/sw.js à partir
 * de src/sw.js en y mettant la liste des fichiers à ranger dès l'installation.
 * Les voix (audio/) et les chants (fichiers audio) en sont exclus : trop lourds,
 * ils sont rangés au fur et à mesure qu'on les écoute.
 */
function serviceWorker(): Plugin {
  return {
    name: 'zion-service-worker',
    apply: 'build',
    closeBundle() {
      const dist = 'dist';
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const path = join(dir, name);
          if (statSync(path).isDirectory()) walk(path);
          else files.push('/' + relative(dist, path).split('\\').join('/'));
        }
      };
      walk(dist);
      const precache = files.filter(
        (f) => !f.startsWith('/audio/') && f !== '/sw.js' && !/\.(mp3|m4a|mp4|ogg|wav|aac|map|woff)$/i.test(f),
      );
      // La version change dès qu'un fichier change : le navigateur installe alors la nouvelle.
      const hash = createHash('sha1');
      for (const f of precache) hash.update(f).update(readFileSync(join(dist, f)));
      const sw = readFileSync('src/sw.js', 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 10))
        .replace('__PRECACHE__', JSON.stringify(precache));
      writeFileSync(join(dist, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  plugins: [serviceWorker()],
  build: {
    target: 'es2020',
    // Three.js pèse ~150 Ko gzip : on relève un peu le seuil d'alerte.
    chunkSizeWarningLimit: 800,
  },
});
