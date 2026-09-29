import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { pendingRoot } from '@/adapters/library/pending-path';

describe('pendingRoot', () => {
  it('allows an isolated absolute root for packaged testing', () => {
    const isolated = path.resolve('isolated');
    expect(pendingRoot('win32', { MANGABOUND_PENDING_ROOT: isolated }, 'C:\\Users\\person')).toBe(
      isolated,
    );
  });
  it('uses local app data on Windows, not roaming settings or temp', () => {
    const localAppData = path.resolve('local-app-data');
    expect(pendingRoot('win32', { LOCALAPPDATA: localAppData }, 'C:\\Users\\person')).toBe(
      path.join(localAppData, 'Mangabound', 'Pending'),
    );
    expect(pendingRoot('win32', {}, 'C:\\Users\\person')).toBe(
      path.join('C:\\Users\\person', 'AppData', 'Local', 'Mangabound', 'Pending'),
    );
    expect(pendingRoot('win32', { LOCALAPPDATA: 'relative' }, 'C:\\Users\\person')).toBe(
      path.join('C:\\Users\\person', 'AppData', 'Local', 'Mangabound', 'Pending'),
    );
  });

  it('uses application support on macOS', () => {
    expect(pendingRoot('darwin', {}, '/Users/person')).toBe(
      path.join('/Users/person', 'Library', 'Application Support', 'Mangabound', 'Pending'),
    );
  });

  it('accepts only an absolute XDG data home on Linux', () => {
    expect(pendingRoot('linux', { XDG_DATA_HOME: '/data' }, '/home/person')).toBe(
      path.join('/data', 'mangabound', 'pending'),
    );
    expect(pendingRoot('linux', { XDG_DATA_HOME: 'relative' }, '/home/person')).toBe(
      path.join('/home/person', '.local', 'share', 'mangabound', 'pending'),
    );
    expect(pendingRoot('linux', {}, '/home/person')).toBe(
      path.join('/home/person', '.local', 'share', 'mangabound', 'pending'),
    );
  });
});
