import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { mappingDraftFromMangabindReport } from '@/adapters/mangabind/mapping-draft';
import { parseMangabindReport } from '@/adapters/mangabind/protocol';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const report = parseMangabindReport(
  fs.readFileSync(
    path.join(repositoryRoot, 'tests', 'fixtures', 'protocol', 'mangabind-v1-plan.json'),
    'utf8',
  ),
);

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
      source: { provider: 'mangadex', id: 'api-work-id' },
    });

    expect(draft.source).toEqual({ provider: 'mangadex', id: 'api-work-id' });
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
