import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout sur la version hors ligne (moteur dans le navigateur),
 * en vue mobile et en vue ordinateur.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // l'interface suit la langue du navigateur : les scénarios sont écrits en français
  use: { baseURL: 'http://localhost:4174', trace: 'retain-on-failure', locale: 'fr-FR' },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'npm run build:e2e && npx vite preview --port 4174 --strictPort',
    url: 'http://localhost:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
