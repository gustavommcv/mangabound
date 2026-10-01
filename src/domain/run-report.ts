import type { BookFormat } from './conversion';
import { describeRow, isWaitingTitle, type QueueAction, type QueueRow } from './input-queue';
import type { ProcessMode } from './process-mode';

/** The report does not inspect artifacts or depend on a transport's book representation. */
export interface RunOutcome<Artifact> {
  readonly rowId: string;
  readonly name: string;
  readonly status: 'done' | 'failed' | 'skipped';
  readonly artifacts: readonly Artifact[];
  /** Why it failed or was left out. */
  readonly message?: string;
  /** Whether the item's grouping can be fixed from the queue. */
  readonly fixable?: boolean;
}

interface RunFailure {
  readonly code: string;
  readonly message: string;
}

type RunResult<Value> =
  { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly error: RunFailure };

interface TitleResult<Artifact> {
  readonly title: string;
  readonly status: 'done' | 'failed';
  readonly artifacts: readonly Artifact[];
  readonly failure?: RunFailure;
}

interface RowRunReport<Artifact> {
  readonly outcomes: readonly RunOutcome<Artifact>[];
  readonly cancelled: boolean;
}

interface LibraryRunReport<Artifact> extends RowRunReport<Artifact> {
  readonly completedTitles?: ReadonlySet<string>;
  readonly queueUpdate?: Extract<QueueAction, { readonly type: 'library-results' }>;
}

type RowIdentity = Pick<QueueRow, 'id' | 'displayName'>;

/** A failed input stays retryable; only the explicit cancellation code stops subsequent work. */
export function reportInputRun<Artifact>(
  row: RowIdentity,
  result: RunResult<readonly Artifact[]>,
): RowRunReport<Artifact> {
  return result.ok
    ? {
        outcomes: [
          { rowId: row.id, name: row.displayName, status: 'done', artifacts: result.value },
        ],
        cancelled: false,
      }
    : {
        outcomes: [
          {
            rowId: row.id,
            name: row.displayName,
            status: 'failed',
            artifacts: [],
            message: result.error.message,
          },
        ],
        cancelled: result.error.code === 'cancelled',
      };
}

/** Keep each title's books, even on failure, and update only titles the library run reported. */
export function reportLibraryRun<Artifact>(
  row: RowIdentity,
  result: RunResult<readonly TitleResult<Artifact>[]>,
): LibraryRunReport<Artifact> {
  if (!result.ok) return reportInputRun(row, result);
  return {
    outcomes: result.value.map((title) => ({
      rowId: row.id,
      name: `${row.displayName} · ${title.title}`,
      status: title.status,
      artifacts: title.artifacts,
      ...(title.failure === undefined ? {} : { message: title.failure.message }),
    })),
    cancelled: result.value.some((title) => title.failure?.code === 'cancelled'),
    completedTitles: new Set(
      result.value.filter((title) => title.status === 'done').map((title) => title.title),
    ),
    queueUpdate: {
      type: 'library-results',
      id: row.id,
      results: result.value.map((title) => ({
        title: title.title,
        outcome:
          title.status === 'done'
            ? { status: 'done' }
            : { status: 'failed', message: title.failure?.message ?? 'It could not be converted.' },
      })),
    },
  };
}

interface RunReportInput<Artifact> {
  /** The queue snapshot the run started with, before its title outcomes were updated. */
  readonly rows: readonly QueueRow[];
  readonly mode: ProcessMode;
  readonly settled: readonly RunOutcome<Artifact>[];
  readonly attempted: ReadonlySet<string>;
  readonly completedTitles: ReadonlyMap<string, ReadonlySet<string>>;
}

interface RunReport<Artifact> {
  readonly outcomes: readonly RunOutcome<Artifact>[];
  readonly completedRowIds: readonly string[];
  readonly hasResults: boolean;
}

/** Report omissions after attempted work and remove only completely processed queue rows. */
export function finishRunReport<Artifact>({
  rows,
  mode,
  settled,
  attempted,
  completedTitles,
}: RunReportInput<Artifact>): RunReport<Artifact> {
  const outcomes = [...settled];
  for (const row of rows) {
    if (row.state === 'inspecting') continue;
    if (row.state === 'inspected' && row.kind === 'library' && attempted.has(row.id)) {
      const waiting = (row.titles ?? []).filter(isWaitingTitle).length;
      if (waiting > 0) {
        outcomes.push({
          rowId: row.id,
          name: row.displayName,
          status: 'skipped',
          artifacts: [],
          message: `${String(waiting)} title${waiting === 1 ? '' : 's'} left out until they have volumes.`,
          fixable: true,
        });
      }
      continue;
    }
    if (attempted.has(row.id)) continue;
    const view = describeRow(row, mode);
    if (view.runnable) continue;
    outcomes.push({
      rowId: row.id,
      name: row.displayName,
      status: 'skipped',
      artifacts: [],
      message: view.note ?? view.chip,
      fixable: row.state === 'inspected' && row.kind !== 'cbz' && mode !== 'convert-only',
    });
  }
  const completedRowIds = rows
    .filter((row) => {
      if (row.state !== 'inspected') return false;
      if (row.kind === 'library') {
        const completed = completedTitles.get(row.id);
        return (
          completed !== undefined &&
          (row.titles ?? []).every(
            (title) => title.outcome?.status === 'done' || completed.has(title.title),
          )
        );
      }
      return outcomes.some((outcome) => outcome.rowId === row.id && outcome.status === 'done');
    })
    .map((row) => row.id);
  return { outcomes, completedRowIds, hasResults: outcomes.length > 0 };
}

export function describeRun(mode: ProcessMode, deviceName: string, format: BookFormat): string {
  return mode === 'bind-only' ? 'Joined volumes · CBZ' : `${deviceName} · ${format.toUpperCase()}`;
}
