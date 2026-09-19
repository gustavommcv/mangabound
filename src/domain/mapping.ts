export interface MappingChapter {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly pageCount: number;
  readonly chapter?: number;
  readonly special?: string;
  readonly parsedVolume?: number;
}

export interface MappingVolume {
  readonly id: string;
  readonly number: string;
  readonly chapterIds: readonly string[];
}

export interface MappingSource {
  readonly provider: string;
  readonly id: string;
}

export interface MappingDraft {
  readonly mangaTitle: string;
  readonly chapters: readonly MappingChapter[];
  readonly volumes: readonly MappingVolume[];
  readonly source?: MappingSource;
}

export interface MappingIssue {
  readonly code:
    | 'duplicate_chapter'
    | 'duplicate_volume'
    | 'empty_volume'
    | 'filename_volume_conflict'
    | 'invalid_source'
    | 'unassigned_chapters'
    | 'unparseable_chapter';
  readonly severity: 'warning' | 'error';
  readonly message: string;
  readonly chapterIds?: readonly string[];
  readonly volumeIds?: readonly string[];
}

export interface MangabindMetadataFile {
  readonly schema_version: 1;
  readonly manga?: { readonly title: string };
  readonly volumes: readonly {
    readonly number: string;
    readonly chapters: readonly string[];
  }[];
  readonly source?: { readonly provider: string; readonly id: string };
}

export class MappingOperationError extends Error {
  constructor(
    readonly code:
      | 'chapter_not_found'
      | 'duplicate_chapter_id'
      | 'duplicate_volume_id'
      | 'empty_selection'
      | 'invalid_chapter'
      | 'invalid_split'
      | 'invalid_volume_number'
      | 'same_volume'
      | 'volume_not_found',
    message: string,
  ) {
    super(message);
    this.name = 'MappingOperationError';
  }
}

export class MappingValidationError extends Error {
  constructor(readonly issues: readonly MappingIssue[]) {
    super('The chapter-to-volume mapping has errors that must be fixed before it can be saved.');
    this.name = 'MappingValidationError';
  }
}

function canonicalVolumeNumber(value: string): string {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d+)?$/u.test(trimmed)) {
    throw new MappingOperationError('invalid_volume_number', `Invalid volume number: ${value}`);
  }
  const number = Number(trimmed);
  if (!Number.isFinite(number)) {
    throw new MappingOperationError('invalid_volume_number', `Invalid volume number: ${value}`);
  }
  return String(number);
}

function chapterToken(chapter: MappingChapter): string {
  if (chapter.chapter === undefined || !Number.isFinite(chapter.chapter) || chapter.chapter < 0) {
    throw new MappingOperationError(
      'invalid_chapter',
      `${chapter.name} does not have a chapter number mangabind can map.`,
    );
  }
  if (chapter.special !== undefined && !/^[xyz]\d+$/u.test(chapter.special)) {
    throw new MappingOperationError(
      'invalid_chapter',
      `${chapter.name} has an unsupported special-chapter suffix.`,
    );
  }
  return `${String(chapter.chapter)}${chapter.special ?? ''}`;
}

/**
 * Whether mangabind.json can represent this chapter: it needs a usable chapter number and, if
 * it is a special chapter, a suffix mangabind understands. validateMapping reports the same
 * chapters as unparseable, so a draft must not start with one assigned to a volume.
 */
export function isMappableChapter(chapter: MappingChapter): boolean {
  try {
    chapterToken(chapter);
    return true;
  } catch {
    return false;
  }
}

/**
 * A stable identity for what a draft says, ignoring volume ids: two drafts with the same
 * signature have the same title, source, and volume-to-chapter assignment.
 */
export function mappingSignature(draft: MappingDraft): string {
  const volumes = draft.volumes
    .map((volume) => ({ number: volume.number, chapterIds: [...volume.chapterIds].sort() }))
    .sort((left, right) => Number(left.number) - Number(right.number));
  return JSON.stringify({
    title: draft.mangaTitle.trim(),
    source: draft.source ?? null,
    volumes,
  });
}

function compareChapters(left: MappingChapter, right: MappingChapter): number {
  const leftNumber = left.chapter ?? Number.POSITIVE_INFINITY;
  const rightNumber = right.chapter ?? Number.POSITIVE_INFINITY;
  return (
    leftNumber - rightNumber ||
    (left.special ?? '').localeCompare(right.special ?? '', 'en') ||
    left.name.localeCompare(right.name, 'en') ||
    left.id.localeCompare(right.id, 'en')
  );
}

