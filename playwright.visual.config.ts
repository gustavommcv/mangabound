import { defineConfig } from '@playwright/test';

const browserExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixelRatio: 0.001,
    },
  },
  fullyParallel: false,
  // The preview is Storybook's development server, and on a CI runner its preview file
  // (`vite-app.js`) has failed to load once in a run and loaded on the next try. A screenshot that
  // really differs fails on every try, so a retry hides no regression.
  retries: process.env.CI === 'true' ? 2 : 0,
  reporter: process.env.CI === 'true' ? 'github' : 'list',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  testDir: './tests/visual',
  use: {
    baseURL: 'http://127.0.0.1:6006',
    colorScheme: 'dark',
    deviceScaleFactor: 1,
    locale: 'en-US',
    reducedMotion: 'reduce',
    viewport: { height: 720, width: 900 },
    ...(browserExecutable === undefined
      ? {}
      : { launchOptions: { executablePath: browserExecutable } }),
  },
  webServer: {
    // Match the address Playwright opens so Vite's host check cannot reject the preview.
    command: 'npm run storybook -- --ci --host 127.0.0.1',
    reuseExistingServer: process.env.CI !== 'true',
    timeout: 30_000,
    url: 'http://127.0.0.1:6006',
  },
});
