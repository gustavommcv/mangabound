import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { FsLibraryStore } from '@/adapters/library/fs-library-store';
import { PendingCatalogStore } from '@/adapters/library/pending-catalog-store';
import { NodeOpdsServer } from '@/adapters/opds/http-server';
import type { LibraryStorePort } from '@/application/ports/library-store';
import type { OpdsServerHandle } from '@/application/ports/opds-server';
import type { LibraryBookEntry } from '@/library/manifest';

const folders: string[] = [];
const handles: OpdsServerHandle[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(handles.splice(0).map((handle) => handle.stop()));
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});

const firstRun = '11111111-1111-4111-8111-111111111111';
const secondRun = '22222222-2222-4222-8222-222222222222';

function entry(
  title: string,
  convertedAt: string,
  relativePath = `${title}.epub`,
): LibraryBookEntry {
  return { relativePath, title, author: 'Someone', format: 'epub', bytes: 1, convertedAt };
}

/** A pending folder, the way the app lays it out, with the store that wraps the real one. */
async function pendingFolder(): Promise<{
  readonly root: string;
  readonly inner: FsLibraryStore;
  readonly catalog: PendingCatalogStore;
  readonly addBook: (run: string, book: LibraryBookEntry) => Promise<void>;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mangabound-pending-catalog-'));
  folders.push(root);
  const inner = new FsLibraryStore();
  const catalog = new PendingCatalogStore(inner);
  catalog.useRoot(root);
  const addBook = async (run: string, book: LibraryBookEntry): Promise<void> => {
    await mkdir(path.join(root, run), { recursive: true });
    await writeFile(path.join(root, run, book.relativePath), book.title);
    await inner.publish(path.join(root, run), book);
  };
  return { root, inner, catalog, addBook };
}

