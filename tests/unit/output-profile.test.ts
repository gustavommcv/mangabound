import { describe, expect, it } from 'vitest';

import {
  defaultMangapressSettings,
  defaultUpscaleFor,
  defaultValueForSetting,
  FORMATS_SUPPORTING_COMBINED_VOLUME,
  resolveDeviceProfileFallback,
  restoreSettingDefault,
  validateMangapressSettings,
  withDeviceProfile,
} from '@/domain/output-profile';

describe('mangapress default settings', () => {
  it('start in the state Kindle Comic Converter opens in', () => {
    expect(defaultMangapressSettings).toMatchObject({
      // On by default in KCC's window.
      mangaStyle: true,
      splitter: 'both',
      upscale: true,
      cropping: 'margins-and-page-numbers',
      croppingPower: 1,
      // Off, or automatic, by default.
      quiet: false,
      croppingMinimum: 0,
      preserveMargin: 0,
      stretch: false,
      wallpaper: false,
      whiteBorders: false,
      forcePng: false,
      rotateRight: false,
      autoLevel: false,
      noAutoContrast: false,
      interPanelCrop: 'disabled',
      eraseRainbow: false,
      keepComicInfo: false,
    });
    // Left to the device profile, as in KCC.
    expect(defaultMangapressSettings.gamma).toBeUndefined();
    expect(defaultMangapressSettings.jpegQuality).toBeUndefined();
    expect(validateMangapressSettings(defaultMangapressSettings, 'epub')).toEqual([]);
  });

  it('start on the Kindle Paperwhite KCC opens on, with the upscaling that device starts with', () => {
    expect(defaultMangapressSettings.deviceProfile).toBe('KPW6');
    // The two must agree, or the first device change would already flip the option.
    expect(defaultMangapressSettings.upscale).toBe(
      defaultUpscaleFor(defaultMangapressSettings.deviceProfile),
    );
  });

  it.each(['KV', 'KPW5', 'KPW6', 'KO', 'KCS', 'KoAO', 'KoLC', 'Rmk2', 'RmkPPMove'])(
    'starts upscaling on for %s, as KCC does',
    (code) => {
      expect(defaultUpscaleFor(code)).toBe(true);
    },
  );

  it.each([
    'K1',
    'K2',
    'K34',
    'K57',
    'K810',
    'KDX',
    'KPW',
    'KS',
    'KS1240',
    'KS1324',
    'KS1860',
    'KS1920',
    'KS3',
    'KSCS',
    'KoA',
    'KoG',
    'KoGHD',
    'KoMT',
    'OTHER',
  ])('starts upscaling off for %s, as KCC does', (code) => {
    expect(defaultUpscaleFor(code)).toBe(false);
  });

  it('starts upscaling on for a device this list has never heard of', () => {
    expect(defaultUpscaleFor('A-FUTURE-READER')).toBe(true);
  });

  it('resets upscaling, and only upscaling, when another device is chosen', () => {
    const edited = {
      ...defaultMangapressSettings,
      mangaStyle: false,
      splitter: 'rotate' as const,
      gamma: 1.2,
      upscale: true,
    };

    expect(withDeviceProfile(edited, 'KS')).toEqual({
      ...edited,
      deviceProfile: 'KS',
      upscale: false,
    });
    // A device that upscales by default turns it back on, even if it was switched off.
    expect(withDeviceProfile({ ...edited, upscale: false }, 'KoAO')).toEqual({
      ...edited,
      deviceProfile: 'KoAO',
      upscale: true,
    });
  });

  it('uses the current device for the upscale default and the app defaults for other fields', () => {
    const scribe = withDeviceProfile(defaultMangapressSettings, 'KS');
    expect(defaultValueForSetting(scribe, 'upscale')).toBe(false);
    expect(defaultValueForSetting(defaultMangapressSettings, 'upscale')).toBe(true);
    expect(defaultValueForSetting(scribe, 'gamma')).toBeUndefined();
    expect(defaultValueForSetting(scribe, 'mangaStyle')).toBe(true);
  });

  it('restores one field without changing its neighbors, except the device-upscale pair', () => {
    const edited = {
      ...withDeviceProfile(defaultMangapressSettings, 'KS'),
      gamma: 1.2,
      quiet: true,
      upscale: true,
    };
    expect(restoreSettingDefault(edited, 'gamma')).toEqual({ ...edited, gamma: undefined });
    expect(restoreSettingDefault(edited, 'upscale')).toEqual({ ...edited, upscale: false });
    expect(restoreSettingDefault(edited, 'deviceProfile')).toEqual({
      ...edited,
      deviceProfile: 'KPW6',
      upscale: true,
    });
  });
});

