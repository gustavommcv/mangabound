import { randomUUID } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import {
  copyFile,
  link,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import { newestChange } from '@/adapters/fs/newest-change';
import { writeFileAtomically, type AtomicWriteDeps } from '@/adapters/fs/write-file-atomically';
import type { LibraryBookEntry } from '@/library/manifest';
import { toLibraryRelativePath } from '@/library/paths';
import { FsLibraryStore } from './fs-library-store';

export interface PendingBook {
  readonly entry: LibraryBookEntry;
  readonly path: string;
  readonly savedPath?: string;
}

export interface PendingRun {
  readonly id: string;
  readonly path: string;
  readonly createdAt: number;
  readonly books: readonly PendingBook[];
}

export type PendingExportResult =
  | { readonly status: 'saved' }
  | { readonly status: 'catalog_failed' | 'record_failed'; readonly cause: unknown };

interface PendingState {
  readonly version: 1;
  readonly saved: Readonly<Record<string, string>>;
}

const emptyState: PendingState = { version: 1, saved: {} };

export interface FsPendingRunsDeps extends AtomicWriteDeps {
  readonly readFile: (filePath: string, encoding: 'utf8') => Promise<string>;
  readonly stat: (filePath: string) => Promise<Pick<Stats, 'isFile' | 'birthtimeMs'>>;
  readonly link: (from: string, to: string) => Promise<void>;
  readonly copyFile: (from: string, to: string, mode: number) => Promise<void>;
}

/** Owns durable, app-local conversion output. Each run is isolated from name collisions in others. */
export class FsPendingRuns {
  private readonly io: FsPendingRunsDeps;

  constructor(
    readonly root: string,
    private readonly libraries = new FsLibraryStore(),
    deps: Partial<FsPendingRunsDeps> = {},
  ) {
    this.io = {
      readFile: deps.readFile ?? readFile,
      stat: deps.stat ?? stat,
      link: deps.link ?? link,
      copyFile: deps.copyFile ?? copyFile,
      writeFile: deps.writeFile ?? writeFile,
      rename: deps.rename ?? rename,
      rm: deps.rm ?? rm,
      createTempSuffix: deps.createTempSuffix ?? randomUUID,
    };
  }

  async prepare(): Promise<string> {
    await mkdir(this.root, { recursive: true });
    return this.root;
  }

  async create(): Promise<{ id: string; path: string }> {
    const id = randomUUID();
    const runPath = path.join(this.root, id);
    await mkdir(runPath, { recursive: true });
    return { id, path: runPath };
  }

  async list(): Promise<readonly PendingRun[]> {
    await mkdir(this.root, { recursive: true });
    const children = await readdir(this.root, { withFileTypes: true });
    const runs: PendingRun[] = [];
    for (const child of children) {
      if (!child.isDirectory() || !/^[0-9a-f-]{36}$/iu.test(child.name)) continue;
      const runPath = path.join(this.root, child.name);
      const manifest = await this.libraries.read(runPath);
      const state = await this.readState(runPath);
      const books: PendingBook[] = [];
      const untracked = await this.libraries.scanUntracked(runPath, manifest);
      for (const entry of [...manifest.books, ...untracked]) {
        const bookPath = path.resolve(runPath, entry.relativePath);
        toLibraryRelativePath(runPath, bookPath);
        try {
          if (!(await this.io.stat(bookPath)).isFile()) continue;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
          throw error;
        }
        books.push({
          entry,
          path: bookPath,
          ...(state.saved[entry.relativePath] === undefined
            ? {}
            : { savedPath: state.saved[entry.relativePath] }),
        });
      }
      if (books.length > 0) {
        const details = await this.io.stat(runPath);
        runs.push({ id: child.name, path: runPath, createdAt: details.birthtimeMs, books });
      }
    }
    return runs.sort((a, b) => b.createdAt - a.createdAt);
  }

  async markSaved(run: PendingRun, book: PendingBook, savedPath: string): Promise<void> {
    const state = await this.readState(run.path);
    const next: PendingState = {
      version: 1,
      saved: { ...state.saved, [book.entry.relativePath]: savedPath },
    };
    const finalPath = path.join(run.path, '.mangabound', 'pending.json');
    await mkdir(path.dirname(finalPath), { recursive: true });
    await writeFileAtomically(finalPath, `${JSON.stringify(next, null, 2)}\n`, this.io);
  }

  /** Never modifies the source. A same-folder staged file protects it from failed exports. */
  async export(book: PendingBook, destination: string, overwrite: boolean): Promise<void> {
    const tempPath = path.join(
      path.dirname(destination),
      `.${path.basename(destination)}.${randomUUID()}.tmp`,
    );
    try {
      await this.io.copyFile(book.path, tempPath, constants.COPYFILE_EXCL);
      if (overwrite) await rename(tempPath, destination);
      else {
        try {
          // Atomic, exclusive publication on filesystems that support hard links.
          await this.io.link(tempPath, destination);
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (!new Set(['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS']).has(code ?? '')) throw error;
          // FAT/exFAT and some network drives cannot make hard links. Exclusive copying is
          // not atomic, but it never replaces an existing book and leaves the source intact. The
          // staged copy goes first: with both on the drive it would need twice the book's size, and
          // a book that fits would be refused as "the destination is full".
          await rm(tempPath, { force: true });
          await this.io.copyFile(book.path, destination, constants.COPYFILE_EXCL);
        }
      }
    } finally {
      await rm(tempPath, { force: true });
    }
  }

  /** A run is complete only after both the destination catalog and saved-state record succeed. */
  async exportAndRecord(
    run: PendingRun,
    book: PendingBook,
    destination: string,
    overwrite: boolean,
  ): Promise<PendingExportResult> {
    await this.export(book, destination, overwrite);
    try {
      await this.libraries.publish(path.dirname(destination), {
        ...book.entry,
        relativePath: path.basename(destination),
      });
    } catch (cause) {
      return { status: 'catalog_failed', cause };
    }
    try {
      await this.markSaved(run, book, destination);
    } catch (cause) {
      return { status: 'record_failed', cause };
    }
    return { status: 'saved' };
  }

  /** Only a wholly exported run may be removed, after sharing has stopped. */
  async pruneCompleted(): Promise<void> {
    for (const run of await this.list()) {
      if (run.books.every((book) => book.savedPath !== undefined)) {
        await rm(run.path, { recursive: true, force: true });
      }
    }
    // A cancelled or wholly failed run may never have produced a book or catalog.
    for (const child of await readdir(this.root, { withFileTypes: true })) {
      if (!child.isDirectory() || !/^[0-9a-f-]{36}$/iu.test(child.name)) continue;
      const runPath = path.join(this.root, child.name);
      if ((await readdir(runPath)).length === 0)
        await rm(runPath, { recursive: true, force: true });
    }
  }

  /**
   * Removes a run folder that holds no finished book and that nothing has changed for
   * `olderThanMs`: what is left when the app is killed while the first book of a run is being made.
   * Nothing lists such a folder, so nothing else could ever remove it. A newer one may be in the
   * middle of that book, in this app or in another copy of it, and stays.
   */
  async pruneAbandoned(olderThanMs: number, now = Date.now()): Promise<void> {
    const listed = new Set((await this.list()).map((run) => run.id));
    for (const child of await readdir(this.root, { withFileTypes: true })) {
      if (!child.isDirectory() || !/^[0-9a-f-]{36}$/iu.test(child.name)) continue;
      if (listed.has(child.name)) continue;
      const runPath = path.join(this.root, child.name);
      if (now - (await newestChange(runPath)) > olderThanMs) {
        await rm(runPath, { recursive: true, force: true });
      }
    }
  }

  /** Remove only an existing app-owned run; exported copies live outside this root. */
  async discard(id: string): Promise<boolean> {
    const run = (await this.list()).find((candidate) => candidate.id === id);
    if (run === undefined) return false;
    await rm(run.path, { recursive: true });
    return true;
  }

  private async readState(runPath: string): Promise<PendingState> {
    let raw: string;
    try {
      raw = await this.io.readFile(path.join(runPath, '.mangabound', 'pending.json'), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyState;
      throw error;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('version' in parsed) ||
      parsed.version !== 1 ||
      !('saved' in parsed) ||
      typeof parsed.saved !== 'object' ||
      parsed.saved === null ||
      Array.isArray(parsed.saved) ||
      Object.values(parsed.saved).some((value) => typeof value !== 'string')
    ) {
      throw new Error('The pending books record is invalid.');
    }
    return parsed as PendingState;
  }
}
