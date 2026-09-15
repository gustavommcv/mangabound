import { describe, expect, it } from 'vitest';

import { defaultMangapressSettings, validateMangapressSettings } from '@/domain/output-profile';

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
