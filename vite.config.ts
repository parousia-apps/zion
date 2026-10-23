import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2020',
    // Three.js pèse ~150 Ko gzip : on relève un peu le seuil d'alerte.
    chunkSizeWarningLimit: 800,
  },
});
