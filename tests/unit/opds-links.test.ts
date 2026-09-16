import { describe, expect, it } from 'vitest';

import { encodeRelativePath, withToken } from '@/opds/links';

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

describe('withToken', () => {
  it('returns the href unchanged when no token is given', () => {
    expect(withToken('http://host/recent', undefined)).toBe('http://host/recent');
  });

  it('appends the token with a question mark when the href has no query string', () => {
    expect(withToken('http://host/recent', 'abc123')).toBe('http://host/recent?token=abc123');
  });

  it('appends the token with an ampersand when the href already has a query string', () => {
    expect(withToken('http://host/recent?foo=bar', 'abc123')).toBe(
      'http://host/recent?foo=bar&token=abc123',
    );
  });

  it('percent-encodes a token containing reserved URL characters', () => {
    expect(withToken('http://host/recent', 'a+b/c')).toBe('http://host/recent?token=a%2Bb%2Fc');
  });
});
