import { constants } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
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

  it('never replaces a book of the same name: the new one gets a free name', async () => {
    const { source, library } = await workspace();
    const volume = path.join(source, 'Manga - Vol.01.cbz');
    await writeFile(path.join(library, 'Manga - Vol.01.cbz'), 'the book already there');
    await writeFile(volume, 'new');

    const saved = await new FsBookFileStore().saveBook({
      sourcePath: volume,
      libraryPath: library,
    });

    expect(saved).toEqual({
      path: path.join(library, 'Manga - Vol.01 (2).cbz'),
      name: 'Manga - Vol.01 (2).cbz',
      bytes: 3,
    });
    expect(await readFile(path.join(library, 'Manga - Vol.01.cbz'), 'utf8')).toBe(
      'the book already there',
    );
    expect(await readFile(saved.path, 'utf8')).toBe('new');
    expect(await stagingFiles(library)).toEqual([]);
  });

  it('gives simultaneous books of the same name different names', async () => {
    const { source, library } = await workspace();
    const store = new FsBookFileStore();
    const volumes = await Promise.all(
      ['first', 'second', 'third'].map(async (content) => {
        const directory = path.join(source, content);
        await mkdir(directory);
        const file = path.join(directory, 'Manga - Vol.01.cbz');
        await writeFile(file, content);
        return file;
      }),
    );

    const saved = await Promise.all(
      volumes.map((sourcePath) => store.saveBook({ sourcePath, libraryPath: library })),
    );

    expect(saved.map((book) => book.name).sort()).toEqual([
      'Manga - Vol.01 (2).cbz',
      'Manga - Vol.01 (3).cbz',
      'Manga - Vol.01.cbz',
    ]);
    const contents = await Promise.all(saved.map((book) => readFile(book.path, 'utf8')));
    expect(contents.sort()).toEqual(['first', 'second', 'third']);
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
    const failure = Object.assign(new Error('no space left on device'), { code: 'ENOSPC' });

    await expect(
      new FsBookFileStore({ rename: () => Promise.reject(failure) }).saveBook({
        sourcePath: volume,
        libraryPath: library,
      }),
    ).rejects.toBe(failure);

    expect(await stagingFiles(library)).toEqual([]);
  });

  it('keeps placing books after one placement failed', async () => {
    const { source, library } = await workspace();
    const first = path.join(source, 'One - Vol.01.cbz');
    const second = path.join(source, 'Two - Vol.01.cbz');
    await writeFile(first, 'x');
    await writeFile(second, 'y');
    const failure = new Error('disk error');
    // Only the first book's move fails; a failure must not leave the queue of placements stuck.
    const store = new FsBookFileStore({
      rename: (from, to) =>
        path.basename(String(to)) === 'One - Vol.01.cbz'
          ? Promise.reject(failure)
          : rename(from, to),
    });

    await expect(store.saveBook({ sourcePath: first, libraryPath: library })).rejects.toBe(failure);
    const saved = await store.saveBook({ sourcePath: second, libraryPath: library });

    expect(saved.name).toBe('Two - Vol.01.cbz');
    expect(await readFile(saved.path, 'utf8')).toBe('y');
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
      readdir: vi.fn((target: unknown) => {
        calls.push(`readdir ${String(target)}`);
        return Promise.resolve([]);
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
      'readdir library',
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

describe('FsBookFileStore.stageBook', () => {
  /** What a conversion tool does: writes a book into the folder it was given. */
  const writeBook =
    (name: string, content: string) =>
    async (stagingPath: string): Promise<{ readonly path: string }> => {
      const file = path.join(stagingPath, name);
      await writeFile(file, content);
      return { path: file };
    };

  it('hands the tool an empty private folder, publishes its book, and removes the folder', async () => {
    const { library } = await workspace();
    let given = '';

    const { produced, saved } = await new FsBookFileStore().stageBook(
      { libraryPath: library },
      async (stagingPath) => {
        given = stagingPath;
        expect(await readdir(stagingPath)).toEqual([]);
        return writeBook('Standalone.epub', 'a converted book')(stagingPath);
      },
    );

    expect(path.dirname(given)).toBe(path.join(library, '.mangabound', 'incoming'));
    expect(produced.path).toBe(path.join(given, 'Standalone.epub'));
    expect(saved).toEqual({
      path: path.join(library, 'Standalone.epub'),
      name: 'Standalone.epub',
      bytes: Buffer.byteLength('a converted book'),
    });
    expect(await readFile(saved.path, 'utf8')).toBe('a converted book');
    expect(await stagingFiles(library)).toEqual([]);
  });

  it('never replaces a book that is already there, whatever the capitals', async () => {
    const { library } = await workspace();
    await writeFile(path.join(library, 'standalone.EPUB'), 'the first book');
    const store = new FsBookFileStore();

    const first = await store.stageBook(
      { libraryPath: library },
      writeBook('Standalone.epub', 'the second book'),
    );
    const second = await store.stageBook(
      { libraryPath: library },
      writeBook('Standalone.epub', 'the third book'),
    );

    expect(first.saved.name).toBe('Standalone (2).epub');
    expect(second.saved.name).toBe('Standalone (3).epub');
    expect(await readFile(path.join(library, 'standalone.EPUB'), 'utf8')).toBe('the first book');
    expect(await readFile(second.saved.path, 'utf8')).toBe('the third book');
  });

  it('takes a title written with a combined accent for the same name as one written with a letter', async () => {
    const { library } = await workspace();
    // "Café" with the é as "e" and a combining accent, as a Mac or a downloader may write it.
    await writeFile(path.join(library, 'Café.epub'), 'the first book');
    const store = new FsBookFileStore();

    const saved = await store.stageBook(
      { libraryPath: library },
      // "Café" with the é as one character.
      writeBook('Café.epub', 'the second book'),
    );

    expect(saved.saved.name).toBe('Café (2).epub');
    expect(await readFile(path.join(library, 'Café.epub'), 'utf8')).toBe('the first book');
  });

  it('gives books converted at the same time different names and their own folders', async () => {
    const { library } = await workspace();
    const store = new FsBookFileStore();
    const folders: string[] = [];

    const results = await Promise.all(
      ['one', 'two', 'three'].map((content) =>
        store.stageBook({ libraryPath: library }, async (stagingPath) => {
          folders.push(stagingPath);
          return writeBook('Volume 1.epub', content)(stagingPath);
        }),
      ),
    );

    expect(new Set(folders).size).toBe(3);
    expect(results.map((result) => result.saved.name).sort()).toEqual([
      'Volume 1 (2).epub',
      'Volume 1 (3).epub',
      'Volume 1.epub',
    ]);
    const contents = await Promise.all(
      results.map((result) => readFile(result.saved.path, 'utf8')),
    );
    expect(contents.sort()).toEqual(['one', 'three', 'two']);
    expect(await stagingFiles(library)).toEqual([]);
  });

  it('publishes nothing and removes the folder when the tool fails', async () => {
    const { library } = await workspace();
    const failure = new Error('mangapress exited with code 1');

    await expect(
      new FsBookFileStore().stageBook({ libraryPath: library }, async (stagingPath) => {
        await writeFile(path.join(stagingPath, 'half.epub'), 'half a book');
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(await readdir(library)).toEqual(['.mangabound']);
    expect(await stagingFiles(library)).toEqual([]);
  });

  it('never publishes when cancelled after the tool finished', async () => {
    const { library } = await workspace();
    const controller = new AbortController();

    await expect(
      new FsBookFileStore().stageBook(
        { libraryPath: library },
        async (stagingPath) => {
          const produced = await writeBook('Standalone.epub', 'x')(stagingPath);
          controller.abort();
          return produced;
        },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(await readdir(library)).toEqual(['.mangabound']);
    expect(await stagingFiles(library)).toEqual([]);
  });

  it('retries a move that another program is holding for a moment', async () => {
    const { library } = await workspace();
    let attempts = 0;
    const store = new FsBookFileStore({
      rename: (from, to) => {
        attempts += 1;
        if (attempts < 3) {
          return Promise.reject(Object.assign(new Error('busy'), { code: 'EBUSY' }));
        }
        return rename(from, to);
      },
    });

    const { saved } = await store.stageBook(
      { libraryPath: library },
      writeBook('Standalone.epub', 'a converted book'),
    );

    expect(attempts).toBe(3);
    expect(await readFile(saved.path, 'utf8')).toBe('a converted book');
  });
});
