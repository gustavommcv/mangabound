import { once } from 'node:events';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { FsLibraryStore } from '@/adapters/library/fs-library-store';
import {
  clientLeft,
  formatHost,
  NodeOpdsServer,
  type NodeOpdsServerOptions,
} from '@/adapters/opds/http-server';
import type { LibraryStorePort } from '@/application/ports/library-store';
import type { OpdsAuthConfig, OpdsServerHandle } from '@/application/ports/opds-server';
import type { LibraryBookEntry, LibraryManifest } from '@/library/manifest';
import { libraryManifestSchemaVersion } from '@/library/manifest';

const open: OpdsAuthConfig = { username: '', password: '' };

function memoryStore(books: readonly LibraryBookEntry[]): LibraryStorePort {
  const manifest: LibraryManifest = { schemaVersion: libraryManifestSchemaVersion, books };
  return {
    read: () => Promise.resolve(manifest),
    publish: () => Promise.reject(new Error('not used in these tests')),
    scanUntracked: () => Promise.resolve([]),
  };
}

function basicHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

const activeHandles: OpdsServerHandle[] = [];

async function startServer(
  store: LibraryStorePort,
  auth: OpdsAuthConfig,
  options?: NodeOpdsServerOptions,
): Promise<OpdsServerHandle> {
  const handle = await new NodeOpdsServer(store, options).start({
    libraryPath: '/library',
    libraryTitle: 'My Library',
    interfaceAddress: '127.0.0.1',
    port: 0,
    auth,
  });
  activeHandles.push(handle);
  return handle;
}

afterEach(async () => {
  await Promise.all(activeHandles.splice(0).map((handle) => handle.stop()));
});

describe('clientLeft', () => {
  it.each(['ERR_STREAM_PREMATURE_CLOSE', 'ECONNRESET', 'EPIPE'])(
    'takes %s for a reader that went away',
    (code) => {
      expect(clientLeft(Object.assign(new Error('gone'), { code }))).toBe(true);
    },
  );

  it('takes a failure of the file, an error with no code, and something that is not an error, for something else', () => {
    expect(clientLeft(Object.assign(new Error('disk'), { code: 'EIO' }))).toBe(false);
    expect(clientLeft(new Error('no code'))).toBe(false);
    expect(clientLeft('ECONNRESET')).toBe(false);
  });
});

describe('formatHost', () => {
  it('leaves an IPv4 address unbracketed', () => {
    expect(formatHost('192.168.1.20')).toBe('192.168.1.20');
  });

  it('brackets an address containing a colon, as IPv6 addresses do', () => {
    expect(formatHost('::1')).toBe('[::1]');
  });
});

