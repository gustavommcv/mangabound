import { mkdir, readdir, rename, rmdir, stat } from 'node:fs/promises';
import path from 'node:path';

/** What moving the app's data out of its old folder needs from the file system. */
export interface LegacyStorageFileSystem {
  readonly exists: (target: string) => Promise<boolean>;
  readonly makeDirectory: (target: string) => Promise<void>;
  readonly listNames: (directory: string) => Promise<readonly string[]>;
  readonly rename: (from: string, to: string) => Promise<void>;
  /** Removes a folder only if nothing is in it; says nothing when it cannot. */
  readonly removeIfEmpty: (directory: string) => Promise<void>;
}

export const nodeLegacyStorageFileSystem: LegacyStorageFileSystem = {
  exists: async (target) => {
    try {
      await stat(target);
      return true;
    } catch {
      return false;
    }
  },
  makeDirectory: async (target) => {
    await mkdir(target, { recursive: true });
  },
  listNames: (directory) => readdir(directory),
  rename,
  removeIfEmpty: async (directory) => {
    try {
      await rmdir(directory);
    } catch {
      // Not empty, or not ours to remove: either way it stays.
    }
  },
};

/**
 * Moves the folders the app keeps its own data in (pending books, covers) from where an earlier
 * version put them to where they belong now, once. A folder that is not at the old place is left
 * alone; one that is moves whole when the new place has none, and entry by entry when it has, never
 * replacing an entry that is already there. Nothing here stops the app from starting: a folder that
 * cannot be moved is reported and left where it is.
 */
export async function moveLegacyStorage({
  from,
  to,
  folders,
  fileSystem = nodeLegacyStorageFileSystem,
  onProblem,
}: {
  readonly from: string;
  readonly to: string;
  readonly folders: readonly string[];
  readonly fileSystem?: LegacyStorageFileSystem;
  readonly onProblem: (message: string, cause: unknown) => void;
}): Promise<void> {
  // Windows takes names that differ only in case for the same folder, which is where this runs.
  if (path.resolve(from).toLowerCase() === path.resolve(to).toLowerCase()) return;
  for (const folder of folders) {
    const source = path.join(from, folder);
    const destination = path.join(to, folder);
    try {
      if (!(await fileSystem.exists(source))) continue;
      await fileSystem.makeDirectory(to);
      if (!(await fileSystem.exists(destination))) {
        await fileSystem.rename(source, destination);
        continue;
      }
      for (const name of await fileSystem.listNames(source)) {
        const target = path.join(destination, name);
        if (await fileSystem.exists(target)) {
          onProblem(
            `${path.join(source, name)} was left where it is: ${target} already exists.`,
            undefined,
          );
          continue;
        }
        await fileSystem.rename(path.join(source, name), target);
      }
      await fileSystem.removeIfEmpty(source);
    } catch (error) {
      onProblem(`Could not move ${source} to ${destination}.`, error);
    }
  }
}
