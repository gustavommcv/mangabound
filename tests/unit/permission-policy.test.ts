import { describe, expect, it } from 'vitest';

import { isPermissionGranted } from '@/main/permission-policy';

describe('isPermissionGranted', () => {
  it('lets the page write to the clipboard, which the Copy button needs', () => {
    expect(isPermissionGranted('clipboard-sanitized-write')).toBe(true);
  });

  it.each([
    'media',
    'mediaKeySystem',
    'geolocation',
    'notifications',
    'midi',
    'midiSysex',
    'clipboard-read',
    'display-capture',
    'hid',
    'serial',
    'usb',
    'fullscreen',
    'openExternal',
    'pointerLock',
    'idle-detection',
    'window-management',
    'unknown',
    'constructor',
    '',
  ])('refuses %j, and so does every other permission nobody asked for', (permission) => {
    expect(isPermissionGranted(permission)).toBe(false);
  });
});