describe('the catalog of the pending folder', () => {
  it('is the books of every conversion in it, each named by its conversion and then its own path', async () => {
    const { root, catalog, addBook } = await pendingFolder();
    await addBook(firstRun, entry('Chainsaw Man - Vol.01', '2026-10-04T10:00:00.000Z'));
    await addBook(secondRun, entry('Initial D - Vol.01', '2026-10-04T11:00:00.000Z'));
    await addBook(secondRun, entry('Initial D - Vol.02', '2026-10-04T11:01:00.000Z'));

    const manifest = await catalog.read(root);

    expect(manifest.books.map((book) => book.relativePath).sort()).toEqual([
      `${firstRun}/Chainsaw Man - Vol.01.epub`,
      `${secondRun}/Initial D - Vol.01.epub`,
      `${secondRun}/Initial D - Vol.02.epub`,
    ]);
    // What the entry says of the book is as the conversion's own catalog has it.
    expect(manifest.books.find((book) => book.title === 'Initial D - Vol.02')).toMatchObject({
      author: 'Someone',
      format: 'epub',
      convertedAt: '2026-10-04T11:01:00.000Z',
    });
  });

  it('leaves out what is not a conversion: files, and folders that no run was named by', async () => {
    const { root, catalog, addBook } = await pendingFolder();
    await addBook(firstRun, entry('Chainsaw Man - Vol.01', '2026-10-04T10:00:00.000Z'));
    await writeFile(path.join(root, 'notes.txt'), 'x');
    // A file that happens to be named like a conversion's folder is not one.
    await writeFile(path.join(root, '33333333-3333-4333-8333-333333333333'), 'x');
    await mkdir(path.join(root, 'not-a-run'));
    await writeFile(path.join(root, 'not-a-run', 'Hidden.epub'), 'x');
    await mkdir(path.join(root, 'not-a-run', '.mangabound'), { recursive: true });
    await writeFile(
      path.join(root, 'not-a-run', '.mangabound', 'library.json'),
      JSON.stringify({ schemaVersion: 1, books: [entry('Hidden', '2026-10-04T12:00:00.000Z')] }),
    );

    const manifest = await catalog.read(root);

    expect(manifest.books.map((book) => book.title)).toEqual(['Chainsaw Man - Vol.01']);
  });

  it('opens only the folders of conversions to read their catalogs', async () => {
    const { root, inner, addBook } = await pendingFolder();
    await addBook(firstRun, entry('Chainsaw Man - Vol.01', '2026-10-04T10:00:00.000Z'));
    await mkdir(path.join(root, 'not-a-run'));
    await writeFile(path.join(root, '33333333-3333-4333-8333-333333333333'), 'x');
    const opened: string[] = [];
    const store = new PendingCatalogStore({
      read: (folder) => {
        opened.push(folder);
        return inner.read(folder);
      },
      publish: (folder, book) => inner.publish(folder, book),
      scanUntracked: (folder, manifest) => inner.scanUntracked(folder, manifest),
    });
    store.useRoot(root);

    await store.read(root);

    expect(opened).toEqual([path.join(root, firstRun)]);
  });

  it('is empty before any conversion, and when the folder is not there yet', async () => {
    const { root, catalog } = await pendingFolder();
    expect((await catalog.read(root)).books).toEqual([]);

    const missing = new PendingCatalogStore(new FsLibraryStore());
    missing.useRoot(path.join(root, 'not-made-yet'));
    expect((await missing.read(path.join(root, 'not-made-yet'))).books).toEqual([]);
  });

  it('fails when the folder cannot be read for another reason', async () => {
    const { root } = await pendingFolder();
    const file = path.join(root, 'a-file');
    await writeFile(file, 'x');
    const store = new PendingCatalogStore(new FsLibraryStore());
    store.useRoot(file);

    const failure = await store
      .read(file)
      .catch((error: unknown) => error as NodeJS.ErrnoException);

    // Not a "nothing there yet": the folder is a file.
    expect(failure).toBeInstanceOf(Error);
    expect(['ENOTDIR', 'ENOENT']).toContain((failure as NodeJS.ErrnoException).code);
  });

  it('serves the other conversions when the catalog of one is damaged, and says so in the log', async () => {
    const { root, catalog, addBook } = await pendingFolder();
    await addBook(firstRun, entry('Chainsaw Man - Vol.01', '2026-10-04T10:00:00.000Z'));
    await mkdir(path.join(root, secondRun, '.mangabound'), { recursive: true });
    await writeFile(path.join(root, secondRun, '.mangabound', 'library.json'), '{ not json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const manifest = await catalog.read(root);

    expect(manifest.books.map((book) => book.title)).toEqual(['Chainsaw Man - Vol.01']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(secondRun), expect.anything());
  });

  it('fails on anything about a conversion that is not a damaged catalog', async () => {
    const failing: LibraryStorePort = {
      read: () => Promise.reject(new Error('disk gone')),
      publish: () => Promise.reject(new Error('unused')),
      scanUntracked: () => Promise.resolve([]),
    };
    const { root, addBook } = await pendingFolder();
    await addBook(firstRun, entry('Chainsaw Man - Vol.01', '2026-10-04T10:00:00.000Z'));
    const store = new PendingCatalogStore(failing);
    store.useRoot(root);

    await expect(store.read(root)).rejects.toThrow('disk gone');
  });

  it('lists the files of a conversion that its catalog does not know, named the same way', async () => {
    const { root, catalog, addBook } = await pendingFolder();
    await addBook(firstRun, entry('Chainsaw Man - Vol.01', '2026-10-04T10:00:00.000Z'));
    await addBook(secondRun, entry('Initial D - Vol.01', '2026-10-04T11:00:00.000Z'));
    await writeFile(path.join(root, secondRun, 'Copied in.cbz'), 'x');
    const manifest = await catalog.read(root);

    const untracked = await catalog.scanUntracked(root, manifest);

    expect(untracked.map((book) => book.relativePath)).toEqual([`${secondRun}/Copied in.cbz`]);
    expect(untracked[0]?.title).toBe('Copied in');
  });

  it('is the store it wraps for any other folder, and before it knows where the conversions are', async () => {
    const read = vi.fn<LibraryStorePort['read']>(() =>
      Promise.resolve({ schemaVersion: 1 as const, books: [] }),
    );
    const publish = vi.fn<LibraryStorePort['publish']>(() =>
      Promise.resolve({ schemaVersion: 1 as const, books: [] }),
    );
    const scanUntracked = vi.fn<LibraryStorePort['scanUntracked']>(() => Promise.resolve([]));
    const store = new PendingCatalogStore({ read, publish, scanUntracked });
    const manifest = { schemaVersion: 1 as const, books: [] };
    const book = entry('Book', '2026-10-04T10:00:00.000Z');

    // Nothing is the pending folder yet.
    await store.read('/library');
    expect(read).toHaveBeenLastCalledWith('/library');

    store.useRoot('/pending');
    await store.read('/library');
    await store.scanUntracked('/library', manifest);
    await store.publish('/library', book);
    // A conversion's own folder is a library like any other.
    await store.read(`/pending/${firstRun}`);

    expect(read).toHaveBeenLastCalledWith(`/pending/${firstRun}`);
    expect(scanUntracked).toHaveBeenCalledExactlyOnceWith('/library', manifest);
    expect(publish).toHaveBeenCalledExactlyOnceWith('/library', book);
  });

  it('refuses to publish a book to all the conversions at once', async () => {
    const { root, catalog } = await pendingFolder();

    await expect(catalog.publish(root, entry('Book', '2026-10-04T10:00:00.000Z'))).rejects.toThrow(
      'not to all of them',
    );
  });
});

describe('sharing the pending folder with the OPDS server', () => {
  const open = { username: '', password: '' };

  async function share(root: string, catalog: PendingCatalogStore): Promise<OpdsServerHandle> {
    const handle = await new NodeOpdsServer(catalog).start({
      libraryPath: root,
      libraryTitle: 'Mangabound ready books',
      interfaceAddress: '127.0.0.1',
      port: 0,
      auth: open,
    });
    handles.push(handle);
    return handle;
  }

  const titlesOf = (feed: string): string[] =>
    [...feed.matchAll(/<entry>[\s\S]*?<title>([^<]*)<\/title>/gu)].map((match) => match[1] ?? '');

  it('shows a book converted after sharing started, which is the one a reader was missing', async () => {
    const { root, catalog, addBook } = await pendingFolder();
    await addBook(firstRun, entry('Chainsaw Man - Vol.01', '2026-10-04T10:00:00.000Z'));
    const handle = await share(root, catalog);
    const recent = async (): Promise<string[]> =>
      titlesOf(await (await fetch(`${handle.url}/recent`)).text());
    expect(await recent()).toEqual(['Chainsaw Man - Vol.01']);

    await addBook(secondRun, entry('Initial D - Vol.01', '2026-10-04T11:00:00.000Z'));

    // Newest first, both of them.
    expect(await recent()).toEqual(['Initial D - Vol.01', 'Chainsaw Man - Vol.01']);
  });

  it('serves the file of a book of either conversion, and not a book that is not in one', async () => {
    const { root, catalog, addBook } = await pendingFolder();
    await addBook(firstRun, entry('Chainsaw Man - Vol.01', '2026-10-04T10:00:00.000Z'));
    await addBook(secondRun, entry('Initial D - Vol.01', '2026-10-04T11:00:00.000Z'));
    await writeFile(path.join(root, 'outside-a-run.epub'), 'not a book of a conversion');
    const handle = await share(root, catalog);
    const feed = await (await fetch(`${handle.url}/recent`)).text();
    const href = (title: string): string => {
      const found = new RegExp(
        `<title>${title}</title>[\\s\\S]*?href="([^"]*/books/[^"]*)"`,
        'u',
      ).exec(feed);
      return found?.[1] ?? '';
    };

    const first = await fetch(href('Chainsaw Man - Vol.01'));
    const second = await fetch(href('Initial D - Vol.01'));
    const loose = await fetch(`${handle.url}/books/outside-a-run.epub`);

    expect([first.status, await first.text()]).toEqual([200, 'Chainsaw Man - Vol.01']);
    expect([second.status, await second.text()]).toEqual([200, 'Initial D - Vol.01']);
    expect(loose.status).toBe(404);
  });

  it('shows the books a conversion holds that its catalog lost, among the other files', async () => {
    const { root, catalog, addBook } = await pendingFolder();
    await addBook(firstRun, entry('Chainsaw Man - Vol.01', '2026-10-04T10:00:00.000Z'));
    await writeFile(path.join(root, firstRun, 'Left out.epub'), 'x');
    const handle = await share(root, catalog);

    const other = titlesOf(await (await fetch(`${handle.url}/other`)).text());
    const download = await fetch(`${handle.url}/books/${firstRun}/Left%20out.epub`);

    expect(other).toEqual(['Left out']);
    expect(download.status).toBe(200);
  });
});
