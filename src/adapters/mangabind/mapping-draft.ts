import type { MangabindReport } from './protocol';

import {
  createMappingDraft,
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
    const volumeByNumber = new Map<number, { id: string; chapterIds: string[] }>();
    for (const unit of manga.units) {
      if (!unit.parser.matched || unit.effective_volume === undefined) continue;
      const existing = volumeByNumber.get(unit.effective_volume) ?? {
        id: `effective-volume-${String(unit.effective_volume)}`,
        chapterIds: [],
      };
      existing.chapterIds.push(unit.path);
      volumeByNumber.set(unit.effective_volume, existing);
    }
    for (const [number, volume] of volumeByNumber) {
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
