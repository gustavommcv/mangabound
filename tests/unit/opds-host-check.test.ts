import { once } from 'node:events';
import http from 'node:http';
import net from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { NodeOpdsServer, type NodeOpdsServerOptions } from '@/adapters/opds/http-server';
import type { LibraryStorePort } from '@/application/ports/library-store';
import type { OpdsAuthConfig, OpdsServerHandle } from '@/application/ports/opds-server';
import { libraryManifestSchemaVersion } from '@/library/manifest';

const emptyStore: LibraryStorePort = {
  read: () => Promise.resolve({ schemaVersion: libraryManifestSchemaVersion, books: [] }),
  publish: () => Promise.reject(new Error('not used')),
  scanUntracked: () => Promise.resolve([]),
};

const handles: OpdsServerHandle[] = [];
const sockets: net.Socket[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const socket of sockets.splice(0)) socket.destroy();
  await Promise.all(handles.splice(0).map((handle) => handle.stop()));
});

async function start(
  auth: OpdsAuthConfig = { username: '', password: '' },
  options: NodeOpdsServerOptions = { ownNames: ['my-pc', 'my-pc.local'] },
): Promise<{ readonly port: number; readonly handle: OpdsServerHandle }> {
  const handle = await new NodeOpdsServer(emptyStore, options).start({
    libraryPath: '/library',
    libraryTitle: 'My Library',
    interfaceAddress: '127.0.0.1',
    port: 0,
    auth,
  });
  handles.push(handle);
  return { port: Number(new URL(handle.url).port), handle };
}

/** A request with the Host header the caller says, which `fetch` does not let it choose. */
function ask(
  port: number,
  requestPath: string,
  host: string,
  headers: Record<string, string> = {},
): Promise<{ readonly status: number; readonly body: string }> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port, path: requestPath, headers: { Host: host, ...headers } },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          body += chunk;
        });
        response.on('end', () => {
          resolve({ status: response.statusCode ?? 0, body });
        });
      },
    );
    request.on('error', reject);
    request.end();
  });
}

describe('which names the catalog answers to', () => {
  it('answers a request that names an address of this computer, in numbers or by name', async () => {
    const { port } = await start();

    for (const host of [
      `127.0.0.1:${String(port)}`,
      `192.168.1.50:${String(port)}`,
      `[::1]:${String(port)}`,
      `localhost:${String(port)}`,
      `my-pc:${String(port)}`,
      `MY-PC.local:${String(port)}`,
    ]) {
      expect((await ask(port, '/recent', host)).status, host).toBe(200);
    }
  });

  it('refuses a request that names any other name, whatever it asks for, and says why in the log once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { port } = await start();

    for (const requestPath of ['/', '/recent', '/other', '/books/a.epub']) {
      const answer = await ask(port, requestPath, `evil.example:${String(port)}`);
      expect(answer.status, requestPath).toBe(403);
      expect(answer.body).toBe('Use an address of this computer to reach the catalog.');
    }
    await ask(port, '/recent', 'rebound.example');

    expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
      expect.stringContaining('evil.example:'),
      expect.stringContaining('rebound.example'),
    ]);
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      'is not an address of this computer. Use the address Mangabound shows',
    );
  });

  it('refuses before it asks for a password, and with the right password too', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { port } = await start({ username: 'reader', password: 'secret' });
    const credentials = `Basic ${Buffer.from('reader:secret').toString('base64')}`;

    const withoutPassword = await ask(port, '/recent', 'evil.example');
    const withPassword = await ask(port, '/recent', 'evil.example', { Authorization: credentials });
    const own = await ask(port, '/recent', `127.0.0.1:${String(port)}`, {
      Authorization: credentials,
    });
    const ownWithoutPassword = await ask(port, '/recent', `127.0.0.1:${String(port)}`);

    // Neither is told that a password would help: the page is not who the catalog is for.
    expect([withoutPassword.status, withPassword.status]).toEqual([403, 403]);
    expect([own.status, ownWithoutPassword.status]).toEqual([200, 401]);
  });

  it('keeps the names it has refused to the first twenty in the log, and refuses all the same', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { port } = await start();

    for (let index = 0; index < 25; index += 1) {
      expect((await ask(port, '/recent', `rebound-${String(index)}.example`)).status).toBe(403);
    }

    expect(warn).toHaveBeenCalledTimes(20);
  });

  it('answers to the name of the computer it is on when it is not told one', async () => {
    const { port } = await start(undefined, {});
    const { hostname } = await import('node:os');

    expect((await ask(port, '/recent', `${hostname()}:${String(port)}`)).status).toBe(200);
    expect((await ask(port, '/recent', `${hostname()}.local`)).status).toBe(200);
    expect((await ask(port, '/recent', 'not-this-computer.example')).status).toBe(403);
  });

  it('answers a request with no Host at all, which a browser never makes', async () => {
    const { port } = await start();
    const client = net.connect({ host: '127.0.0.1', port });
    sockets.push(client);
    await once(client, 'connect');

    client.write('GET /recent HTTP/1.0\r\n\r\n');
    let response = '';
    client.setEncoding('utf8');
    client.on('data', (chunk: string) => {
      response += chunk;
    });
    await once(client, 'close');

    expect(response).toMatch(/^HTTP\/1\.1 200 /u);
  });
});

describe('a path that is not written right', () => {
  it('is not found, and is not an error of the server', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { port } = await start();

    for (const requestPath of [
      '/books/%E0%A4%A',
      '/books/%',
      '/books/ok/%ZZ',
      '/books/%C0%80%F8',
    ]) {
      const answer = await ask(port, requestPath, `127.0.0.1:${String(port)}`);
      expect(answer.status, requestPath).toBe(404);
      expect(answer.body).toBe('Not found.');
    }
    expect(error).not.toHaveBeenCalled();
  });
});
