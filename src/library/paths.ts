import path from 'node:path';

import { LibraryIndexError } from './manifest';

/**
 * Whether `file` is below `root`, both as they are written. A `..`, a drive or a separator of this
 * platform cannot get out, while a file whose name merely starts with two dots stays in. Where a
 * link on the way leads is not looked at: that takes the file system (see `realpath`).
 */
export function isInsideLibrary(root: string, file: string): boolean {
  const inside = path.relative(root, file);
  return !(
    inside === '' ||
    inside === '..' ||
    inside.startsWith(`..${path.sep}`) ||
    // Another drive: there is no way to write the path relative to the root.
    path.isAbsolute(inside)
  );
}

export function toLibraryRelativePath(libraryRoot: string, artifactPath: string): string {
  const root = path.resolve(libraryRoot);
  const artifact = path.resolve(artifactPath);
  if (!isInsideLibrary(root, artifact)) {
    throw new LibraryIndexError(
      'path_outside_library',
      'The converted file is not inside the selected library.',
    );
  }
  return path.relative(root, artifact).split(path.sep).join('/');
}

/**
 * Where a catalog entry's file is, or `undefined` when the entry names a place outside the library.
 * Checked on the resolved path (see `isInsideLibrary`); a link inside the library is not followed
 * here, so whoever opens the file checks the real path too.
 */
export function resolveLibraryFile(libraryRoot: string, relativePath: string): string | undefined {
  const root = path.resolve(libraryRoot);
  const file = path.resolve(root, ...relativePath.split('/'));
  return isInsideLibrary(root, file) ? file : undefined;
}
