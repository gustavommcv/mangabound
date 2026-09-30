import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveLibraryFile, toLibraryRelativePath } from '@/library/paths';

describe('toLibraryRelativePath', () => {
  it('returns a forward-slash relative path for a nested subdirectory', () => {
    const root = path.resolve('/library');
    const artifact = path.join(root, 'A Quiet Journey', 'Vol.01.epub');

    expect(toLibraryRelativePath(root, artifact)).toBe('A Quiet Journey/Vol.01.epub');
  });

  it('normalizes the current platform separators to forward slashes', () => {
    const root = path.resolve('/library');
    const artifact = ['sub', 'folder', 'book.cbz'].reduce(
      (current, segment) => path.join(current, segment),
      root,
    );

    expect(toLibraryRelativePath(root, artifact)).toBe('sub/folder/book.cbz');
  });

  it('throws path_outside_library when the artifact is outside the library root', () => {
    const root = path.resolve('/library');
    const outside = path.resolve('/elsewhere/book.epub');

    expect(() => toLibraryRelativePath(root, outside)).toThrowError(
      expect.objectContaining({ code: 'path_outside_library' }),
    );
  });

  it('throws path_outside_library when the artifact path is the library root itself', () => {
    const root = path.resolve('/library');

    expect(() => toLibraryRelativePath(root, root)).toThrowError(
      expect.objectContaining({ code: 'path_outside_library' }),
    );
  });
});

describe('resolveLibraryFile', () => {
  const root = path.resolve('/library');

  it('finds a file below the library, however deep', () => {
    expect(resolveLibraryFile(root, 'A Quiet Journey/Vol.01.epub')).toBe(
      path.join(root, 'A Quiet Journey', 'Vol.01.epub'),
    );
  });

  it('keeps a file whose name merely starts with two dots', () => {
    expect(resolveLibraryFile(root, '..hidden.epub')).toBe(path.join(root, '..hidden.epub'));
  });

  it('allows a step up that stays below the library', () => {
    expect(resolveLibraryFile(root, 'a/../b.epub')).toBe(path.join(root, 'b.epub'));
  });

  it.each(['..', '../outside.epub', 'a/../../outside.epub', 'a/b/../../../outside.epub'])(
    'refuses %j, which leaves the library',
    (relativePath) => {
      expect(resolveLibraryFile(root, relativePath)).toBeUndefined();
    },
  );

  it('refuses the library folder itself', () => {
    expect(resolveLibraryFile(root, '')).toBeUndefined();
    expect(resolveLibraryFile(root, '.')).toBeUndefined();
  });

  it.runIf(process.platform === 'win32')(
    'refuses a path written with this platform’s own separator, or on another drive',
    () => {
      expect(resolveLibraryFile('C:\\library', '..\\outside.epub')).toBeUndefined();
      expect(resolveLibraryFile('C:\\library', 'D:/outside.epub')).toBeUndefined();
    },
  );
});
