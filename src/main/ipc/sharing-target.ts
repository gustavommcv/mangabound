import path from 'node:path';

/** What a share serves: the folder, the name the reader shows for it, and what kind of books it is. */
export interface SharingTarget {
  readonly path: string;
  readonly title: string;
  /** Every book that is ready to be saved, from all the pending conversions, and not one folder. */
  readonly readyBooks: boolean;
}

/**
 * What to serve when a library is shared. A pending conversion is asked for by its own folder, but
 * the books ready to be saved are all of them, and a person who shares them expects the book
 * converted next to arrive too: so a pending conversion stands for the folder that holds them
 * all. Any other folder is served as it is, under its own name.
 */
export function sharingTarget(libraryPath: string, pendingRoot: string | undefined): SharingTarget {
  if (
    pendingRoot !== undefined &&
    path.dirname(path.resolve(libraryPath)) === path.resolve(pendingRoot)
  ) {
    return { path: pendingRoot, title: 'Mangabound ready books', readyBooks: true };
  }
  return { path: libraryPath, title: path.basename(libraryPath), readyBooks: false };
}
