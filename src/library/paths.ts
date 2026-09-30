import path from 'node:path';

import { LibraryIndexError } from './manifest';

export function toLibraryRelativePath(libraryRoot: string, artifactPath: string): string {
  const relative = path.relative(path.resolve(libraryRoot), path.resolve(artifactPath));
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new LibraryIndexError(
      'path_outside_library',
      'The converted file is not inside the selected library.',
    );
  }
  return relative.split(path.sep).join('/');
}

/**
 * Where a catalog entry's file is, or `undefined` when the entry names a place outside the library.
 * Checked on the resolved path, so a `..`, a drive or a separator of this platform cannot get out,
 * while a file whose name merely starts with two dots stays in.
 */
export function resolveLibraryFile(libraryRoot: string, relativePath: string): string | undefined {
  const root = path.resolve(libraryRoot);
  const file = path.resolve(root, ...relativePath.split('/'));
  const inside = path.relative(root, file);
  const outside =
    inside === '' ||
    inside === '..' ||
    inside.startsWith(`..${path.sep}`) ||
    // Another drive: there is no way to write the path relative to the root.
    path.isAbsolute(inside);
  return outside ? undefined : file;
}
