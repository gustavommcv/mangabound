import { describe, expect, it } from 'vitest';

import {
  describeRow,
  emptyQueue,
  type InspectedRow,
  type QueueInput,
  type QueueRow,
  queueReducer,
  rowMode,
  runnableRows,
  sessionIds,
  summarizeQueue,
  unassignedChapterCount,
} from '@/domain/input-queue';
import { createMappingDraft } from '@/domain/mapping';

const chapters = [
  { id: 'c1', name: 'Chapter 1', path: '/m/1', pageCount: 2, chapter: 1 },
  { id: 'c2', name: 'Chapter 2', path: '/m/2', pageCount: 2, chapter: 2 },
  { id: 'c3', name: 'Chapter 3', path: '/m/3', pageCount: 2, chapter: 3 },
] as const;

function draft(volumes: readonly { id: string; number: string; chapterIds: string[] }[]) {
  return createMappingDraft({ mangaTitle: 'Work', chapters, volumes });
}

const grouped = draft([
  { id: 'v1', number: '1', chapterIds: ['c1', 'c2'] },
  { id: 'v2', number: '2', chapterIds: ['c3'] },
]);
const gappy = draft([{ id: 'v1', number: '1', chapterIds: ['c1', 'c2'] }]);
const ungrouped = draft([]);

const folderInput: QueueInput = {
  id: 'a',
  kind: 'folder',
  displayName: 'Chainsaw Man',
  displayPath: 'D:\\Manga\\Chainsaw Man',
};
const cbzInput: QueueInput = {
  id: 'b',
  kind: 'cbz',
  displayName: 'Vagabond.cbz',
  displayPath: 'D:\\Manga\\Vagabond.cbz',
};

function inspectedFolder(
  mapping: ReturnType<typeof draft> | undefined,
  overrides: Partial<InspectedRow> = {},
): InspectedRow {
  const rows = queueReducer(queueReducer(emptyQueue, { type: 'add', inputs: [folderInput] }), {
    type: 'inspected',
    id: 'a',
    sessionId: 'session-a',
    ...(mapping === undefined ? {} : { mapping }),
  });
  return { ...(rows[0] as InspectedRow), ...overrides };
}

function inspectedCbz(): InspectedRow {
  const rows = queueReducer(queueReducer(emptyQueue, { type: 'add', inputs: [cbzInput] }), {
    type: 'inspected',
    id: 'b',
    sessionId: 'session-b',
  });
  return rows[0] as InspectedRow;
}

describe('input queue reducer', () => {
  it('adds inputs as rows still being read, and keeps the same folder or file to one row', () => {
    const once = queueReducer(emptyQueue, { type: 'add', inputs: [folderInput, cbzInput] });

    expect(once).toEqual([
      { ...folderInput, state: 'inspecting' },
      { ...cbzInput, state: 'inspecting' },
    ]);
    // A second drop of the same folder changes nothing, not even the array identity.
    expect(queueReducer(once, { type: 'add', inputs: [{ ...folderInput, id: 'other' }] })).toBe(
      once,
    );
    // A duplicate inside one batch is dropped too.
    expect(
      queueReducer(emptyQueue, { type: 'add', inputs: [folderInput, { ...folderInput, id: 'x' }] }),
    ).toHaveLength(1);
  });

  it('keeps what mangabind proposed for a folder so a later edit can be told apart', () => {
    const rows = queueReducer(queueReducer(emptyQueue, { type: 'add', inputs: [folderInput] }), {
      type: 'inspected',
      id: 'a',
      sessionId: 'session-a',
      mapping: grouped,
    });

    expect(rows[0]).toMatchObject({
      state: 'inspected',
      sessionId: 'session-a',
      mapping: grouped,
      confirmed: false,
    });
    expect((rows[0] as InspectedRow).proposedSignature).toEqual(expect.any(String));
  });

  it('marks a CBZ inspected without a mapping', () => {
    const row = inspectedCbz();

    expect(row).toMatchObject({ state: 'inspected', kind: 'cbz', sessionId: 'session-b' });
    expect('mapping' in row).toBe(false);
  });

  it('only accepts an inspection result for a row still being read', () => {
    const rows = queueReducer(emptyQueue, { type: 'add', inputs: [folderInput] });
    const done = queueReducer(rows, { type: 'inspected', id: 'a', sessionId: 's1' });

    expect(queueReducer(done, { type: 'inspected', id: 'a', sessionId: 's2' })).toEqual(done);
    expect(queueReducer(done, { type: 'inspect-failed', id: 'a', message: 'late' })).toEqual(done);
    expect(queueReducer(rows, { type: 'inspected', id: 'gone', sessionId: 's3' })).toEqual(rows);
  });

  it('records why a row could not be read', () => {
    const rows = queueReducer(queueReducer(emptyQueue, { type: 'add', inputs: [cbzInput] }), {
      type: 'inspect-failed',
      id: 'b',
      message: 'The file is unreadable.',
    });

    expect(rows[0]).toMatchObject({ state: 'unreadable', message: 'The file is unreadable.' });
    expect(describeRow(rows[0] as QueueRow, 'bind-and-convert')).toMatchObject({
      chip: 'Could not read',
      tone: 'danger',
      runnable: false,
      note: 'The file is unreadable.',
    });
  });

  it('accepts a confirmed mapping only for an inspected folder', () => {
    const inspecting = queueReducer(emptyQueue, { type: 'add', inputs: [folderInput] });
    const inspected = queueReducer(inspecting, {
      type: 'inspected',
      id: 'a',
      sessionId: 's',
      mapping: gappy,
    });

    const confirmed = queueReducer(inspected, {
      type: 'confirm-mapping',
      id: 'a',
      mapping: grouped,
    });

    expect(confirmed[0]).toMatchObject({ confirmed: true, mapping: grouped });
    expect(
      queueReducer(inspecting, { type: 'confirm-mapping', id: 'a', mapping: grouped }),
    ).toEqual(inspecting);
    expect(
      queueReducer(inspected, { type: 'confirm-mapping', id: 'other', mapping: grouped }),
    ).toEqual(inspected);
  });

  it('removes rows by id and can be cleared', () => {
    const rows = queueReducer(emptyQueue, { type: 'add', inputs: [folderInput, cbzInput] });

    expect(queueReducer(rows, { type: 'remove', ids: ['a'] }).map((row) => row.id)).toEqual(['b']);
    expect(queueReducer(rows, { type: 'remove', ids: ['a', 'b', 'missing'] })).toEqual([]);
    expect(queueReducer(rows, { type: 'clear' })).toBe(emptyQueue);
  });

  it('lists the scratch sessions of inspected rows only', () => {
    const rows = [
      { ...folderInput, state: 'inspecting' as const },
      inspectedFolder(grouped),
      inspectedCbz(),
      { ...cbzInput, id: 'c', state: 'unreadable' as const, message: 'x' },
    ];

    expect(sessionIds(rows)).toEqual(['session-a', 'session-b']);
  });
});

