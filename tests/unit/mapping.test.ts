import { describe, expect, it } from 'vitest';

import {
  addVolume,
  applyVolumeSuggestion,
  assignedVolumeId,
  assignChapterRange,
  assignChapters,
  createMappingDraft,
  dominantLanguage,
  isMappableChapter,
  isVolumeNumber,
  MappingOperationError,
  mappingSignature,
  MappingValidationError,
  mergeVolumes,
  removeVolume,
  renumberVolume,
  serializeMangabindMetadata,
  splitVolume,
  toMangabindMetadata,
  unassignChapters,
  validateMapping,
  type MappingChapter,
} from '@/domain/mapping';

const chapters: readonly MappingChapter[] = [
  { id: 'c3', name: 'Chapter 3', path: '/manga/Chapter 3', pageCount: 3, chapter: 3 },
  { id: 'c1', name: 'Chapter 1', path: '/manga/Chapter 1', pageCount: 2, chapter: 1 },
  {
    id: 'c2x1',
    name: 'Chapter 2 extra',
    path: '/manga/Chapter 2x1',
    pageCount: 1,
    chapter: 2,
    special: 'x1',
  },
  { id: 'c2', name: 'Chapter 2', path: '/manga/Chapter 2', pageCount: 2, chapter: 2 },
];

function manualDraft() {
  return createMappingDraft({ chapters, mangaTitle: ' Example Manga ' });
}

