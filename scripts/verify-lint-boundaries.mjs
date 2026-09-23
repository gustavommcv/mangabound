import { ESLint } from 'eslint';

// Proves eslint-rules/module-boundaries.mjs does what it claims: an import already legitimate
// somewhere in the codebase is still accepted, and a representative violation of each forbidden
// boundary is rejected - including the same violation written twice, once with the `@/*` alias and
// once as a relative path (at more than one depth), to prove the check is based on where an import
// actually resolves to, not a list of specifier strings. Each case lints a small snippet of
// real-shaped code at its own virtual path, through the real, loaded eslint.config.mjs - nothing
// here reimplements the rule, only exercises it. Every case gets a distinct path (rather than
// reusing one shared "__check__" file per layer, as an earlier version of this script did):
// typescript-eslint's project service caps how many distinct paths may be served by the "default
// project" (the mechanism `allowDefaultProject` opts a virtual file into) at 8 by default; past
// that, every further file silently gets zero messages from every rule instead of an error -
// `maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING` below raises that cap so a case
// that silently never ran cannot make this script lie about what it checked.

const RULE = 'module-boundaries/respect-layers';

const cases = [
  // domain: nothing outside domain, via the alias or a relative path.
  valid('domain', 'ts', 'own-layer', "import { defaultProcessMode } from '@/domain/process-mode';"),
  invalid(
    'domain',
    'ts',
    'application-alias',
    "import { x } from '@/application/ports/library-store';",
  ),
  invalid(
    'domain',
    'ts',
    'application-relative',
    "import { x } from '../application/ports/library-store';",
  ),
  invalid('domain', 'ts', 'electron', "import { app } from 'electron';"),
  invalid('domain', 'ts', 'node-fs', "import fs from 'node:fs';"),
  invalid('domain', 'ts', 'node-fs-promises', "import fsp from 'node:fs/promises';"),

  // application: domain, library, opds.
  valid('application', 'ts', 'domain', "import type { BookFormat } from '@/domain/conversion';"),
  valid(
    'application',
    'ts',
    'library',
    "import type { LibraryManifest } from '@/library/manifest';",
  ),
  invalid(
    'application',
    'ts',
    'adapters',
    "import { FsLibraryStore } from '@/adapters/library/fs-library-store';",
  ),
  invalid('application', 'ts', 'renderer', "import { App } from '@/renderer/app';"),

  // library and opds: domain, and each other.
  valid('library', 'ts', 'domain', "import type { BookFormat } from '@/domain/conversion';"),
  valid('opds', 'ts', 'library', "import type { LibraryBookEntry } from '@/library/manifest';"),
  invalid(
    'library',
    'ts',
    'application',
    "import type { LibraryStorePort } from '@/application/ports/library-store';",
  ),
  invalid(
    'opds',
    'ts',
    'adapters',
    "import { FsLibraryStore } from '@/adapters/library/fs-library-store';",
  ),

  // shared: domain only.
  valid('shared', 'ts', 'domain', "import type { BookFormat } from '@/domain/conversion';"),
  invalid('shared', 'ts', 'electron', "import { app } from 'electron';"),
  invalid(
    'shared',
    'ts',
    'adapters',
    "import { FsLibraryStore } from '@/adapters/library/fs-library-store';",
  ),

  // adapters: everything but main, preload, renderer - proven at a nested depth too, since a real
  // adapter (e.g. mangabind/, mangapress/) is never at the top level of src/adapters.
  valid(
    'adapters',
    'ts',
    'application',
    "import type { LibraryStorePort } from '@/application/ports/library-store';",
  ),
  valid('adapters', 'ts', 'library', "import { publishBook } from '@/library/publish';"),
  valid('adapters', 'ts', 'node-fs', "import fs from 'node:fs';"),
  // A relative import to a sibling folder within the same layer is never restricted, at any depth.
  valid('adapters/mangabind', 'ts', 'sibling-adapter', "import { x } from '../mangapress/cli';"),
  invalid('adapters', 'ts', 'renderer-alias', "import { App } from '@/renderer/app';"),
  invalid('adapters', 'ts', 'main-alias', "import '@/main/index';"),
  invalid('adapters/mangabind', 'ts', 'renderer-alias', "import { App } from '@/renderer/app';"),
  invalid(
    'adapters/mangabind',
    'ts',
    'renderer-relative',
    "import { App } from '../../renderer/app';",
  ),

  // preload: domain and shared, whether written with the alias or a relative path (the one file
  // that actually writes it that way).
  valid('preload', 'ts', 'domain-alias', "import type { MappingDraft } from '@/domain/mapping';"),
  valid(
    'preload',
    'ts',
    'domain-relative',
    "import type { MappingDraft } from '../domain/mapping';",
  ),
  valid(
    'preload',
    'ts',
    'shared',
    "import type { MangaboundBridge } from '@/shared/runtime-info';",
  ),
  invalid(
    'preload',
    'ts',
    'adapters-alias',
    "import { FsLibraryStore } from '@/adapters/library/fs-library-store';",
  ),
  invalid(
    'preload',
    'ts',
    'adapters-relative',
    "import { FsLibraryStore } from '../adapters/library/fs-library-store';",
  ),

  // renderer: domain and shared - the same violation proven three ways, alias and relative at two
  // different depths, since this is the boundary most renderer files could plausibly cross by
  // accident and the one the report's example used.
  valid('renderer', 'tsx', 'domain', "import type { BookFormat } from '@/domain/conversion';"),
  valid(
    'renderer',
    'tsx',
    'shared',
    "import type { MangaboundBridge } from '@/shared/runtime-info';",
  ),
  invalid(
    'renderer',
    'tsx',
    'adapters-alias',
    "import { FsLibraryStore } from '@/adapters/library/fs-library-store';",
  ),
  invalid(
    'renderer',
    'tsx',
    'adapters-relative',
    "import { FsLibraryStore } from '../adapters/library/fs-library-store';",
  ),
  invalid(
    'renderer/components/mapping',
    'tsx',
    'adapters-alias',
    "import { FsLibraryStore } from '@/adapters/library/fs-library-store';",
  ),
  invalid(
    'renderer/components/mapping',
    'tsx',
    'adapters-relative',
    "import { FsLibraryStore } from '../../../adapters/library/fs-library-store';",
  ),
  invalid('renderer', 'tsx', 'electron', "import { app } from 'electron';"),
  invalid('renderer', 'tsx', 'node-fs', "import fs from 'node:fs';"),
];

