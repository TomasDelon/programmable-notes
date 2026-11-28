import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/cloud',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  failOnFlakyTests: true,
  timeout: 60_000,
  // Self-signed certificate exists only in this disposable loopback fixture.
  use: {
    baseURL: 'https://127.0.0.1:4185',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/preview-cloud-storage.mjs',
    url: 'https://127.0.0.1:4185/',
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
