import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { writeFileAtomically, type AtomicWriteDeps } from '@/adapters/fs/write-file-atomically';
import type {
  CoverImage,
  CoverSourcePort,
  CoverStorePort,
  StoredCover,
} from '@/application/ports/cover-store';
import { type CoverOrigin, type CoverSlot, isCoverImage } from '@/domain/book-covers';

const indexSchema = z.object({
  version: z.literal(1),
  /** The item the folder is for, as a person would read it; the folder's name is its hash. */
  item: z.string(),
  covers: z.record(
    z.string(),
    z.object({
      file: z.string().min(1),
      name: z.string().min(1),
      origin: z.enum(['chosen', 'folder']),
    }),
  ),
});

type CoverIndex = z.infer<typeof indexSchema>;

const indexFile = 'covers.json';

export interface FsCoverStoreDeps extends AtomicWriteDeps {
  readonly readFile: (filePath: string, encoding: 'utf8') => Promise<string>;
  readonly mkdir: (
    directoryPath: string,
    options: { readonly recursive: true },
  ) => Promise<string | undefined>;
  readonly copyFile: (from: string, to: string) => Promise<void>;
  readonly isFile: (filePath: string) => Promise<boolean>;
  /** The names of the files directly inside a folder, or undefined when it is not a folder. */
  readonly filesIn: (directoryPath: string) => Promise<readonly string[] | undefined>;
  readonly removeDirectory: (directoryPath: string) => Promise<void>;
  readonly createId: () => string;
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function filesIn(directoryPath: string): Promise<readonly string[] | undefined> {
  try {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch {
    return undefined;
  }
}

const slotKey = (slot: CoverSlot): string => String(slot);

/** A volume's number as it was written (`3`, `3.5`, `0`), or the one book; anything else is not a key. */
function slotOf(key: string): CoverSlot | undefined {
  if (key === 'book') return 'book';
  const volume = Number(key);
  return Number.isFinite(volume) && volume >= 0 && String(volume) === key ? volume : undefined;
}

/** The one book first, then the volumes by number. */
const rank = (cover: StoredCover): number => (cover.slot === 'book' ? -1 : cover.slot);
const bySlot = (left: StoredCover, right: StoredCover): number => rank(left) - rank(right);

/**
 * Covers kept as files of the app's own, beside its pending books: a folder for each item, named
 * by a hash of the item's path, holding a copy of every image and an index of which book each is
 * for. The originals can be moved or deleted afterwards.
 */
export class FsCoverStore implements CoverStorePort, CoverSourcePort {
  private readonly io: FsCoverStoreDeps;

  constructor(
    readonly root: string,
    deps: Partial<FsCoverStoreDeps> = {},
  ) {
    this.io = {
      readFile: deps.readFile ?? readFile,
      writeFile: deps.writeFile ?? writeFile,
      rename: deps.rename ?? rename,
      rm: deps.rm ?? rm,
      mkdir: deps.mkdir ?? mkdir,
      copyFile: deps.copyFile ?? copyFile,
      isFile: deps.isFile ?? isFile,
      filesIn: deps.filesIn ?? filesIn,
      removeDirectory:
        deps.removeDirectory ??
        ((directoryPath) => rm(directoryPath, { recursive: true, force: true })),
      createId: deps.createId ?? randomUUID,
      createTempSuffix: deps.createTempSuffix ?? randomUUID,
    };
  }

  async list(itemPath: string): Promise<readonly StoredCover[]> {
    const directory = this.directoryOf(itemPath);
    const index = await this.readIndex(directory);
    const covers: StoredCover[] = [];
    for (const [key, entry] of Object.entries(index.covers)) {
      const slot = slotOf(key);
      // An entry that names anything but a file of this folder is not one this store wrote.
      if (slot === undefined || path.basename(entry.file) !== entry.file) continue;
      const coverPath = path.join(directory, entry.file);
      if (!(await this.io.isFile(coverPath))) continue;
      covers.push({ slot, name: entry.name, origin: entry.origin, path: coverPath });
    }
    return covers.sort(bySlot);
  }

  async attach(
    itemPath: string,
    cover: { readonly slot: CoverSlot; readonly origin: CoverOrigin; readonly sourcePath: string },
  ): Promise<void> {
    const directory = this.directoryOf(itemPath);
    await this.io.mkdir(directory, { recursive: true });
    const key = slotKey(cover.slot);
    const file = `${key}-${this.io.createId()}${path.extname(cover.sourcePath).toLowerCase()}`;
    await this.io.copyFile(cover.sourcePath, path.join(directory, file));
    const index = await this.readIndex(directory);
    const previous = index.covers[key];
    try {
      await this.writeIndex(directory, {
        version: 1,
        item: path.resolve(itemPath),
        covers: {
          ...index.covers,
          [key]: { file, name: path.basename(cover.sourcePath), origin: cover.origin },
        },
      });
    } catch (error) {
      // The copy is not a cover until the index says so; a failed save leaves none behind.
      await this.io.rm(path.join(directory, file), { force: true }).catch(() => undefined);
      throw error;
    }
    if (previous !== undefined && path.basename(previous.file) === previous.file) {
      await this.io.rm(path.join(directory, previous.file), { force: true }).catch(() => undefined);
    }
  }

  async remove(itemPath: string, slot: CoverSlot): Promise<void> {
    const directory = this.directoryOf(itemPath);
    const index = await this.readIndex(directory);
    const key = slotKey(slot);
    const { [key]: removed, ...rest } = index.covers;
    if (removed === undefined) return;
    if (Object.keys(rest).length === 0) {
      await this.io.removeDirectory(directory);
      return;
    }
    await this.writeIndex(directory, { ...index, covers: rest });
    if (path.basename(removed.file) === removed.file) {
      await this.io.rm(path.join(directory, removed.file), { force: true }).catch(() => undefined);
    }
  }

  async imagesIn(paths: readonly string[]): Promise<readonly CoverImage[]> {
    const images: CoverImage[] = [];
    for (const candidate of paths) {
      const inside = await this.io.filesIn(candidate);
      if (inside !== undefined) {
        for (const name of inside) {
          if (isCoverImage(name)) images.push({ path: path.join(candidate, name), name });
        }
      } else if (isCoverImage(path.basename(candidate)) && (await this.io.isFile(candidate))) {
        images.push({ path: candidate, name: path.basename(candidate) });
      }
    }
    return images;
  }

  private directoryOf(itemPath: string): string {
    const hash = createHash('sha256').update(path.resolve(itemPath)).digest('hex');
    return path.join(this.root, hash.slice(0, 32));
  }

  /** A folder with no index, or one that cannot be used, holds no covers. */
  private async readIndex(directory: string): Promise<CoverIndex> {
    try {
      const raw: unknown = JSON.parse(
        await this.io.readFile(path.join(directory, indexFile), 'utf8'),
      );
      const parsed = indexSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
    } catch {
      // Falls through to the empty index.
    }
    return { version: 1, item: '', covers: {} };
  }

  private writeIndex(directory: string, index: CoverIndex): Promise<void> {
    return writeFileAtomically(
      path.join(directory, indexFile),
      `${JSON.stringify(index, null, 2)}\n`,
      this.io,
    );
  }
}
