import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { moduleBoundaries } from './eslint-rules/module-boundaries.mjs';

export default tseslint.config(
  {
    ignores: [
      '.webpack/**',
      'coverage/**',
      'node_modules/**',
      'out/**',
      'storybook-static/**',
      'test-results/**',
    ],
  },
  eslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  ...tseslint.configs.recommendedTypeChecked.map((configuration) => ({
    ...configuration,
    files: ['**/*.{ts,tsx}'],
  })),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-confusing-void-expression': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },
  {
    // ADR 0001's module boundaries (docs/architecture.md's "Layers" table has the full "May
    // import" list this encodes). One rule for every file under src, rather than one config block
    // per layer: the rule itself resolves each import - the `@/*` alias, a relative path, at any
    // depth - to the real layer it targets before deciding whether the importing file's own layer
    // may reach it, so it needs no per-layer file globs to do that correctly. See
    // eslint-rules/module-boundaries.mjs for the layer-by-layer allow list and why library/opds and
    // adapters/main/preload each get a different Node/Electron treatment.
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'module-boundaries': { rules: { 'respect-layers': moduleBoundaries } },
    },
    rules: {
      'module-boundaries/respect-layers': 'error',
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}', '.storybook/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: reactHooks.configs.flat.recommended.rules,
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.mocha,
      },
    },
  },
  {
    files: ['tests/e2e/**/*.ts'],
    rules: {
      // WebdriverIO's runtime-augmented browser types intentionally cross a dynamic service boundary.
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
);
