import { defineConfig } from '@playwright/test';

// PK_BASE_URL lets a run target a dev server (npx vite --port N) instead of the production preview.
const external = process.env.PK_BASE_URL;
// Specs that run a real model on the CPU. They time out when they compete for cores, so `npm run e2e`
// runs them in a second pass with one worker.
const MODELS = /(cutout|stems|transcribe|face)\.spec\.ts$/;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: 'line',
  use: { baseURL: external ?? 'http://localhost:4173', trace: 'off' },
  projects: [
    { name: 'fast', testIgnore: MODELS },
    { name: 'models', testMatch: MODELS },
  ],
  webServer: external ? undefined : { command: 'npm run preview', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 60_000 },
});
