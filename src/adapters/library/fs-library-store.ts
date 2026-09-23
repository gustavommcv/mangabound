import { randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { LibraryStorePort } from '@/application/ports/library-store';
import {
  type LibraryBookEntry,
  type LibraryManifest,
  bookFormatFromExtension,
  emptyLibraryManifest,
  parseLibraryManifest,
  serializeLibraryManifest,
} from '@/library/manifest';
import { publishBook } from '@/library/publish';

const manifestDirName = '.mangabound';
const manifestFileName = 'library.json';

export interface FsLibraryStoreDeps {
  readonly readFile: typeof readFile;
  readonly writeFile: typeof writeFile;
  readonly rename: typeof rename;
  readonly mkdir: typeof mkdir;
  readonly readdir: typeof readdir;
  readonly stat: typeof stat;
  readonly createTempSuffix: () => string;
}

function manifestDir(libraryPath: string): string {
  return path.join(libraryPath, manifestDirName);
}

function manifestPath(libraryPath: string): string {
  return path.join(manifestDir(libraryPath), manifestFileName);
}

function isEnoent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

export class FsLibraryStore implements LibraryStorePort {
  private readonly io: FsLibraryStoreDeps;

  constructor(deps: Partial<FsLibraryStoreDeps> = {}) {
    this.io = {
      readFile: deps.readFile ?? readFile,
      writeFile: deps.writeFile ?? writeFile,
      rename: deps.rename ?? rename,
      mkdir: deps.mkdir ?? mkdir,
      readdir: deps.readdir ?? readdir,
      stat: deps.stat ?? stat,
      createTempSuffix: deps.createTempSuffix ?? randomUUID,
    };
  }

  async read(libraryPath: string): Promise<LibraryManifest> {
    let raw: string;
    try {
      raw = await this.io.readFile(manifestPath(libraryPath), 'utf8');
    } catch (error) {
      if (isEnoent(error)) return emptyLibraryManifest;
      throw error;
    }
    return parseLibraryManifest(raw);
  }

  async publish(libraryPath: string, entry: LibraryBookEntry): Promise<LibraryManifest> {
    const current = await this.read(libraryPath);
    const next = publishBook(current, entry);
    await this.io.mkdir(manifestDir(libraryPath), { recursive: true });
    const finalPath = manifestPath(libraryPath);
    const tempPath = `${finalPath}.${this.io.createTempSuffix()}.tmp`;
    await this.io.writeFile(tempPath, serializeLibraryManifest(next), 'utf8');
    await this.io.rename(tempPath, finalPath);
    return next;
  }

  async scanUntracked(
    libraryPath: string,
    manifest: LibraryManifest,
  ): Promise<readonly LibraryBookEntry[]> {
    const known = new Set(manifest.books.map((book) => book.relativePath));
    let entries: Dirent[];
    try {
      entries = await this.io.readdir(libraryPath, { withFileTypes: true });
    } catch (error) {
      if (isEnoent(error)) return [];
      throw error;
    }
    const found: LibraryBookEntry[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || known.has(entry.name)) continue;
      const format = bookFormatFromExtension(entry.name);
      if (format === undefined) continue;
      const stats = await this.io.stat(path.join(libraryPath, entry.name));
      found.push({
        relativePath: entry.name,
        title: path.parse(entry.name).name,
        author: 'Unknown',
        format,
        bytes: stats.size,
        convertedAt: stats.mtime.toISOString(),
      });
    }
    return found;
  }
}
