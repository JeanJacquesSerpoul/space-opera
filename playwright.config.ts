import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout :
 * - version hors ligne (moteur dans le navigateur), en vue mobile et en vue ordinateur ;
 * - parties en ligne via le serveur (API + Vite en développement), à deux joueurs.
 * Ports à part de ceux de `npm run dev` (5173/3001), modifiables par E2E_WEB_PORT / E2E_API_PORT.
 */
const OFFLINE_PORT = 4174;
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4175);
const API_PORT = Number(process.env.E2E_API_PORT ?? 4176);
const ONLINE_SPECS = /online\.spec\.ts/;

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // l'interface suit la langue du navigateur : les scénarios sont écrits en français
  use: { baseURL: `http://localhost:${OFFLINE_PORT}`, trace: 'retain-on-failure', locale: 'fr-FR' },
  projects: [
    { name: 'mobile', testIgnore: ONLINE_SPECS, use: { ...devices['Pixel 7'] } },
    {
      name: 'desktop',
      testIgnore: ONLINE_SPECS,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'online',
      testMatch: ONLINE_SPECS,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        baseURL: `http://localhost:${WEB_PORT}`,
      },
    },
  ],
  webServer: [
    {
      command: `npm run build:e2e && npx vite preview --port ${OFFLINE_PORT} --strictPort`,
      url: `http://localhost:${OFFLINE_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      // base en mémoire, ordinateurs rapides
      command: 'npx tsx server/index.ts',
      url: `http://127.0.0.1:${API_PORT}/api/stats`,
      env: { API_PORT: String(API_PORT), DB_PATH: ':memory:', ROOM_BOT_DELAY: '200' },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // Vite relaie /api et /ws vers l'API ci-dessus (vite.config.ts lit API_PORT)
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { API_PORT: String(API_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
