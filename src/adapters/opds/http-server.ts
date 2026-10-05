import { timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import type { LibraryStorePort } from '@/application/ports/library-store';
import type {
  OpdsAuthConfig,
  OpdsServerHandle,
  OpdsServerPort,
  OpdsServerStartOptions,
} from '@/application/ports/opds-server';
import type { LibraryBookEntry, LibraryManifest } from '@/library/manifest';
import { isInsideLibrary, resolveLibraryFile } from '@/library/paths';
import { isOwnHost } from '@/opds/host';
import {
  acquisitionFeedType,
  buildAcquisitionFeed,
  buildNavigationFeed,
  navigationFeedType,
  type OpdsCatalogConfig,
  otherFilesFeed,
  recentFeed,
} from '@/opds/feed';
import { bookFormatMimeTypes } from '@/opds/mime';

const bookRoutePrefix = '/books/';

/**
 * How long a connection may do nothing, in either direction, before it is closed. A reader that
 * went to sleep or lost its Wi-Fi in the middle of a download never ends its connection by itself,
 * and without this the server would keep it, and the book it is reading, for as long as the
 * operating system takes to give up on it (minutes, and up to a quarter of an hour on Linux).
 */
const idleConnectionTimeoutMs = 60_000;

/** What a client that left in the middle of a download makes the stream report. */
const clientLeftCodes: ReadonlySet<string> = new Set([
  'ERR_STREAM_PREMATURE_CLOSE',
  'ECONNRESET',
  'EPIPE',
]);

export function clientLeft(error: unknown): boolean {
  return error instanceof Error && 'code' in error && clientLeftCodes.has(String(error.code));
}

export interface NodeOpdsServerOptions {
  /** Overrides how long an idle connection is kept; only the tests need to. */
  readonly idleTimeoutMs?: number;
  /** Overrides how a book's file is opened for sending; only the tests need to. */
  readonly openBook?: (filePath: string) => Readable;
  /** Overrides the names this computer is called by in a `Host` header; only the tests need to. */
  readonly ownNames?: readonly string[];
}

export function formatHost(address: string): string {
  return address.includes(':') ? `[${address}]` : address;
}

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** The path a request named, or `undefined` when its percent-encoding is not valid. */
function decodeRelativePath(encoded: string): string | undefined {
  try {
    return encoded
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/');
  } catch {
    return undefined;
  }
}

/** Both credentials left blank is an explicit choice to share with no authentication (ADR 0018). */
function isOpen(auth: OpdsAuthConfig): boolean {
  return auth.username === '' && auth.password === '';
}

function isAuthorized(req: IncomingMessage, auth: OpdsAuthConfig): boolean {
  if (isOpen(auth)) return true;
  const header = req.headers.authorization;
  if (header === undefined || !header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) return false;
  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);
  return safeEqual(username, auth.username) && safeEqual(password, auth.password);
}

function respondUnauthorized(res: ServerResponse): void {
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="Mangabound"',
    'Content-Type': 'text/plain; charset=utf-8',
  });
  res.end('Unauthorized.');
}

/**
 * Whether the file is still inside the library once every link on the way is followed. A catalog
 * entry only names a path, and the folder can hold a link (an archive can carry one) that leads
 * anywhere the person running the app can read.
 */
async function staysInsideLibrary(libraryPath: string, filePath: string): Promise<boolean> {
  const [root, file] = await Promise.all([realpath(libraryPath), realpath(filePath)]);
  return isInsideLibrary(root, file);
}

function respondForbidden(res: ServerResponse): void {
  res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Use an address of this computer to reach the catalog.');
}

function respondNotFound(res: ServerResponse): void {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found.');
}

export class NodeOpdsServer implements OpdsServerPort {
  private readonly idleTimeoutMs: number;
  private readonly openBook: (filePath: string) => Readable;
  private readonly ownNames: readonly string[];
  private readonly refusedHosts = new Set<string>();

  constructor(
    private readonly libraryStore: LibraryStorePort,
    options: NodeOpdsServerOptions = {},
  ) {
    this.idleTimeoutMs = options.idleTimeoutMs ?? idleConnectionTimeoutMs;
    this.openBook = options.openBook ?? ((filePath) => createReadStream(filePath));
    const computer = os.hostname().toLowerCase();
    this.ownNames = options.ownNames ?? [computer, `${computer}.local`];
  }

