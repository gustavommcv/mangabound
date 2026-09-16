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
