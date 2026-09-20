import { describe, expect, it } from 'vitest';

import { catalogAddress } from '@/renderer/lib/sharing';

describe('catalogAddress', () => {
  it('has no address while nothing is shared', () => {
    expect(catalogAddress({ active: false })).toBeUndefined();
  });

  it('has none while sharing is on but the server has not said where', () => {
    expect(catalogAddress({ active: true, authMode: 'token' })).toBeUndefined();
  });

  it('carries the token, so one paste is enough for the reader', () => {
    expect(
      catalogAddress({
        active: true,
        url: 'http://192.168.1.24:8080/opds',
        authMode: 'token',
        token: 'abc123',
      }),
    ).toBe('http://192.168.1.24:8080/opds/?token=abc123');
  });

  it('is the plain address when the catalog asks for a name and password instead', () => {
    expect(
      catalogAddress({ active: true, url: 'http://192.168.1.24:8080', authMode: 'basic' }),
    ).toBe('http://192.168.1.24:8080');
  });

  it('is the plain address when a token was promised but is missing', () => {
    expect(
      catalogAddress({ active: true, url: 'http://192.168.1.24:8080', authMode: 'token' }),
    ).toBe('http://192.168.1.24:8080');
  });
});
