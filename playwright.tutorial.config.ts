import { defineConfig, type BrowserContextOptions } from '@playwright/test';

import visual from './playwright.visual.config';

export const tutorialPresentation = {
  baseURL: 'http://127.0.0.1:6007',
  colorScheme: visual.use?.colorScheme,
  locale: visual.use?.locale,
  reducedMotion: visual.use?.reducedMotion,
  viewport: { width: 1360, height: 960 },
} satisfies BrowserContextOptions;

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
    ...tutorialPresentation,
    deviceScaleFactor: 3,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'http-server storybook-static -a 127.0.0.1 -p 6007 -c-1',
    reuseExistingServer: false,
    url: 'http://127.0.0.1:6007/iframe.html',
  },
  workers: 1,
});
