import { describe, expect, it } from 'vitest';

import { defaultMangapressSettings } from '@/domain/output-profile';
import {
  bookDetailsSchema,
  chooseInputsKindSchema,
  conversionCommandSchema,
  libraryConversionCommandSchema,
  mappingDraftSchema,
  planLibraryCommandSchema,
  registerInputsCommandSchema,
  saveBookDetailsCommandSchema,
  searchMetadataCommandSchema,
  suggestVolumesCommandSchema,
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
        { title: 'x'.repeat(201) },
        { language: 'not a language' },
        { language: 'en_US' },
      ]) {
        expect(bookDetailsSchema.safeParse(details).success).toBe(false);
      }
      // A title is bounded in bytes now, since the book's file is named after it; an author is not.
      expect(
        bookDetailsSchema.safeParse({
          title: 'x'.repeat(200),
          author: 'x'.repeat(300),
          language: 'en-US',
        }).success,
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

describe('the command that keeps details with a folder', () => {
  it('names a session, and a title only for a library, with the details to keep', () => {
    const details = { author: 'Fujimoto Tatsuki', language: 'pt-br' };

    expect(saveBookDetailsCommandSchema.parse({ sessionId: 'session', details })).toEqual({
      sessionId: 'session',
      details,
    });
    expect(
      saveBookDetailsCommandSchema.parse({
        sessionId: 'session',
        title: 'Good Manga',
        details: {},
      }),
    ).toEqual({ sessionId: 'session', title: 'Good Manga', details: {} });
  });

  it('never names a folder by its path, and refuses what a run would refuse', () => {
    expect(
      saveBookDetailsCommandSchema.parse({
        sessionId: 'session',
        details: {},
        inputPath: 'C:\\Manga\\Good Manga',
      }),
    ).not.toHaveProperty('inputPath');
    for (const command of [
      { details: {} },
      { sessionId: '', details: {} },
      { sessionId: 'session', title: '', details: {} },
      { sessionId: 'session', details: { author: '' } },
      { sessionId: 'session', details: { language: 'not a language' } },
    ]) {
      expect(saveBookDetailsCommandSchema.safeParse(command).success).toBe(false);
    }
  });
});

describe('what the page may send, and how much', () => {
  const nul = String.fromCharCode(0);
  const chapter = (index: number) => ({
    id: `c${String(index)}`,
    name: `Chapter ${String(index)}`,
    path: `/manga/${String(index)}`,
    pageCount: 1,
    chapter: index,
  });
  const draft = (chapters: number, volumes = 0) => ({
    mangaTitle: 'Manga',
    chapters: Array.from({ length: chapters }, (_, index) => chapter(index)),
    volumes: Array.from({ length: volumes }, (_, index) => ({
      id: `v${String(index)}`,
      number: String(index + 1),
      chapterIds: ['c0'],
    })),
  });

  it('takes the biggest series there is, with room to spare', () => {
    expect(mappingDraftSchema.safeParse(draft(2000, 150)).success).toBe(true);
    expect(mappingDraftSchema.safeParse(draft(20_000, 5000)).success).toBe(true);
  });

  it('refuses a list of chapters or of volumes that no folder could hold', () => {
    expect(mappingDraftSchema.safeParse(draft(20_001)).success).toBe(false);
    expect(mappingDraftSchema.safeParse(draft(1, 5001)).success).toBe(false);
    expect(
      mappingDraftSchema.safeParse({
        ...draft(1),
        volumes: [{ id: 'v', number: '1', chapterIds: Array.from({ length: 20_001 }, () => 'c0') }],
      }).success,
    ).toBe(false);
  });

  it('refuses a name or a path with no end', () => {
    const named = (overrides: Record<string, unknown>) => ({
      ...draft(1),
      ...overrides,
    });
    expect(mappingDraftSchema.safeParse(named({ mangaTitle: 'x'.repeat(1025) })).success).toBe(
      false,
    );
    expect(mappingDraftSchema.safeParse(named({ mangaTitle: 'x'.repeat(1024) })).success).toBe(
      true,
    );
    expect(
      mappingDraftSchema.safeParse(named({ chapters: [{ ...chapter(0), name: 'x'.repeat(1025) }] }))
        .success,
    ).toBe(false);
    expect(
      mappingDraftSchema.safeParse(named({ chapters: [{ ...chapter(0), path: 'x'.repeat(4097) }] }))
        .success,
    ).toBe(false);
    expect(
      mappingDraftSchema.safeParse(
        named({ chapters: [{ ...chapter(0), special: 'x'.repeat(17) }] }),
      ).success,
    ).toBe(false);
    expect(
      mappingDraftSchema.safeParse(named({ source: { provider: 'p'.repeat(65), id: 'w' } }))
        .success,
    ).toBe(false);
  });

  it('refuses the dropped and the typed paths that are far longer than any path', () => {
    expect(registerInputsCommandSchema.safeParse({ paths: ['x'.repeat(4097)] }).success).toBe(
      false,
    );
    expect(registerInputsCommandSchema.safeParse({ paths: ['x'.repeat(4096)] }).success).toBe(true);
  });

  it('refuses a title that would not fit in a file name, in bytes, and a title or author with a control character', () => {
    expect(bookDetailsSchema.safeParse({ title: 'あ'.repeat(66) }).success).toBe(true);
    expect(bookDetailsSchema.safeParse({ title: 'あ'.repeat(90) }).success).toBe(false);
    expect(bookDetailsSchema.safeParse({ title: 'a'.repeat(201) }).success).toBe(false);
    expect(bookDetailsSchema.safeParse({ title: `a${nul}b` }).success).toBe(false);
    expect(bookDetailsSchema.safeParse({ author: `a${nul}b` }).success).toBe(false);
    expect(bookDetailsSchema.safeParse({ author: 'a\nb' }).success).toBe(false);
    expect(bookDetailsSchema.safeParse({ author: 'a'.repeat(300) }).success).toBe(true);
    expect(bookDetailsSchema.safeParse({ author: 'a'.repeat(301) }).success).toBe(false);
  });

  it('refuses the names of a library title, and the lists of them, that go past a limit', () => {
    const library = {
      jobId: 'job',
      sessionId: 'session',
      libraryId: 'library',
      settings: defaultMangapressSettings,
      format: 'epub',
    };
    expect(
      libraryConversionCommandSchema.safeParse({ ...library, titles: ['x'.repeat(1025)] }).success,
    ).toBe(false);
    expect(
      libraryConversionCommandSchema.safeParse({
        ...library,
        titleDetails: [{ title: 'x'.repeat(1025), details: {} }],
      }).success,
    ).toBe(false);
    expect(
      writeTitleMappingCommandSchema.safeParse({
        sessionId: 'session',
        title: 'x'.repeat(1025),
        mapping: draft(1),
      }).success,
    ).toBe(false);
    expect(
      saveBookDetailsCommandSchema.safeParse({
        sessionId: 'session',
        title: 'x'.repeat(1025),
        details: {},
      }).success,
    ).toBe(false);
  });

  it('refuses an online search or suggestion with a title, a source or a work of no sensible size', () => {
    const search = { jobId: 'job', providerId: 'mangadex', title: 'Chainsaw Man' };
    expect(searchMetadataCommandSchema.safeParse(search).success).toBe(true);
    expect(
      searchMetadataCommandSchema.safeParse({ ...search, title: 'x'.repeat(301) }).success,
    ).toBe(false);
    expect(
      searchMetadataCommandSchema.safeParse({ ...search, providerId: 'p'.repeat(65) }).success,
    ).toBe(false);
    const suggest = { jobId: 'job', providerId: 'mangadex', workId: 'abc-123' };
    expect(suggestVolumesCommandSchema.safeParse(suggest).success).toBe(true);
    expect(
      suggestVolumesCommandSchema.safeParse({ ...suggest, workId: 'w'.repeat(1025) }).success,
    ).toBe(false);
  });

  it('refuses a gamma, a cropping power or a screen size that a slip of a key made', () => {
    const withSettings = (overrides: Record<string, unknown>) =>
      conversionCommandSchema.safeParse({
        ...command,
        settings: { ...defaultMangapressSettings, ...overrides },
      }).success;
    expect(withSettings({ gamma: 1.8 })).toBe(true);
    expect(withSettings({ gamma: 18 })).toBe(false);
    expect(withSettings({ gamma: 0.05 })).toBe(false);
    expect(withSettings({ croppingPower: 10 })).toBe(true);
    expect(withSettings({ croppingPower: 50 })).toBe(false);
    expect(withSettings({ croppingPower: -5 })).toBe(false);
    expect(withSettings({ deviceProfile: 'OTHER', customWidth: 20_000, customHeight: 1 })).toBe(
      true,
    );
    expect(withSettings({ deviceProfile: 'OTHER', customWidth: 1e21, customHeight: 1600 })).toBe(
      false,
    );
  });
});