function chapterById(draft: MappingDraft, chapterId: string): MappingChapter {
  const chapter = draft.chapters.find((candidate) => candidate.id === chapterId);
  if (chapter === undefined) {
    throw new MappingOperationError('chapter_not_found', `Unknown chapter: ${chapterId}`);
  }
  return chapter;
}

function volumeIndex(draft: MappingDraft, volumeId: string): number {
  const index = draft.volumes.findIndex((volume) => volume.id === volumeId);
  if (index === -1) {
    throw new MappingOperationError('volume_not_found', `Unknown volume: ${volumeId}`);
  }
  return index;
}

function uniqueChapterIds(draft: MappingDraft, chapterIds: readonly string[]): readonly string[] {
  if (chapterIds.length === 0) {
    throw new MappingOperationError('empty_selection', 'Choose at least one chapter.');
  }
  const unique = [...new Set(chapterIds)];
  for (const chapterId of unique) chapterById(draft, chapterId);
  return unique.sort((left, right) =>
    compareChapters(chapterById(draft, left), chapterById(draft, right)),
  );
}

function withoutChapters(
  volumes: readonly MappingVolume[],
  chapterIds: ReadonlySet<string>,
): readonly MappingVolume[] {
  return volumes.map((volume) => ({
    ...volume,
    chapterIds: volume.chapterIds.filter((chapterId) => !chapterIds.has(chapterId)),
  }));
}

export function createMappingDraft({
  chapters,
  mangaTitle,
  source,
  volumes = [],
}: {
  readonly chapters: readonly MappingChapter[];
  readonly mangaTitle: string;
  readonly source?: MappingSource;
  readonly volumes?: readonly MappingVolume[];
}): MappingDraft {
  const chapterIds = new Set<string>();
  for (const chapter of chapters) {
    if (chapterIds.has(chapter.id)) {
      throw new MappingOperationError(
        'duplicate_chapter_id',
        `Duplicate chapter id: ${chapter.id}`,
      );
    }
    chapterIds.add(chapter.id);
  }
  const volumeIds = new Set<string>();
  for (const volume of volumes) {
    if (volumeIds.has(volume.id)) {
      throw new MappingOperationError('duplicate_volume_id', `Duplicate volume id: ${volume.id}`);
    }
    volumeIds.add(volume.id);
  }

  let draft: MappingDraft = {
    mangaTitle,
    chapters: [...chapters].sort(compareChapters),
    volumes: [],
    ...(source === undefined ? {} : { source }),
  };
  for (const volume of volumes) {
    draft = addVolume(draft, volume.id, volume.number);
    if (volume.chapterIds.length > 0) {
      draft = assignChapters(draft, volume.id, volume.chapterIds);
    }
  }
  return draft;
}

export function addVolume(draft: MappingDraft, id: string, number: string): MappingDraft {
  if (draft.volumes.some((volume) => volume.id === id)) {
    throw new MappingOperationError('duplicate_volume_id', `Duplicate volume id: ${id}`);
  }
  return {
    ...draft,
    volumes: [...draft.volumes, { id, number: canonicalVolumeNumber(number), chapterIds: [] }],
  };
}

export function removeVolume(draft: MappingDraft, volumeId: string): MappingDraft {
  const index = volumeIndex(draft, volumeId);
  return { ...draft, volumes: draft.volumes.filter((_, candidate) => candidate !== index) };
}

export function renumberVolume(
  draft: MappingDraft,
  volumeId: string,
  number: string,
): MappingDraft {
  const index = volumeIndex(draft, volumeId);
  return {
    ...draft,
    volumes: draft.volumes.map((volume, candidate) =>
      candidate === index ? { ...volume, number: canonicalVolumeNumber(number) } : volume,
    ),
  };
}

export function assignChapters(
  draft: MappingDraft,
  volumeId: string,
  chapterIds: readonly string[],
): MappingDraft {
  const targetIndex = volumeIndex(draft, volumeId);
  const selected = uniqueChapterIds(draft, chapterIds);
  const selectedSet = new Set(selected);
  const volumes = withoutChapters(draft.volumes, selectedSet).map((volume, index) =>
    index === targetIndex
      ? {
          ...volume,
          chapterIds: uniqueChapterIds(draft, [...volume.chapterIds, ...selected]),
        }
      : volume,
  );
  return { ...draft, volumes };
}

