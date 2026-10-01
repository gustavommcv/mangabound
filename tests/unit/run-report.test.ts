import { describe, expect, it } from 'vitest';

import type { InspectedRow, LibraryTitle, QueueRow } from '@/domain/input-queue';
import { createMappingDraft } from '@/domain/mapping';
import type { ProcessMode } from '@/domain/process-mode';
import {
  describeRun,
  finishRunReport,
  reportInputRun,
  reportLibraryRun,
  type RunOutcome,
} from '@/domain/run-report';

const chapters = [
  { id: 'c1', name: 'Chapter 1', path: '/m/1', pageCount: 2, chapter: 1 },
  { id: 'c2', name: 'Chapter 2', path: '/m/2', pageCount: 2, chapter: 2 },
] as const;
const grouped = createMappingDraft({
  mangaTitle: 'Work',
  chapters,
  volumes: [{ id: 'v1', number: '1', chapterIds: ['c1', 'c2'] }],
});
const ungrouped = createMappingDraft({ mangaTitle: 'Work', chapters });

const folder = (id: string): InspectedRow => ({
  id,
  displayName: id,
  displayPath: `/m/${id}`,
  kind: 'folder',
  state: 'inspected',
  sessionId: `session-${id}`,
  confirmed: false,
  mapping: grouped,
});
const title = (name: string): LibraryTitle => ({
  title: name,
  draft: grouped,
  volumes: [{ name: `${name}.cbz`, pageCount: 4 }],
});
const library = (id: string, titles: readonly LibraryTitle[]): InspectedRow => ({
  ...folder(id),
  kind: 'library',
  titles,
});
// Artifacts are deliberately opaque to the rules, not reconstructed or sorted by the report.
const book = Object.freeze({ id: 'book', name: 'Work.epub' });
const books = Object.freeze([book]);

describe('one input in a run', () => {
  it('reports a completed input with the same books in their original order', () => {
    const artifacts = [book, { id: 'second', name: 'Work - Vol.02.epub' }];
    const report = reportInputRun(folder('Work'), { ok: true, value: artifacts });

    expect(report).toEqual({
      outcomes: [{ rowId: 'Work', name: 'Work', status: 'done', artifacts }],
      cancelled: false,
    });
    expect(report.outcomes[0]?.artifacts).toBe(artifacts);
  });

  it.each([
    ['process_failed', false],
    ['cancelled', true],
  ])('reports %s without books and stops later work only on cancellation', (code, cancelled) => {
    const report = reportInputRun(folder('Work'), {
      ok: false,
      error: { code, message: 'The tool stopped.' },
    });

    expect(report).toEqual({
      outcomes: [
        {
          rowId: 'Work',
          name: 'Work',
          status: 'failed',
          artifacts: [],
          message: 'The tool stopped.',
        },
      ],
      cancelled,
    });
  });
});

describe('a library in a run', () => {
  it.each([
    ['binding_failed', false],
    ['cancelled', true],
  ])('keeps %s at row level without marking any title completed', (code, cancelled) => {
    const report = reportLibraryRun(library('Library', [title('Work')]), {
      ok: false,
      error: { code, message: 'The library could not run.' },
    });

    expect(report).toEqual({
      outcomes: [
        {
          rowId: 'Library',
          name: 'Library',
          status: 'failed',
          artifacts: [],
          message: 'The library could not run.',
        },
      ],
      cancelled,
    });
  });

  it('keeps per-title order and partial books while only completed titles stop needing another run', () => {
    const result = Object.freeze({
      ok: true as const,
      value: Object.freeze([
        { title: 'Good', status: 'done' as const, artifacts: books },
        {
          title: 'Partial',
          status: 'failed' as const,
          artifacts: books,
          failure: { code: 'process_failed', message: 'Volume 2 failed.' },
        },
        { title: 'Unknown', status: 'failed' as const, artifacts: [] },
      ]),
    });
    const report = reportLibraryRun(library('Library', []), result);

    expect(report.outcomes).toEqual([
      { rowId: 'Library', name: 'Library · Good', status: 'done', artifacts: books },
      {
        rowId: 'Library',
        name: 'Library · Partial',
        status: 'failed',
        artifacts: books,
        message: 'Volume 2 failed.',
      },
      { rowId: 'Library', name: 'Library · Unknown', status: 'failed', artifacts: [] },
    ]);
    expect(report.outcomes[1]?.artifacts).toBe(books);
    expect(report.completedTitles).toEqual(new Set(['Good']));
    expect(report.cancelled).toBe(false);
    expect(report.queueUpdate).toEqual({
      type: 'library-results',
      id: 'Library',
      results: [
        { title: 'Good', outcome: { status: 'done' } },
        { title: 'Partial', outcome: { status: 'failed', message: 'Volume 2 failed.' } },
        { title: 'Unknown', outcome: { status: 'failed', message: 'It could not be converted.' } },
      ],
    });
  });

  it('stops later queue work on a cancelled title without discarding another title or its partial books', () => {
    const report = reportLibraryRun(library('Library', []), {
      ok: true,
      value: [
        { title: 'Good', status: 'done', artifacts: books },
        {
          title: 'Cancelled',
          status: 'failed',
          artifacts: books,
          failure: { code: 'cancelled', message: 'Cancelled.' },
        },
      ],
    });

    expect(report.cancelled).toBe(true);
    expect(report.completedTitles).toEqual(new Set(['Good']));
    expect(report.outcomes.flatMap((outcome) => outcome.artifacts)).toEqual([book, book]);
    expect(report.queueUpdate?.results[1]).toEqual({
      title: 'Cancelled',
      outcome: { status: 'failed', message: 'Cancelled.' },
    });
  });

  it('keeps an empty successful reply distinct from a library failure', () => {
    expect(reportLibraryRun(library('Library', []), { ok: true, value: [] })).toEqual({
      outcomes: [],
      cancelled: false,
      completedTitles: new Set(),
      queueUpdate: { type: 'library-results', id: 'Library', results: [] },
    });
  });
});

