import { mkdtemp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { FsLibraryStore } from '@/adapters/library/fs-library-store';
import { FsPendingRuns, type FsPendingRunsDeps } from '@/adapters/library/fs-pending-runs';
import type { LibraryBookEntry } from '@/library/manifest';

const roots: string[] = [];

async function fixture(): Promise<{ root: string; store: FsPendingRuns; library: FsLibraryStore }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mangabound-pending-unit-'));
  roots.push(root);
  const library = new FsLibraryStore();
  return { root, store: new FsPendingRuns(path.join(root, 'pending'), library), library };
}

async function bookFixture() {
  const { root, store, library } = await fixture();
  const run = await store.create();
  const entry: LibraryBookEntry = {
    relativePath: 'Book.epub',
    title: 'Book',
    author: 'Author',
    format: 'epub',
    bytes: 5,
    convertedAt: '2026-09-28T00:00:00.000Z',
  };
  await writeFile(path.join(run.path, entry.relativePath), 'hello');
  await library.publish(run.path, entry);
  return { root, store, library, run, entry };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('FsPendingRuns', () => {
  it('removes a partial state write and retains the previous saved destination', async () => {
    const { root, store, library } = await bookFixture();
    const run = (await store.list())[0];
    const book = run?.books[0];
    if (run === undefined || book === undefined) throw new Error('Fixture missing');
    const previous = path.join(root, 'First.epub');
    await store.markSaved(run, book, previous);
    const failure = Object.assign(new Error('full'), { code: 'ENOSPC' });
    const cleanup = vi.fn<FsPendingRunsDeps['rm']>().mockImplementation(rm);
    const writer = new FsPendingRuns(store.root, library, {
      createTempSuffix: () => 'partial',
      rm: cleanup,
      writeFile: async (file, _contents, options) => {
        await writeFile(file, 'partial', options);
        throw failure;
      },
    });

    await expect(writer.markSaved(run, book, path.join(root, 'Second.epub'))).rejects.toBe(failure);

    expect((await store.list())[0]?.books[0]?.savedPath).toBe(previous);
    expect((await readdir(path.join(run.path, '.mangabound'))).sort()).toEqual([
      'library.json',
      'pending.json',
    ]);
    expect(cleanup).toHaveBeenCalledExactlyOnceWith(
      path.join(run.path, '.mangabound', 'pending.json.partial.tmp'),
      { force: true },
    );
  });

  it('retries a transient saved-state rename lock and recovers the saved destination', async () => {
    const { root, store, library } = await bookFixture();
    const run = (await store.list())[0];
    const book = run?.books[0];
    if (run === undefined || book === undefined) throw new Error('Fixture missing');
    const retryingRename = vi
      .fn<FsPendingRunsDeps['rename']>()
      .mockRejectedValueOnce(Object.assign(new Error('locked'), { code: 'EBUSY' }))
      .mockImplementation(rename);
    const writer = new FsPendingRuns(store.root, library, { rename: retryingRename });
    const destination = path.join(root, 'Book.epub');

    await writer.markSaved(run, book, destination);

    expect(retryingRename).toHaveBeenCalledTimes(2);
    expect((await new FsPendingRuns(store.root, library).list())[0]?.books[0]?.savedPath).toBe(
      destination,
    );
    expect((await readdir(path.join(run.path, '.mangabound'))).sort()).toEqual([
      'library.json',
      'pending.json',
    ]);
  });

  it('keeps the previous saved-state record and removes its temporary file on a failed rename', async () => {
    const { root, store, library } = await bookFixture();
    const run = (await store.list())[0];
    const book = run?.books[0];
    if (run === undefined || book === undefined) throw new Error('Fixture missing');
    const firstDestination = path.join(root, 'First.epub');
    await store.markSaved(run, book, firstDestination);
    const failure = Object.assign(new Error('full'), { code: 'ENOSPC' });
    const writer = new FsPendingRuns(store.root, library, {
      rename: () => Promise.reject(failure),
    });

    await expect(writer.markSaved(run, book, path.join(root, 'Second.epub'))).rejects.toBe(failure);

    expect((await store.list())[0]?.books[0]?.savedPath).toBe(firstDestination);
    expect((await readdir(path.join(run.path, '.mangabound'))).sort()).toEqual([
      'library.json',
      'pending.json',
    ]);
  });

  it('prepares durable storage, isolates runs, and omits empty ones from recovery', async () => {
    const { store } = await fixture();
    expect(await store.prepare()).toBe(store.root);
    const first = await store.create();
    const second = await store.create();
    expect(first.path).not.toBe(second.path);
    await writeFile(path.join(store.root, 'notes.txt'), 'ignored');
    await mkdir(path.join(store.root, 'not-a-run'));
    expect(await store.list()).toEqual([]);
    await store.pruneCompleted();
    expect((await readdir(store.root)).sort()).toEqual(['not-a-run', 'notes.txt']);
  });

  it('recovers catalogued books, saves without deleting the source, then prunes completed runs', async () => {
    const { root, store, run, entry } = await bookFixture();
    const recovered = await store.list();
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.books[0]).toMatchObject({ entry, path: path.join(run.path, 'Book.epub') });
    expect(
      (await new FsPendingRuns(store.root, new FsLibraryStore()).list())[0]?.books[0]?.savedPath,
    ).toBeUndefined();
    const destination = path.join(root, 'Book.epub');
    const book = recovered[0]?.books[0];
    if (book === undefined || recovered[0] === undefined) throw new Error('Fixture missing');
    await store.export(book, destination, false);
    expect(await readFile(destination, 'utf8')).toBe('hello');
    expect(await readFile(book.path, 'utf8')).toBe('hello');
    await store.markSaved(recovered[0], book, destination);
    const restarted = new FsPendingRuns(store.root, new FsLibraryStore());
    expect((await restarted.list())[0]?.books[0]?.savedPath).toBe(destination);
    await store.pruneCompleted();
    expect(await store.list()).toEqual([]);
    expect(await readFile(destination, 'utf8')).toBe('hello');
  });

  it('discards only the selected pending run and leaves exported books alone', async () => {
    const { root, store, run } = await bookFixture();
    const other = await store.create();
    await writeFile(path.join(other.path, 'Other.cbz'), 'other');
    const pendingBook = (await store.list()).find((item) => item.id === run.id)?.books[0];
    if (pendingBook === undefined) throw new Error('Fixture missing');
    const exported = path.join(root, 'Exported.epub');
    await store.export(pendingBook, exported, false);

    expect(await store.discard('not-a-run')).toBe(false);
    expect(await store.discard(run.id)).toBe(true);
    expect(await store.discard(run.id)).toBe(false);
    await expect(readFile(path.join(run.path, 'Book.epub'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(await readFile(exported, 'utf8')).toBe('hello');
    expect((await store.list()).map((item) => item.id)).toEqual([other.id]);
  });

  it('lists multiple populated runs newest first', async () => {
    const { store } = await bookFixture();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = await store.create();
    await writeFile(path.join(second.path, 'Later.epub'), 'later');
    const listed = await store.list();
    expect(listed).toHaveLength(2);
    expect(listed[0]?.books[0]?.entry.relativePath).toBe('Later.epub');
  });

  it('never overwrites in batch mode, but allows an explicitly chosen Save As replacement', async () => {
    const { root, store } = await bookFixture();
    const book = (await store.list())[0]?.books[0];
    if (book === undefined) throw new Error('Fixture missing');
    const destination = path.join(root, 'Book.epub');
    await writeFile(destination, 'original');
    await expect(store.export(book, destination, false)).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await readFile(destination, 'utf8')).toBe('original');
    await store.export(book, destination, true);
    expect(await readFile(destination, 'utf8')).toBe('hello');
    expect((await readdir(root)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('keeps a pending source recoverable when the destination catalog fails, then lets it be retried', async () => {
    const { root, store, library } = await bookFixture();
    const run = (await store.list())[0];
    const book = run?.books[0];
    if (run === undefined || book === undefined) throw new Error('Fixture missing');
    const folder = path.join(root, 'exports');
    await mkdir(folder);
    await writeFile(path.join(folder, '.mangabound'), 'blocks the catalog directory');
    const destination = path.join(folder, 'Book.epub');

    const first = await store.exportAndRecord(run, book, destination, false);
    expect(first.status).toBe('catalog_failed');
    expect(await readFile(destination, 'utf8')).toBe('hello');
    expect((await store.list())[0]?.books[0]?.savedPath).toBeUndefined();
    await store.pruneCompleted();
    expect(await store.list()).toHaveLength(1);

    await rm(path.join(folder, '.mangabound'));
    await rm(destination);
    expect(await store.exportAndRecord(run, book, destination, false)).toEqual({ status: 'saved' });
    expect((await library.read(folder)).books[0]?.relativePath).toBe('Book.epub');
    expect((await store.list())[0]?.books[0]?.savedPath).toBe(destination);
  });

  it('keeps the pending source when the exported-state record cannot be written', async () => {
    const { root, store, library } = await bookFixture();
    const run = (await store.list())[0];
    const book = run?.books[0];
    if (run === undefined || book === undefined) throw new Error('Fixture missing');
    const failure = new Error('state unavailable');
    class UnrecordablePendingRuns extends FsPendingRuns {
      override markSaved(): Promise<void> {
        return Promise.reject(failure);
      }
    }
    const broken = new UnrecordablePendingRuns(store.root, library);
    const destination = path.join(root, 'Book.epub');
    expect(await broken.exportAndRecord(run, book, destination, false)).toEqual({
      status: 'record_failed',
      cause: failure,
    });
    expect((await library.read(root)).books[0]?.relativePath).toBe('Book.epub');
    expect((await store.list())[0]?.books[0]?.savedPath).toBeUndefined();
  });

  it('uses an exclusive copy on filesystems without hard links', async () => {
    const { root, store } = await bookFixture();
    const book = (await store.list())[0]?.books[0];
    if (book === undefined) throw new Error('Fixture missing');
    const noLinks = new FsPendingRuns(store.root, new FsLibraryStore(), {
      link: vi.fn(() =>
        Promise.reject(Object.assign(new Error('unsupported'), { code: 'ENOTSUP' })),
      ),
    });
    const destination = path.join(root, 'On USB.epub');
    await noLinks.export(book, destination, false);
    expect(await readFile(destination, 'utf8')).toBe('hello');
  });

  it('propagates an unexpected hard-link failure without writing the destination', async () => {
    const { root, store } = await bookFixture();
    const book = (await store.list())[0]?.books[0];
    if (book === undefined) throw new Error('Fixture missing');
    const failure = new Error('unexpected');
    const broken = new FsPendingRuns(store.root, new FsLibraryStore(), {
      link: vi.fn(() => Promise.reject(failure)),
    });
    const destination = path.join(root, 'Never.epub');
    await expect(broken.export(book, destination, false)).rejects.toBe(failure);
    await expect(readFile(destination)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('recovers an unindexed output and ignores catalogued files that disappeared', async () => {
    const { store, run } = await bookFixture();
    await rm(path.join(run.path, 'Book.epub'));
    await writeFile(path.join(run.path, 'Untracked.cbz'), 'zip');
    const recovered = await store.list();
    expect(recovered[0]?.books.map((book) => book.entry.relativePath)).toEqual(['Untracked.cbz']);
  });

  it('skips a catalogued path that is now a directory', async () => {
    const { store, run } = await bookFixture();
    await rm(path.join(run.path, 'Book.epub'));
    await mkdir(path.join(run.path, 'Book.epub'));
    expect(await store.list()).toEqual([]);
  });

  it('does not hide filesystem errors other than a missing book or state file', async () => {
    const { store, run } = await bookFixture();
    const denied = new Error('denied');
    const statFailure = new FsPendingRuns(store.root, new FsLibraryStore(), {
      stat: vi.fn((target: string) =>
        target === path.join(run.path, 'Book.epub') ? Promise.reject(denied) : stat(target),
      ),
    });
    await expect(statFailure.list()).rejects.toBe(denied);
    const readFailure = new FsPendingRuns(store.root, new FsLibraryStore(), {
      readFile: vi.fn(() => Promise.reject(denied)),
    });
    await expect(readFailure.list()).rejects.toBe(denied);
  });

  it('rejects a malformed saved-state record instead of treating an exported book as unsaved', async () => {
    const { store, run } = await bookFixture();
    const statePath = path.join(run.path, '.mangabound', 'pending.json');
    await writeFile(statePath, '{bad json');
    await expect(store.list()).rejects.toBeInstanceOf(SyntaxError);
    await writeFile(statePath, JSON.stringify({ version: 1, saved: [] }));
    await expect(store.list()).rejects.toThrow('invalid');
    await writeFile(statePath, JSON.stringify({ version: 2, saved: {} }));
    await expect(store.list()).rejects.toThrow('invalid');
    await writeFile(statePath, JSON.stringify({ version: 1, saved: { 'Book.epub': 123 } }));
    await expect(store.list()).rejects.toThrow('invalid');
  });

  it('keeps a partly exported run so the remaining book can be saved later', async () => {
    const { store, run } = await bookFixture();
    await writeFile(path.join(run.path, 'Second.cbz'), 'zip');
    const listed = (await store.list())[0];
    if (listed === undefined) throw new Error('Fixture missing');
    const first = listed.books.find((book) => book.entry.relativePath === 'Book.epub');
    if (first === undefined) throw new Error('Fixture missing');
    await store.markSaved(listed, first, path.join(run.path, 'export.epub'));
    await store.pruneCompleted();
    expect((await store.list())[0]?.books).toHaveLength(2);
  });
});
