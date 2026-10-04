import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';

/** What a read gives, or `fallback` when what it reads was removed while the walk was under way. */
async function unlessVanished<T>(read: Promise<T>, fallback: T): Promise<T> {
  try {
    return await read;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
}

/**
 * When anything in a folder was last changed: the latest of its own time and of everything below
 * it. A folder's own time does not move when a file deep inside is written, so a conversion in
 * the middle of a book would look untouched by it. A link is looked at, not followed, so a walk
 * cannot leave the folder or loop; something that vanishes while it is being read counts for
 * nothing.
 */
export async function newestChange(target: string): Promise<number> {
  const details = await unlessVanished(lstat(target), undefined);
  if (details === undefined) return 0;
  let newest = details.mtimeMs;
  if (!details.isDirectory()) return newest;
  for (const name of await unlessVanished(readdir(target), [])) {
    newest = Math.max(newest, await newestChange(path.join(target, name)));
  }
  return newest;
}
