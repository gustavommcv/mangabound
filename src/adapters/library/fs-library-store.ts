import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { LibraryStorePort } from '@/application/ports/library-store';
import {
  type LibraryBookEntry,
  type LibraryManifest,
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
}
