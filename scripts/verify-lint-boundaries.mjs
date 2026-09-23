import { ESLint } from 'eslint';

// Proves the ADR 0001 module-boundary rules in eslint.config.mjs do what they claim: an import
// already legitimate somewhere in the codebase is still accepted, and one representative import
// across each forbidden boundary is rejected by `no-restricted-imports`. Each case lints a small
// snippet of real-shaped code at a virtual path, so the flat config's `files` matching picks the
// same override a real file at that path would get - nothing here is a new rule, only evidence the
// configured ones fire where expected and nowhere else.

const RULE = 'no-restricted-imports';

const cases = [
  // domain: nothing outside domain.
  valid('src/domain/__check__.ts', "import { defaultProcessMode } from '@/domain/process-mode';"),
  invalid('src/domain/__check__.ts', "import { x } from '@/application/ports/library-store';"),
  invalid('src/domain/__check__.ts', "import { app } from 'electron';"),
  invalid('src/domain/__check__.ts', "import fs from 'node:fs';"),
  invalid('src/domain/__check__.ts', "import fsp from 'node:fs/promises';"),

  // application: domain, library, opds.
  valid('src/application/__check__.ts', "import type { BookFormat } from '@/domain/conversion';"),
  valid(
    'src/application/__check__.ts',
    "import type { LibraryManifest } from '@/library/manifest';",
  ),
  invalid(
    'src/application/__check__.ts',
    "import { FsLibraryStore } from '@/adapters/library/fs-library-store';",
  ),
  invalid('src/application/__check__.ts', "import { App } from '@/renderer/app';"),

  // library and opds: domain, and each other.
  valid('src/library/__check__.ts', "import type { BookFormat } from '@/domain/conversion';"),
  valid('src/opds/__check__.ts', "import type { LibraryBookEntry } from '@/library/manifest';"),
  invalid(
    'src/library/__check__.ts',
    "import type { LibraryStorePort } from '@/application/ports/library-store';",
  ),
  invalid(
    'src/opds/__check__.ts',
    "import { FsLibraryStore } from '@/adapters/library/fs-library-store';",
  ),

  // shared: domain only.
  valid('src/shared/__check__.ts', "import type { BookFormat } from '@/domain/conversion';"),
  invalid('src/shared/__check__.ts', "import { app } from 'electron';"),
  invalid(
    'src/shared/__check__.ts',
    "import { FsLibraryStore } from '@/adapters/library/fs-library-store';",
  ),

  // adapters: everything but main, preload, renderer.
  valid(
    'src/adapters/__check__.ts',
    "import type { LibraryStorePort } from '@/application/ports/library-store';",
  ),
  valid('src/adapters/__check__.ts', "import { publishBook } from '@/library/publish';"),
  valid('src/adapters/__check__.ts', "import fs from 'node:fs';"),
  invalid('src/adapters/__check__.ts', "import { App } from '@/renderer/app';"),
  invalid('src/adapters/__check__.ts', "import '@/main/index';"),

  // preload: domain and shared, whether written with the alias or a relative path.
  valid('src/preload/__check__.ts', "import type { MappingDraft } from '@/domain/mapping';"),
  valid('src/preload/__check__.ts', "import type { MappingDraft } from '../domain/mapping';"),
  valid(
    'src/preload/__check__.ts',
    "import type { MangaboundBridge } from '@/shared/runtime-info';",
  ),
  invalid(
    'src/preload/__check__.ts',
    "import { FsLibraryStore } from '@/adapters/library/fs-library-store';",
  ),
  invalid(
    'src/preload/__check__.ts',
    "import { FsLibraryStore } from '../adapters/library/fs-library-store';",
  ),

  // renderer: domain and shared.
  valid('src/renderer/__check__.tsx', "import type { BookFormat } from '@/domain/conversion';"),
  valid(
    'src/renderer/__check__.tsx',
    "import type { MangaboundBridge } from '@/shared/runtime-info';",
  ),
  invalid(
    'src/renderer/__check__.tsx',
    "import { FsLibraryStore } from '@/adapters/library/fs-library-store';",
  ),
  invalid('src/renderer/__check__.tsx', "import { app } from 'electron';"),
  invalid('src/renderer/__check__.tsx', "import fs from 'node:fs';"),
];

function valid(filePath, code) {
  return { filePath, code, expectRuleFired: false };
}

function invalid(filePath, code) {
  return { filePath, code, expectRuleFired: true };
}

// Each case lints a virtual file that never exists on disk, so TypeScript's project service (which
// the real config requires for type-aware rules) cannot find it in a tsconfig; this explicit,
// finite allowlist is what typescript-eslint's `allowDefaultProject` asks for instead of a glob
// (a wide `**` glob there is refused outright, to keep every real file on the checked project).
const virtualFiles = [...new Set(cases.map((testCase) => testCase.filePath))];
const eslint = new ESLint({
  overrideConfig: [
    {
      files: virtualFiles,
      languageOptions: {
        parserOptions: { projectService: { allowDefaultProject: virtualFiles } },
      },
    },
  ],
});
const failures = [];

for (const testCase of cases) {
  const [result] = await eslint.lintText(testCase.code, { filePath: testCase.filePath });
  const fired = (result?.messages ?? []).some((message) => message.ruleId === RULE);
  if (fired !== testCase.expectRuleFired) {
    failures.push(
      `${testCase.filePath}: expected ${RULE} to ${testCase.expectRuleFired ? '' : 'not '}fire for \`${testCase.code}\`, but it ${fired ? 'did' : 'did not'}.`,
    );
  }
}

if (failures.length > 0) {
  throw new Error(
    `The ADR 0001 module-boundary lint rules do not match ${String(failures.length)} expected outcome(s):\n` +
      failures.map((line) => `  - ${line}`).join('\n'),
  );
}

console.log(
  `All ${String(cases.length)} module-boundary cases behaved as expected (` +
    `${String(cases.filter((c) => !c.expectRuleFired).length)} allowed, ` +
    `${String(cases.filter((c) => c.expectRuleFired).length)} rejected).`,
);
