import { defineConfig } from '@playwright/test';
import base from './playwright.config';
import { deploymentOrigin } from './scripts/cloudflare-config';

export default defineConfig({
  ...base,
  testDir: './tests/deployment',
  use: {
    ...base.use,
    baseURL: deploymentOrigin(process.env.PN_DEPLOYMENT_URL),
  },
  webServer: process.env.PN_DEPLOYMENT_URL
    ? undefined
    : {
        command: 'npm run preview:cloudflare',
        url: 'http://127.0.0.1:4174',
        reuseExistingServer: false,
        timeout: 30_000,
      },
  outputDir: 'test-results/cloudflare',
  reporter: process.env.CI
    ? [
        ['list'],
        ['github'],
        [
          'html',
          { outputFolder: 'playwright-report/cloudflare', open: 'never' },
        ],
      ]
    : 'list',
});