export function assignChapterRange(
  draft: MappingDraft,
  volumeId: string,
  firstChapterId: string,
  lastChapterId: string,
): MappingDraft {
  const firstIndex = draft.chapters.findIndex((chapter) => chapter.id === firstChapterId);
  const lastIndex = draft.chapters.findIndex((chapter) => chapter.id === lastChapterId);
  if (firstIndex === -1) chapterById(draft, firstChapterId);
  if (lastIndex === -1) chapterById(draft, lastChapterId);
  const start = Math.min(firstIndex, lastIndex);
  const end = Math.max(firstIndex, lastIndex);
  return assignChapters(
    draft,
    volumeId,
    draft.chapters.slice(start, end + 1).map((chapter) => chapter.id),
  );
}

export function unassignChapters(draft: MappingDraft, chapterIds: readonly string[]): MappingDraft {
  const selected = uniqueChapterIds(draft, chapterIds);
  return { ...draft, volumes: withoutChapters(draft.volumes, new Set(selected)) };
}

export function splitVolume(
  draft: MappingDraft,
  volumeId: string,
  firstChapterId: string,
  newVolumeId: string,
  newVolumeNumber: string,
): MappingDraft {
  const index = volumeIndex(draft, volumeId);
  if (draft.volumes.some((volume) => volume.id === newVolumeId)) {
    throw new MappingOperationError('duplicate_volume_id', `Duplicate volume id: ${newVolumeId}`);
  }
  const volume = draft.volumes[index]!;
  const splitIndex = volume.chapterIds.indexOf(firstChapterId);
  if (splitIndex <= 0) {
    throw new MappingOperationError(
      'invalid_split',
      'A split must leave at least one chapter in each volume.',
    );
  }
  const left = { ...volume, chapterIds: volume.chapterIds.slice(0, splitIndex) };
  const right = {
    id: newVolumeId,
    number: canonicalVolumeNumber(newVolumeNumber),
    chapterIds: volume.chapterIds.slice(splitIndex),
  };
  return {
    ...draft,
    volumes: [...draft.volumes.slice(0, index), left, right, ...draft.volumes.slice(index + 1)],
  };
}

export function mergeVolumes(
  draft: MappingDraft,
  targetVolumeId: string,
  sourceVolumeId: string,
): MappingDraft {
  if (targetVolumeId === sourceVolumeId) {
    throw new MappingOperationError('same_volume', 'Choose two different volumes to merge.');
  }
  const targetIndex = volumeIndex(draft, targetVolumeId);
  const sourceIndex = volumeIndex(draft, sourceVolumeId);
  const sourceChapterIds = draft.volumes[sourceIndex]!.chapterIds;
  const combinedChapterIds = [...draft.volumes[targetIndex]!.chapterIds, ...sourceChapterIds];
  return {
    ...draft,
    volumes: draft.volumes
      .map((volume, index) =>
        index === targetIndex
          ? {
              ...volume,
              chapterIds:
                combinedChapterIds.length === 0 ? [] : uniqueChapterIds(draft, combinedChapterIds),
            }
          : volume,
      )
      .filter((_, index) => index !== sourceIndex),
  };
}

export interface VolumeSuggestion {
  readonly number: string;
  readonly chapterNumbers: readonly number[];
}

export function applyVolumeSuggestion(
  draft: MappingDraft,
  suggestions: readonly (VolumeSuggestion & { readonly id: string })[],
  source: MappingSource,
): MappingDraft {
  let next: MappingDraft = draft;
  for (const suggestion of suggestions) {
    const matchedChapterIds = draft.chapters
      .filter(
        (chapter) =>
          chapter.chapter !== undefined && suggestion.chapterNumbers.includes(chapter.chapter),
      )
      .map((chapter) => chapter.id);
    if (matchedChapterIds.length === 0) continue;
    const canonicalNumber = canonicalVolumeNumber(suggestion.number);
    const existingVolume = next.volumes.find((volume) => volume.number === canonicalNumber);
    const volumeId = existingVolume?.id ?? suggestion.id;
    if (existingVolume === undefined) next = addVolume(next, volumeId, suggestion.number);
    next = assignChapters(next, volumeId, matchedChapterIds);
  }
  return { ...next, source };
}

