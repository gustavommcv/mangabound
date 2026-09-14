import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const browserExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(rootDirectory, 'src'),
    },
  },
  test: {
    coverage: {
      include: [
        'src/adapters/**/*.ts',
        'src/application/**/*.ts',
        'src/domain/**/*.ts',
        'src/library/**/*.ts',
        'src/opds/**/*.ts',
        'src/renderer/lib/**/*.ts',
      ],
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
          name: 'unit',
        },
      },
      {
        extends: true,
        test: {
          environment: 'jsdom',
          include: ['tests/component/**/*.test.tsx'],
          name: 'component',
          setupFiles: ['./tests/component/setup.ts'],
        },
      },
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(rootDirectory, '.storybook'),
          }),
        ],
        test: {
          browser: {
            enabled: true,
            headless: true,
            instances: [{ browser: 'chromium' }],
            provider: playwright(
              browserExecutable === undefined
                ? {}
                : { launchOptions: { executablePath: browserExecutable } },
            ),
          },
          name: 'storybook',
        },
      },
    ],
  },
});
