import path from 'node:path';

import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';

const config: StorybookConfig = {
  stories: ['../src/renderer/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-vitest'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  viteFinal: (configuration) => {
    return mergeConfig(configuration, {
      optimizeDeps: {
        include: ['react', 'react-dom', 'react/jsx-runtime'],
      },
      resolve: {
        dedupe: ['react', 'react-dom'],
        alias: {
          '@': path.resolve(import.meta.dirname, '../src'),
        },
      },
    });
  },
};

export default config;
