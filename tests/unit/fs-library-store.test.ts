import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { FsLibraryStore, type FsLibraryStoreDeps } from '@/adapters/library/fs-library-store';
import {
  emptyLibraryManifest,
  type LibraryBookEntry,
  libraryManifestSchemaVersion,
} from '@/library/manifest';

function entry(overrides: Partial<LibraryBookEntry> = {}): LibraryBookEntry {
  return {
    relativePath: 'Manga/Vol.01.epub',
    title: 'Manga',
    author: 'Unknown',
    format: 'epub',
    bytes: 100,
    convertedAt: '2026-09-16T10:00:00.000Z',
    ...overrides,
  };
}

function enoentError(): NodeJS.ErrnoException {
  const error = new Error('not found') as NodeJS.ErrnoException;
  error.code = 'ENOENT';
  return error;
}

describe('FsLibraryStore (mocked filesystem)', () => {
  it('returns an empty manifest when the manifest file does not exist', async () => {
    const readFile = vi.fn(() => Promise.reject(enoentError()));
    const store = new FsLibraryStore({
      readFile,
    });

    await expect(store.read('/library')).resolves.toEqual(emptyLibraryManifest);
  });

  it('propagates a non-ENOENT read failure', async () => {
    const failure = new Error('permission denied');
    const readFile = vi.fn(() => Promise.reject(failure));
    const store = new FsLibraryStore({
      readFile,
    });

    await expect(store.read('/library')).rejects.toBe(failure);
  });

  it('throws a LibraryIndexError when the manifest file contains malformed JSON', async () => {
    const readFile = vi.fn(() => Promise.resolve('not json'));
    const store = new FsLibraryStore({
      readFile,
    });

    await expect(store.read('/library')).rejects.toMatchObject({ code: 'malformed_json' });
  });

  it('creates the manifest directory, writes to a temp file, then renames it into place', async () => {
    const calls: string[] = [];
    const readFile = vi.fn(() => Promise.reject(enoentError()));
    const mkdir = vi.fn(() => {
      calls.push('mkdir');
      return Promise.resolve(undefined);
    });
    const writtenPaths: string[] = [];
    const writeFile = vi.fn((filePath: string) => {
      calls.push('writeFile');
      writtenPaths.push(filePath);
      return Promise.resolve();
    });
    const renamedFrom: string[] = [];
    const renamedTo: string[] = [];
    const rename = vi.fn((from: string, to: string) => {
      calls.push('rename');
      renamedFrom.push(from);
      renamedTo.push(to);
      return Promise.resolve();
    });
    const store = new FsLibraryStore({
      readFile,
      mkdir,
      writeFile,
      rename,
      createTempSuffix: () => 'fixed-suffix',
    });

    const manifest = await store.publish('library-root', entry());

    expect(manifest.books).toEqual([entry()]);
    expect(calls).toEqual(['mkdir', 'writeFile', 'rename']);
    expect(mkdir).toHaveBeenCalledWith(path.join('library-root', '.mangabound'), {
      recursive: true,
    });
    const finalPath = path.join('library-root', '.mangabound', 'library.json');
    expect(writtenPaths[0]).toBe(`${finalPath}.fixed-suffix.tmp`);
    expect(writtenPaths[0]).not.toBe(finalPath);
    expect(renamedFrom[0]).toBe(writtenPaths[0]);
    expect(renamedTo[0]).toBe(finalPath);
  });

  it('replaces an existing entry at the same relative path when republishing', async () => {
    const existing = {
      schemaVersion: libraryManifestSchemaVersion,
      books: [entry({ bytes: 100 })],
    };
    const readFile = vi.fn(() => Promise.resolve(JSON.stringify(existing)));
    const mkdir = vi.fn(() => Promise.resolve(undefined));
    const writeFile = vi.fn(() => Promise.resolve());
    const rename = vi.fn(() => Promise.resolve());
    const store = new FsLibraryStore({
      readFile,
      mkdir,
      writeFile,
      rename,
    });

    const republished = entry({ bytes: 200, convertedAt: '2026-09-16T12:00:00.000Z' });
    const manifest = await store.publish('library-root', republished);

    expect(manifest.books).toEqual([republished]);
  });

  it('finds nothing when the folder does not exist yet', async () => {
    const readdir = vi.fn(() => Promise.reject(enoentError()));
    const store = new FsLibraryStore({
      readdir,
    });

    await expect(store.scanUntracked('/library', emptyLibraryManifest)).resolves.toEqual([]);
  });

  it('propagates a non-ENOENT listing failure', async () => {
    const failure = new Error('permission denied');
    const readdir = vi.fn(() => Promise.reject(failure));
    const store = new FsLibraryStore({
      readdir,
    });

    await expect(store.scanUntracked('/library', emptyLibraryManifest)).rejects.toBe(failure);
  });

  it('skips subfolders, already-tracked files, and files of an unsupported kind', async () => {
    const direntLike = (
      name: string,
      isFile: boolean,
    ): { name: string; isFile: () => boolean } => ({
      name,
      isFile: () => isFile,
    });
    const readdir = vi.fn(() =>
      Promise.resolve([
        direntLike('Subfolder', false),
        // A folder that happens to be named like a book is not one.
        direntLike('Folder.epub', false),
        direntLike('Vol.01.epub', true),
        direntLike('notes.txt', true),
        direntLike('Loose.cbz', true),
      ]),
    );
    const stat = vi.fn(() =>
      Promise.resolve({ size: 42, mtime: new Date('2026-09-20T12:00:00.000Z') }),
    );
    const store = new FsLibraryStore({
      readdir,
      stat,
    });
    const manifest = {
      schemaVersion: libraryManifestSchemaVersion,
      books: [entry({ relativePath: 'Vol.01.epub' })],
    };

    const found = await store.scanUntracked('/library', manifest);

    expect(found).toEqual([
      {
        relativePath: 'Loose.cbz',
        title: 'Loose',
        author: 'Unknown',
        format: 'cbz',
        bytes: 42,
        convertedAt: '2026-09-20T12:00:00.000Z',
      },
    ]);
  });
});

