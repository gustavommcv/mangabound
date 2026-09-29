import { describe, expect, it } from 'vitest';

import { defaultMangapressSettings } from '@/domain/output-profile';
import { defaultPreferences } from '@/domain/preferences';
import { preferencesSchema, saveSettingsCommandSchema } from '@/shared/settings-contract';
import { persistedSettingsSchema } from '@/shared/workflow-contract';

describe('the options that are kept', () => {
  it('accept the defaults', () => {
    expect(preferencesSchema.parse(defaultPreferences)).toEqual(defaultPreferences);
  });

  it('drop a title and an author instead of keeping them', () => {
    const parsed = persistedSettingsSchema.parse({
      ...defaultMangapressSettings,
      title: 'Only for this book',
      author: 'Someone',
    });

    expect(parsed).toEqual(defaultMangapressSettings);
    expect(parsed).not.toHaveProperty('title');
    expect(parsed).not.toHaveProperty('author');
  });

  it.each([
    ['a process that does not exist', { ...defaultPreferences, mode: 'convert-twice' }],
    ['a format that does not exist', { ...defaultPreferences, format: 'mobi' }],
    ['an empty source', { ...defaultPreferences, providerId: '' }],
    ['a source id that is far too long', { ...defaultPreferences, providerId: 'x'.repeat(65) }],
    [
      'an option out of range',
      { ...defaultPreferences, settings: { ...defaultMangapressSettings, preserveMargin: -1 } },
    ],
  ])('refuse %s', (_name, preferences) => {
    expect(preferencesSchema.safeParse(preferences).success).toBe(false);
  });

  it('want a size for the custom device, as a conversion does', () => {
    const custom = { ...defaultMangapressSettings, deviceProfile: 'OTHER' };

    expect(persistedSettingsSchema.safeParse(custom).success).toBe(false);
    expect(
      persistedSettingsSchema.safeParse({ ...custom, customWidth: 1000, customHeight: 1400 })
        .success,
    ).toBe(true);
  });
});

describe('the command that saves them', () => {
  it('does not accept an output folder as a renderer preference', () => {
    expect(
      saveSettingsCommandSchema.parse({ preferences: defaultPreferences, libraryId: 'library-1' }),
    ).toEqual({ preferences: defaultPreferences });
    expect(saveSettingsCommandSchema.parse({ preferences: defaultPreferences })).toEqual({
      preferences: defaultPreferences,
    });
  });

  it('accepts a chosen network interface but rejects invalid addresses', () => {
    const preferredNetworkInterface = { name: 'Ethernet', address: '192.168.18.39' };
    expect(
      saveSettingsCommandSchema.parse({
        preferences: defaultPreferences,
        preferredNetworkInterface,
      }),
    ).toEqual({ preferences: defaultPreferences, preferredNetworkInterface });
    expect(
      saveSettingsCommandSchema.safeParse({
        preferences: defaultPreferences,
        preferredNetworkInterface: { name: 'Ethernet', address: 'not-an-ip' },
      }).success,
    ).toBe(false);
  });

  it('has no place for a path or a selected library id', () => {
    const parsed = saveSettingsCommandSchema.parse({
      preferences: defaultPreferences,
      libraryId: 'library-1',
      outputFolder: 'C:\\Users\\someone\\Secrets',
    });

    expect(parsed).not.toHaveProperty('outputFolder');
    expect(parsed).not.toHaveProperty('libraryId');
  });

  it.each([
    ['no preferences', { libraryId: 'library-1' }],
    [
      'an invalid network interface',
      {
        preferences: defaultPreferences,
        preferredNetworkInterface: { name: 'Ethernet', address: 'invalid' },
      },
    ],
    ['something that is not a command', 'save it'],
  ])('refuses %s', (_name, command) => {
    expect(saveSettingsCommandSchema.safeParse(command).success).toBe(false);
  });
});
