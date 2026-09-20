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
  it('names the output folder by its id, and can leave it out', () => {
    expect(
      saveSettingsCommandSchema.parse({ preferences: defaultPreferences, libraryId: 'library-1' }),
    ).toEqual({ preferences: defaultPreferences, libraryId: 'library-1' });
    expect(saveSettingsCommandSchema.parse({ preferences: defaultPreferences })).toEqual({
      preferences: defaultPreferences,
    });
  });

  it('has no place for a path: only the id a dialog gave out', () => {
    const parsed = saveSettingsCommandSchema.parse({
      preferences: defaultPreferences,
      libraryId: 'library-1',
      outputFolder: 'C:\\Users\\someone\\Secrets',
    });

    expect(parsed).not.toHaveProperty('outputFolder');
  });

  it.each([
    ['no preferences', { libraryId: 'library-1' }],
    ['an empty id', { preferences: defaultPreferences, libraryId: '' }],
    ['an id that is far too long', { preferences: defaultPreferences, libraryId: 'x'.repeat(201) }],
    ['something that is not a command', 'save it'],
  ])('refuses %s', (_name, command) => {
    expect(saveSettingsCommandSchema.safeParse(command).success).toBe(false);
  });
});
