import { describe, expect, it } from 'vitest';

import { startSharingCommandSchema } from '@/shared/opds-contract';

describe('startSharingCommandSchema', () => {
  it('accepts a command with no credentials, which shares with no authentication', () => {
    expect(
      startSharingCommandSchema.safeParse({
        libraryId: 'library',
        interfaceAddress: '127.0.0.1',
        auth: { username: '', password: '' },
      }).success,
    ).toBe(true);
  });

  it('accepts a command with a username and password', () => {
    expect(
      startSharingCommandSchema.safeParse({
        libraryId: 'library',
        interfaceAddress: '127.0.0.1',
        auth: { username: 'reader', password: 'hunter2' },
      }).success,
    ).toBe(true);
  });

  it('rejects auth missing the username or password fields entirely', () => {
    expect(
      startSharingCommandSchema.safeParse({
        libraryId: 'library',
        interfaceAddress: '127.0.0.1',
        auth: { username: 'reader' },
      }).success,
    ).toBe(false);
  });

  it('rejects a missing interface address or library id', () => {
    expect(
      startSharingCommandSchema.safeParse({
        interfaceAddress: '127.0.0.1',
        auth: { username: '', password: '' },
      }).success,
    ).toBe(false);
    expect(
      startSharingCommandSchema.safeParse({
        libraryId: 'library',
        auth: { username: '', password: '' },
      }).success,
    ).toBe(false);
  });
});
