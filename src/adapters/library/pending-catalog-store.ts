import { readdir } from 'node:fs/promises';
import path from 'node:path';

import type { LibraryStorePort } from '@/application/ports/library-store';
import {
  type LibraryBookEntry,
  LibraryIndexError,
  type LibraryManifest,
  libraryManifestSchemaVersion,
} from '@/library/manifest';

import { isPendingRunFolder } from './fs-pending-runs';

/**
 * The catalog of every book that is ready to be saved: the books of all the pending conversions, as
 * one. A pending conversion is a folder of its own with a catalog of its own, so sharing one of
 * them served only that conversion, and a book converted afterwards never reached the reader.
 * Asked about the folder that holds the conversions it joins their catalogs, with each book named
 * by its conversion's folder and then its own path (`<run>/<book>`), which is also where the file
 * is. Asked about any other folder it is the store it wraps.
 */
export class PendingCatalogStore implements LibraryStorePort {
  private pendingRoot: string | undefined;

  constructor(private readonly folders: LibraryStorePort) {}

  /** Where the pending conversions are, once the app knows. Until then nothing is the pending root. */
  useRoot(root: string): void {
    this.pendingRoot = root;
  }

  async read(libraryPath: string): Promise<LibraryManifest> {
    if (!this.isPendingRoot(libraryPath)) return this.folders.read(libraryPath);
    const books: LibraryBookEntry[] = [];
    for (const run of await this.runFolders(libraryPath)) {
      let manifest: LibraryManifest;
      try {
        manifest = await this.folders.read(path.join(libraryPath, run));
      } catch (error) {
        // One conversion whose catalog is damaged must not take the others off the reader. Its
        // books are still on disk, and show with the files that were never catalogued.
        if (!(error instanceof LibraryIndexError)) throw error;
        console.warn(`The catalog of the pending conversion ${run} could not be read.`, error);
        continue;
      }
      books.push(...manifest.books.map((entry) => inRun(run, entry)));
    }
    return { schemaVersion: libraryManifestSchemaVersion, books };
  }

  async scanUntracked(
    libraryPath: string,
    manifest: LibraryManifest,
  ): Promise<readonly LibraryBookEntry[]> {
    if (!this.isPendingRoot(libraryPath)) return this.folders.scanUntracked(libraryPath, manifest);
    const untracked: LibraryBookEntry[] = [];
    for (const run of await this.runFolders(libraryPath)) {
      const prefix = `${run}/`;
      const known: LibraryManifest = {
        schemaVersion: libraryManifestSchemaVersion,
        books: manifest.books
          .filter((entry) => entry.relativePath.startsWith(prefix))
          .map((entry) => ({ ...entry, relativePath: entry.relativePath.slice(prefix.length) })),
      };
      const found = await this.folders.scanUntracked(path.join(libraryPath, run), known);
      untracked.push(...found.map((entry) => inRun(run, entry)));
    }
    return untracked;
  }

  publish(libraryPath: string, entry: LibraryBookEntry): Promise<LibraryManifest> {
    if (this.isPendingRoot(libraryPath)) {
      return Promise.reject(new Error('Books are published to a conversion, not to all of them.'));
    }
    return this.folders.publish(libraryPath, entry);
  }

  private isPendingRoot(libraryPath: string): boolean {
    return (
      this.pendingRoot !== undefined && path.resolve(libraryPath) === path.resolve(this.pendingRoot)
    );
  }

  private async runFolders(root: string): Promise<readonly string[]> {
    try {
      const children = await readdir(root, { withFileTypes: true });
      return children
        .filter((child) => child.isDirectory() && isPendingRunFolder(child.name))
        .map((child) => child.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }
}

function inRun(run: string, entry: LibraryBookEntry): LibraryBookEntry {
  return { ...entry, relativePath: `${run}/${entry.relativePath}` };
}
