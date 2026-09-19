import { type MappingDraft, mappingSignature } from './mapping';
import { type ProcessMode, resolveMode } from './process-mode';

/** A manga folder (chapters inside) or one comic archive. A whole library of folders is separate. */
export type QueueRowKind = 'folder' | 'cbz';

interface QueueRowBase {
  /** The id the main process registered the input under. */
  readonly id: string;
  readonly kind: QueueRowKind;
  readonly displayName: string;
  readonly displayPath: string;
}

export type QueueRow = QueueRowBase &
  (
    | { readonly state: 'inspecting' }
    | { readonly state: 'unreadable'; readonly message: string }
    | {
        readonly state: 'inspected';
        readonly sessionId: string;
        readonly mapping?: MappingDraft;
        /** What mangabind proposed, so a later change can be told apart from the start. */
        readonly proposedSignature?: string;
        /** The user opened the editor and accepted the mapping, gaps included. */
        readonly confirmed: boolean;
      }
  );

export type InspectedRow = Extract<QueueRow, { readonly state: 'inspected' }>;

export interface QueueInput {
  readonly id: string;
  readonly kind: QueueRowKind;
  readonly displayName: string;
  readonly displayPath: string;
}

export type QueueAction =
  | { readonly type: 'add'; readonly inputs: readonly QueueInput[] }
  | {
      readonly type: 'inspected';
      readonly id: string;
      readonly sessionId: string;
      readonly mapping?: MappingDraft;
    }
  | { readonly type: 'inspect-failed'; readonly id: string; readonly message: string }
  | { readonly type: 'confirm-mapping'; readonly id: string; readonly mapping: MappingDraft }
  | { readonly type: 'remove'; readonly ids: readonly string[] }
  | { readonly type: 'clear' };

export const emptyQueue: readonly QueueRow[] = [];

export function queueReducer(rows: readonly QueueRow[], action: QueueAction): readonly QueueRow[] {
  switch (action.type) {
    case 'add': {
      // The same folder or file added twice (a second drop, a re-pick) stays one row.
      const known = new Set(rows.map((row) => row.displayPath));
      const added: QueueRow[] = [];
      for (const input of action.inputs) {
        if (known.has(input.displayPath)) continue;
        known.add(input.displayPath);
        added.push({ ...input, state: 'inspecting' });
      }
      return added.length === 0 ? rows : [...rows, ...added];
    }
    case 'inspected':
      return rows.map((row) =>
        row.id === action.id && row.state === 'inspecting'
          ? {
              id: row.id,
              kind: row.kind,
              displayName: row.displayName,
              displayPath: row.displayPath,
              state: 'inspected',
              sessionId: action.sessionId,
              confirmed: false,
              ...(action.mapping === undefined
                ? {}
                : { mapping: action.mapping, proposedSignature: mappingSignature(action.mapping) }),
            }
          : row,
      );
    case 'inspect-failed':
      return rows.map((row) =>
        row.id === action.id && row.state === 'inspecting'
          ? {
              id: row.id,
              kind: row.kind,
              displayName: row.displayName,
              displayPath: row.displayPath,
              state: 'unreadable',
              message: action.message,
            }
          : row,
      );
    case 'confirm-mapping':
      return rows.map((row) =>
        row.id === action.id && row.state === 'inspected'
          ? { ...row, mapping: action.mapping, confirmed: true }
          : row,
      );
    case 'remove': {
      const removed = new Set(action.ids);
      return rows.filter((row) => !removed.has(row.id));
    }
    case 'clear':
      return emptyQueue;
  }
}

/** The scratch sessions a set of rows holds, which must be released when the rows go away. */
export function sessionIds(rows: readonly QueueRow[]): readonly string[] {
  return rows.flatMap((row) => (row.state === 'inspected' ? [row.sessionId] : []));
}

export function unassignedChapterCount(mapping: MappingDraft): number {
  const assigned = new Set(mapping.volumes.flatMap((volume) => volume.chapterIds));
  return mapping.chapters.filter((chapter) => !assigned.has(chapter.id)).length;
}

/**
 * The process a row gets under the chosen mode, or `skip` when the mode has nothing to do for it:
 * a CBZ is already one volume, so a run that only joins volumes leaves it alone rather than
 * converting something the user did not ask to convert.
 */
export function rowMode(kind: QueueRowKind, mode: ProcessMode): ProcessMode | 'skip' {
  if (kind === 'cbz' && mode === 'bind-only') return 'skip';
  return resolveMode(kind, mode);
}

export type RowTone = 'neutral' | 'accent' | 'warning' | 'danger';

