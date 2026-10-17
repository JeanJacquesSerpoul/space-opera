import { defineConfig } from 'vitest/config';

// Tests unitaires du moteur et du serveur ; les tests de bout en bout (e2e/) passent par Playwright.
export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'server/**/*.test.ts'],
    // base SQLite en mémoire pour les tests du serveur
    env: { DB_PATH: ':memory:' },
  },
});