function finish(
  rows: readonly QueueRow[],
  settled: readonly RunOutcome<unknown>[] = [],
  attempted: ReadonlySet<string> = new Set(),
  completedTitles: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
  mode: ProcessMode = 'bind-and-convert',
) {
  return finishRunReport({ rows, settled, attempted, completedTitles, mode });
}

describe('the final run report and remaining queue', () => {
  it('returns to the queue when there are no outcomes or omissions', () => {
    expect(finish([])).toEqual({ outcomes: [], completedRowIds: [], hasResults: false });
  });

  it('removes only completed inspected inputs, keeping failures, unreadable and still-reading rows', () => {
    const done = folder('Done');
    const failed = folder('Failed');
    const reading: QueueRow = { ...folder('Reading'), state: 'inspecting' };
    const unreadable: QueueRow = {
      ...folder('Unreadable'),
      state: 'unreadable',
      message: 'Cannot read.',
    };
    const settled = Object.freeze([
      ...reportInputRun(done, { ok: true, value: books }).outcomes,
      ...reportInputRun(failed, {
        ok: false,
        error: { code: 'process_failed', message: 'Cannot convert.' },
      }).outcomes,
    ]);
    const rows = Object.freeze([done, failed, reading, unreadable]);
    const attempted = new Set(['Done', 'Failed']);
    const report = finish(rows, settled, attempted);

    expect(report.completedRowIds).toEqual(['Done']);
    expect(report.outcomes).toEqual([
      ...settled,
      {
        rowId: 'Unreadable',
        name: 'Unreadable',
        status: 'skipped',
        artifacts: [],
        message: 'Cannot read.',
        fixable: false,
      },
    ]);
    expect(report.hasResults).toBe(true);
    expect(settled).toHaveLength(2);
    expect(rows).toHaveLength(4);
    expect(attempted).toEqual(new Set(['Done', 'Failed']));
  });

  it('does not describe ready but unattempted inputs as skipped after cancellation', () => {
    const first = folder('First');
    const report = finish(
      [first, folder('Later'), library('Later library', [title('Work')])],
      reportInputRun(first, { ok: false, error: { code: 'cancelled', message: 'Cancelled.' } })
        .outcomes,
      new Set(['First']),
    );

    expect(report.completedRowIds).toEqual([]);
    expect(report.outcomes).toEqual([
      { rowId: 'First', name: 'First', status: 'failed', artifacts: [], message: 'Cancelled.' },
    ]);
  });

  it('offers to fix an ungrouped folder and leaves it in the queue', () => {
    const row = { ...folder('Loose'), mapping: ungrouped };
    expect(finish([row])).toEqual({
      outcomes: [
        {
          rowId: 'Loose',
          name: 'Loose',
          status: 'skipped',
          artifacts: [],
          message: 'No volumes yet. Open Edit volumes to group the chapters.',
          fixable: true,
        },
      ],
      completedRowIds: [],
      hasResults: true,
    });
  });

  it('leaves a CBZ out of join-only mode with no fix action', () => {
    const row: InspectedRow = { ...folder('Comic.cbz'), kind: 'cbz' };
    expect(finish([row], [], new Set(), new Map(), 'bind-only').outcomes).toEqual([
      {
        rowId: row.id,
        name: row.displayName,
        status: 'skipped',
        artifacts: [],
        message: 'A CBZ is already one volume, so there is nothing to join.',
        fixable: false,
      },
    ]);
    expect(finish([row]).outcomes).toEqual([]);
  });

  it('does not offer a grouping fix for a library skipped in convert-only mode', () => {
    const row = library('Library', [title('Work')]);
    const report = finish([row], [], new Set(), new Map(), 'convert-only');

    expect(report.outcomes).toEqual([
      {
        rowId: row.id,
        name: row.displayName,
        status: 'skipped',
        artifacts: [],
        message: 'A library is grouped title by title first, so it cannot skip joining volumes.',
        fixable: false,
      },
    ]);
    expect(report.completedRowIds).toEqual([]);
  });

  it.each([1, 2])(
    'reports %i waiting library titles after an attempted run, never retrying them as completed',
    (count) => {
      const waiting = Array.from({ length: count }, (_, index) => ({
        ...title(`Loose ${String(index)}`),
        volumes: [],
      }));
      const row = library('Library', [
        title('Good'),
        ...waiting,
        { ...title('Earlier'), volumes: [], outcome: { status: 'done' } },
      ]);
      const ran = reportLibraryRun(row, {
        ok: true,
        value: [{ title: 'Good', status: 'done', artifacts: books }],
      });
      const completed = new Map([['Library', ran.completedTitles ?? new Set<string>()]]);
      const report = finish([row], ran.outcomes, new Set(['Library']), completed);

      expect(report.outcomes).toEqual([
        ...ran.outcomes,
        {
          rowId: row.id,
          name: row.displayName,
          status: 'skipped',
          artifacts: [],
          message: `${String(count)} title${count === 1 ? '' : 's'} left out until they have volumes.`,
          fixable: true,
        },
      ]);
      expect(report.completedRowIds).toEqual([]);
      expect(completed).toEqual(new Map([['Library', new Set(['Good'])]]));
    },
  );

  it('removes a library only when this run completed every title not already done', () => {
    const row = library('Library', [
      { ...title('Earlier'), outcome: { status: 'done' } },
      { ...title('Retry'), outcome: { status: 'failed', message: 'Previous failure.' } },
      title('New'),
    ]);
    const completed = new Map([['Library', new Set(['Retry', 'New'])]]);
    const settled = reportLibraryRun(row, {
      ok: true,
      value: [
        { title: 'Retry', status: 'done', artifacts: books },
        { title: 'New', status: 'done', artifacts: books },
      ],
    }).outcomes;

    expect(finish([row], settled, new Set(['Library']), completed)).toEqual({
      outcomes: settled,
      completedRowIds: ['Library'],
      hasResults: true,
    });
    expect(
      finish([row], settled, new Set(['Library']), new Map([['Library', new Set(['Retry'])]]))
        .completedRowIds,
    ).toEqual([]);
    expect(finish([row], settled, new Set(['Library'])).completedRowIds).toEqual([]);
  });

  it('keeps an attempted library on row-level failure without adding a second skipped outcome for ready titles', () => {
    const row = library('Library', [title('Work')]);
    const ran = reportLibraryRun(row, {
      ok: false,
      error: { code: 'binding_failed', message: 'Cannot bind.' },
    });
    expect(finish([row], ran.outcomes, new Set(['Library']))).toEqual({
      outcomes: ran.outcomes,
      completedRowIds: [],
      hasResults: true,
    });
  });

  it('uses the row chip when there is no omission note and retains an unattempted library', () => {
    const row = library('Library', [{ ...title('Earlier'), outcome: { status: 'done' } }]);
    expect(finish([row]).outcomes).toEqual([
      {
        rowId: row.id,
        name: row.displayName,
        status: 'skipped',
        artifacts: [],
        message: 'Saved',
        fixable: true,
      },
    ]);
    expect(finish([row]).completedRowIds).toEqual([]);
  });

  it('keeps the existing empty-library semantics when titles are absent from the inspected snapshot', () => {
    const row = { ...folder('Library'), kind: 'library' as const };
    expect(finish([row], [], new Set(['Library']))).toEqual({
      outcomes: [],
      completedRowIds: [],
      hasResults: false,
    });
    expect(
      finish([row], [], new Set(['Library']), new Map([['Library', new Set<string>()]])),
    ).toEqual({
      outcomes: [],
      completedRowIds: ['Library'],
      hasResults: false,
    });
  });
});

describe('the run summary', () => {
  it('describes joined CBZ volumes rather than unused device and format choices', () => {
    expect(describeRun('bind-only', 'Kindle 11', 'pdf')).toBe('Joined volumes · CBZ');
  });

  it.each(['bind-and-convert', 'convert-only'] as const)(
    'describes the chosen device and format for %s',
    (mode) => {
      expect(describeRun(mode, 'Kindle 11', 'epub')).toBe('Kindle 11 · EPUB');
    },
  );
});
