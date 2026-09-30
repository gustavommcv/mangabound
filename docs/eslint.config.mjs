import eslint from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**', '.astro/**', 'dist/**', 'test-results/**', 'playwright-report/**'],
  },
  eslint.configs.recommended,
  { files: ['**/*.mjs'], languageOptions: { globals: globals.node } },
  { files: ['tests/{browser,media}/*.mjs'], languageOptions: { globals: globals.browser } },
];
