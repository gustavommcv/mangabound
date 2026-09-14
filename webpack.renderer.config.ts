import path from 'node:path';

import type { Configuration } from 'webpack';

import { rules } from './webpack.rules';

export const rendererConfig: Configuration = {
  devtool: 'source-map',
  module: {
    rules: [
      ...rules,
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    extensions: ['.js', '.ts', '.tsx'],
  },
};