function valid(dir, extension, name, code) {
  return { filePath: `src/${dir}/__check-${name}__.${extension}`, code, expectRuleFired: false };
}

function invalid(dir, extension, name, code) {
  return { filePath: `src/${dir}/__check-${name}__.${extension}`, code, expectRuleFired: true };
}

// Each case lints a virtual file that never exists on disk, so TypeScript's project service (which
// the real config requires for type-aware rules) cannot find it in a tsconfig; this explicit,
// finite allowlist is what typescript-eslint's `allowDefaultProject` asks for instead of a glob
// (a wide `**` glob there is refused outright, to keep every real file on the checked project).
const virtualFiles = cases.map((testCase) => testCase.filePath);
if (virtualFiles.length !== new Set(virtualFiles).size) {
  throw new Error('Two module-boundary cases share a virtual file path; give each one its own.');
}
const eslint = new ESLint({
  overrideConfig: [
    {
      files: virtualFiles,
      languageOptions: {
        parserOptions: {
          projectService: {
            allowDefaultProject: virtualFiles,
            maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: virtualFiles.length,
          },
        },
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
    `The ADR 0001 module-boundary rule does not match ${String(failures.length)} expected outcome(s):\n` +
      failures.map((line) => `  - ${line}`).join('\n'),
  );
}

console.log(
  `All ${String(cases.length)} module-boundary cases behaved as expected (` +
    `${String(cases.filter((c) => !c.expectRuleFired).length)} allowed, ` +
    `${String(cases.filter((c) => c.expectRuleFired).length)} rejected).`,
);
