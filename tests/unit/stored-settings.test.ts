import { describe, expect, it } from 'vitest';

import {
  defaultStoredSettings,
  parseStoredSettings,
  serializeStoredSettings,
  settingsFileVersion,
} from '@/adapters/settings/stored-settings';
import { defaultMangapressSettings } from '@/domain/output-profile';
import { defaultPreferences } from '@/domain/preferences';

const file = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    version: settingsFileVersion,
    mode: 'bind-only',
    format: 'pdf',
    settings: { ...defaultMangapressSettings, deviceProfile: 'KS', upscale: false },
    providerId: 'mangadex',
    outputFolder: '/books',
    lastPickerFolder: '/downloads',
    preferredNetworkInterface: { name: 'Ethernet', address: '192.168.18.39' },
    ...overrides,
  });

describe('parseStoredSettings', () => {
  it('reads everything that is kept', () => {
    expect(parseStoredSettings(file())).toEqual({
      mode: 'bind-only',
      format: 'pdf',
      singleBook: false,
      settings: { ...defaultMangapressSettings, deviceProfile: 'KS', upscale: false },
      providerId: 'mangadex',
      outputFolder: '/books',
      lastPickerFolder: '/downloads',
      preferredNetworkInterface: { name: 'Ethernet', address: '192.168.18.39' },
    });
  });

  it('leaves out the source and the folders when the file has none', () => {
    const parsed = parseStoredSettings(
      file({
        providerId: undefined,
        outputFolder: undefined,
        lastPickerFolder: undefined,
        preferredNetworkInterface: undefined,
      }),
    );

    expect(parsed).toEqual({
      mode: 'bind-only',
      format: 'pdf',
      singleBook: false,
      settings: { ...defaultMangapressSettings, deviceProfile: 'KS', upscale: false },
    });
    expect(parsed).not.toHaveProperty('providerId');
    expect(parsed).not.toHaveProperty('outputFolder');
    expect(parsed).not.toHaveProperty('lastPickerFolder');
    expect(parsed).not.toHaveProperty('preferredNetworkInterface');
  });

  it('drops a title, an author and any key it does not know', () => {
    const parsed = parseStoredSettings(
      file({
        settings: {
          ...defaultMangapressSettings,
          title: 'Smuggled in',
          author: 'Someone',
          somethingNew: true,
        },
        somethingElse: 1,
      }),
    );

    expect(parsed?.settings).toEqual(defaultMangapressSettings);
    expect(parsed).not.toHaveProperty('somethingElse');
  });

  it.each([
    ['not JSON', '{ nope'],
    ['empty', ''],
    ['JSON that is not an object', '[1, 2]'],
    ['a primitive number', '123'],
    ['null', 'null'],
    ['a version this build does not know', file({ version: 2 })],
    ['no version', file({ version: undefined })],
    ['an unknown process', file({ mode: 'convert-twice' })],
    ['an unknown format', file({ format: 'mobi' })],
    [
      'a setting of the wrong kind',
      file({ settings: { ...defaultMangapressSettings, quiet: 'yes' } }),
    ],
    ['a setting that is missing', file({ settings: { deviceProfile: 'KV' } })],
    [
      'a setting out of range',
      file({ settings: { ...defaultMangapressSettings, croppingMinimum: 150 } }),
    ],
    [
      'the custom device without a size',
      file({ settings: { ...defaultMangapressSettings, deviceProfile: 'OTHER' } }),
    ],
    ['an empty folder', file({ outputFolder: '' })],
    ['an empty picker folder', file({ lastPickerFolder: '' })],
    ['an empty source', file({ providerId: '' })],
    [
      'an interface without a name',
      file({ preferredNetworkInterface: { name: '', address: '192.168.18.39' } }),
    ],
    [
      'an interface without an IPv4 address',
      file({ preferredNetworkInterface: { name: 'Ethernet', address: 'not-an-ip' } }),
    ],
  ])('cannot use a file with %s', (_name, raw) => {
    expect(parseStoredSettings(raw)).toBeUndefined();
  });
});

describe('serializeStoredSettings', () => {
  it('writes the version first, and what is kept as readable JSON', () => {
    const text = serializeStoredSettings({
      ...defaultPreferences,
      outputFolder: '/books',
      lastPickerFolder: '/downloads',
      preferredNetworkInterface: { name: 'Ethernet', address: '192.168.18.39' },
    });

    expect(text.endsWith('\n')).toBe(true);
    expect(Object.keys(JSON.parse(text) as object)).toEqual([
      'version',
      'mode',
      'format',
      'singleBook',
      'settings',
      'outputFolder',
      'lastPickerFolder',
      'preferredNetworkInterface',
    ]);
  });

  it('migrates legacy combineIntoOneVolume: true to singleBook: true', () => {
    const legacy = JSON.stringify({
      version: 1,
      mode: 'bind-and-convert',
      format: 'epub',
      combineIntoOneVolume: true,
      settings: defaultMangapressSettings,
    });
    const parsed = parseStoredSettings(legacy);
    expect(parsed?.singleBook).toBe(true);

    const legacyInSettings = JSON.stringify({
      version: 1,
      mode: 'bind-and-convert',
      format: 'epub',
      settings: { ...defaultMangapressSettings, combineIntoOneVolume: true },
    });
    const parsed2 = parseStoredSettings(legacyInSettings);
    expect(parsed2?.singleBook).toBe(true);
  });

  it('persists singleBook: false when turned off after migrating legacy combineIntoOneVolume: true', () => {
    const legacy = JSON.stringify({
      version: 1,
      mode: 'bind-and-convert',
      format: 'epub',
      settings: { ...defaultMangapressSettings, combineIntoOneVolume: true },
    });
    const migrated = parseStoredSettings(legacy);
    expect(migrated?.singleBook).toBe(true);

    const turnedOff = {
      ...migrated!,
      singleBook: false,
    };
    const serialized = serializeStoredSettings(turnedOff);
    const reloaded = parseStoredSettings(serialized);
    expect(reloaded?.singleBook).toBe(false);
    expect(reloaded?.settings.combineIntoOneVolume).toBe(false);
  });

  it('is read back as the same settings', () => {
    const settings = {
      mode: 'convert-only' as const,
      format: 'cbz' as const,
      singleBook: true,
      settings: { ...defaultMangapressSettings, jpegQuality: 70, gamma: 1.2 },
      providerId: 'mangadex',
      outputFolder: 'C:\\Manga',
      lastPickerFolder: 'C:\\Manga\\Downloads',
      preferredNetworkInterface: { name: 'Ethernet', address: '192.168.18.39' },
    };

    expect(parseStoredSettings(serializeStoredSettings(settings))).toEqual(settings);
  });
});

describe('defaultStoredSettings', () => {
  it('is what a first launch has, and holds no folder or source', () => {
    expect(defaultStoredSettings).toEqual(defaultPreferences);
    expect(defaultStoredSettings.outputFolder).toBeUndefined();
  });
});
