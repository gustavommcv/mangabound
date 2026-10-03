import { defineConfig } from '@playwright/test';

import visual from './playwright.visual.config';

// Reuse the browser's presentation settings, never its screenshot baselines or retries.
export default defineConfig({
  forbidOnly: process.env.CI === 'true',
  fullyParallel: false,
  outputDir: 'test-results/tutorial',
  reporter: process.env.CI === 'true' ? 'github' : 'list',
  retries: 0,
  testDir: './tests/tutorial',
  use: {
    ...visual.use,
    baseURL: 'http://127.0.0.1:6007',
    deviceScaleFactor: 3,
    trace: 'retain-on-failure',
    viewport: { width: 1360, height: 960 },
  },
  webServer: {
    command: 'http-server storybook-static -a 127.0.0.1 -p 6007 -c-1',
    reuseExistingServer: false,
    url: 'http://127.0.0.1:6007/iframe.html',
  },
  workers: 1,
});
