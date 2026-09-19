import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import type { BookFileStorePort, SavedBookFile } from '@/application/ports/book-file-store';

// Same hidden folder the catalog lives in (ADR 0007), so nothing stray shows in the library root.
const stagingDirectory = path.join('.mangabound', 'incoming');

export interface FsBookFileStoreDeps {
  readonly copyFile: typeof copyFile;
  readonly mkdir: typeof mkdir;
  readonly rename: typeof rename;
  readonly rm: typeof rm;
  readonly stat: typeof stat;
  readonly createTempSuffix: () => string;
}

export class FsBookFileStore implements BookFileStorePort {
  private readonly io: FsBookFileStoreDeps;

  constructor(deps: Partial<FsBookFileStoreDeps> = {}) {
    this.io = {
      copyFile: deps.copyFile ?? copyFile,
      mkdir: deps.mkdir ?? mkdir,
      rename: deps.rename ?? rename,
      rm: deps.rm ?? rm,
      stat: deps.stat ?? stat,
      createTempSuffix: deps.createTempSuffix ?? randomUUID,
    };
  }

  /**
   * Copies into a staging file inside the library, then renames it into place, so the book only
   * ever appears complete. An existing book of the same name is replaced, the same way a
   * reconversion replaces its book (ADR 0007).
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
    const finalPath = path.join(request.libraryPath, name);
    await this.io.mkdir(stagingPath, { recursive: true });
    try {
      await this.io.copyFile(request.sourcePath, temporaryPath, constants.COPYFILE_EXCL);
      options.signal?.throwIfAborted();
      const { size } = await this.io.stat(temporaryPath);
      await this.io.rename(temporaryPath, finalPath);
      return { path: finalPath, name, bytes: size };
    } catch (error) {
      await this.io.rm(temporaryPath, { force: true });
      throw error;
    }
  }
}
