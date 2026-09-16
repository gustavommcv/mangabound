import { describe, expect, it } from 'vitest';

import { startSharingCommandSchema } from '@/shared/opds-contract';

describe('startSharingCommandSchema', () => {
  it('accepts a valid token-mode command', () => {
    expect(
      startSharingCommandSchema.safeParse({
        libraryId: 'library',
        interfaceAddress: '127.0.0.1',
        auth: { mode: 'token' },
      }).success,
    ).toBe(true);
  });

  it('accepts a valid basic-mode command', () => {
    expect(
      startSharingCommandSchema.safeParse({
        libraryId: 'library',
        interfaceAddress: '127.0.0.1',
        auth: { mode: 'basic', username: 'reader', password: 'hunter2' },
      }).success,
    ).toBe(true);
  });

  it('rejects a basic-mode command missing credentials', () => {
    expect(
      startSharingCommandSchema.safeParse({
        libraryId: 'library',
        interfaceAddress: '127.0.0.1',
        auth: { mode: 'basic' },
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown auth mode', () => {
    expect(
      startSharingCommandSchema.safeParse({
        libraryId: 'library',
        interfaceAddress: '127.0.0.1',
        auth: { mode: 'oauth' },
      }).success,
    ).toBe(false);
  });

  it('rejects a missing interface address or library id', () => {
    expect(
      startSharingCommandSchema.safeParse({
        interfaceAddress: '127.0.0.1',
        auth: { mode: 'token' },
      }).success,
    ).toBe(false);
    expect(
      startSharingCommandSchema.safeParse({
        libraryId: 'library',
        auth: { mode: 'token' },
      }).success,
    ).toBe(false);
  });
});