export interface RowView {
  /** The short status shown on the row. */
  readonly chip: string;
  readonly tone: RowTone;
  /** The line under the name. */
  readonly detail: string;
  /** Whether a run would process this row (otherwise it is left out and reported). */
  readonly runnable: boolean;
  /** Why the row is left out, or something worth knowing about it. */
  readonly note?: string;
}

const plural = (count: number, word: string): string =>
  `${String(count)} ${word}${count === 1 ? '' : 's'}`;

export function describeRow(row: QueueRow, mode: ProcessMode): RowView {
  if (row.state === 'inspecting') {
    return {
      chip: 'Checking…',
      tone: 'neutral',
      detail: row.kind === 'folder' ? 'Folder · reading it' : 'CBZ · checking it',
      runnable: false,
    };
  }
  if (row.state === 'unreadable') {
    return {
      chip: 'Could not read',
      tone: 'danger',
      detail: row.kind === 'folder' ? 'Folder' : 'CBZ',
      runnable: false,
      note: row.message,
    };
  }
  if (row.kind === 'cbz') {
    return rowMode('cbz', mode) === 'skip'
      ? {
          chip: 'Nothing to join',
          tone: 'neutral',
          detail: 'CBZ · already one volume',
          runnable: false,
          note: 'A CBZ is already one volume, so there is nothing to join.',
        }
      : {
          chip: 'Ready',
          tone: 'neutral',
          detail: 'CBZ · goes straight to the e-reader step',
          runnable: true,
        };
  }

  const chapters = row.mapping?.chapters.length ?? 0;
  const volumes = row.mapping?.volumes.length ?? 0;
  const unassigned = row.mapping === undefined ? 0 : unassignedChapterCount(row.mapping);
  const folder = `Folder · ${plural(chapters, 'chapter')}`;
  if (mode === 'convert-only') {
    return { chip: 'One book', tone: 'neutral', detail: `${folder} · not grouped`, runnable: true };
  }
  if (chapters === 0) {
    return {
      chip: 'Not recognized',
      tone: 'danger',
      detail: 'Folder · no chapters found',
      runnable: false,
      note: 'mangabind found no chapters here. Turn off "Group chapters into volumes" to convert the folder as one book.',
    };
  }
  const fromNames =
    row.mapping !== undefined &&
    row.proposedSignature !== undefined &&
    mappingSignature(row.mapping) === row.proposedSignature
      ? ' · grouped from names'
      : '';
  if (volumes === 0 || (unassigned > 0 && !row.confirmed)) {
    return {
      chip: 'Needs volumes',
      tone: 'warning',
      detail: `${folder}${fromNames}`,
      runnable: false,
      note:
        volumes === 0
          ? 'No volumes yet. Open Edit volumes to group the chapters.'
          : `${plural(unassigned, 'chapter')} still ${unassigned === 1 ? 'has' : 'have'} no volume. Open Edit volumes to place ${unassigned === 1 ? 'it' : 'them'}, or accept the gaps there.`,
    };
  }
  return {
    chip: plural(volumes, 'volume'),
    tone: 'accent',
    detail: `${folder}${fromNames}`,
    runnable: true,
    ...(unassigned > 0 ? { note: `${plural(unassigned, 'chapter')} left out.` } : {}),
  };
}

export interface QueueSummary {
  readonly total: number;
  /** Rows a run would process. */
  readonly runnable: number;
  /** Rows a run would leave out and report. */
  readonly skipped: number;
  /** Rows still being read: a run should wait for them. */
  readonly inspecting: number;
}

export function summarizeQueue(rows: readonly QueueRow[], mode: ProcessMode): QueueSummary {
  let runnable = 0;
  let inspecting = 0;
  for (const row of rows) {
    if (row.state === 'inspecting') inspecting += 1;
    else if (describeRow(row, mode).runnable) runnable += 1;
  }
  return { total: rows.length, runnable, skipped: rows.length - runnable - inspecting, inspecting };
}

/** The rows a run processes, in the order the user added them, each with its process. */
export function runnableRows(
  rows: readonly QueueRow[],
  mode: ProcessMode,
): readonly { readonly row: InspectedRow; readonly mode: ProcessMode }[] {
  const result: { readonly row: InspectedRow; readonly mode: ProcessMode }[] = [];
  for (const row of rows) {
    if (row.state !== 'inspected') continue;
    const process = rowMode(row.kind, mode);
    if (process === 'skip' || !describeRow(row, mode).runnable) continue;
    result.push({ row, mode: process });
  }
  return result;
}
