import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { renameWithRetry } from '@/adapters/fs/rename-with-retry';
import type { BookFileStorePort, SavedBookFile } from '@/application/ports/book-file-store';
import { uniqueFileName } from '@/library/unique-name';

// Same hidden folder the catalog lives in (ADR 0007), so nothing stray shows in the library root.
const stagingDirectory = path.join('.mangabound', 'incoming');

export interface FsBookFileStoreDeps {
  readonly copyFile: typeof copyFile;
  readonly mkdir: typeof mkdir;
  readonly readdir: typeof readdir;
  readonly rename: typeof rename;
  readonly rm: typeof rm;
  readonly stat: typeof stat;
  readonly createTempSuffix: () => string;
}

export class FsBookFileStore implements BookFileStorePort {
  private readonly io: FsBookFileStoreDeps;
  // Books are placed one at a time, so two of them can never be handed the same free name.
  private tail: Promise<void> = Promise.resolve();

  constructor(deps: Partial<FsBookFileStoreDeps> = {}) {
    this.io = {
      copyFile: deps.copyFile ?? copyFile,
      mkdir: deps.mkdir ?? mkdir,
      readdir: deps.readdir ?? readdir,
      rename: deps.rename ?? rename,
      rm: deps.rm ?? rm,
      stat: deps.stat ?? stat,
      createTempSuffix: deps.createTempSuffix ?? randomUUID,
    };
  }

  /**
   * Copies into a staging file inside the library, then renames it into place, so the book only
   * ever appears complete. A book of the same name is never replaced; this one gets a free name.
   */
  async saveBook(
    request: { readonly sourcePath: string; readonly libraryPath: string },
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<SavedBookFile> {
    const name = path.basename(request.sourcePath);
    if (path.extname(name).toLowerCase() !== '.cbz') {
      throw new Error('Only .cbz volume files can be saved as books.');
    }
    const stagingPath = path.join(request.libraryPath, stagingDirectory);
    const temporaryPath = path.join(stagingPath, `${name}.${this.io.createTempSuffix()}.tmp`);
    await this.io.mkdir(stagingPath, { recursive: true });
    try {
      await this.io.copyFile(request.sourcePath, temporaryPath, constants.COPYFILE_EXCL);
      options.signal?.throwIfAborted();
      return await this.place(temporaryPath, request.libraryPath, name);
    } catch (error) {
      await this.io.rm(temporaryPath, { force: true });
      throw error;
    }
  }

  async stageBook<T extends { readonly path: string }>(
    request: { readonly libraryPath: string },
    produce: (stagingPath: string) => Promise<T>,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<{ readonly produced: T; readonly saved: SavedBookFile }> {
    const stagingPath = path.join(
      request.libraryPath,
      stagingDirectory,
      this.io.createTempSuffix(),
    );
    await this.io.mkdir(stagingPath, { recursive: true });
    try {
      const produced = await produce(stagingPath);
      options.signal?.throwIfAborted();
      const saved = await this.place(
        produced.path,
        request.libraryPath,
        path.basename(produced.path),
      );
      return { produced, saved };
    } finally {
      await this.io.rm(stagingPath, { recursive: true, force: true });
    }
  }

  private place(sourcePath: string, libraryPath: string, name: string): Promise<SavedBookFile> {
    const placed = this.tail.then(() => this.move(sourcePath, libraryPath, name));
    this.tail = placed.then(
      () => undefined,
      () => undefined,
    );
    return placed;
  }

  // Names are compared without regard to case or to the way an accent is written, so a library
  // copied to Windows, macOS or a FAT drive never ends up with two books that differ only in
  // capitals, or in an "é" made of one character in one and of two in the other (APFS takes those
  // for the same name, and the second book would replace the first).
  private async move(
    sourcePath: string,
    libraryPath: string,
    name: string,
  ): Promise<SavedBookFile> {
    const comparable = (entry: string): string => entry.normalize('NFC').toLowerCase();
    const taken = new Set((await this.io.readdir(libraryPath)).map(comparable));
    const finalName = uniqueFileName(name, (candidate) => taken.has(comparable(candidate)));
    const finalPath = path.join(libraryPath, finalName);
    const { size } = await this.io.stat(sourcePath);
    await renameWithRetry(this.io.rename, sourcePath, finalPath);
    return { path: finalPath, name: finalName, bytes: size };
  }
}
