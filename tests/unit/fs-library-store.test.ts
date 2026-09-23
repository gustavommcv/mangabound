import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
      readFile: readFile as unknown as FsLibraryStoreDeps['readFile'],
    });

    await expect(store.read('/library')).resolves.toEqual(emptyLibraryManifest);
  });

  it('propagates a non-ENOENT read failure', async () => {
    const failure = new Error('permission denied');
    const readFile = vi.fn(() => Promise.reject(failure));
    const store = new FsLibraryStore({
      readFile: readFile as unknown as FsLibraryStoreDeps['readFile'],
    });

    await expect(store.read('/library')).rejects.toBe(failure);
  });

  it('throws a LibraryIndexError when the manifest file contains malformed JSON', async () => {
    const readFile = vi.fn(() => Promise.resolve('not json'));
    const store = new FsLibraryStore({
      readFile: readFile as unknown as FsLibraryStoreDeps['readFile'],
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
      readFile: readFile as unknown as FsLibraryStoreDeps['readFile'],
      mkdir: mkdir as unknown as FsLibraryStoreDeps['mkdir'],
      writeFile: writeFile as unknown as FsLibraryStoreDeps['writeFile'],
      rename: rename as unknown as FsLibraryStoreDeps['rename'],
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
      readFile: readFile as unknown as FsLibraryStoreDeps['readFile'],
      mkdir: mkdir as unknown as FsLibraryStoreDeps['mkdir'],
      writeFile: writeFile as unknown as FsLibraryStoreDeps['writeFile'],
      rename: rename as unknown as FsLibraryStoreDeps['rename'],
    });

    const republished = entry({ bytes: 200, convertedAt: '2026-09-16T12:00:00.000Z' });
    const manifest = await store.publish('library-root', republished);

    expect(manifest.books).toEqual([republished]);
  });

  it('finds nothing when the folder does not exist yet', async () => {
    const readdir = vi.fn(() => Promise.reject(enoentError()));
    const store = new FsLibraryStore({
      readdir: readdir as unknown as FsLibraryStoreDeps['readdir'],
    });

    await expect(store.scanUntracked('/library', emptyLibraryManifest)).resolves.toEqual([]);
  });

  it('propagates a non-ENOENT listing failure', async () => {
    const failure = new Error('permission denied');
    const readdir = vi.fn(() => Promise.reject(failure));
    const store = new FsLibraryStore({
      readdir: readdir as unknown as FsLibraryStoreDeps['readdir'],
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
        direntLike('Vol.01.epub', true),
        direntLike('notes.txt', true),
        direntLike('Loose.cbz', true),
      ]),
    );
    const stat = vi.fn(() =>
      Promise.resolve({ size: 42, mtime: new Date('2026-09-20T12:00:00.000Z') }),
    );
    const store = new FsLibraryStore({
      readdir: readdir as unknown as FsLibraryStoreDeps['readdir'],
      stat: stat as unknown as FsLibraryStoreDeps['stat'],
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
