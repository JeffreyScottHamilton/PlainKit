import { defineConfig } from '@playwright/test';

// PK_BASE_URL lets an agent test against its own dev server (npx vite --port N) without rebuilding dist.
const external = process.env.PK_BASE_URL;
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: 'line',
  use: { baseURL: external ?? 'http://localhost:4173', trace: 'off' },
  webServer: external ? undefined : { command: 'npm run preview', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 60_000 },
});
