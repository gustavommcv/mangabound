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
    command: 'npm run storybook -- --ci',
    reuseExistingServer: process.env.CI !== 'true',
    timeout: 30_000,
    url: 'http://127.0.0.1:6006',
  },
});
