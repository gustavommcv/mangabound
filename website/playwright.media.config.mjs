import { defineConfig } from '@playwright/test';

import production from './playwright.config.mjs';
import { base } from './site.config.mjs';

export default defineConfig({
  ...production,
  testDir: './tests/media',
  use: { ...production.use, baseURL: 'http://127.0.0.1:4331' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4331',
    url: `http://127.0.0.1:4331${base}`,
    reuseExistingServer: false,
  },
});
