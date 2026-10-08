import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const libraryUrl = pathToFileURL(path.resolve('scripts/lib/toolchain.mjs')).href;
const notices = {
  mangabind: ['LICENSE'],
  mangapress: [
    'LICENSE-MIT',
    'LICENSE-APACHE',
    'THIRD-PARTY-NOTICES.md',
    'DEPENDENCY-LICENSES.txt',
  ],
};
const target = 'win32-x64';
let workspace: string;

function callHelper(
  name: 'extractExecutable' | 'copyToolLicenses' | 'alreadyAcquired',
  args: readonly unknown[],
): { readonly status: number | null; readonly output: string; readonly error: string } {
  const run = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { readFileSync } from 'node:fs';
       const helpers = await import(${JSON.stringify(libraryUrl)});
       const result = await helpers[process.argv[1]](...JSON.parse(readFileSync(0, 'utf8')));
       console.log(JSON.stringify(result));`,
      name,
    ],
    { encoding: 'utf8', input: JSON.stringify(args), windowsHide: true },
  );
  return { status: run.status, output: run.stdout.trim(), error: run.stderr };
}

async function archive(entries: readonly string[]): Promise<string> {
  const source = path.join(workspace, 'source');
  await mkdir(path.join(source, 'nested'), { recursive: true });
  for (const name of new Set(entries)) {
    await writeFile(path.join(source, name), `Original ${name}\r\n`, 'utf8');
  }
  const archivePath = path.join(workspace, 'release.tar.gz');
  const result = spawnSync('tar', ['-czf', archivePath, '-C', source, ...entries], {
    encoding: 'utf8',
    windowsHide: true,
  });
  expect(result.status, result.stderr).toBe(0);
  return archivePath;
}

async function cachedToolchain() {
  const tools = {} as Record<string, { pin: object }>;
  const licenses = {} as Record<string, unknown>;
  for (const [tool, files] of Object.entries(notices)) {
    const source = path.join(workspace, `${tool}-source`);
    await mkdir(source);
    for (const file of files) await writeFile(path.join(source, file), `Original ${file}\r\n`);
    const copied = callHelper('copyToolLicenses', [tool, source, workspace]);
    expect(copied.status, copied.error).toBe(0);
    licenses[tool] = JSON.parse(copied.output) as unknown;
    const binary = Buffer.from(`${tool} executable`);
    await writeFile(path.join(workspace, `${tool}.exe`), binary);
    tools[tool] = {
      pin: {
        releaseTag: 'v1.0.0',
        artifacts: {
          [target]: { executableSha256: createHash('sha256').update(binary).digest('hex') },
        },
      },
    };
  }
  const manifest = { target, tools, licenses };
  await writeFile(path.join(workspace, 'manifest.json'), JSON.stringify(manifest));
  return manifest;
}

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'mangabound-toolchain-test-'));
});

afterEach(async () => {
  expect(path.dirname(workspace)).toBe(path.resolve(tmpdir()));
  expect(path.basename(workspace)).toMatch(/^mangabound-toolchain-test-/u);
  await rm(workspace, { recursive: true, force: true });
});

describe('acquiring upstream licenses with the executable', () => {
  it('extracts only the required root files, preserving their bytes', async () => {
    const packed = await archive(['mangapress', ...notices.mangapress, 'nested/README']);
    const destination = path.join(workspace, 'extracted');
    const run = callHelper('extractExecutable', [
      packed,
      destination,
      'mangapress',
      notices.mangapress,
    ]);
    expect(run.status, run.error).toBe(0);
    expect(run.output).toBe(JSON.stringify(path.join(destination, 'mangapress')));
    for (const file of ['mangapress', ...notices.mangapress]) {
      expect(await readFile(path.join(destination, file))).toEqual(
        await readFile(path.join(workspace, 'source', file)),
      );
    }
    expect(existsSync(path.join(destination, 'nested'))).toBe(false);
  });

  it.each([
    ['missing', ['mangabind']],
    ['nested instead of root', ['mangabind', 'nested/LICENSE']],
    ['duplicate', ['mangabind', 'LICENSE', 'LICENSE']],
  ])('refuses a %s license before extracting the executable', async (_label, entries) => {
    const packed = await archive(entries);
    const destination = path.join(workspace, 'extracted');
    const run = callHelper('extractExecutable', [packed, destination, 'mangabind', ['LICENSE']]);
    expect(run.status).not.toBe(0);
    expect(run.error).toContain('must contain exactly one root LICENSE');
    expect(existsSync(path.join(destination, 'mangabind'))).toBe(false);
  });

  it('keeps the executable-only extraction API used by existing callers', async () => {
    const packed = await archive(['mangabind', 'LICENSE']);
    const destination = path.join(workspace, 'extracted');
    expect(callHelper('extractExecutable', [packed, destination, 'mangabind']).status).toBe(0);
    expect(existsSync(path.join(destination, 'LICENSE'))).toBe(false);
  });

  it('copies each tool into its own directory without changing the documents', async () => {
    const manifest = await cachedToolchain();
    for (const [tool, files] of Object.entries(notices)) {
      for (const file of files) {
        const copied = path.join(workspace, 'licenses', tool, file);
        expect(await readFile(copied)).toEqual(
          await readFile(path.join(workspace, `${tool}-source`, file)),
        );
        if (process.platform !== 'win32') expect((await stat(copied)).mode & 0o777).toBe(0o644);
      }
      if (process.platform !== 'win32') {
        expect((await stat(path.join(workspace, 'licenses', tool))).mode & 0o777).toBe(0o755);
      }
    }
    expect(callHelper('alreadyAcquired', [workspace, target, manifest]).output).toBe('true');
  });

  it('refuses empty license documents', async () => {
    const source = path.join(workspace, 'source');
    await mkdir(source);
    await writeFile(path.join(source, 'LICENSE'), ' \r\n');
    const run = callHelper('copyToolLicenses', ['mangabind', source, workspace]);
    expect(run.status).not.toBe(0);
    expect(run.error).toContain('mangabind LICENSE must not be empty');
  });
});

describe('revalidating an acquired toolchain cache', () => {
  it('does not reuse old caches without license hashes', async () => {
    const manifest = await cachedToolchain();
    await writeFile(
      path.join(workspace, 'manifest.json'),
      JSON.stringify({ target, tools: manifest.tools }),
    );
    expect(callHelper('alreadyAcquired', [workspace, target, manifest]).output).toBe('false');
  });

  it.each(['missing', 'modified'])('does not reuse a cache with a %s notice', async (kind) => {
    const manifest = await cachedToolchain();
    const file = path.join(workspace, 'licenses', 'mangapress', 'DEPENDENCY-LICENSES.txt');
    if (kind === 'missing') await rm(file);
    else await writeFile(file, 'Different license text');
    expect(callHelper('alreadyAcquired', [workspace, target, manifest]).output).toBe('false');
  });

  it('still refuses a changed executable', async () => {
    const manifest = await cachedToolchain();
    await writeFile(path.join(workspace, 'mangabind.exe'), 'Changed executable');
    expect(callHelper('alreadyAcquired', [workspace, target, manifest]).output).toBe('false');
  });

  it('still refuses a different target or pin', async () => {
    const manifest = await cachedToolchain();
    expect(callHelper('alreadyAcquired', [workspace, 'linux-x64', manifest]).output).toBe('false');
    const changed = structuredClone(manifest);
    changed.tools.mangabind = { pin: { releaseTag: 'v2.0.0' } };
    expect(callHelper('alreadyAcquired', [workspace, target, changed]).output).toBe('false');
  });

  it.each(['missing', 'invalid JSON', 'null'])('refuses a %s cache manifest', async (kind) => {
    const manifest = await cachedToolchain();
    const file = path.join(workspace, 'manifest.json');
    if (kind === 'missing') await rm(file);
    else await writeFile(file, kind === 'null' ? 'null' : '{');
    expect(callHelper('alreadyAcquired', [workspace, target, manifest]).output).toBe('false');
  });
});
