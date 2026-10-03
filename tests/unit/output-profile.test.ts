import { describe, expect, it } from 'vitest';

import {
  borderModeOf,
  defaultJpegQualityFor,
  defaultMangapressSettings,
  defaultPageSizeFor,
  defaultUpscaleFor,
  defaultValueForSetting,
  FORMATS_SUPPORTING_COMBINED_VOLUME,
  pageLayoutLocks,
  pageSizeOf,
  resolveDeviceProfileFallback,
  restoreSettingDefault,
  stripsLockReason,
  validateMangapressSettings,
  webtoonLockReason,
  withBorderMode,
  withDeviceProfile,
  withPageSize,
} from '@/domain/output-profile';

describe('mangapress default settings', () => {
  it.each([
    ['KPW6', 85],
    ['KV', 85],
    ['OTHER', 85],
    ['KS', 90],
    ['KS3', 90],
    ['KCS', 90],
  ])('matches mangapress JPEG quality for %s', (profile, quality) => {
    expect(defaultJpegQualityFor(profile)).toBe(quality);
  });

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
      webtoon: false,
      croppingMinimum: 0,
      preserveMargin: 0,
      noRotate: false,
      rotateFirst: false,
      maximizeStrips: false,
      stretch: false,
      wallpaper: false,
      whiteBorders: false,
      blackBorders: false,
      spreadShift: false,
      onePageLandscape: false,
      invertDirection: false,
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

describe('the page size, one choice for three flags', () => {
  it('reads the flag that wins: cropping to fill, then stretching, then enlarging', () => {
    const flags = (upscale: boolean, stretch: boolean, wallpaper: boolean) => ({
      upscale,
      stretch,
      wallpaper,
    });
    expect(pageSizeOf(flags(false, false, false))).toBe('fit');
    expect(pageSizeOf(flags(true, false, false))).toBe('enlarge');
    expect(pageSizeOf(flags(true, true, false))).toBe('stretch');
    expect(pageSizeOf(flags(false, true, false))).toBe('stretch');
    expect(pageSizeOf(flags(true, true, true))).toBe('fill');
    expect(pageSizeOf(flags(false, false, true))).toBe('fill');
  });

  it('sets exactly the flag a choice needs, whatever was set before', () => {
    const everything = {
      ...defaultMangapressSettings,
      upscale: true,
      stretch: true,
      wallpaper: true,
    };
    for (const mode of ['fit', 'enlarge', 'stretch', 'fill'] as const) {
      const chosen = withPageSize(everything, mode);
      expect(pageSizeOf(chosen)).toBe(mode);
      expect([chosen.upscale, chosen.stretch, chosen.wallpaper].filter(Boolean)).toHaveLength(
        mode === 'fit' ? 0 : 1,
      );
      // Nothing else is touched.
      expect({ ...chosen, upscale: true, stretch: true, wallpaper: true }).toEqual(everything);
    }
  });

  it('starts where the device starts enlarging', () => {
    expect(defaultPageSizeFor('KPW6')).toBe('enlarge');
    expect(defaultPageSizeFor('KS')).toBe('fit');
    expect(defaultPageSizeFor('OTHER')).toBe('fit');
    expect(pageSizeOf(defaultMangapressSettings)).toBe(
      defaultPageSizeFor(defaultMangapressSettings.deviceProfile),
    );
  });

  it('keeps stretching or cropping to fill when the device changes', () => {
    const stretched = withPageSize(defaultMangapressSettings, 'stretch');
    expect(pageSizeOf(withDeviceProfile(stretched, 'KV'))).toBe('stretch');
    const filled = withPageSize(defaultMangapressSettings, 'fill');
    expect(pageSizeOf(withDeviceProfile(filled, 'OTHER'))).toBe('fill');
  });
});

describe('the borders, one choice for two flags', () => {
  it('reads black over white, as mangapress does, and automatic when neither is set', () => {
    expect(borderModeOf({ whiteBorders: false, blackBorders: false })).toBe('automatic');
    expect(borderModeOf({ whiteBorders: true, blackBorders: false })).toBe('white');
    expect(borderModeOf({ whiteBorders: false, blackBorders: true })).toBe('black');
    expect(borderModeOf({ whiteBorders: true, blackBorders: true })).toBe('black');
  });

  it('sets the two flags so that they never disagree', () => {
    const both = { ...defaultMangapressSettings, whiteBorders: true, blackBorders: true };
    expect(withBorderMode(both, 'automatic')).toMatchObject({
      whiteBorders: false,
      blackBorders: false,
    });
    expect(withBorderMode(both, 'white')).toMatchObject({
      whiteBorders: true,
      blackBorders: false,
    });
    expect(withBorderMode(both, 'black')).toMatchObject({
      whiteBorders: false,
      blackBorders: true,
    });
    expect(borderModeOf(defaultMangapressSettings)).toBe('automatic');
  });
});

describe('the page-layout controls another choice leaves without effect', () => {
  const settings = defaultMangapressSettings;

  it('locks nothing for an EPUB with both spread versions, which is where the options start', () => {
    expect(pageLayoutLocks(settings, 'epub')).toEqual({});
  });

  it('offers the two-page view only where it is written: an EPUB', () => {
    expect(pageLayoutLocks(settings, 'cbz')).toEqual({
      twoPageView: 'Only an EPUB carries these.',
    });
    expect(pageLayoutLocks(settings, 'pdf').twoPageView).toBe('Only an EPUB carries these.');
  });

  it('has a whole spread to place and turn only when one is kept', () => {
    expect(pageLayoutLocks({ ...settings, splitter: 'split' }, 'epub')).toEqual({
      rotateFirst: 'Only when both versions are made.',
      noRotate: 'Only when the whole spread is kept.',
      rotateRight: 'Only when the whole spread is kept.',
    });
    expect(pageLayoutLocks({ ...settings, splitter: 'rotate' }, 'epub')).toEqual({
      rotateFirst: 'Only when both versions are made.',
    });
  });

  it('has nothing to rotate once the whole spread stays upright', () => {
    expect(pageLayoutLocks({ ...settings, noRotate: true }, 'epub')).toEqual({
      rotateRight: 'Nothing is rotated while the whole spread stays upright.',
    });
    expect(pageLayoutLocks({ ...settings, splitter: 'rotate', noRotate: true }, 'epub')).toEqual({
      rotateFirst: 'Only when both versions are made.',
      rotateRight: 'Nothing is rotated while the whole spread stays upright.',
    });
    // Splitting keeps no whole spread, so staying upright is itself without effect.
    expect(
      pageLayoutLocks({ ...settings, splitter: 'split', noRotate: true }, 'epub').rotateRight,
    ).toBe('Only when the whole spread is kept.');
  });

  it('replaces everything about wide pages when strips are restacked', () => {
    expect(
      pageLayoutLocks({ ...settings, maximizeStrips: true, splitter: 'split' }, 'epub'),
    ).toEqual({
      splitter: stripsLockReason,
      rotateFirst: stripsLockReason,
      noRotate: stripsLockReason,
      rotateRight: stripsLockReason,
    });
  });

  it('locks for webtoon strips all that mangapress never does to them, strips restacking included', () => {
    const locks = pageLayoutLocks({ ...settings, webtoon: true, maximizeStrips: true }, 'cbz');
    expect(locks).toEqual({
      twoPageView: 'Only an EPUB carries these.',
      mangaStyle: webtoonLockReason,
      splitter: webtoonLockReason,
      rotateFirst: webtoonLockReason,
      noRotate: webtoonLockReason,
      rotateRight: webtoonLockReason,
      maximizeStrips: webtoonLockReason,
      marginCropping: webtoonLockReason,
      autoContrast: webtoonLockReason,
      borders: 'Always white for webtoon strips.',
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
