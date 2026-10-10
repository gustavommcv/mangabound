import { describe, expect, it } from 'vitest';

import { defaultMangapressSettings } from '@/domain/output-profile';
import {
  defaultFormat,
  defaultPreferences,
  isDefaultMangapress,
  sameSettings,
} from '@/domain/preferences';
import { defaultProcessMode } from '@/domain/process-mode';

describe('the defaults everything starts from', () => {
  it('are the process, format and options a first launch has', () => {
    expect(defaultPreferences).toEqual({
      mode: defaultProcessMode,
      format: 'cbz',
      singleBook: false,
      settings: defaultMangapressSettings,
    });
    expect(defaultFormat).toBe('cbz');
    expect(defaultPreferences.providerId).toBeUndefined();
  });

  it('cannot be changed by whoever holds them', () => {
    expect(Object.isFrozen(defaultPreferences)).toBe(true);
  });
});

describe('sameSettings', () => {
  it('is true for the same options, however they were built', () => {
    expect(sameSettings(defaultMangapressSettings, { ...defaultMangapressSettings })).toBe(true);
  });

  it('is false when any one option differs', () => {
    expect(
      sameSettings(defaultMangapressSettings, { ...defaultMangapressSettings, quiet: true }),
    ).toBe(false);
    expect(
      sameSettings(defaultMangapressSettings, { ...defaultMangapressSettings, jpegQuality: 90 }),
    ).toBe(false);
    expect(
      sameSettings({ ...defaultMangapressSettings, jpegQuality: 90 }, defaultMangapressSettings),
    ).toBe(false);
  });

  it('counts an option that was cleared as one that was never set', () => {
    expect(
      sameSettings(defaultMangapressSettings, { ...defaultMangapressSettings, gamma: undefined }),
    ).toBe(true);
  });
});

describe('isDefaultMangapress', () => {
  it('is true for the format and options a fresh start has', () => {
    expect(isDefaultMangapress('cbz', defaultMangapressSettings)).toBe(true);
  });

  it('is false once the format or an option was changed', () => {
    expect(isDefaultMangapress('pdf', defaultMangapressSettings)).toBe(false);
    expect(isDefaultMangapress('epub', { ...defaultMangapressSettings, splitter: 'split' })).toBe(
      false,
    );
    expect(isDefaultMangapress('epub', { ...defaultMangapressSettings, language: 'pt-br' })).toBe(
      false,
    );
  });
});
