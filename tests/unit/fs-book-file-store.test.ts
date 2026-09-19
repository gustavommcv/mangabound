import { constants } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { FsBookFileStore } from '@/adapters/library/fs-book-file-store';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function workspace(): Promise<{ readonly source: string; readonly library: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mangabound-book-store-'));
  temporaryDirectories.push(root);
  const source = path.join(root, 'scratch');
  const library = path.join(root, 'library');
  await mkdir(source);
  await mkdir(library);
  return { source, library };
}

async function stagingFiles(library: string): Promise<readonly string[]> {
  return readdir(path.join(library, '.mangabound', 'incoming'));
}

describe('FsBookFileStore', () => {
  it('publishes a joined volume as a complete book and leaves nothing in staging', async () => {
    const { source, library } = await workspace();
    const volume = path.join(source, 'Manga - Vol.01.cbz');
    await writeFile(volume, 'volume one contents');

    const saved = await new FsBookFileStore().saveBook({
      sourcePath: volume,
      libraryPath: library,
    });

    expect(saved).toEqual({
      path: path.join(library, 'Manga - Vol.01.cbz'),
      name: 'Manga - Vol.01.cbz',
      bytes: Buffer.byteLength('volume one contents'),
    });
    expect(await readFile(saved.path, 'utf8')).toBe('volume one contents');
    expect(await stagingFiles(library)).toEqual([]);
    // The source stays in the scratch workspace, which its owner releases.
    expect(await readFile(volume, 'utf8')).toBe('volume one contents');
  });

  it('replaces a book of the same name, like a reconversion does', async () => {
    const { source, library } = await workspace();
    const volume = path.join(source, 'Manga - Vol.01.cbz');
    await writeFile(path.join(library, 'Manga - Vol.01.cbz'), 'an older, longer version');
    await writeFile(volume, 'new');

    const saved = await new FsBookFileStore().saveBook({
      sourcePath: volume,
      libraryPath: library,
    });

    expect(await readFile(saved.path, 'utf8')).toBe('new');
    expect(saved.bytes).toBe(3);
    expect(await stagingFiles(library)).toEqual([]);
  });

  it.each(['notes.txt', '.cbz', 'Manga.cbz.exe'])(
    'refuses %s, which is not a .cbz volume',
    async (name) => {
      const { source, library } = await workspace();
      const file = path.join(source, name);
      await writeFile(file, 'x');

      await expect(
        new FsBookFileStore().saveBook({ sourcePath: file, libraryPath: library }),
      ).rejects.toThrow(/\.cbz/u);
      expect(await readdir(library)).toEqual([]);
    },
  );

  it('accepts an upper-case extension', async () => {
    const { source, library } = await workspace();
    const volume = path.join(source, 'Manga - Vol.01.CBZ');
    await writeFile(volume, 'x');

    const saved = await new FsBookFileStore().saveBook({
      sourcePath: volume,
      libraryPath: library,
    });

    expect(saved.name).toBe('Manga - Vol.01.CBZ');
  });

  it('leaves the library untouched when the source cannot be copied', async () => {
    const { source, library } = await workspace();

    await expect(
      new FsBookFileStore().saveBook({
        sourcePath: path.join(source, 'missing.cbz'),
        libraryPath: library,
      }),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    expect(await readdir(library)).toEqual(['.mangabound']);
    expect(await stagingFiles(library)).toEqual([]);
  });

  it('never publishes when cancelled, and removes the staging copy', async () => {
    const { source, library } = await workspace();
    const volume = path.join(source, 'Manga - Vol.01.cbz');
    await writeFile(volume, 'x');
    const controller = new AbortController();
    controller.abort();

    await expect(
      new FsBookFileStore().saveBook(
        { sourcePath: volume, libraryPath: library },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(await readdir(library)).toEqual(['.mangabound']);
    expect(await stagingFiles(library)).toEqual([]);
  });

  it('removes the staging copy when the final move fails', async () => {
    const { source, library } = await workspace();
    const volume = path.join(source, 'Manga - Vol.01.cbz');
    await writeFile(volume, 'x');
    // A directory already occupies the book's name, so the move cannot replace it.
    await mkdir(path.join(library, 'Manga - Vol.01.cbz'));

    await expect(
      new FsBookFileStore().saveBook({ sourcePath: volume, libraryPath: library }),
    ).rejects.toThrow();

    expect(await stagingFiles(library)).toEqual([]);
  });

  it('stages then moves in order, using only the injected filesystem', async () => {
    const calls: string[] = [];
    const store = new FsBookFileStore({
      mkdir: vi.fn((target: unknown) => {
        calls.push(`mkdir ${String(target)}`);
        return Promise.resolve(undefined);
      }),
      copyFile: vi.fn((from: unknown, to: unknown, mode: unknown) => {
        calls.push(
          `copy ${String(from)} -> ${String(to)} exclusive=${String(mode === constants.COPYFILE_EXCL)}`,
        );
        return Promise.resolve();
      }),
      stat: vi.fn((target: unknown) => {
        calls.push(`stat ${String(target)}`);
        return Promise.resolve({ size: 42 });
      }) as never,
      rename: vi.fn((from: unknown, to: unknown) => {
        calls.push(`rename ${String(from)} -> ${String(to)}`);
        return Promise.resolve();
      }),
      rm: vi.fn(() => Promise.resolve()),
      createTempSuffix: () => 'suffix',
    });

    const saved = await store.saveBook({
      sourcePath: path.join('scratch', 'Manga - Vol.02.cbz'),
      libraryPath: 'library',
    });

    const staging = path.join('library', '.mangabound', 'incoming');
    const temporary = path.join(staging, 'Manga - Vol.02.cbz.suffix.tmp');
    expect(calls).toEqual([
      `mkdir ${staging}`,
      `copy ${path.join('scratch', 'Manga - Vol.02.cbz')} -> ${temporary} exclusive=true`,
      `stat ${temporary}`,
      `rename ${temporary} -> ${path.join('library', 'Manga - Vol.02.cbz')}`,
    ]);
    expect(saved).toEqual({
      path: path.join('library', 'Manga - Vol.02.cbz'),
      name: 'Manga - Vol.02.cbz',
      bytes: 42,
    });
  });
});
