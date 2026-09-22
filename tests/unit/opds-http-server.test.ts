import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { formatHost, NodeOpdsServer } from '@/adapters/opds/http-server';
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
  };
}

function basicHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

const activeHandles: OpdsServerHandle[] = [];

async function startServer(
  store: LibraryStorePort,
  auth: OpdsAuthConfig,
): Promise<OpdsServerHandle> {
  const handle = await new NodeOpdsServer(store).start({
    libraryPath: '/library',
    libraryTitle: 'My Library',
    interfaceAddress: '127.0.0.1',
    auth,
  });
  activeHandles.push(handle);
  return handle;
}

afterEach(async () => {
  await Promise.all(activeHandles.splice(0).map((handle) => handle.stop()));
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
      },
      open,
    );

    const response = await fetch(`${handle.url}/recent`);

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toBe('The catalog could not be read.');
    expect(body).not.toMatch(/JSON/u);
  });

  it('ends the response without a status change when the stream fails after headers are sent', async () => {
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
        auth: open,
      });
      activeHandles.push(handle);

      const response = await fetch(`${handle.url}/books/a-directory`);

      expect(response.status).toBe(200);
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
});
