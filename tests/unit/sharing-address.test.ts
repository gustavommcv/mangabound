import { describe, expect, it } from 'vitest';

import { catalogAddress } from '@/renderer/lib/sharing';

describe('catalogAddress', () => {
  it('has no address while nothing is shared', () => {
    expect(catalogAddress({ active: false })).toBeUndefined();
  });

  it('has none while sharing is on but the server has not said where', () => {
    expect(catalogAddress({ active: true })).toBeUndefined();
  });

  it('is the plain address the server gave, with no credentials in it', () => {
    expect(catalogAddress({ active: true, url: 'http://192.168.1.24:8080' })).toBe(
      'http://192.168.1.24:8080',
    );
  });
});