describe('what a mode does for each kind of row', () => {
  it('leaves a CBZ alone when a run only joins volumes, and sends it straight to mangapress otherwise', () => {
    expect(rowMode('cbz', 'bind-only')).toBe('skip');
    expect(rowMode('cbz', 'bind-and-convert')).toBe('convert-only');
    expect(rowMode('cbz', 'convert-only')).toBe('convert-only');
    expect(rowMode('folder', 'bind-only')).toBe('bind-only');
    expect(rowMode('folder', 'bind-and-convert')).toBe('bind-and-convert');
    expect(rowMode('folder', 'convert-only')).toBe('convert-only');
  });

  it('counts the chapters no volume has taken', () => {
    expect(unassignedChapterCount(grouped)).toBe(0);
    expect(unassignedChapterCount(gappy)).toBe(1);
    expect(unassignedChapterCount(ungrouped)).toBe(3);
  });
});

describe('describing a row', () => {
  it('says a row is still being read, folder or file', () => {
    expect(describeRow({ ...folderInput, state: 'inspecting' }, 'bind-and-convert')).toEqual({
      chip: 'Checking…',
      tone: 'neutral',
      detail: 'Folder · reading it',
      runnable: false,
    });
    expect(describeRow({ ...cbzInput, state: 'inspecting' }, 'bind-and-convert').detail).toBe(
      'CBZ · checking it',
    );
  });

  it('says why a folder could not be read', () => {
    expect(
      describeRow(
        { ...folderInput, state: 'unreadable', message: 'Access denied.' },
        'bind-and-convert',
      ),
    ).toMatchObject({ detail: 'Folder', note: 'Access denied.' });
  });

  it('is ready for a CBZ unless the run only joins volumes', () => {
    expect(describeRow(inspectedCbz(), 'bind-and-convert')).toEqual({
      chip: 'Ready',
      tone: 'neutral',
      detail: 'CBZ · goes straight to the e-reader step',
      runnable: true,
    });
    expect(describeRow(inspectedCbz(), 'bind-only')).toMatchObject({
      chip: 'Nothing to join',
      runnable: false,
      note: expect.stringContaining('already one volume') as string,
    });
  });

  it('shows a folder mangabind already grouped from its names as ready, with its volumes', () => {
    expect(describeRow(inspectedFolder(grouped), 'bind-and-convert')).toEqual({
      chip: '2 volumes',
      tone: 'accent',
      detail: 'Folder · 3 chapters · grouped from names',
      runnable: true,
    });
    expect(
      describeRow(
        inspectedFolder(draft([{ id: 'v1', number: '1', chapterIds: ['c1', 'c2', 'c3'] }])),
        'bind-only',
      ).chip,
    ).toBe('1 volume');
  });

  it('stops claiming the grouping came from the names once the user changed it', () => {
    const edited = inspectedFolder(grouped, {
      mapping: draft([{ id: 'v1', number: '1', chapterIds: ['c1', 'c2', 'c3'] }]),
    });

    expect(describeRow(edited, 'bind-and-convert').detail).toBe('Folder · 3 chapters');
  });

  it('does not claim it either when nothing recorded what mangabind proposed', () => {
    const { proposedSignature, ...withoutProposal } = inspectedFolder(grouped);

    // The starting point is otherwise recorded, so removing it is what changes the outcome.
    expect(proposedSignature).toBeDefined();
    expect(describeRow(withoutProposal as InspectedRow, 'bind-and-convert').detail).toBe(
      'Folder · 3 chapters',
    );
  });

  it('holds a folder with no volumes until the user groups it', () => {
    expect(describeRow(inspectedFolder(ungrouped), 'bind-and-convert')).toMatchObject({
      chip: 'Needs volumes',
      tone: 'warning',
      runnable: false,
      note: expect.stringContaining('No volumes yet') as string,
    });
  });

  it('holds a folder with chapters left out until the user places them or accepts the gap', () => {
    const held = describeRow(inspectedFolder(gappy), 'bind-and-convert');
    expect(held).toMatchObject({ chip: 'Needs volumes', runnable: false });
    expect(held.note).toMatch(/1 chapter still has no volume/u);
    expect(held.note).toMatch(/place it/u);

    const two = draft([{ id: 'v1', number: '1', chapterIds: ['c1'] }]);
    expect(describeRow(inspectedFolder(two), 'bind-only').note).toMatch(
      /2 chapters still have no volume.*place them/u,
    );

    const accepted = describeRow(inspectedFolder(gappy, { confirmed: true }), 'bind-and-convert');
    expect(accepted).toMatchObject({ chip: '1 volume', tone: 'accent', runnable: true });
    expect(accepted.note).toBe('1 chapter left out.');
  });

  it('cannot recognize a folder with no chapters, unless it is to be converted as one book', () => {
    const empty = createMappingDraft({ mangaTitle: 'Nothing', chapters: [] });

    expect(describeRow(inspectedFolder(empty), 'bind-and-convert')).toMatchObject({
      chip: 'Not recognized',
      tone: 'danger',
      runnable: false,
    });
    expect(describeRow(inspectedFolder(undefined), 'bind-only')).toMatchObject({
      chip: 'Not recognized',
      detail: 'Folder · no chapters found',
    });
    expect(describeRow(inspectedFolder(empty), 'convert-only')).toEqual({
      chip: 'One book',
      tone: 'neutral',
      detail: 'Folder · 0 chapters · not grouped',
      runnable: true,
    });
  });

  it('sends a folder straight to mangapress as one book when the run does not group', () => {
    expect(describeRow(inspectedFolder(ungrouped), 'convert-only')).toEqual({
      chip: 'One book',
      tone: 'neutral',
      detail: 'Folder · 3 chapters · not grouped',
      runnable: true,
    });
  });
});

