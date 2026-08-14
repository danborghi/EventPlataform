import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const apiEnvironment = {
  ...process.env,
  APP_PUBLIC_URL: 'http://localhost:3000',
  CORS_ORIGIN: 'http://localhost:3000',
  JWT_SECRET:
    process.env.JWT_SECRET ??
    'playwright-only-jwt-secret-with-at-least-32-characters',
  QR_SIGNING_SECRET:
    process.env.QR_SIGNING_SECRET ??
    'playwright-only-qr-secret-separate-from-jwt-32-characters',
  TMDB_API_READ_TOKEN: process.env.TMDB_API_READ_TOKEN ?? 'playwright-not-used',
};

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @event-platform/api start:dev',
      cwd: workspaceRoot,
      env: apiEnvironment,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      url: 'http://localhost:3333/api/v1/health/ready',
    },
    {
      command: 'pnpm --filter @event-platform/web dev',
      cwd: workspaceRoot,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: 'http://localhost:3333/api/v1',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      url: 'http://localhost:3000',
    },
  ],
});
