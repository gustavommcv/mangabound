import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { MangabindCliAdapter } from '@/adapters/mangabind/cli';
import { MangapressCliAdapter } from '@/adapters/mangapress/cli';
import { createNodeProcessRunner } from '@/adapters/process/node-process-runner';
import { resolveToolchainTarget } from '@/adapters/toolchain/verification';

/**
 * The pinned tools are the ones that will ship, and what they print is read with the app's own
 * parsers, which reject what is not the shape they know. The protocol fixtures of the other tests
 * were written from earlier builds of the tools, and `capabilities:check` looks only at the names
 * of flags, so a tool update that kept its flags and changed its JSON would otherwise be caught
 * only by the packaged end-to-end suite, on the commit that happens to be tagged. Here the real
 * executables are run, as the unit suite already does for their handshakes, and everything they
 * answer goes through the parsers.
 */
const target = resolveToolchainTarget(process.platform, process.arch)!;
const toolchainFolder = path.resolve('vendor', 'toolchain', target);
const executable = (name: string): string =>
  path.join(toolchainFolder, target.startsWith('win32-') ? `${name}.exe` : name);
const fixtures = path.resolve('tests', 'fixtures', 'e2e');
const runner = createNodeProcessRunner();

describe('what the pinned tools print, read with the app’s own parsers', () => {
  it('reads the report of mangabind for a folder of chapters, a plan and a library', async () => {
    const mangabind = new MangabindCliAdapter(executable('mangabind'), runner);
    const output = path.join(tmpdir(), 'mangabound-pinned-never-written');

    const folder = await mangabind.run({
      inputPath: path.join(fixtures, 'manga-named-volumes', 'Named Volumes'),
      outputPath: output,
      dryRun: true,
    });
    const library = await mangabind.run({
      inputPath: path.join(fixtures, 'manga-batch', 'Library'),
      outputPath: output,
      dryRun: true,
      batch: true,
    });

    expect(folder.exitCode).toBe(0);
    expect(folder.report.manga).toHaveLength(1);
    expect(folder.report.manga[0]?.volumes.length).toBeGreaterThan(0);
    expect(library.exitCode).toBe(0);
    expect(library.report.manga.length).toBeGreaterThan(1);
  });

  it('reads the event stream of mangapress for a plan, a conversion and its list of devices', async () => {
    const mangapress = new MangapressCliAdapter(executable('mangapress'), runner);
    const input = path.join(fixtures, 'cbz', 'Mangabound Direct.cbz');
    const output = await mkdtemp(path.join(tmpdir(), 'mangabound-pinned-'));
    try {
      const plan = await mangapress.run({
        inputPath: input,
        outputPath: output,
        profile: 'KV',
        format: 'epub',
        dryRun: true,
      });
      const conversion = await mangapress.run({
        inputPath: input,
        outputPath: output,
        profile: 'KV',
        format: 'epub',
        dryRun: false,
      });
      const devices = await mangapress.listProfiles();

      expect(plan.exitCode).toBe(0);
      expect(plan.result).toMatchObject({ operation: 'convert', written: false });
      expect(conversion.exitCode).toBe(0);
      expect(conversion.result).toMatchObject({ operation: 'convert', written: true });
      expect(conversion.events.length).toBeGreaterThan(2);
      expect(devices.profiles.length).toBeGreaterThan(5);
    } finally {
      await rm(output, { force: true, recursive: true });
    }
  }, 60_000);
});