describe('manual mapping draft', () => {
  it('starts fully offline and unassigned in deterministic chapter order', () => {
    const draft = manualDraft();

    expect(draft.source).toBeUndefined();
    expect(draft.volumes).toEqual([]);
    expect(draft.chapters.map((chapter) => chapter.id)).toEqual(['c1', 'c2', 'c2x1', 'c3']);
    expect(validateMapping(draft)).toMatchObject([
      {
        code: 'unassigned_chapters',
        severity: 'warning',
        chapterIds: ['c1', 'c2', 'c2x1', 'c3'],
      },
    ]);
  });

  it('uses the same draft shape for a provider suggestion and canonicalizes volume numbers', () => {
    const draft = createMappingDraft({
      chapters,
      mangaTitle: 'Example Manga',
      source: { provider: 'external', id: 'work-123' },
      volumes: [
        { id: 'suggested-1', number: '01.0', chapterIds: ['c2', 'c1'] },
        { id: 'suggested-2', number: '2', chapterIds: ['c3'] },
      ],
    });

    expect(draft.source).toEqual({ provider: 'external', id: 'work-123' });
    expect(draft.volumes).toMatchObject([
      { id: 'suggested-1', number: '1', chapterIds: ['c1', 'c2'] },
      { id: 'suggested-2', number: '2', chapterIds: ['c3'] },
    ]);
  });

  it('rejects duplicate stable identifiers at initialization', () => {
    expect(() =>
      createMappingDraft({
        chapters: [chapters[0]!, { ...chapters[0]! }],
        mangaTitle: 'Duplicate',
      }),
    ).toThrowError(expect.objectContaining({ code: 'duplicate_chapter_id' }));
    expect(() =>
      createMappingDraft({
        chapters,
        mangaTitle: 'Duplicate',
        volumes: [
          { id: 'v1', number: '1', chapterIds: [] },
          { id: 'v1', number: '2', chapterIds: [] },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: 'duplicate_volume_id' }));
  });

  it('uses stable ids as the final ordering tie-breaker for otherwise identical chapters', () => {
    const draft = createMappingDraft({
      chapters: [
        { id: 'b', name: 'Same', path: '/b', pageCount: 1, chapter: 1 },
        { id: 'a', name: 'Same', path: '/a', pageCount: 1, chapter: 1 },
      ],
      mangaTitle: 'Tie',
    });

    expect(draft.chapters.map((chapter) => chapter.id)).toEqual(['a', 'b']);
  });
});

describe('mapping operations', () => {
  it('creates, renumbers, removes, assigns, reassigns, and unassigns volumes immutably', () => {
    const initial = manualDraft();
    const withVolumes = addVolume(addVolume(initial, 'v1', '1'), 'v2', '2');
    const assigned = assignChapters(withVolumes, 'v1', ['c2', 'c1', 'c1']);
    const reassigned = assignChapters(assigned, 'v2', ['c2']);
    const unassigned = unassignChapters(reassigned, ['c1']);
    const renumbered = renumberVolume(unassigned, 'v2', '2.50');
    const removed = removeVolume(renumbered, 'v1');

    expect(initial.volumes).toEqual([]);
    expect(assigned.volumes[0]?.chapterIds).toEqual(['c1', 'c2']);
    expect(assignedVolumeId(reassigned, 'c1')).toBe('v1');
    expect(assignedVolumeId(reassigned, 'c2')).toBe('v2');
    expect(assignedVolumeId(unassigned, 'c1')).toBeUndefined();
    expect(renumbered.volumes[1]?.number).toBe('2.5');
    expect(removed.volumes.map((volume) => volume.id)).toEqual(['v2']);
  });

  it('assigns inclusive ranges in either selection direction', () => {
    const draft = addVolume(manualDraft(), 'v1', '1');
    const forwards = assignChapterRange(draft, 'v1', 'c1', 'c2x1');
    const backwards = assignChapterRange(draft, 'v1', 'c2x1', 'c1');

    expect(forwards.volumes[0]?.chapterIds).toEqual(['c1', 'c2', 'c2x1']);
    expect(backwards).toEqual(forwards);
  });

  it('splits and merges volumes without changing chapter order', () => {
    const volume = assignChapters(addVolume(manualDraft(), 'v1', '1'), 'v1', [
      'c1',
      'c2',
      'c2x1',
      'c3',
    ]);
    const split = splitVolume(volume, 'v1', 'c2x1', 'v2', '2');
    const merged = mergeVolumes(split, 'v1', 'v2');

    expect(split.volumes).toMatchObject([
      { id: 'v1', chapterIds: ['c1', 'c2'] },
      { id: 'v2', chapterIds: ['c2x1', 'c3'] },
    ]);
    expect(merged.volumes).toMatchObject([{ id: 'v1', chapterIds: ['c1', 'c2', 'c2x1', 'c3'] }]);
  });

  it('merges empty volumes so cleanup does not require a separate destructive edit', () => {
    const draft = addVolume(addVolume(manualDraft(), 'v1', '1'), 'v2', '2');

    expect(mergeVolumes(draft, 'v1', 'v2').volumes).toEqual([
      { id: 'v1', number: '1', chapterIds: [] },
    ]);
  });

  it.each([
    () => addVolume(manualDraft(), 'v1', 'one'),
    () => addVolume(manualDraft(), 'v1', '9'.repeat(400)),
    () => addVolume(addVolume(manualDraft(), 'v1', '1'), 'v1', '2'),
    () => removeVolume(manualDraft(), 'missing'),
    () => renumberVolume(manualDraft(), 'missing', '1'),
    () => assignChapters(manualDraft(), 'missing', ['c1']),
    () => assignChapters(addVolume(manualDraft(), 'v1', '1'), 'v1', []),
    () => assignChapters(addVolume(manualDraft(), 'v1', '1'), 'v1', ['missing']),
    () => unassignChapters(manualDraft(), ['missing']),
    () => assignedVolumeId(manualDraft(), 'missing'),
    () => assignChapterRange(addVolume(manualDraft(), 'v1', '1'), 'v1', 'missing', 'c2'),
    () => assignChapterRange(addVolume(manualDraft(), 'v1', '1'), 'v1', 'c1', 'missing'),
  ])('rejects invalid volume or chapter operations', (operation) => {
    expect(operation).toThrow(MappingOperationError);
  });

  it('rejects splits that are empty, unknown, or reuse a volume id', () => {
    const draft = assignChapters(addVolume(manualDraft(), 'v1', '1'), 'v1', ['c1', 'c2']);

    expect(() => splitVolume(draft, 'v1', 'c1', 'v2', '2')).toThrowError(
      expect.objectContaining({ code: 'invalid_split' }),
    );
    expect(() => splitVolume(draft, 'v1', 'c3', 'v2', '2')).toThrowError(
      expect.objectContaining({ code: 'invalid_split' }),
    );
    expect(() => splitVolume(draft, 'v1', 'c2', 'v1', '2')).toThrowError(
      expect.objectContaining({ code: 'duplicate_volume_id' }),
    );
    expect(() => splitVolume(draft, 'missing', 'c2', 'v2', '2')).toThrowError(
      expect.objectContaining({ code: 'volume_not_found' }),
    );
  });

  it('rejects merging a volume with itself or with an unknown volume', () => {
    const draft = addVolume(addVolume(manualDraft(), 'v1', '1'), 'v2', '2');

    expect(() => mergeVolumes(draft, 'v1', 'v1')).toThrowError(
      expect.objectContaining({ code: 'same_volume' }),
    );
    expect(() => mergeVolumes(draft, 'missing', 'v2')).toThrowError(
      expect.objectContaining({ code: 'volume_not_found' }),
    );
    expect(() => mergeVolumes(draft, 'v1', 'missing')).toThrowError(
      expect.objectContaining({ code: 'volume_not_found' }),
    );
  });

  it('applies a volume suggestion by matching local chapters by number and sets the source', () => {
    const draft = manualDraft();

    const applied = applyVolumeSuggestion(
      draft,
      [{ id: 'suggested-1', number: '1', chapterNumbers: [1, 2] }],
      { provider: 'external', id: 'work-123' },
    );

    // c2x1 is a special chapter that also carries chapter number 2, so it's swept in too.
    expect(applied.volumes).toMatchObject([
      { id: 'suggested-1', number: '1', chapterIds: ['c1', 'c2', 'c2x1'] },
    ]);
    expect(applied.source).toEqual({ provider: 'external', id: 'work-123' });
  });

  it('skips a suggestion that matches no locally discovered chapter', () => {
    const draft = manualDraft();

    const applied = applyVolumeSuggestion(
      draft,
      [{ id: 'suggested-1', number: '1', chapterNumbers: [99] }],
      { provider: 'external', id: 'work-123' },
    );

    expect(applied.volumes).toEqual([]);
  });

  it('reuses an existing volume with a matching canonical number instead of duplicating it', () => {
    const draft = assignChapters(addVolume(manualDraft(), 'v1', '01.0'), 'v1', ['c3']);

    const applied = applyVolumeSuggestion(
      draft,
      [{ id: 'suggested-1', number: '1', chapterNumbers: [1] }],
      { provider: 'external', id: 'work-123' },
    );

    expect(applied.volumes).toMatchObject([{ id: 'v1', number: '1', chapterIds: ['c1', 'c3'] }]);
  });

  it('reassigns a chapter suggested into a different volume than its current one', () => {
    const draft = assignChapters(addVolume(manualDraft(), 'v1', '1'), 'v1', ['c1']);

    const applied = applyVolumeSuggestion(
      draft,
      [{ id: 'suggested-2', number: '2', chapterNumbers: [1] }],
      { provider: 'external', id: 'work-123' },
    );

    expect(applied.volumes).toMatchObject([
      { id: 'v1', chapterIds: [] },
      { id: 'suggested-2', number: '2', chapterIds: ['c1'] },
    ]);
  });
});

describe('mapping validation and serialization', () => {
  it('reports every condition that would make mangabind ignore or ambiguously group an edit', () => {
    const problematicChapters: readonly MappingChapter[] = [
      { id: 'a', name: 'Chapter A', path: '/a', pageCount: 1, chapter: 1 },
      { id: 'b', name: 'Chapter B', path: '/b', pageCount: 1, chapter: 1 },
      {
        id: 'locked',
        name: 'Chapter 2',
        path: '/locked',
        pageCount: 1,
        chapter: 2,
        parsedVolume: 9,
      },
      { id: 'bad-number', name: 'Afterword', path: '/afterword', pageCount: 1 },
      {
        id: 'bad-special',
        name: 'Special',
        path: '/special',
        pageCount: 1,
        chapter: 3,
        special: 'q1',
      },
      { id: 'loose', name: 'Chapter 4', path: '/loose', pageCount: 1, chapter: 4 },
    ];
    const draft = createMappingDraft({
      chapters: problematicChapters,
      mangaTitle: 'Problems',
      source: { provider: '', id: '' },
      volumes: [
        { id: 'v1', number: '1', chapterIds: ['a', 'b', 'locked', 'bad-number', 'bad-special'] },
        { id: 'duplicate-number', number: '1', chapterIds: [] },
      ],
    });

    expect(validateMapping(draft).map((issue) => issue.code)).toEqual([
      'invalid_source',
      'filename_volume_conflict',
      'unparseable_chapter',
      'unparseable_chapter',
      'empty_volume',
      'duplicate_volume',
      'duplicate_chapter',
      'unassigned_chapters',
    ]);
    expect(() => toMangabindMetadata(draft)).toThrowError(MappingValidationError);
    try {
      toMangabindMetadata(draft);
    } catch (error) {
      expect(error).toBeInstanceOf(MappingValidationError);
      expect((error as MappingValidationError).issues).toHaveLength(7);
    }
  });

  it('uses singular wording for one intentionally unassigned chapter', () => {
    const draft = assignChapters(addVolume(manualDraft(), 'v1', '1'), 'v1', ['c1', 'c2', 'c2x1']);

    expect(validateMapping(draft).at(-1)?.message).toBe('1 chapter is not assigned to a volume.');
  });

  it('serializes a provider-backed draft deterministically with source as an object', () => {
    const draft = createMappingDraft({
      chapters,
      mangaTitle: '  Mangá São José  ',
      source: { provider: 'external', id: 'abc-123' },
      volumes: [
        { id: 'v2', number: '2', chapterIds: ['c3'] },
        { id: 'v1', number: '1', chapterIds: ['c2x1', 'c1', 'c2'] },
      ],
    });

    expect(toMangabindMetadata(draft)).toEqual({
      schema_version: 1,
      manga: { title: 'Mangá São José' },
      volumes: [
        { number: '1', chapters: ['1', '2', '2x1'] },
        { number: '2', chapters: ['3'] },
      ],
      source: { provider: 'external', id: 'abc-123' },
    });
    expect(serializeMangabindMetadata(draft)).toBe(
      `${JSON.stringify(toMangabindMetadata(draft), null, 2)}\n`,
    );
  });

  it('omits optional manga and source fields for a wholly manual mapping', () => {
    const draft = createMappingDraft({
      chapters: [chapters[1]!],
      mangaTitle: '   ',
      volumes: [{ id: 'v1', number: '1', chapterIds: ['c1'] }],
    });

    expect(toMangabindMetadata(draft)).toEqual({
      schema_version: 1,
      volumes: [{ number: '1', chapters: ['1'] }],
    });
  });
});

describe('two copies of one chapter in the folder', () => {
  /** Chapter 2 twice, from two groups, with chapters 1 and 3 beside it. */
  const copies = (overrides: Partial<MappingChapter> = {}): readonly MappingChapter[] => [
    { id: 'c1', name: 'Ch.1 [G1]', path: '/m/1', pageCount: 1, chapter: 1 },
    { id: 'c2-g1', name: 'Ch.2 [G1]', path: '/m/2a', pageCount: 1, chapter: 2, ...overrides },
    { id: 'c2-g2', name: 'Ch.2 [G2]', path: '/m/2b', pageCount: 1, chapter: 2, ...overrides },
    { id: 'c3', name: 'Ch.3 [G1]', path: '/m/3', pageCount: 1, chapter: 3 },
  ];

  const place = (chapterList: readonly MappingChapter[], ids: readonly string[]) =>
    assignChapters(
      addVolume(createMappingDraft({ chapters: chapterList, mangaTitle: 'Dup' }), 'v1', '1'),
      'v1',
      ids,
    );

  const errorsOf = (draft: ReturnType<typeof place>) =>
    validateMapping(draft).filter((issue) => issue.severity === 'error');

  it('is an error to place one copy, since the file mangabind reads cannot choose it', () => {
    const draft = place(copies(), ['c1', 'c2-g2', 'c3']);

    const errors = errorsOf(draft);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      code: 'duplicate_chapter',
      severity: 'error',
      chapterIds: ['c2-g2', 'c2-g1'],
    });
    expect(errors[0]?.message).toContain('Chapter 2 is in the folder more than once');
    expect(() => toMangabindMetadata(draft)).toThrowError(MappingValidationError);
  });

  it('says to remove the copies from the folder, which is the one thing that fixes it', () => {
    const [issue] = errorsOf(place(copies(), ['c1', 'c2-g1', 'c3']));

    expect(issue?.message).toContain('remove all but one from the folder');
  });

  it('is no error while neither copy is placed, only a note that the chapter is not in a volume', () => {
    const draft = place(copies(), ['c1', 'c3']);

    expect(errorsOf(draft)).toEqual([]);
    expect(validateMapping(draft).map((issue) => issue.code)).toEqual(['unassigned_chapters']);
  });

  it('names every copy once when both are placed and a third is not', () => {
    const three: readonly MappingChapter[] = [
      ...copies(),
      { id: 'c2-g3', name: 'Ch.2 [G3]', path: '/m/2c', pageCount: 1, chapter: 2 },
    ];
    const issues = errorsOf(place(three, ['c1', 'c2-g1', 'c2-g2', 'c3']));

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'duplicate_chapter',
      message: 'More than one source represents chapter 2; mangabind cannot choose between them.',
      chapterIds: ['c2-g1', 'c2-g2', 'c2-g3'],
    });
  });

  it('does not take a special chapter for a copy of the chapter it follows', () => {
    const withSpecial: readonly MappingChapter[] = [
      ...copies().slice(0, 2),
      { id: 'c2x1', name: 'Ch.2 extra', path: '/m/2x', pageCount: 1, chapter: 2, special: 'x1' },
    ];

    expect(errorsOf(place(withSpecial, ['c1', 'c2-g1']))).toEqual([]);
  });

  it('passes over a chapter mangabind could not map, whether or not another is placed', () => {
    const unmappable: readonly MappingChapter[] = [
      ...copies().slice(0, 2),
      { id: 'afterword', name: 'Afterword', path: '/m/after', pageCount: 1 },
    ];

    expect(errorsOf(place(unmappable, ['c1', 'c2-g1']))).toEqual([]);
  });

  describe('when the file names say which volume each copy is in', () => {
    const named = (placed: number | undefined, other: number | undefined) => {
      const list: readonly MappingChapter[] = [
        { id: 'a', name: 'A', path: '/m/a', pageCount: 1, chapter: 2, parsedVolume: placed },
        { id: 'b', name: 'B', path: '/m/b', pageCount: 1, chapter: 2, parsedVolume: other },
      ];
      return errorsOf(place(list, ['a'])).map((issue) => issue.code);
    };

    it('counts copies that name the same volume', () => {
      expect(named(1, 1)).toEqual(['duplicate_chapter']);
    });

    it('counts a copy that names no volume, since the file can only give it the placed one', () => {
      expect(named(undefined, 1)).toEqual(['duplicate_chapter']);
      expect(named(1, undefined)).toEqual(['duplicate_chapter']);
      expect(named(undefined, undefined)).toEqual(['duplicate_chapter']);
    });

    it('leaves alone a copy that names another volume, which mangabind tells apart by it', () => {
      expect(named(1, 2)).toEqual([]);
    });
  });
});

