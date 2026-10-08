import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { MangabindBindingAdapter } from '@/adapters/mangabind/binding-port';
import { MangabindCliAdapter } from '@/adapters/mangabind/cli';
import { MangapressCliAdapter } from '@/adapters/mangapress/cli';
import { MangapressConversionAdapter } from '@/adapters/mangapress/conversion-port';
import { createNodeProcessRunner } from '@/adapters/process/node-process-runner';
import { resolveToolchainTarget } from '@/adapters/toolchain/verification';
import { skippedLinkNames } from '@/domain/library-links';
import { defaultMangapressSettings } from '@/domain/output-profile';

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
  it.each([
    ['Kindle', 'KPW6', {}, 'epub'],
    ['Kobo', 'KoLC', {}, 'kepub.epub'],
    ['Kobo with plain EPUB', 'KoLC', { noKepub: true }, 'epub'],
    ['Kobo with custom dimensions', 'KoLC', { customWidth: 800, customHeight: 1200 }, 'epub'],
  ] as const)(
    'uses the custom filename for %s with the real converter, without changing its title',
    async (_label, deviceProfile, settings, extension) => {
      const output = await mkdtemp(path.join(tmpdir(), 'mangabound-pinned-custom-name-'));
      const adapter = new MangapressConversionAdapter(
        new MangapressCliAdapter(executable('mangapress'), runner),
      );
      const request = {
        inputPath: path.join(fixtures, 'cbz', 'Mangabound Direct.cbz'),
        outputDirectory: output,
        book: { title: 'Custom: Book' },
        format: 'epub' as const,
        settings: { ...defaultMangapressSettings, deviceProfile, noProcessing: true, ...settings },
      };
      try {
        const plan = await adapter.plan(request);
        const artifact = await adapter.convert(request, { onProgress: () => undefined });
        expect(plan.name).toBe(`Custom- Book.${extension}`);
        expect(artifact.name).toBe(plan.name);
        expect(artifact.title).toBe('Custom: Book');
      } finally {
        await rm(output, { force: true, recursive: true });
      }
    },
    60_000,
  );

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

  it('binds one title of a library on its own, the way the whole library is bound', async () => {
    const cli = new MangabindCliAdapter(executable('mangabind'), runner, true);
    const scratch = await mkdtemp(path.join(tmpdir(), 'mangabound-pinned-bind-'));
    const adapter = new MangabindBindingAdapter(cli, undefined, scratch);
    const library = path.join(fixtures, 'manga-batch', 'Library');
    try {
      const whole = await adapter.bindBatch(library);
      const alone = await adapter.bindTitles(library, [path.join(library, 'Auto-Resolved Manga')]);

      const named = (bound: typeof whole): unknown =>
        bound.titles
          .filter((title) => title.title === 'Auto-Resolved Manga')
          .map((title) => ({
            status: title.status,
            volumes: title.volumes.map((volume) => [volume.number, path.basename(volume.path)]),
          }));
      expect(alone.titles.map((title) => title.title)).toEqual(['Auto-Resolved Manga']);
      expect(named(alone)).toEqual(named(whole));
      // The library has another title, which only the whole run reads.
      expect(whole.titles.map((title) => title.title)).toHaveLength(2);
      await adapter.release(whole.workspaceId);
      await adapter.release(alone.workspaceId);
    } finally {
      await rm(scratch, { force: true, recursive: true });
    }
  }, 60_000);

  it('leaves out a link that leads outside the folder it binds, and says so', async ({ skip }) => {
    const mangabind = new MangabindCliAdapter(executable('mangabind'), runner);
    const root = await mkdtemp(path.join(tmpdir(), 'mangabound-pinned-links-'));
    try {
      const chapter = path.join(root, 'Hostile', 'Vol.01 Ch.001');
      await mkdir(chapter, { recursive: true });
      await writeFile(path.join(chapter, '001.png'), 'its own page');
      await writeFile(path.join(root, 'private.png'), 'not part of the manga');
      try {
        await symlink(path.join(root, 'private.png'), path.join(chapter, '002.png'));
      } catch {
        // Windows allows a link only with Developer Mode or an elevated shell.
        skip('This system does not allow a symbolic link here.');
      }

      const { report } = await mangabind.run({
        inputPath: path.join(root, 'Hostile'),
        outputPath: path.join(root, 'volumes'),
        dryRun: true,
      });

      // An earlier mangabind (0.6.0) copied the target into the volume and said nothing.
      expect(report.manga[0]?.issues.map((issue) => issue.code)).toContain('link_skipped');
      expect(report.manga[0]?.volumes.map((volume) => volume.page_count)).toEqual([1]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }, 60_000);

  it('says which series of a library are links it did not follow, with or without other series', async ({
    skip,
  }) => {
    const cli = new MangabindCliAdapter(executable('mangabind'), runner, true);
    const root = await mkdtemp(path.join(tmpdir(), 'mangabound-pinned-library-links-'));
    const adapter = new MangabindBindingAdapter(cli, undefined, root);
    try {
      const chapter = path.join(root, 'Library', 'Plain', 'Vol.01 Ch.001');
      await mkdir(chapter, { recursive: true });
      await writeFile(path.join(chapter, '001.png'), 'a page');
      const real = path.join(root, 'Elsewhere', 'Linked', 'Vol.01 Ch.001');
      await mkdir(real, { recursive: true });
      await writeFile(path.join(real, '001.png'), 'a page');
      try {
        await symlink(path.join(root, 'Elsewhere', 'Linked'), path.join(root, 'Library', 'Linked'));
        await mkdir(path.join(root, 'OnlyLinks'));
        await symlink(path.join(root, 'Elsewhere', 'Linked'), path.join(root, 'OnlyLinks', 'A'));
        await symlink(path.join(root, 'Elsewhere', 'Linked'), path.join(root, 'OnlyLinks', 'B'));
      } catch {
        // Windows allows a link only with Developer Mode or an elevated shell.
        skip('This system does not allow a symbolic link here.');
      }

      const mixed = await adapter.planBatch(path.join(root, 'Library'));
      const onlyLinks = await adapter.planBatch(path.join(root, 'OnlyLinks'));

      // An earlier mangabind (0.6.1) skipped a linked series without a word.
      expect(mixed.titles.map((title) => title.title)).toEqual(['Plain']);
      expect(skippedLinkNames(mixed.issues)).toEqual(['Linked']);
      expect(onlyLinks.titles).toEqual([]);
      expect(skippedLinkNames(onlyLinks.issues).slice().sort()).toEqual(['A', 'B']);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }, 60_000);

  it('counts only the images of a chapter, and says which other files it left out', async () => {
    const cli = new MangabindCliAdapter(executable('mangabind'), runner, true);
    const scratch = await mkdtemp(path.join(tmpdir(), 'mangabound-pinned-pages-'));
    const adapter = new MangabindBindingAdapter(cli, undefined, scratch);
    try {
      const chapter = path.join(scratch, 'Mixed', 'Vol.01 Ch.001');
      await mkdir(chapter, { recursive: true });
      await writeFile(path.join(chapter, '001.png'), 'a page');
      await writeFile(path.join(chapter, '002.png'), 'a page');
      // Known junk is left out without a word; any other file is left out and named.
      await writeFile(path.join(chapter, '.DS_Store'), 'junk');
      await writeFile(path.join(chapter, 'credits.txt'), 'not a page');

      const inspection = await adapter.inspect(path.join(scratch, 'Mixed'));

      // An earlier mangabind (0.6.1) counted all four files as pages.
      expect(inspection.draft.chapters.map((entry) => entry.pageCount)).toEqual([2]);
      const issues = inspection.issues.filter((issue) => issue.code === 'unsupported_page_files');
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ severity: 'warning', stage: 'inspect', volume: '1' });
      expect(issues[0]?.message).toContain('credits.txt');
      expect(issues[0]?.message).not.toContain('.DS_Store');
      await adapter.release(inspection.workspaceId);
    } finally {
      await rm(scratch, { force: true, recursive: true });
    }
  }, 60_000);

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

  it('keeps unsupported-input warnings when mangabind finds no chapters', async () => {
    const cli = new MangabindCliAdapter(executable('mangabind'), runner, true);
    const scratch = await mkdtemp(path.join(tmpdir(), 'mangabound-pinned-no-chapters-'));
    const adapter = new MangabindBindingAdapter(cli, undefined, scratch);
    try {
      const input = path.join(scratch, 'Series');
      await mkdir(input);
      await writeFile(path.join(input, 'chapter.pdf'), 'not a supported chapter');
      await writeFile(path.join(input, 'chapter.epub'), 'not a supported chapter');
      await writeFile(path.join(input, '.DS_Store'), 'known junk');

      const inspection = await adapter.inspect(input);

      expect(inspection.draft.chapters).toEqual([]);
      expect(inspection.issues.map((issue) => issue.code)).toEqual([
        'unsupported_input_file',
        'unsupported_input_file',
        'no_chapters_found',
      ]);
      expect(
        inspection.issues
          .filter((issue) => issue.code === 'unsupported_input_file')
          .map((issue) => path.basename(issue.path!))
          .sort(),
      ).toEqual(['chapter.epub', 'chapter.pdf']);
      expect(inspection.issues.every((issue) => issue.severity === 'warning')).toBe(true);
      await adapter.release(inspection.workspaceId);
    } finally {
      await rm(scratch, { force: true, recursive: true });
    }
  }, 60_000);
});
