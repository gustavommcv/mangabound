import { describe, expect, it } from 'vitest';

import { encodeRelativePath } from '@/opds/links';

describe('encodeRelativePath', () => {
  it('percent-encodes each path segment independently', () => {
    expect(encodeRelativePath('A Quiet Journey/Vol. 01.epub')).toBe(
      'A%20Quiet%20Journey/Vol.%2001.epub',
    );
  });

  it('leaves a single-segment path with no special characters untouched', () => {
    expect(encodeRelativePath('book.epub')).toBe('book.epub');
  });
});
