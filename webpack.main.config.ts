import path from 'node:path';

import type { Configuration } from 'webpack';

import { rules } from './webpack.rules';

export const mainConfig: Configuration = {
  devtool: 'source-map',
  entry: './src/main/index.ts',
  module: {
    rules,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    extensions: ['.js', '.ts', '.tsx'],
  },
};
