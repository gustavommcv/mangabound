import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { toLibraryRelativePath } from '@/library/paths';

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
