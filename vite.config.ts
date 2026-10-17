import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Génère le service worker (`sw.js`) au build : il met en cache tous les fichiers
 * produits pour que le jeu s'installe et fonctionne sans réseau.
 */
function serviceWorker(): Plugin {
  return {
    name: 'so-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const assets = ['./', './manifest.webmanifest', './icon.svg', ...built.map((f) => `./${f}`)];
      const version = createHash('sha1').update(built.sort().join('|')).digest('hex').slice(0, 10);
      const template = readFileSync('sw-template.js', 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace('__VERSION__', version).replace('__ASSETS__', JSON.stringify([...new Set(assets)])),
      });
    },
  };
}

export default defineConfig({
  // GitHub Pages sert le site sous /<nom-du-dépôt>/
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), serviceWorker()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
});
