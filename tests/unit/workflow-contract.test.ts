import { describe, expect, it } from 'vitest';

import { defaultMangapressSettings } from '@/domain/output-profile';
import {
  bookDetailsSchema,
  chooseInputsKindSchema,
  conversionCommandSchema,
  libraryConversionCommandSchema,
  planLibraryCommandSchema,
  registerInputsCommandSchema,
  writeTitleMappingCommandSchema,
} from '@/shared/workflow-contract';

const command = {
  jobId: 'job',
  sessionId: 'session',
  libraryId: 'library',
  settings: defaultMangapressSettings,
  format: 'epub',
};

describe('workflow IPC contract', () => {
  it('accepts a complete output-settings command', () => {
    expect(conversionCommandSchema.safeParse(command).success).toBe(true);
  });

  it('rejects unsafe numeric ranges and incomplete custom resolutions', () => {
    expect(
      conversionCommandSchema.safeParse({
        ...command,
        settings: { ...defaultMangapressSettings, croppingMinimum: 101 },
      }).success,
    ).toBe(false);
    expect(
      conversionCommandSchema.safeParse({
        ...command,
        settings: { ...defaultMangapressSettings, deviceProfile: 'OTHER', customWidth: 1200 },
      }).success,
    ).toBe(false);
  });

  it('names a library by the session it was read in, and lets no path through', () => {
    const library = {
      jobId: 'job',
      sessionId: 'session',
      libraryId: 'library',
      settings: defaultMangapressSettings,
      format: 'epub',
      titles: ['Good Manga'],
    };

    const parsed = libraryConversionCommandSchema.parse({ ...library, parentPath: '/library' });

    expect(parsed).not.toHaveProperty('parentPath');
    expect(parsed.titles).toEqual(['Good Manga']);
    expect(libraryConversionCommandSchema.safeParse({ ...library, sessionId: '' }).success).toBe(
      false,
    );
    expect(
      planLibraryCommandSchema.parse({
        jobId: 'job',
        sessionId: 'session',
        parentPath: '/library',
      }),
    ).toEqual({ jobId: 'job', sessionId: 'session' });
    expect(
      planLibraryCommandSchema.safeParse({ jobId: 'job', parentPath: '/library' }).success,
    ).toBe(false);
  });

  it('saves a title mapping by session and title, never by a folder path', () => {
    const mapping = { mangaTitle: 'Good Manga', chapters: [], volumes: [] };

    expect(
      writeTitleMappingCommandSchema.parse({
        sessionId: 'session',
        title: 'Good Manga',
        mapping,
        inputPath: '/library/Good Manga',
      }),
    ).toEqual({ sessionId: 'session', title: 'Good Manga', mapping });
    expect(
      writeTitleMappingCommandSchema.safeParse({ inputPath: '/library/Good Manga', mapping })
        .success,
    ).toBe(false);
    expect(
      writeTitleMappingCommandSchema.safeParse({ sessionId: 'session', title: '', mapping })
        .success,
    ).toBe(false);
  });

  it('accepts only the two kinds of native picker', () => {
    expect(chooseInputsKindSchema.safeParse('files').success).toBe(true);
    expect(chooseInputsKindSchema.safeParse('folders').success).toBe(true);
    expect(chooseInputsKindSchema.safeParse('library').success).toBe(false);
  });

  it('takes a bounded list of dropped paths, empty ones included', () => {
    expect(registerInputsCommandSchema.safeParse({ paths: ['C:\\a', ''] }).success).toBe(true);
    expect(registerInputsCommandSchema.safeParse({ paths: [] }).success).toBe(true);
    expect(registerInputsCommandSchema.safeParse({ paths: [1] }).success).toBe(false);
    expect(
      registerInputsCommandSchema.safeParse({ paths: Array.from({ length: 1001 }, () => 'x') })
        .success,
    ).toBe(false);
  });

  describe('the title, author and language typed for a book', () => {
    it('are accepted for one input, and for each title of a library', () => {
      const details = { title: 'Chainsaw Man', author: 'Fujimoto Tatsuki', language: 'pt-br' };

      expect(conversionCommandSchema.parse({ ...command, details }).details).toEqual(details);
      expect(
        libraryConversionCommandSchema.parse({
          jobId: 'job',
          sessionId: 'session',
          libraryId: 'library',
          settings: defaultMangapressSettings,
          format: 'epub',
          titleDetails: [{ title: 'Good Manga', details }],
        }).titleDetails,
      ).toEqual([{ title: 'Good Manga', details }]);
    });

    it('are optional, and every field of them is', () => {
      expect(conversionCommandSchema.parse(command)).not.toHaveProperty('details');
      expect(bookDetailsSchema.parse({})).toEqual({});
      expect(bookDetailsSchema.parse({ author: ' Someone ' })).toEqual({ author: 'Someone' });
    });

    it('refuse a blank or oversized text and a language that is not a tag', () => {
      for (const details of [
        { title: '' },
        { title: '   ' },
        { author: 'x'.repeat(301) },
        { title: 'x'.repeat(301) },
        { language: 'not a language' },
        { language: 'en_US' },
      ]) {
        expect(bookDetailsSchema.safeParse(details).success).toBe(false);
      }
      expect(
        bookDetailsSchema.safeParse({ title: 'x'.repeat(300), language: 'en-US' }).success,
      ).toBe(true);
    });

    it('cannot carry more titles than a library can hold', () => {
      const titleDetails = Array.from({ length: 1001 }, (_, index) => ({
        title: `Title ${String(index)}`,
        details: {},
      }));

      expect(
        libraryConversionCommandSchema.safeParse({
          jobId: 'job',
          sessionId: 'session',
          libraryId: 'library',
          settings: defaultMangapressSettings,
          format: 'epub',
          titleDetails,
        }).success,
      ).toBe(false);
    });
  });
});