  start(options: OpdsServerStartOptions): Promise<OpdsServerHandle> {
    let baseUrl = '';
    const server = http.createServer((req, res) => {
      this.handleRequest(req, res, options, baseUrl).catch((error: unknown) => {
        // The real cause (a corrupt catalog, a missing book file) can carry filesystem paths
        // or parser text, so it stays in the app's own log and never reaches the OPDS client.
        console.error('OPDS request failed.', error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        res.end('The catalog could not be read.');
      });
    });

    // With no 'timeout' listener, a connection that has been silent this long is destroyed.
    server.timeout = this.idleTimeoutMs;

    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(options.port, options.interfaceAddress, () => {
        server.removeListener('error', reject);
        const address = server.address() as AddressInfo;
        baseUrl = `http://${formatHost(options.interfaceAddress)}:${String(address.port)}`;
        resolve({
          url: baseUrl,
          interfaceAddress: options.interfaceAddress,
          port: address.port,
          stop: () =>
            new Promise<void>((resolveStop, rejectStop) => {
              server.close((closeError) => {
                if (closeError) rejectStop(closeError);
                else resolveStop();
              });
              // close() answers only when every connection has ended, and one whose reader has
              // stopped reading never does. Stopping to share ends the downloads in progress.
              server.closeAllConnections();
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
    // Before anything else, the password included: a page that is reaching the catalog through the
    // browser by a name of its own is not to be asked for credentials either.
    if (!isOwnHost(req.headers.host, this.ownNames)) {
      this.noteRefusedHost(req.headers.host);
      respondForbidden(res);
      return;
    }
    const url = new URL(req.url!, 'http://localhost');
    if (!isAuthorized(req, options.auth)) {
      respondUnauthorized(res);
      return;
    }

    const catalogConfig: OpdsCatalogConfig = {
      baseUrl,
      libraryTitle: options.libraryTitle,
      updated: new Date().toISOString(),
    };

    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': navigationFeedType });
      res.end(buildNavigationFeed(catalogConfig));
      return;
    }

    if (url.pathname === recentFeed.path) {
      const manifest = await this.libraryStore.read(options.libraryPath);
      res.writeHead(200, { 'Content-Type': acquisitionFeedType });
      res.end(buildAcquisitionFeed(catalogConfig, recentFeed, manifest.books));
      return;
    }

    if (url.pathname === otherFilesFeed.path) {
      const manifest = await this.libraryStore.read(options.libraryPath);
      const untracked = await this.libraryStore.scanUntracked(options.libraryPath, manifest);
      res.writeHead(200, { 'Content-Type': acquisitionFeedType });
      res.end(buildAcquisitionFeed(catalogConfig, otherFilesFeed, untracked));
      return;
    }

    if (url.pathname.startsWith(bookRoutePrefix)) {
      await this.serveBook(res, options.libraryPath, url.pathname.slice(bookRoutePrefix.length));
      return;
    }

    respondNotFound(res);
  }

  /**
   * Says once, in the app's log, which name a request was refused for, so that a person whose
   * reader reaches the computer by a name of its own can find out why it is not let in.
   */
  private noteRefusedHost(header: string | undefined): void {
    const name = String(header);
    if (this.refusedHosts.has(name) || this.refusedHosts.size >= 20) return;
    this.refusedHosts.add(name);
    console.warn(
      `A request to the catalog was refused: ${name} is not an address of this computer. Use the address Mangabound shows, or the computer's own name.`,
    );
  }

  /**
   * A tracked entry, or one this asks a fresh scan for. The scan only ever returns bare file names
   * it just found on disk. A tracked entry comes from a file anyone can edit, so where it points is
   * checked again before it is opened (see `serveBook`).
   */
  private async findBook(
    libraryPath: string,
    manifest: LibraryManifest,
    requestedPath: string,
  ): Promise<LibraryBookEntry | undefined> {
    const tracked = manifest.books.find((book) => book.relativePath === requestedPath);
    if (tracked !== undefined) return tracked;
    const untracked = await this.libraryStore.scanUntracked(libraryPath, manifest);
    return untracked.find((book) => book.relativePath === requestedPath);
  }

  private async serveBook(
    res: ServerResponse,
    libraryPath: string,
    encodedRelativePath: string,
  ): Promise<void> {
    const requestedPath = decodeRelativePath(encodedRelativePath);
    if (requestedPath === undefined) {
      respondNotFound(res);
      return;
    }
    const manifest = await this.libraryStore.read(libraryPath);
    const entry = await this.findBook(libraryPath, manifest, requestedPath);
    if (entry === undefined) {
      respondNotFound(res);
      return;
    }

    const filePath = resolveLibraryFile(libraryPath, entry.relativePath);
    if (filePath === undefined) {
      respondNotFound(res);
      return;
    }
    if (!(await staysInsideLibrary(libraryPath, filePath))) {
      // The reader only sees "not found", so the reason stays in the app's own log, where a person
      // whose library is laid out with links can find out why a book is not shared.
      console.warn(
        `A book was not shared because a link leads outside the shared folder: ${entry.relativePath}`,
      );
      respondNotFound(res);
      return;
    }
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      respondNotFound(res);
      return;
    }
    res.writeHead(200, {
      'Content-Type': bookFormatMimeTypes[entry.format],
      'Content-Length': stats.size,
    });
    try {
      // pipeline, not pipe: when the reader goes away it closes the file too, where pipe would
      // leave it open and this request waiting for ever.
      await pipeline(this.openBook(filePath), res);
    } catch (error) {
      if (!clientLeft(error)) throw error;
    }
  }
}
