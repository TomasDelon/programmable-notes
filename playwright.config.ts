import { defineConfig, devices } from '@playwright/test';

const chromiumUse = {
  ...devices['Desktop Chrome'],
  launchOptions: {
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  },
};
const browserProjects = [
  { name: 'chromium', use: chromiumUse },
  ...(process.env.PN_ALL_BROWSERS === '1'
    ? [
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
      ]
    : []),
];
const crashTest = '**/web-recovery-crash.spec.ts';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // A passing retry is diagnostic evidence, not a clean acceptance result.
  failOnFlakyTests: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.PLAYWRIGHT_WORKERS
    ? Number(process.env.PLAYWRIGHT_WORKERS)
    : process.env.CI
      ? 2
      : undefined,
  reporter: process.env.CI
    ? [['list'], ['github'], ['html', { open: 'never' }]]
    : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    ...browserProjects.map((project) => ({
      ...project,
      testIgnore: crashTest,
    })),
    {
      name: 'chromium-crash-recovery',
      testMatch: crashTest,
      dependencies: browserProjects.map((project) => project.name),
      workers: 1,
      use: chromiumUse,
    },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