describe('what a volume number and a chapter number may be', () => {
  const draft = createMappingDraft({ chapters, mangaTitle: 'Example' });

  it.each([
    '-1',
    '0x10',
    '1e3',
    '1.',
    '.5',
    '1,5',
    '',
    ' ',
    'one',
    '+1',
    '1 2',
    // Written with an exponent, or with other digits than the ones typed, they would not be what
    // the person meant in mangabind.json.
    '10000000000000000000000',
    '9007199254740993',
    '0.0000001',
    '9'.repeat(400),
  ])('refuses %j as the number of a volume', (number) => {
    expect(() => addVolume(draft, 'v1', number)).toThrowError(
      expect.objectContaining({ code: 'invalid_volume_number' }),
    );
  });

  it.each([
    ['1', '1'],
    ['01', '1'],
    [' 2 ', '2'],
    ['1.5', '1.5'],
    ['0', '0'],
  ])('takes %j as volume %s', (typed, written) => {
    expect(addVolume(draft, 'v1', typed).volumes[0]?.number).toBe(written);
  });

  it('takes the highest volume number mangabind takes, and no more', () => {
    expect(addVolume(draft, 'v1', '100000').volumes[0]?.number).toBe('100000');
    for (const number of ['100001', '100000.5', '9007199254740991']) {
      expect(() => addVolume(draft, 'v1', number)).toThrowError(
        expect.objectContaining({ code: 'invalid_volume_number' }),
      );
    }
  });

  it('does not take a draft whose volume is numbered with an exponent from the page', () => {
    expect(() =>
      createMappingDraft({
        chapters,
        mangaTitle: 'Example',
        volumes: [{ id: 'v1', number: '1e+22', chapterIds: [chapters[0]!.id] }],
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_volume_number' }));
  });

  it('refuses a chapter with a negative or a missing number, and a source with no id', () => {
    const base = { id: 'x', name: 'X', path: '/x', pageCount: 1 };

    expect(isMappableChapter({ ...base, chapter: 3 })).toBe(true);
    expect(isMappableChapter({ ...base, chapter: 0 })).toBe(true);
    expect(isMappableChapter({ ...base, chapter: -1 })).toBe(false);
    expect(isMappableChapter(base)).toBe(false);

    const sourced = (provider: string, id: string) =>
      validateMapping(
        createMappingDraft({ chapters, mangaTitle: 'Example', source: { provider, id } }),
      ).map((issue) => issue.code);
    expect(sourced('mangadex', ' ')).toContain('invalid_source');
    expect(sourced(' ', 'abc')).toContain('invalid_source');
    expect(sourced('mangadex', 'abc')).not.toContain('invalid_source');
  });
});

describe('isMappableChapter', () => {
  it('accepts a chapter with a number, with or without a known special suffix', () => {
    expect(isMappableChapter(chapters[1]!)).toBe(true);
    expect(isMappableChapter(chapters[2]!)).toBe(true);
  });

  it('rejects a chapter mangabind.json cannot represent, matching what validation reports', () => {
    const numberless: MappingChapter = { id: 'n', name: 'Vol 3', path: '/n', pageCount: 1 };
    const badSuffix: MappingChapter = { ...chapters[1]!, id: 's', special: 'not-a-suffix' };

    expect(isMappableChapter(numberless)).toBe(false);
    expect(isMappableChapter(badSuffix)).toBe(false);
  });
});

describe('mappingSignature', () => {
  const grouped = () =>
    createMappingDraft({
      chapters,
      mangaTitle: 'Example Manga',
      volumes: [
        { id: 'a', number: '2', chapterIds: ['c3'] },
        { id: 'b', number: '1', chapterIds: ['c2', 'c1'] },
      ],
    });

  it('ignores volume ids, volume order and chapter order', () => {
    const renamed = createMappingDraft({
      chapters,
      mangaTitle: ' Example Manga ',
      volumes: [
        { id: 'x', number: '1', chapterIds: ['c1', 'c2'] },
        { id: 'y', number: '2.0', chapterIds: ['c3'] },
      ],
    });

    expect(mappingSignature(renamed)).toBe(mappingSignature(grouped()));
  });

  it('changes with the assignment, the title, or the source', () => {
    const base = mappingSignature(grouped());

    expect(mappingSignature(unassignChapters(grouped(), ['c3'])) === base).toBe(false);
    expect(mappingSignature({ ...grouped(), mangaTitle: 'Other' }) === base).toBe(false);
    expect(
      mappingSignature({ ...grouped(), source: { provider: 'external', id: 'w1' } }) === base,
    ).toBe(false);
  });
});

describe('the language chapters declare', () => {
  const chapter = (id: string, language?: string) => ({
    id,
    name: id,
    path: `/m/${id}`,
    pageCount: 1,
    chapter: Number(id.slice(1)),
    ...(language === undefined ? {} : { language }),
  });

  it('is the one most of them declare', () => {
    expect(
      dominantLanguage([chapter('c1', 'en'), chapter('c2', 'pt-br'), chapter('c3', 'pt-br')]),
    ).toBe('pt-br');
  });

  it('ignores chapters that declare none, and is undefined when none does', () => {
    expect(dominantLanguage([chapter('c1'), chapter('c2', 'fr'), chapter('c3')])).toBe('fr');
    expect(dominantLanguage([chapter('c1'), chapter('c2')])).toBeUndefined();
    expect(dominantLanguage([])).toBeUndefined();
  });

  it('goes to the language met first when two are declared as often', () => {
    expect(dominantLanguage([chapter('c1', 'es'), chapter('c2', 'en')])).toBe('es');
    expect(dominantLanguage([chapter('c1', 'en'), chapter('c2', 'es')])).toBe('en');
  });
});

describe('isVolumeNumber', () => {
  it.each(['1', '01', '12', '1.5', '0', ' 2 ', '100000'])(
    'takes %j for a volume number',
    (typed) => {
      expect(isVolumeNumber(typed)).toBe(true);
    },
  );

  // mangabind refuses a mapping file with a volume above 100000, so the field must not take it.
  it.each([
    '100001',
    '100000.5',
    '9007199254740993',
    '1'.padEnd(400, '0'),
    // Too small to be written without an exponent.
    '0.0000001',
  ])(
    'does not take %j, which mangabind would refuse or which would not be kept as typed',
    (typed) => {
      expect(isVolumeNumber(typed)).toBe(false);
    },
  );

  it.each(['', 'one', '1,5', '-1', '+1', '1e3', '0x10', '.5', '1.'])(
    'does not take %j for one',
    (typed) => {
      expect(isVolumeNumber(typed)).toBe(false);
    },
  );
});
