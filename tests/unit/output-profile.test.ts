import { describe, expect, it } from 'vitest';

import {
  defaultMangapressSettings,
  defaultUpscaleFor,
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
    expect(validateMangapressSettings(defaultMangapressSettings)).toEqual([]);
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
});

describe('mangapress output settings', () => {
  it('accepts the defaults and complete custom-device overrides', () => {
    expect(validateMangapressSettings(defaultMangapressSettings)).toEqual([]);
    expect(
      validateMangapressSettings({
        ...defaultMangapressSettings,
        deviceProfile: 'OTHER',
        customWidth: 1200,
        customHeight: 1600,
        croppingMinimum: 100,
        preserveMargin: 100,
        jpegQuality: 100,
        gamma: 1,
      }),
    ).toEqual([]);
  });

  it('reports empty, non-finite, and out-of-range values by field', () => {
    const issues = validateMangapressSettings({
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
    });

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
      expect(validateMangapressSettings({ ...defaultMangapressSettings, [field]: value })).toEqual(
        expect.arrayContaining([expect.objectContaining({ field })]),
      );
    }

    expect(
      validateMangapressSettings({
        ...defaultMangapressSettings,
        deviceProfile: 'OTHER',
      }),
    ).toContainEqual(expect.objectContaining({ field: 'customWidth' }));
    expect(
      validateMangapressSettings({
        ...defaultMangapressSettings,
        deviceProfile: 'OTHER',
        customWidth: 1200,
      }),
    ).toContainEqual(expect.objectContaining({ field: 'customHeight' }));
  });
});
