import type { MangabindReport } from './protocol';

import {
  createMappingDraft,
  isMappableChapter,
  type MappingDraft,
  type MappingSource,
  type MappingVolume,
} from '@/domain/mapping';

export function mappingDraftFromMangabindReport(
  report: MangabindReport,
  options: {
    readonly mangaIndex?: number;
    readonly seed: 'empty' | 'effective-volumes';
    readonly source?: MappingSource;
  },
): MappingDraft {
  const manga = report.manga[options.mangaIndex ?? 0];
  if (manga === undefined) {
    throw new RangeError('The mangabind report does not contain the requested manga.');
  }

  const chapters = manga.units
    .filter((unit) => unit.parser.matched)
    .map((unit) => ({
      id: unit.path,
      name: unit.name,
      path: unit.path,
      pageCount: unit.page_count,
      ...(unit.parser.chapter === undefined ? {} : { chapter: unit.parser.chapter }),
      ...(unit.parser.special === undefined ? {} : { special: unit.parser.special }),
      ...(unit.parser.volume === undefined ? {} : { parsedVolume: unit.parser.volume }),
    }));

  const volumes: MappingVolume[] = [];
  if (options.seed === 'effective-volumes') {
    // Start from mangabind's own grouping (volumes named in the folder names, or already
    // mapped by an existing mangabind.json). Only units mangabind actually includes qualify:
    // a duplicate chapter reports `conflict` even though it carries an effective volume, and
    // mangabind skips every copy. A unit with no usable chapter number would open the editor
    // with an error the user can't explain, so it stays unassigned instead.
    const chapterByPath = new Map(chapters.map((chapter) => [chapter.path, chapter]));
    const volumeByNumber = new Map<number, { id: string; chapterIds: string[] }>();
    for (const unit of manga.units) {
      const chapter = chapterByPath.get(unit.path);
      if (
        chapter === undefined ||
        unit.disposition !== 'included' ||
        unit.effective_volume === undefined ||
        !isMappableChapter(chapter)
      ) {
        continue;
      }
      const existing = volumeByNumber.get(unit.effective_volume) ?? {
        id: `effective-volume-${String(unit.effective_volume)}`,
        chapterIds: [],
      };
      existing.chapterIds.push(unit.path);
      volumeByNumber.set(unit.effective_volume, existing);
    }
    // Numeric order: "Merge into volume N-1" in the editor follows array order.
    for (const [number, volume] of [...volumeByNumber].sort(([left], [right]) => left - right)) {
      volumes.push({ ...volume, number: String(number) });
    }
  }

  return createMappingDraft({
    chapters,
    mangaTitle: manga.name,
    volumes,
    ...(options.source === undefined ? {} : { source: options.source }),
  });
}