describe('NodeOpdsServer', () => {
  it('serves a navigation feed linking to the acquisition feed', async () => {
    const handle = await startServer(memoryStore([]), open);

    const response = await fetch(`${handle.url}/`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('kind=navigation');
    const body = await response.text();
    expect(body).toContain('kind=acquisition');
  });

  it('serves the acquisition feed newest-first', async () => {
    const older: LibraryBookEntry = {
      relativePath: 'a.epub',
      title: 'A',
      author: 'Unknown',
      format: 'epub',
      bytes: 10,
      convertedAt: '2026-09-16T08:00:00.000Z',
    };
    const newer: LibraryBookEntry = {
      relativePath: 'b.epub',
      title: 'B',
      author: 'Unknown',
      format: 'epub',
      bytes: 20,
      convertedAt: '2026-09-16T10:00:00.000Z',
    };
    const handle = await startServer(memoryStore([older, newer]), open);

    const response = await fetch(`${handle.url}/recent`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('kind=acquisition');
    expect(body.indexOf('<title>B</title>')).toBeLessThan(body.indexOf('<title>A</title>'));
  });

  it('accepts any request when both the username and the password are left blank', async () => {
    const handle = await startServer(memoryStore([]), open);

    const response = await fetch(`${handle.url}/recent`);

    expect(response.status).toBe(200);
  });

  it('is not open when only one of the username or the password was left blank', async () => {
    const handle = await startServer(memoryStore([]), { username: 'reader', password: '' });

    const response = await fetch(`${handle.url}/recent`);

    expect(response.status).toBe(401);
  });

  it('rejects a request with no credentials and advertises the Basic scheme', async () => {
    const handle = await startServer(memoryStore([]), { username: 'reader', password: 'hunter2' });

    const response = await fetch(`${handle.url}/recent`);

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('Basic');
  });

  it('rejects a request with a non-Basic scheme', async () => {
    const handle = await startServer(memoryStore([]), { username: 'reader', password: 'hunter2' });

    const response = await fetch(`${handle.url}/recent`, {
      headers: { Authorization: 'Bearer abc' },
    });

    expect(response.status).toBe(401);
  });

  it('does not take a Bearer header carrying valid credentials for a Basic one', async () => {
    const handle = await startServer(memoryStore([]), { username: 'reader', password: 'hunter2' });
    const credentials = Buffer.from('reader:hunter2').toString('base64');

    const response = await fetch(`${handle.url}/recent`, {
      headers: { Authorization: `Bearer ${credentials}` },
    });

    expect(response.status).toBe(401);
  });

  it('asks for credentials on the navigation feed too, which names the library', async () => {
    const handle = await startServer(memoryStore([]), { username: 'reader', password: 'hunter2' });

    const without = await fetch(`${handle.url}/`);
    const wrong = await fetch(`${handle.url}/`, {
      headers: { Authorization: basicHeader('reader', 'wrong') },
    });
    const right = await fetch(`${handle.url}/`, {
      headers: { Authorization: basicHeader('reader', 'hunter2') },
    });

    expect(without.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(right.status).toBe(200);
  });

  it('is not open when only the username was left blank: a password alone still protects the share', async () => {
    const handle = await startServer(memoryStore([]), { username: '', password: 'hunter2' });

    const without = await fetch(`${handle.url}/`);
    const withBoth = await fetch(`${handle.url}/`, {
      headers: { Authorization: basicHeader('', 'hunter2') },
    });

    expect(without.status).toBe(401);
    expect(withBoth.status).toBe(200);
  });

  it('rejects a request with no colon separator in the credentials', async () => {
    const handle = await startServer(memoryStore([]), { username: 'reader', password: 'hunter2' });

    const response = await fetch(`${handle.url}/recent`, {
      headers: { Authorization: `Basic ${Buffer.from('nocolon').toString('base64')}` },
    });

    expect(response.status).toBe(401);
  });

  it('rejects the wrong username or password', async () => {
    const handle = await startServer(memoryStore([]), { username: 'reader', password: 'hunter2' });

    const wrongUser = await fetch(`${handle.url}/recent`, {
      headers: { Authorization: basicHeader('someone-else', 'hunter2') },
    });
    const wrongPassword = await fetch(`${handle.url}/recent`, {
      headers: { Authorization: basicHeader('reader', 'wrong') },
    });

    expect(wrongUser.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
  });

  it('accepts the correct username and password', async () => {
    const handle = await startServer(memoryStore([]), { username: 'reader', password: 'hunter2' });

    const response = await fetch(`${handle.url}/recent`, {
      headers: { Authorization: basicHeader('reader', 'hunter2') },
    });

    expect(response.status).toBe(200);
  });

  it('downloads a book byte-for-byte and 404s for an unknown path', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mangabound-opds-'));
    try {
      await mkdir(path.join(root, 'Manga'), { recursive: true });
      const content = Buffer.from('fake epub contents');
      await writeFile(path.join(root, 'Manga', 'Vol.01.epub'), content);
      const entry: LibraryBookEntry = {
        relativePath: 'Manga/Vol.01.epub',
        title: 'Manga',
        author: 'Unknown',
        format: 'epub',
        bytes: content.byteLength,
        convertedAt: '2026-09-16T10:00:00.000Z',
      };
      const handle = await new NodeOpdsServer(memoryStore([entry])).start({
        libraryPath: root,
        libraryTitle: 'My Library',
        interfaceAddress: '127.0.0.1',
        port: 0,
        auth: open,
      });
      activeHandles.push(handle);

      const found = await fetch(`${handle.url}/books/Manga/Vol.01.epub`);
      const downloaded = Buffer.from(await found.arrayBuffer());

      expect(found.status).toBe(200);
      expect(found.headers.get('content-type')).toBe('application/epub+zip');
      expect(found.headers.get('content-length')).toBe(String(content.byteLength));
      expect(downloaded.equals(content)).toBe(true);

      const missing = await fetch(`${handle.url}/books/Manga/Vol.02.epub`);
      expect(missing.status).toBe(404);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('never serves a file outside the library, whatever a catalog entry says', async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'mangabound-opds-outside-'));
    try {
      const library = path.join(parent, 'library');
      await mkdir(library);
      await writeFile(path.join(parent, 'outside-secret.epub'), 'OUTSIDE THE LIBRARY');
      const entry: LibraryBookEntry = {
        relativePath: '../outside-secret.epub',
        title: 'Outside',
        author: 'Unknown',
        format: 'epub',
        bytes: 1,
        convertedAt: '2026-09-16T10:00:00.000Z',
      };
      // A store that returns the entry as it is: what stands between the file and the client
      // here is the server itself, not the catalog's reader.
      const handle = await new NodeOpdsServer(memoryStore([entry])).start({
        libraryPath: library,
        libraryTitle: 'My Library',
        interfaceAddress: '127.0.0.1',
        port: 0,
        auth: open,
      });
      activeHandles.push(handle);

      const response = await fetch(`${handle.url}/books/..%2Foutside-secret.epub`);

      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('OUTSIDE THE LIBRARY');
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('refuses a catalog on disk that names a file outside the library', async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'mangabound-opds-hostile-'));
    try {
      const library = path.join(parent, 'library');
      await mkdir(path.join(library, '.mangabound'), { recursive: true });
      await writeFile(path.join(parent, 'outside-secret.epub'), 'OUTSIDE THE LIBRARY');
      await writeFile(
        path.join(library, '.mangabound', 'library.json'),
        JSON.stringify({
          schemaVersion: libraryManifestSchemaVersion,
          books: [
            {
              relativePath: '../outside-secret.epub',
              title: 'Outside',
              author: 'Unknown',
              format: 'epub',
              bytes: 1,
              convertedAt: '2026-09-16T10:00:00.000Z',
            },
          ],
        }),
      );
      const handle = await new NodeOpdsServer(new FsLibraryStore()).start({
        libraryPath: library,
        libraryTitle: 'My Library',
        interfaceAddress: '127.0.0.1',
        port: 0,
        auth: open,
      });
      activeHandles.push(handle);

      const response = await fetch(`${handle.url}/books/..%2Foutside-secret.epub`);

      expect(response.status).toBe(500);
      const body = await response.text();
      expect(body).toBe('The catalog could not be read.');
      expect(body).not.toContain('OUTSIDE THE LIBRARY');
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  describe('a link inside the shared folder', () => {
    function entryAt(relativePath: string): LibraryBookEntry {
      return {
        relativePath,
        title: 'Linked',
        author: 'Unknown',
        format: 'epub',
        bytes: 1,
        convertedAt: '2026-09-16T10:00:00.000Z',
      };
    }

    async function serve(library: string, entry: LibraryBookEntry): Promise<OpdsServerHandle> {
      // A store that returns the entry as it is, so the server is what stands in the way.
      const handle = await new NodeOpdsServer(memoryStore([entry])).start({
        libraryPath: library,
        libraryTitle: 'My Library',
        interfaceAddress: '127.0.0.1',
        port: 0,
        auth: open,
      });
      activeHandles.push(handle);
      return handle;
    }

    it('never leads to a file outside the library', async () => {
      const parent = await mkdtemp(path.join(os.tmpdir(), 'mangabound-opds-link-out-'));
      try {
        const library = path.join(parent, 'library');
        const outside = path.join(parent, 'outside');
        await mkdir(library);
        await mkdir(outside);
        await writeFile(path.join(outside, 'secret.epub'), 'OUTSIDE THE LIBRARY');
        // A directory link needs no privilege on Windows when it is a junction.
        await symlink(outside, path.join(library, 'shelf'), 'junction');
        const handle = await serve(library, entryAt('shelf/secret.epub'));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const response = await fetch(`${handle.url}/books/shelf/secret.epub`);

        expect(response.status).toBe(404);
        expect(await response.text()).not.toContain('OUTSIDE THE LIBRARY');
        // The reader is told nothing, so the app's log says why the book was left out.
        expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('shelf/secret.epub'));
        warn.mockRestore();
      } finally {
        await rm(parent, { recursive: true, force: true });
      }
    });

    it('still serves a file it leads to inside the library', async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'mangabound-opds-link-in-'));
      try {
        const real = path.join(root, 'Real Shelf');
        await mkdir(real);
        await writeFile(path.join(real, 'book.epub'), 'INSIDE THE LIBRARY');
        await symlink(real, path.join(root, 'shelf'), 'junction');
        const handle = await serve(root, entryAt('shelf/book.epub'));

        const response = await fetch(`${handle.url}/books/shelf/book.epub`);

        expect(response.status).toBe(200);
        expect(await response.text()).toBe('INSIDE THE LIBRARY');
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  });

  it('serves a loose file in the "other" feed, and never lists it in "recent"', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mangabound-opds-other-'));
    try {
      const tracked: LibraryBookEntry = {
        relativePath: 'Tracked.epub',
        title: 'Tracked',
        author: 'Someone',
        format: 'epub',
        bytes: 1,
        convertedAt: '2026-09-16T10:00:00.000Z',
      };
      const store = new FsLibraryStore();
      await store.publish(root, tracked);
      await writeFile(path.join(root, 'Tracked.epub'), 'x');
      const loose = Buffer.from('fake cbz contents');
      await writeFile(path.join(root, 'Copied in.cbz'), loose);

      const handle = await new NodeOpdsServer(store).start({
        libraryPath: root,
        libraryTitle: 'My Library',
        interfaceAddress: '127.0.0.1',
        port: 0,
        auth: open,
      });
      activeHandles.push(handle);

      const otherFeed = await fetch(`${handle.url}/other`);
      const otherBody = await otherFeed.text();
      expect(otherFeed.status).toBe(200);
      expect(otherBody).toContain('<title>Copied in</title>');
      expect(otherBody).not.toContain('<title>Tracked</title>');

      const recentFeed = await fetch(`${handle.url}/recent`);
      const recentBody = await recentFeed.text();
      expect(recentBody).toContain('<title>Tracked</title>');
      expect(recentBody).not.toContain('<title>Copied in</title>');

      const downloaded = await fetch(`${handle.url}/books/Copied%20in.cbz`);
      expect(downloaded.status).toBe(200);
      expect(downloaded.headers.get('content-type')).toBe('application/vnd.comicbook+zip');
      expect(Buffer.from(await downloaded.arrayBuffer()).equals(loose)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('404s an unknown route', async () => {
    const handle = await startServer(memoryStore([]), open);

    const response = await fetch(`${handle.url}/unknown`);

    expect(response.status).toBe(404);
  });

  it('returns 500 when a listed book is missing from disk', async () => {
    const entry: LibraryBookEntry = {
      relativePath: 'missing.epub',
      title: 'Missing',
      author: 'Unknown',
      format: 'epub',
      bytes: 1,
      convertedAt: '2026-09-16T10:00:00.000Z',
    };
    const root = await mkdtemp(path.join(os.tmpdir(), 'mangabound-opds-missing-'));
    try {
      const handle = await new NodeOpdsServer(memoryStore([entry])).start({
        libraryPath: root,
        libraryTitle: 'My Library',
        interfaceAddress: '127.0.0.1',
        port: 0,
        auth: open,
      });
      activeHandles.push(handle);

      const response = await fetch(`${handle.url}/books/missing.epub`);

      expect(response.status).toBe(500);
      const body = await response.text();
      expect(body).toBe('The catalog could not be read.');
      expect(body).not.toContain(root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('answers with a generic 500, not the parser text, when the catalog stops being readable mid-session', async () => {
    const handle = await startServer(
      {
        read: () => Promise.reject(new SyntaxError('Unexpected token n in JSON at position 1')),
        publish: () => Promise.reject(new Error('not used in these tests')),
        scanUntracked: () => Promise.reject(new Error('not used in these tests')),
      },
      open,
    );

    const response = await fetch(`${handle.url}/recent`);

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toBe('The catalog could not be read.');
    expect(body).not.toMatch(/JSON/u);
  });

  it('answers 404 for a catalog entry that is not a file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mangabound-opds-eisdir-'));
    try {
      await mkdir(path.join(root, 'a-directory'), { recursive: true });
      const entry: LibraryBookEntry = {
        relativePath: 'a-directory',
        title: 'Not a file',
        author: 'Unknown',
        format: 'epub',
        bytes: 0,
        convertedAt: '2026-09-16T10:00:00.000Z',
      };
      const handle = await new NodeOpdsServer(memoryStore([entry])).start({
        libraryPath: root,
        libraryTitle: 'My Library',
        interfaceAddress: '127.0.0.1',
        port: 0,
        auth: open,
      });
      activeHandles.push(handle);

      const response = await fetch(`${handle.url}/books/a-directory`);

      expect(response.status).toBe(404);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('stops accepting connections after stop()', async () => {
    const handle = await startServer(memoryStore([]), open);

    expect(handle.port).toBeGreaterThan(0);

    await handle.stop();
    activeHandles.length = 0;
    await expect(fetch(`${handle.url}/`)).rejects.toBeInstanceOf(Error);
  });

  it('rejects a second stop() on an already-stopped server', async () => {
    const handle = await startServer(memoryStore([]), open);

    await handle.stop();
    activeHandles.length = 0;

    await expect(handle.stop()).rejects.toBeInstanceOf(Error);
  });

  it('rejects when the port is already in use', async () => {
    const first = await startServer(memoryStore([]), open);

    await expect(
      new NodeOpdsServer(memoryStore([])).start({
        libraryPath: '/library',
        libraryTitle: 'My Library',
        interfaceAddress: '127.0.0.1',
        port: first.port,
        auth: open,
      }),
    ).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });
});

describe('NodeOpdsServer while a book is being downloaded', () => {
  const bookName = 'Big.epub';
  const bookBytes = 64 * 1024 * 1024;
  const tenSeconds = 10_000;
  const directories: string[] = [];
  const clients: net.Socket[] = [];

  afterEach(async () => {
    for (const client of clients.splice(0)) client.destroy();
    vi.restoreAllMocks();
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  /** A library with one book too large to be sent before the reader has read any of it. */
  async function startSharingBigBook(options?: NodeOpdsServerOptions): Promise<OpdsServerHandle> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mangabound-opds-download-'));
    directories.push(root);
    await writeFile(path.join(root, bookName), Buffer.alloc(bookBytes, 1));
    const entry: LibraryBookEntry = {
      relativePath: bookName,
      title: 'Big',
      author: 'Unknown',
      format: 'epub',
      bytes: bookBytes,
      convertedAt: '2026-09-16T10:00:00.000Z',
    };
    const handle = await new NodeOpdsServer(memoryStore([entry]), options).start({
      libraryPath: root,
      libraryTitle: 'My Library',
      interfaceAddress: '127.0.0.1',
      port: 0,
      auth: open,
    });
    activeHandles.push(handle);
    return handle;
  }

  /** Asks for the book, waits until the answer has begun, and then stops reading it. */
  async function startDownloadAndStopReading(handle: OpdsServerHandle): Promise<net.Socket> {
    const { hostname, port } = new URL(handle.url);
    const client = net.connect({ host: hostname, port: Number(port) });
    clients.push(client);
    // A server that ends the connection may reset it, which a socket reports as an error.
    client.on('error', () => undefined);
    await once(client, 'connect');
    client.write(`GET /books/${bookName} HTTP/1.1\r\nHost: ${hostname}\r\n\r\n`);
    await once(client, 'data');
    client.pause();
    return client;
  }

  /** Starts reading again, and answers how much came before the connection ended. */
  async function receivedUntilClosed(client: net.Socket): Promise<number> {
    let received = 0;
    client.on('data', (chunk: Buffer) => {
      received += chunk.length;
    });
    client.resume();
    await once(client, 'close');
    return received;
  }

  it(
    'ends the download in progress when sharing stops, instead of waiting for the reader',
    async () => {
      const handle = await startSharingBigBook();
      const client = await startDownloadAndStopReading(handle);

      const stopped = await Promise.race([
        handle.stop().then(() => true),
        new Promise<boolean>((resolve) => setTimeout(resolve, 5000, false)),
      ]);
      activeHandles.splice(activeHandles.indexOf(handle), 1);

      expect(stopped).toBe(true);
      // The reader is paused, so it only sees the connection end once it reads what was already on
      // its way: a few megabytes of a book that is much larger. A server that kept sending would
      // have delivered all of it.
      expect(await receivedUntilClosed(client)).toBeLessThan(bookBytes / 2);
    },
    tenSeconds,
  );

  it(
    'closes the connection of a reader that has stopped reading, once it has been idle long enough',
    async () => {
      const handle = await startSharingBigBook({ idleTimeoutMs: 200 });
      const client = await startDownloadAndStopReading(handle);

      // Left alone for longer than the server waits; a server that kept the connection would then
      // send the whole book.
      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(await receivedUntilClosed(client)).toBeLessThan(bookBytes / 2);
    },
    tenSeconds,
  );

  it(
    'closes the file when the reader goes away in the middle of a download',
    async () => {
      const opened: Readable[] = [];
      const handle = await startSharingBigBook({
        openBook: (filePath) => {
          const stream = createReadStream(filePath);
          opened.push(stream);
          return stream;
        },
      });
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const client = await startDownloadAndStopReading(handle);

      client.destroy();

      await vi.waitFor(() => {
        expect(opened).toHaveLength(1);
        expect(opened[0]?.destroyed).toBe(true);
      });
      // Leaving halfway is nothing the person needs to be told about.
      expect(error).not.toHaveBeenCalled();
    },
    tenSeconds,
  );

  it(
    'cuts the connection and logs it when the file fails to read, so a book is never delivered cut short',
    async () => {
      const handle = await startSharingBigBook({
        openBook: () =>
          new Readable({
            read() {
              this.destroy(Object.assign(new Error('The disk failed.'), { code: 'EIO' }));
            },
          }),
      });
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      let outcome = 'delivered';
      try {
        const response = await fetch(`${handle.url}/books/${bookName}`);
        await response.arrayBuffer();
      } catch {
        outcome = 'refused';
      }

      expect(outcome).toBe('refused');
      await vi.waitFor(() => {
        expect(error).toHaveBeenCalledWith(
          'OPDS request failed.',
          expect.objectContaining({ code: 'EIO' }),
        );
      });
    },
    tenSeconds,
  );
});
