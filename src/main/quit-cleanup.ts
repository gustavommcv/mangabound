/** What there is to let go of when the app quits. */
export interface QuitCleanup {
  readonly activeJobs: ReadonlyMap<string, { readonly abort: () => void }>;
  readonly releaseAll: (() => Promise<unknown>) | undefined;
  readonly stopSharing: (() => Promise<unknown>) | undefined;
  readonly settlePreferences: (() => Promise<unknown>) | undefined;
  readonly pruneCompleted: (() => Promise<unknown>) | undefined;
}

/**
 * Lets go of everything the app holds, in the order that keeps a person's work: running
 * conversions are told to stop; the scratch copies, the sharing server and a setting changed an
 * instant ago are let go of, whatever each does; and only then are the pending runs whose every
 * book was saved removed, since nothing is serving or saving them any more. A failure of the last is
 * reported, never allowed to keep the app from quitting, which `quit` ends either way.
 */
export async function cleanUpBeforeQuit(
  cleanup: QuitCleanup,
  quit: () => void,
  report: (message: string, cause: unknown) => void,
): Promise<void> {
  for (const controller of cleanup.activeJobs.values()) controller.abort();
  try {
    await Promise.allSettled([
      cleanup.releaseAll?.(),
      cleanup.stopSharing?.(),
      cleanup.settlePreferences?.(),
    ]);
    await cleanup.pruneCompleted?.();
  } catch (error) {
    report('Could not clear exported pending books.', error);
  } finally {
    quit();
  }
}
