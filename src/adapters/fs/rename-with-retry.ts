// Unlike POSIX rename, replacing a file on Windows fails outright (EBUSY, EPERM, or EACCES) if
// another process - antivirus real-time scanning, a search indexer, a backup agent - has it open
// at that instant, rather than succeeding the way POSIX does. That window is typically a handful
// of milliseconds, so a few short retries absorb it instead of losing the file outright.
const TRANSIENT_RENAME_ERROR_CODES: ReadonlySet<string | undefined> = new Set([
  'EBUSY',
  'EPERM',
  'EACCES',
]);
const RENAME_RETRY_DELAYS_MS = [20, 50, 100, 200];

function isTransientRenameError(error: unknown): boolean {
  return TRANSIENT_RENAME_ERROR_CODES.has((error as NodeJS.ErrnoException).code);
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Renames, retrying a few times when the failure is the brief lock another process holds. */
export async function renameWithRetry(
  rename: (from: string, to: string) => Promise<void>,
  from: string,
  to: string,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const delay: number | undefined = RENAME_RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !isTransientRenameError(error)) throw error;
      await wait(delay);
    }
  }
}
