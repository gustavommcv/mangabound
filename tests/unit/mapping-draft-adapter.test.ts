import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { mappingDraftFromMangabindReport } from '@/adapters/mangabind/mapping-draft';
import { parseMangabindReport } from '@/adapters/mangabind/protocol';
import { validateMapping } from '@/domain/mapping';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
function protocolFixture(name: string): ReturnType<typeof parseMangabindReport> {
  return parseMangabindReport(
    fs.readFileSync(path.join(repositoryRoot, 'tests', 'fixtures', 'protocol', name), 'utf8'),
  );
}
const report = protocolFixture('mangabind-v1-plan.json');
// Real mangabind 0.4.0 reports, recorded from the pinned binary.
const groupedReport = protocolFixture('mangabind-v1-vol-ch-title.json');
const mixedReport = protocolFixture('mangabind-v1-mixed-grouping.json');
const duplicateReport = protocolFixture('mangabind-v1-duplicate-chapters.json');

describe('mangabind report to mapping draft', () => {
  it('starts from parsed chapters with no volume assignments and no provider', () => {
    const draft = mappingDraftFromMangabindReport(report, { seed: 'empty' });

    expect(draft.mangaTitle).toBe('Mangá São José');
    expect(draft.source).toBeUndefined();
    expect(draft.volumes).toEqual([]);
    expect(draft.chapters).toMatchObject([
      { name: 'Chapter 1', chapter: 1, pageCount: 2 },
      { name: 'Chapter 3', chapter: 3, pageCount: 1 },
    ]);
  });

  it('can seed the exact same draft from effective suggested assignments', () => {
    const draft = mappingDraftFromMangabindReport(report, {
      seed: 'effective-volumes',
      source: { provider: 'external', id: 'api-work-id' },
    });

    expect(draft.source).toEqual({ provider: 'external', id: 'api-work-id' });
    expect(draft.volumes).toMatchObject([
      {
        id: 'effective-volume-1',
        number: '1',
        chapterIds: ['/fixtures/Mangá São José/Chapter 1'],
      },
    ]);
  });

  it('rejects a missing manga selection', () => {
    expect(() =>
      mappingDraftFromMangabindReport(report, { mangaIndex: 99, seed: 'empty' }),
    ).toThrow(RangeError);
  });

  it('preserves parser volume and special fields when present and omits unparsed units', () => {
    const enriched = structuredClone(report);
    const manga = enriched.manga[0]!;
    manga.units.push({
      name: 'Unparsed notes',
      path: '/fixtures/notes',
      kind: 'folder',
      page_count: 0,
      parser: { matched: false },
      metadata_assignment: { status: 'not_applicable' },
      disposition: 'unparsed',
    });
    manga.units.push({
      name: 'Parsed without a number',
      path: '/fixtures/numberless',
      kind: 'folder',
      page_count: 1,
      parser: { matched: true, name: 'future-parser' },
      metadata_assignment: { status: 'not_found' },
      disposition: 'unassigned',
    });
    Object.assign(manga.units[0]!.parser, { special: 'x1', volume: 4 });

    const draft = mappingDraftFromMangabindReport(enriched, { seed: 'effective-volumes' });

    expect(draft.chapters).toHaveLength(3);
    expect(draft.chapters[0]).toMatchObject({ special: 'x1', parsedVolume: 4 });
  });
});

describe('seeding the mapping from mangabind grouping', () => {
  const chapterPath = (name: string): string => `/fixtures/Chainsaw Man/${name}`;

  it('groups a folder whose names carry the volumes, with nothing left to fix', () => {
    const draft = mappingDraftFromMangabindReport(groupedReport, { seed: 'effective-volumes' });

    expect(draft.mangaTitle).toBe('Chainsaw Man');
    expect(draft.volumes).toMatchObject([
      {
        id: 'effective-volume-1',
        number: '1',
        chapterIds: [
          chapterPath(
            'Vol.01 Ch.0001 - Cachorro & Motosserra (pt-br) [Morro dos Scans, Power Scans]',
          ),
          chapterPath('Vol.01 Ch.0002 - O Cachorro Que Foi ao Encontro (pt-br) [Morro dos Scans]'),
        ],
      },
      {
        id: 'effective-volume-2',
        number: '2',
        chapterIds: [
          chapterPath('Vol.02 Ch.0008 - Titulo Qualquer (pt-br) [Morro dos Scans]'),
          chapterPath('Vol.02 Ch.0009 - Outro Titulo (pt-br) [Power Scans]'),
        ],
      },
    ]);
    expect(validateMapping(draft)).toEqual([]);
  });

  it('still starts empty when asked to', () => {
    const draft = mappingDraftFromMangabindReport(groupedReport, { seed: 'empty' });

    expect(draft.volumes).toEqual([]);
    expect(draft.chapters).toHaveLength(4);
  });

  it('leaves a chapter that names no volume unassigned, with only a warning', () => {
    const draft = mappingDraftFromMangabindReport(mixedReport, { seed: 'effective-volumes' });

    expect(draft.volumes.map((volume) => volume.number)).toEqual(['1', '2']);
    expect(draft.chapters).toHaveLength(3);
    expect(validateMapping(draft)).toMatchObject([
      {
        code: 'unassigned_chapters',
        severity: 'warning',
        chapterIds: ['/fixtures/Mixed Manga/Chapter 2'],
      },
    ]);
  });

  it('never seeds a duplicate chapter, which mangabind reports as a conflict and skips', () => {
    const conflicting = duplicateReport.manga[0]!.units.filter(
      (unit) => unit.disposition === 'conflict',
    );
    expect(conflicting).toHaveLength(2);
    expect(conflicting.every((unit) => unit.effective_volume === 1)).toBe(true);

    const draft = mappingDraftFromMangabindReport(duplicateReport, { seed: 'effective-volumes' });

    expect(draft.volumes).toMatchObject([
      {
        number: '1',
        chapterIds: ['/fixtures/Dupes Manga/Vol.01 Ch.0002 - Next (en) [GroupA]'],
      },
    ]);
    expect(draft.chapters).toHaveLength(3);
    expect(validateMapping(draft).filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('does not seed a unit mangabind includes but that has no chapter number or a bad suffix', () => {
    const edited = structuredClone(groupedReport);
    const [first, second] = edited.manga[0]!.units;
    delete first!.parser.chapter;
    second!.parser.special = 'not-a-suffix';

    const draft = mappingDraftFromMangabindReport(edited, { seed: 'effective-volumes' });

    expect(draft.chapters).toHaveLength(4);
    expect(draft.volumes).toMatchObject([{ number: '2' }]);
    expect(draft.volumes).toHaveLength(1);
    expect(validateMapping(draft).filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('ignores an included unit that has no effective volume or is not a parsed chapter', () => {
    const edited = structuredClone(groupedReport);
    const [first, second] = edited.manga[0]!.units;
    delete first!.effective_volume;
    second!.parser = { matched: false };

    const draft = mappingDraftFromMangabindReport(edited, { seed: 'effective-volumes' });

    expect(draft.chapters).toHaveLength(3);
    expect(draft.volumes).toMatchObject([{ number: '2' }]);
  });

  it('orders volumes numerically however mangabind lists the units', () => {
    const edited = structuredClone(groupedReport);
    edited.manga[0]!.units.reverse();

    const draft = mappingDraftFromMangabindReport(edited, { seed: 'effective-volumes' });

    expect(draft.volumes.map((volume) => volume.number)).toEqual(['1', '2']);
  });
});