export function assignedVolumeId(draft: MappingDraft, chapterId: string): string | undefined {
  chapterById(draft, chapterId);
  return draft.volumes.find((volume) => volume.chapterIds.includes(chapterId))?.id;
}

export function validateMapping(draft: MappingDraft): readonly MappingIssue[] {
  const issues: MappingIssue[] = [];
  const numbers = new Map<string, string[]>();
  const assigned = new Set<string>();
  const tokens = new Map<string, string[]>();

  if (draft.source !== undefined && (!draft.source.provider.trim() || !draft.source.id.trim())) {
    issues.push({
      code: 'invalid_source',
      severity: 'error',
      message: 'A suggested mapping must identify both its provider and work.',
    });
  }

  for (const volume of draft.volumes) {
    const sameNumber = numbers.get(volume.number) ?? [];
    sameNumber.push(volume.id);
    numbers.set(volume.number, sameNumber);
    if (volume.chapterIds.length === 0) {
      issues.push({
        code: 'empty_volume',
        severity: 'error',
        message: `Volume ${volume.number} has no chapters.`,
        volumeIds: [volume.id],
      });
    }
    for (const chapterId of volume.chapterIds) {
      assigned.add(chapterId);
      const chapter = chapterById(draft, chapterId);
      let token: string;
      try {
        token = chapterToken(chapter);
      } catch {
        issues.push({
          code: 'unparseable_chapter',
          severity: 'error',
          message: `${chapter.name} cannot be represented in mangabind.json.`,
          chapterIds: [chapterId],
        });
        continue;
      }
      const sameToken = tokens.get(token) ?? [];
      sameToken.push(chapterId);
      tokens.set(token, sameToken);
      if (chapter.parsedVolume !== undefined && chapter.parsedVolume !== Number(volume.number)) {
        issues.push({
          code: 'filename_volume_conflict',
          severity: 'error',
          message: `${chapter.name} names volume ${String(chapter.parsedVolume)}, which mangabind will keep instead of volume ${volume.number}.`,
          chapterIds: [chapterId],
          volumeIds: [volume.id],
        });
      }
    }
  }

  for (const [number, volumeIds] of numbers) {
    if (volumeIds.length > 1) {
      issues.push({
        code: 'duplicate_volume',
        severity: 'error',
        message: `More than one volume is numbered ${number}.`,
        volumeIds,
      });
    }
  }
  for (const [token, chapterIds] of tokens) {
    if (chapterIds.length > 1) {
      issues.push({
        code: 'duplicate_chapter',
        severity: 'error',
        message: `More than one source represents chapter ${token}; mangabind cannot choose between them.`,
        chapterIds,
      });
    }
  }
  const unassigned = draft.chapters
    .filter((chapter) => !assigned.has(chapter.id))
    .map((chapter) => chapter.id);
  if (unassigned.length > 0) {
    issues.push({
      code: 'unassigned_chapters',
      severity: 'warning',
      message: `${String(unassigned.length)} chapter${unassigned.length === 1 ? ' is' : 's are'} not assigned to a volume.`,
      chapterIds: unassigned,
    });
  }
  return issues;
}

export function toMangabindMetadata(draft: MappingDraft): MangabindMetadataFile {
  const issues = validateMapping(draft);
  const errors = issues.filter((issue) => issue.severity === 'error');
  if (errors.length > 0) throw new MappingValidationError(errors);

  const chapters = new Map(draft.chapters.map((chapter) => [chapter.id, chapter]));
  const volumes = [...draft.volumes]
    .sort((left, right) => Number(left.number) - Number(right.number))
    .map((volume) => ({
      number: volume.number,
      chapters: volume.chapterIds
        .map((chapterId) => chapters.get(chapterId)!)
        .sort(compareChapters)
        .map(chapterToken),
    }));
  const title = draft.mangaTitle.trim();
  return {
    schema_version: 1,
    ...(title === '' ? {} : { manga: { title } }),
    volumes,
    ...(draft.source === undefined
      ? {}
      : { source: { provider: draft.source.provider, id: draft.source.id } }),
  };
}

export function serializeMangabindMetadata(draft: MappingDraft): string {
  return `${JSON.stringify(toMangabindMetadata(draft), null, 2)}\n`;
}
