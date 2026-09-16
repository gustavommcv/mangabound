import { timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

import type { LibraryStorePort } from '@/application/ports/library-store';
import type {
  OpdsAuthConfig,
  OpdsServerHandle,
  OpdsServerPort,
  OpdsServerStartOptions,
} from '@/application/ports/opds-server';
import {
  acquisitionFeedType,
  buildAcquisitionFeed,
  buildNavigationFeed,
  navigationFeedType,
  type OpdsCatalogConfig,
} from '@/opds/feed';
import { bookFormatMimeTypes } from '@/opds/mime';

const bookRoutePrefix = '/books/';

export function formatHost(address: string): string {
  return address.includes(':') ? `[${address}]` : address;
}

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

function decodeRelativePath(encoded: string): string {
  return encoded
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .join('/');
}

function isAuthorized(req: IncomingMessage, url: URL, auth: OpdsAuthConfig): boolean {
  if (auth.mode === 'token') {
    const token = url.searchParams.get('token');
    return token !== null && safeEqual(token, auth.token);
  }
  const header = req.headers.authorization;
  if (header === undefined || !header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) return false;
  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);
  return safeEqual(username, auth.username) && safeEqual(password, auth.password);
}

function respondUnauthorized(res: ServerResponse, authMode: OpdsAuthConfig['mode']): void {
  const headers: Record<string, string> =
    authMode === 'basic'
      ? {
          'WWW-Authenticate': 'Basic realm="Mangabound"',
          'Content-Type': 'text/plain; charset=utf-8',
        }
      : { 'Content-Type': 'text/plain; charset=utf-8' };
  res.writeHead(401, headers);
  res.end('Unauthorized.');
}

function respondNotFound(res: ServerResponse): void {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found.');
}

export class NodeOpdsServer implements OpdsServerPort {
  constructor(private readonly libraryStore: LibraryStorePort) {}

  start(options: OpdsServerStartOptions): Promise<OpdsServerHandle> {
    let baseUrl = '';
    const server = http.createServer((req, res) => {
      this.handleRequest(req, res, options, baseUrl).catch((error: Error) => {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        res.end(error.message);
      });
    });

    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, options.interfaceAddress, () => {
        server.removeListener('error', reject);
        const address = server.address() as AddressInfo;
        baseUrl = `http://${formatHost(options.interfaceAddress)}:${String(address.port)}`;
        resolve({
          url: baseUrl,
          interfaceAddress: options.interfaceAddress,
          port: address.port,
          authMode: options.auth.mode,
          ...(options.auth.mode === 'token' ? { token: options.auth.token } : {}),
          stop: () =>
            new Promise<void>((resolveStop, rejectStop) => {
              server.close((closeError) => {
                if (closeError) rejectStop(closeError);
                else resolveStop();
              });
            }),
        });
      });
    });
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    options: OpdsServerStartOptions,
    baseUrl: string,
  ): Promise<void> {
    const url = new URL(req.url!, 'http://localhost');
    if (!isAuthorized(req, url, options.auth)) {
      respondUnauthorized(res, options.auth.mode);
      return;
    }

    const catalogConfig: OpdsCatalogConfig = {
      baseUrl,
      libraryTitle: options.libraryTitle,
      updated: new Date().toISOString(),
      ...(options.auth.mode === 'token' ? { token: options.auth.token } : {}),
    };

    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': navigationFeedType });
      res.end(buildNavigationFeed(catalogConfig));
      return;
    }

    if (url.pathname === '/recent') {
      const manifest = await this.libraryStore.read(options.libraryPath);
      res.writeHead(200, { 'Content-Type': acquisitionFeedType });
      res.end(buildAcquisitionFeed(catalogConfig, manifest.books));
      return;
    }

    if (url.pathname.startsWith(bookRoutePrefix)) {
      await this.serveBook(res, options.libraryPath, url.pathname.slice(bookRoutePrefix.length));
      return;
    }

    respondNotFound(res);
  }

  private async serveBook(
    res: ServerResponse,
    libraryPath: string,
    encodedRelativePath: string,
  ): Promise<void> {
    const requestedPath = decodeRelativePath(encodedRelativePath);
    const manifest = await this.libraryStore.read(libraryPath);
    const entry = manifest.books.find((book) => book.relativePath === requestedPath);
    if (entry === undefined) {
      respondNotFound(res);
      return;
    }

    const filePath = path.join(libraryPath, ...entry.relativePath.split('/'));
    const stats = await stat(filePath);
    res.writeHead(200, {
      'Content-Type': bookFormatMimeTypes[entry.format],
      'Content-Length': stats.size,
    });
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(filePath);
      stream.once('error', reject);
      stream.once('close', resolve);
      stream.pipe(res);
    });
  }
}