describe('FsLibraryStore (real filesystem)', () => {
  it('removes a partial catalog write while retaining the previous catalog and original error', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mangabound-library-partial-'));
    try {
      await new FsLibraryStore().publish(root, entry());
      const catalogPath = path.join(root, '.mangabound', 'library.json');
      const previous = await readFile(catalogPath, 'utf8');
      const failure = Object.assign(new Error('full'), { code: 'ENOSPC' });
      const cleanup = vi.fn<FsLibraryStoreDeps['rm']>().mockImplementation(rm);
      const store = new FsLibraryStore({
        createTempSuffix: () => 'partial',
        rm: cleanup,
        writeFile: async (file, _contents, options) => {
          await writeFile(file, 'partial', options);
          throw failure;
        },
      });

      await expect(store.publish(root, entry({ bytes: 200 }))).rejects.toBe(failure);

      expect(await readFile(catalogPath, 'utf8')).toBe(previous);
      expect(await readdir(path.dirname(catalogPath))).toEqual(['library.json']);
      expect(cleanup).toHaveBeenCalledExactlyOnceWith(`${catalogPath}.partial.tmp`, {
        force: true,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('publishes through a transient rename lock without losing the existing catalog', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mangabound-library-lock-'));
    try {
      await new FsLibraryStore().publish(root, entry());
      const retryingRename = vi
        .fn<FsLibraryStoreDeps['rename']>()
        .mockRejectedValueOnce(Object.assign(new Error('locked'), { code: 'EBUSY' }))
        .mockImplementation(rename);
      const store = new FsLibraryStore({ rename: retryingRename });
      const next = entry({ bytes: 200 });

      await store.publish(root, next);

      expect((await store.read(root)).books).toEqual([next]);
      expect(retryingRename).toHaveBeenCalledTimes(2);
      expect(await readdir(path.join(root, '.mangabound'))).toEqual(['library.json']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('removes its temporary file and preserves the catalog when publication fails', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mangabound-library-failed-'));
    try {
      await new FsLibraryStore().publish(root, entry());
      const catalogPath = path.join(root, '.mangabound', 'library.json');
      const previous = await readFile(catalogPath, 'utf8');
      const failure = Object.assign(new Error('full'), { code: 'ENOSPC' });
      const store = new FsLibraryStore({ rename: () => Promise.reject(failure) });

      await expect(store.publish(root, entry({ bytes: 200 }))).rejects.toBe(failure);

      expect(await readFile(catalogPath, 'utf8')).toBe(previous);
      expect(await readdir(path.dirname(catalogPath))).toEqual(['library.json']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('round-trips a published entry through a real directory on disk', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mangabound-library-'));
    try {
      const store = new FsLibraryStore();
      await store.publish(root, entry());

      const reread = await new FsLibraryStore().read(root);

      expect(reread.books).toEqual([entry()]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('finds a loose comic file that was never published, on a real directory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mangabound-library-untracked-'));
    try {
      const store = new FsLibraryStore();
      await store.publish(root, entry());
      await writeFile(path.join(root, 'Copied in.epub'), 'fake epub contents');
      await mkdir(path.join(root, 'Not a file'));

      const manifest = await store.read(root);
      const found = await store.scanUntracked(root, manifest);

      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        relativePath: 'Copied in.epub',
        title: 'Copied in',
        author: 'Unknown',
        format: 'epub',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
