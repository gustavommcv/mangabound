import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// ADR 0001's module boundaries, enforced (docs/architecture.md's "Layers" table has the full
// "May import" list this mirrors). Each of the two helpers below expands one layer name into the
// two specifier forms that reach it in this codebase: the `@/*` path alias, used everywhere except
// one file, and a plain relative path, used only by `src/preload/index.ts` — the sole file that
// imports across a layer boundary without the alias. It is exactly one level under `src`, so its
// relative imports are always `../<layer>`, never any other depth; these patterns are written for
// that fixed depth, not as a general relative-import boundary checker (no-restricted-imports
// cannot resolve a relative specifier to the module it targets, so it cannot catch a relative
// cross-layer import written at some other depth elsewhere - see CONTRIBUTING.md's note on this
// rule for what still depends on review).
const aliasedLayer = (name) => [`@/${name}`, `@/${name}/**`];
const relativeLayer = (name) => [`../${name}`, `../${name}/**`];

const nodeAndElectronFree = {
  paths: [{ name: 'electron', message: 'Not importable from here (ADR 0001).' }],
  patterns: [{ group: ['node:*', 'node:*/**'], message: 'Not importable from here (ADR 0001).' }],
};

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
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: nodeAndElectronFree.paths,
          patterns: [
            ...nodeAndElectronFree.patterns,
            {
              group: [
                ...aliasedLayer('application'),
                ...aliasedLayer('adapters'),
                ...aliasedLayer('library'),
                ...aliasedLayer('opds'),
                ...aliasedLayer('shared'),
                ...aliasedLayer('main'),
                ...aliasedLayer('preload'),
                ...aliasedLayer('renderer'),
              ],
              message: 'src/domain imports nothing outside domain (ADR 0001).',
            },
          ],
        },
      ],
    },
  },
  {
    // Also reaches into library (library-store.ts's port and library-publisher.ts's workflow both
    // need LibraryBookEntry/LibraryManifest and the path helper), the one place docs/architecture.md's
    // table is incomplete for this layer, same as it is for adapters below: library and opds are the
    // one pure, foundational pair both application and adapters may depend on, the way everything may
    // depend on domain.
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: nodeAndElectronFree.paths,
          patterns: [
            ...nodeAndElectronFree.patterns,
            {
              group: [
                ...aliasedLayer('adapters'),
                ...aliasedLayer('shared'),
                ...aliasedLayer('main'),
                ...aliasedLayer('preload'),
                ...aliasedLayer('renderer'),
              ],
              message: 'src/application may import only domain, library and opds (ADR 0001).',
            },
          ],
        },
      ],
    },
  },
  {
    // library and opds share one rule: ADR 0001 and docs/architecture.md's table treat them as one
    // row ("Pure library-catalog and OPDS-feed logic"), and each may import the other (opds/feed.ts
    // reads library/manifest.ts and library/publish.ts to build a feed from a manifest). Unlike the
    // domain block above, this does not forbid Node builtins: ADR 0001's "no ... filesystem,
    // process, or network imports" line names domain specifically, not this row, and both files
    // already use `node:path` for plain path joining - a real, working, sanctioned dependency
    // no-restricted-imports has no clean way to allow while still forbidding every other Node
    // builtin (it cannot express "all of node:* except node:path" without an enumerated,
    // easily-stale list). Keeping this layer free of real I/O (fs, child_process, network) stays a
    // matter for review, same as it is today; only the cross-layer `@/` boundary is enforced here.
    files: ['src/library/**/*.ts', 'src/opds/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'electron', message: 'Not importable from here (ADR 0001).' }],
          patterns: [
            {
              group: [
                ...aliasedLayer('application'),
                ...aliasedLayer('adapters'),
                ...aliasedLayer('shared'),
                ...aliasedLayer('main'),
                ...aliasedLayer('preload'),
                ...aliasedLayer('renderer'),
              ],
              message: 'src/library and src/opds may import only domain and each other (ADR 0001).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: nodeAndElectronFree.paths,
          patterns: [
            ...nodeAndElectronFree.patterns,
            {
              group: [
                ...aliasedLayer('application'),
                ...aliasedLayer('adapters'),
                ...aliasedLayer('library'),
                ...aliasedLayer('opds'),
                ...aliasedLayer('main'),
                ...aliasedLayer('preload'),
                ...aliasedLayer('renderer'),
              ],
              message: 'src/shared may import only domain (ADR 0001).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/adapters/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                ...aliasedLayer('main'),
                ...aliasedLayer('preload'),
                ...aliasedLayer('renderer'),
              ],
              message:
                'src/adapters may import application, domain, shared, library and opds, but not main, preload or renderer (ADR 0001).',
            },
          ],
        },
      ],
    },
  },
  {
    // The one file that still reaches across a layer boundary with a relative path instead of the
    // `@/` alias (see the comment on `relativeLayer` above): both forms are forbidden here so the
    // rule reflects what this file may import, not just how the rest of the codebase happens to
    // write it. preload may reach domain and shared, same as renderer (both need domain's types to
    // describe what crosses the bridge), which docs/architecture.md's table understates.
    files: ['src/preload/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                ...aliasedLayer('adapters'),
                ...relativeLayer('adapters'),
                ...aliasedLayer('application'),
                ...relativeLayer('application'),
                ...aliasedLayer('library'),
                ...relativeLayer('library'),
                ...aliasedLayer('opds'),
                ...relativeLayer('opds'),
                ...aliasedLayer('main'),
                ...relativeLayer('main'),
                ...aliasedLayer('renderer'),
                ...relativeLayer('renderer'),
              ],
              message: 'src/preload may import only domain and shared (ADR 0001).',
            },
          ],
        },
      ],
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
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'electron',
              message:
                'The renderer never touches Node or Electron directly (ADR 0001); go through window.mangabound.',
            },
          ],
          patterns: [
            {
              group: ['node:*', 'node:*/**'],
              message:
                'The renderer never touches Node or Electron directly (ADR 0001); go through window.mangabound.',
            },
            {
              group: [
                ...aliasedLayer('adapters'),
                ...aliasedLayer('application'),
                ...aliasedLayer('library'),
                ...aliasedLayer('opds'),
                ...aliasedLayer('main'),
                ...aliasedLayer('preload'),
              ],
              message: 'src/renderer may import only domain and shared (ADR 0001).',
            },
          ],
        },
      ],
    },
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
