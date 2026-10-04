import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { coversRoot, legacyStorageMove, pendingRoot } from '@/adapters/library/pending-path';

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
      path.join(localAppData, 'Mangabound Data', 'Pending'),
    );
    expect(pendingRoot('win32', {}, 'C:\\Users\\person')).toBe(
      path.join('C:\\Users\\person', 'AppData', 'Local', 'Mangabound Data', 'Pending'),
    );
    expect(pendingRoot('win32', { LOCALAPPDATA: 'relative' }, 'C:\\Users\\person')).toBe(
      path.join('C:\\Users\\person', 'AppData', 'Local', 'Mangabound Data', 'Pending'),
    );
  });

  it('ignores a root chosen by the environment that is not an absolute path', () => {
    expect(pendingRoot('linux', { MANGABOUND_PENDING_ROOT: 'relative' }, '/home/person')).toBe(
      path.join('/home/person', '.local', 'share', 'mangabound', 'pending'),
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

describe('coversRoot', () => {
  it('sits beside the pending books, named the way each platform names that folder', () => {
    const localAppData = path.resolve('local-app-data');
    expect(coversRoot('win32', { LOCALAPPDATA: localAppData }, 'C:\\Users\\person')).toBe(
      path.join(localAppData, 'Mangabound Data', 'Covers'),
    );
    expect(coversRoot('darwin', {}, '/Users/person')).toBe(
      path.join('/Users/person', 'Library', 'Application Support', 'Mangabound', 'Covers'),
    );
    expect(coversRoot('linux', { XDG_DATA_HOME: '/data' }, '/home/person')).toBe(
      path.join('/data', 'mangabound', 'covers'),
    );
    expect(coversRoot('freebsd', {}, '/home/person')).toBe(
      path.join('/home/person', '.local', 'share', 'mangabound', 'covers'),
    );
  });

  it('allows an isolated absolute root of its own, and does not follow the pending one', () => {
    const isolated = path.resolve('isolated-covers');
    expect(coversRoot('linux', { MANGABOUND_COVERS_ROOT: isolated }, '/home/person')).toBe(
      isolated,
    );
    expect(coversRoot('linux', { MANGABOUND_COVERS_ROOT: 'relative' }, '/home/person')).toBe(
      path.join('/home/person', '.local', 'share', 'mangabound', 'covers'),
    );
    expect(
      coversRoot('linux', { MANGABOUND_PENDING_ROOT: path.resolve('elsewhere') }, '/home/person'),
    ).toBe(path.join('/home/person', '.local', 'share', 'mangabound', 'covers'));
  });
});

describe('legacyStorageMove', () => {
  const home = 'C:\\Users\\person';
  const localAppData = path.resolve('local-app-data');

  it('says to move pending books and covers out of the installer’s folder on Windows', () => {
    expect(legacyStorageMove('win32', { LOCALAPPDATA: localAppData }, home)).toEqual({
      from: path.join(localAppData, 'Mangabound'),
      to: path.join(localAppData, 'Mangabound Data'),
      folders: ['Pending', 'Covers'],
    });
  });

  it('finds local app data under the home folder when the environment does not say', () => {
    expect(legacyStorageMove('win32', {}, home)).toMatchObject({
      from: path.join(home, 'AppData', 'Local', 'Mangabound'),
      to: path.join(home, 'AppData', 'Local', 'Mangabound Data'),
    });
    expect(legacyStorageMove('win32', { LOCALAPPDATA: 'relative' }, home)).toMatchObject({
      from: path.join(home, 'AppData', 'Local', 'Mangabound'),
    });
  });

  it('has nothing to move where there never was an installer folder', () => {
    expect(legacyStorageMove('darwin', {}, '/Users/person')).toBeUndefined();
    expect(legacyStorageMove('linux', {}, '/home/person')).toBeUndefined();
  });

  it('has nothing to move when the pending root is chosen by the environment', () => {
    expect(
      legacyStorageMove('win32', { MANGABOUND_PENDING_ROOT: path.resolve('isolated') }, home),
    ).toBeUndefined();
    // A root that is not absolute is not a choice: it is ignored, as the root itself ignores it.
    expect(legacyStorageMove('win32', { MANGABOUND_PENDING_ROOT: 'relative' }, home)).toBeDefined();
  });

  it('leaves the covers out when their root is chosen by the environment', () => {
    expect(
      legacyStorageMove(
        'win32',
        { LOCALAPPDATA: localAppData, MANGABOUND_COVERS_ROOT: path.resolve('covers') },
        home,
      )?.folders,
    ).toEqual(['Pending']);
    expect(
      legacyStorageMove(
        'win32',
        { LOCALAPPDATA: localAppData, MANGABOUND_COVERS_ROOT: 'relative' },
        home,
      )?.folders,
    ).toEqual(['Pending', 'Covers']);
  });
});