describe('resolving a device profile fallback', () => {
  const paperwhite = { code: 'KPW6', name: 'Kindle Paperwhite 6' };
  const scribe = { code: 'KS', name: 'Kindle Scribe 1/2' };

  it('needs no fallback while the list has not loaded', () => {
    expect(resolveDeviceProfileFallback('KPW6', [])).toBeUndefined();
  });

  it('needs no fallback when the chosen profile is offered', () => {
    expect(resolveDeviceProfileFallback('KS', [paperwhite, scribe])).toBeUndefined();
  });

  it('falls back to the default profile when it is offered', () => {
    expect(resolveDeviceProfileFallback('K999', [scribe, paperwhite])).toEqual(paperwhite);
  });

  it('falls back to the first offered profile when the default is not offered', () => {
    expect(resolveDeviceProfileFallback('KPW6', [scribe])).toEqual(scribe);
  });
});

describe('mangapress output settings', () => {
  it('accepts the defaults and complete custom-device overrides', () => {
    expect(validateMangapressSettings(defaultMangapressSettings, 'epub')).toEqual([]);
    expect(
      validateMangapressSettings(
        {
          ...defaultMangapressSettings,
          deviceProfile: 'OTHER',
          customWidth: 1200,
          customHeight: 1600,
          croppingMinimum: 100,
          preserveMargin: 100,
          jpegQuality: 100,
          gamma: 1,
        },
        'epub',
      ),
    ).toEqual([]);
  });

  it('reports empty, non-finite, and out-of-range values by field', () => {
    const issues = validateMangapressSettings(
      {
        ...defaultMangapressSettings,
        deviceProfile: ' ',
        croppingPower: Number.NaN,
        croppingMinimum: -1,
        preserveMargin: 101,
        jpegQuality: 0,
        gamma: Number.POSITIVE_INFINITY,
        customWidth: 0,
        customHeight: 1.5,
        language: ' ',
      },
      'epub',
    );

    expect(issues.map((issue) => issue.field)).toEqual([
      'deviceProfile',
      'croppingPower',
      'croppingMinimum',
      'preserveMargin',
      'jpegQuality',
      'gamma',
      'customWidth',
      'customHeight',
      'language',
    ]);
  });

  it('covers every numeric boundary and either missing OTHER dimension', () => {
    for (const [field, value] of [
      ['croppingMinimum', Number.NaN],
      ['preserveMargin', -1],
      ['jpegQuality', 1.5],
      ['jpegQuality', 101],
      ['customWidth', 1.5],
      ['customHeight', 0],
    ] as const) {
      expect(
        validateMangapressSettings({ ...defaultMangapressSettings, [field]: value }, 'epub'),
      ).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
    }

    expect(
      validateMangapressSettings(
        {
          ...defaultMangapressSettings,
          deviceProfile: 'OTHER',
        },
        'epub',
      ),
    ).toContainEqual(expect.objectContaining({ field: 'customWidth' }));
    expect(
      validateMangapressSettings(
        {
          ...defaultMangapressSettings,
          deviceProfile: 'OTHER',
          customWidth: 1200,
        },
        'epub',
      ),
    ).toContainEqual(expect.objectContaining({ field: 'customHeight' }));
  });

  it('only offers combining into one volume for EPUB today', () => {
    expect([...FORMATS_SUPPORTING_COMBINED_VOLUME]).toEqual(['epub']);
  });

  it('rejects combining into one volume for a format that does not support it yet', () => {
    const combined = { ...defaultMangapressSettings, combineIntoOneVolume: true };
    expect(validateMangapressSettings(combined, 'epub')).toEqual([]);
    expect(validateMangapressSettings(combined, 'cbz')).toContainEqual(
      expect.objectContaining({ field: 'combineIntoOneVolume' }),
    );
    expect(validateMangapressSettings(combined, 'pdf')).toContainEqual(
      expect.objectContaining({ field: 'combineIntoOneVolume' }),
    );
    // Off, the format doesn't matter - nothing to reject.
    expect(
      validateMangapressSettings(
        { ...defaultMangapressSettings, combineIntoOneVolume: false },
        'cbz',
      ),
    ).toEqual([]);
  });
});