describe('summarizing a queue and picking what to run', () => {
  const rows: readonly QueueRow[] = [
    inspectedFolder(grouped),
    {
      ...folderInput,
      id: 'held',
      displayPath: 'held',
      state: 'inspected' as const,
      sessionId: 's',
      mapping: ungrouped,
      confirmed: false,
    },
    {
      ...cbzInput,
      id: 'cbz',
      displayPath: 'cbz',
      state: 'inspected' as const,
      sessionId: 'sc',
      confirmed: false,
    },
    { ...folderInput, id: 'wait', displayPath: 'wait', state: 'inspecting' as const },
    { ...cbzInput, id: 'bad', displayPath: 'bad', state: 'unreadable' as const, message: 'x' },
  ];

  it('counts what would run, what would be left out, and what is still being read', () => {
    expect(summarizeQueue(rows, 'bind-and-convert')).toEqual({
      total: 5,
      runnable: 2,
      skipped: 2,
      inspecting: 1,
    });
    expect(summarizeQueue(rows, 'bind-only')).toEqual({
      total: 5,
      runnable: 1,
      skipped: 3,
      inspecting: 1,
    });
    expect(summarizeQueue(emptyQueue, 'bind-and-convert')).toEqual({
      total: 0,
      runnable: 0,
      skipped: 0,
      inspecting: 0,
    });
  });

  it('runs the rows that can run, in the order they were added, each with its own process', () => {
    expect(runnableRows(rows, 'bind-and-convert').map(({ row, mode }) => [row.id, mode])).toEqual([
      ['a', 'bind-and-convert'],
      ['cbz', 'convert-only'],
    ]);
    // Only joining: the CBZ has nothing to join and the ungrouped folder is still held.
    expect(runnableRows(rows, 'bind-only').map(({ row, mode }) => [row.id, mode])).toEqual([
      ['a', 'bind-only'],
    ]);
    // Not grouping: the held folder is now runnable as one book.
    expect(runnableRows(rows, 'convert-only').map(({ row, mode }) => [row.id, mode])).toEqual([
      ['a', 'convert-only'],
      ['held', 'convert-only'],
      ['cbz', 'convert-only'],
    ]);
  });
});
