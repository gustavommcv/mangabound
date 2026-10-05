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

/** What a file gives, which is all of it only when nothing in it was out of range. */
const settingsIn = (raw: string) => parseStoredSettings(raw)?.settings;
const resetIn = (raw: string) => parseStoredSettings(raw)?.reset;

describe('parseStoredSettings', () => {
  it('reads everything that is kept, with nothing reset', () => {
    expect(resetIn(file())).toEqual([]);
    expect(settingsIn(file())).toEqual({
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

  it('reads a file written before an option existed, with that option off', () => {
    // What a release before the page-layout, image and cover options kept: none of their keys.
    const {
      noKepub,
      smartCoverCrop,
      coverFill,
      noProcessing,
      forceColor,
      colorAutoContrast,
      noQuantize,
      pngLegacy,
      forcePngRgb,
      webtoon,
      noRotate,
      rotateFirst,
      maximizeStrips,
      blackBorders,
      spreadShift,
      onePageLandscape,
      invertDirection,
      ...older
    } = { ...defaultMangapressSettings, deviceProfile: 'KS', upscale: false, stretch: true };
    void [webtoon, noRotate, rotateFirst, maximizeStrips, blackBorders];
    void [spreadShift, onePageLandscape, invertDirection];
    void [noProcessing, forceColor, colorAutoContrast, noQuantize, pngLegacy, forcePngRgb];
    void [noKepub, smartCoverCrop, coverFill];

    const parsed = settingsIn(file({ settings: older }));

    expect(parsed?.settings).toEqual({
      ...defaultMangapressSettings,
      deviceProfile: 'KS',
      upscale: false,
      stretch: true,
    });
  });

  it('leaves out the source and the folders when the file has none', () => {
    const parsed = settingsIn(
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
    const parsed = settingsIn(
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
  ])('cannot use a file that is %s', (_name, raw) => {
    expect(parseStoredSettings(raw)).toBeUndefined();
  });

  describe('keeps what is good when one value is not', () => {
    it('resets an option out of range and keeps everything else, and says which', () => {
      // The audit's case: one field outside its range cost the person format, mode, device and folders.
      const raw = file({
        settings: { ...defaultMangapressSettings, deviceProfile: 'KS', croppingMinimum: 150 },
      });

      const parsed = parseStoredSettings(raw);

      expect(parsed?.reset).toEqual(['cropping minimum']);
      expect(parsed?.settings.mode).toBe('bind-only');
      expect(parsed?.settings.format).toBe('pdf');
      expect(parsed?.settings.outputFolder).toBe('/books');
      expect(parsed?.settings.settings.deviceProfile).toBe('KS');
      expect(parsed?.settings.settings.croppingMinimum).toBe(
        defaultMangapressSettings.croppingMinimum,
      );
    });

    it.each([
      ['a gamma a typo made huge', { gamma: 18 }, 'gamma', 'gamma'],
      ['a cropping power out of range', { croppingPower: 50 }, 'cropping power', 'croppingPower'],
      ['a size no screen has', { customWidth: 1e21 }, 'custom width', 'customWidth'],
      ['an option of the wrong kind', { quiet: 'yes' }, 'quiet', 'quiet'],
      ['a JPEG quality of 0', { jpegQuality: 0 }, 'jpeg quality', 'jpegQuality'],
    ])('resets %s alone', (_name, bad, spoken, field) => {
      const parsed = parseStoredSettings(
        file({ settings: { ...defaultMangapressSettings, deviceProfile: 'KS', ...bad } }),
      );

      expect(parsed?.reset).toEqual([spoken]);
      expect(parsed?.settings.settings.deviceProfile).toBe('KS');
      expect(parsed?.settings.settings).not.toHaveProperty(
        field,
        (bad as Record<string, unknown>)[field],
      );
    });

    it('names every option it reset, in the order of the options', () => {
      const parsed = parseStoredSettings(
        file({
          settings: { ...defaultMangapressSettings, gamma: 99, croppingMinimum: -4, quiet: 3 },
        }),
      );

      expect(parsed?.reset).toEqual(['quiet', 'cropping minimum', 'gamma']);
    });

    it('takes an option that is missing for its default, without calling it reset', () => {
      const parsed = parseStoredSettings(file({ settings: { deviceProfile: 'KV' } }));

      expect(parsed?.reset).toEqual([]);
      expect(parsed?.settings.settings).toEqual({
        ...defaultMangapressSettings,
        deviceProfile: 'KV',
      });
    });

    it('takes a file with no settings at all for the defaults', () => {
      expect(settingsIn(file({ settings: undefined }))?.settings).toEqual(
        defaultMangapressSettings,
      );
      expect(settingsIn(file({ settings: [1] }))?.settings).toEqual(defaultMangapressSettings);
    });

    it('resets the process and the format when the file names one that does not exist', () => {
      const parsed = parseStoredSettings(file({ mode: 'convert-twice', format: 'mobi' }));

      expect(parsed?.reset).toEqual(['mode', 'format']);
      expect(parsed?.settings.mode).toBe(defaultPreferences.mode);
      expect(parsed?.settings.format).toBe(defaultPreferences.format);
    });

    it('resets a folder, a source or a network that cannot be used, and keeps the others', () => {
      const parsed = parseStoredSettings(
        file({
          outputFolder: '',
          lastPickerFolder: '',
          providerId: '',
          preferredNetworkInterface: { name: 'Ethernet', address: 'not-an-ip' },
        }),
      );

      expect(parsed?.reset).toEqual([
        'online source',
        'save folder',
        'last folder',
        'sharing network',
      ]);
      expect(parsed?.settings.mode).toBe('bind-only');
      expect(parsed?.settings).not.toHaveProperty('providerId');
      expect(parsed?.settings).not.toHaveProperty('outputFolder');
      expect(parsed?.settings).not.toHaveProperty('preferredNetworkInterface');
    });

    it('resets a custom device that has no size, with the size, and keeps the rest', () => {
      const parsed = parseStoredSettings(
        file({
          settings: { ...defaultMangapressSettings, deviceProfile: 'OTHER', upscale: true },
        }),
      );

      expect(parsed?.reset).toEqual(['custom device size']);
      expect(parsed?.settings.settings.deviceProfile).toBe(defaultMangapressSettings.deviceProfile);
      expect(parsed?.settings.settings.upscale).toBe(true);
      expect(parsed?.settings.mode).toBe('bind-only');
    });

    it('resets a custom size that is out of range along with the device that needs it', () => {
      const parsed = parseStoredSettings(
        file({
          settings: {
            ...defaultMangapressSettings,
            deviceProfile: 'OTHER',
            customWidth: 800,
            customHeight: 0,
          },
        }),
      );

      expect(parsed?.reset).toEqual(['custom height', 'custom device size']);
      expect(parsed?.settings.settings.deviceProfile).toBe(defaultMangapressSettings.deviceProfile);
      expect(parsed?.settings.settings).not.toHaveProperty('customWidth');
    });
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
    const parsed = settingsIn(legacy);
    expect(parsed?.singleBook).toBe(true);

    const legacyInSettings = JSON.stringify({
      version: 1,
      mode: 'bind-and-convert',
      format: 'epub',
      settings: { ...defaultMangapressSettings, combineIntoOneVolume: true },
    });
    const parsed2 = settingsIn(legacyInSettings);
    expect(parsed2?.singleBook).toBe(true);
  });

  it('persists singleBook: false when turned off after migrating legacy combineIntoOneVolume: true', () => {
    const legacy = JSON.stringify({
      version: 1,
      mode: 'bind-and-convert',
      format: 'epub',
      settings: { ...defaultMangapressSettings, combineIntoOneVolume: true },
    });
    const migrated = settingsIn(legacy);
    expect(migrated?.singleBook).toBe(true);

    const turnedOff = {
      ...migrated!,
      singleBook: false,
    };
    const serialized = serializeStoredSettings(turnedOff);
    const reloaded = settingsIn(serialized);
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

    expect(settingsIn(serializeStoredSettings(settings))).toEqual(settings);
  });
});

describe('defaultStoredSettings', () => {
  it('is what a first launch has, and holds no folder or source', () => {
    expect(defaultStoredSettings).toEqual(defaultPreferences);
    expect(defaultStoredSettings.outputFolder).toBeUndefined();
  });
});
