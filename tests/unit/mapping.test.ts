import { describe, expect, it } from 'vitest';

import {
  addVolume,
  applyVolumeSuggestion,
  assignedVolumeId,
  assignChapterRange,
  assignChapters,
  createMappingDraft,
  MappingOperationError,
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
