import { useCallback, useEffect, useState } from 'react';

import type { MangaboundBridge } from '@/shared/runtime-info';
import type { PendingRunSummary, WorkflowFailure } from '@/shared/workflow-contract';

/**
 * The conversions whose books are waiting to be saved or shared: read when the bridge is first
 * used, read again on `refresh`, and shortened by `discard`. Anything that goes wrong is told to
 * `onFailure`, which is a dependency of all three, so pass a stable function (a state setter).
 */
export function usePendingRuns(
  bridge: MangaboundBridge,
  onFailure: (failure: WorkflowFailure) => void,
): {
  readonly pendingRuns: readonly PendingRunSummary[];
  /** Reads the list again. */
  readonly refresh: () => Promise<void>;
  /** Deletes one run's pending books; whether it was deleted. Anything in the way is reported. */
  readonly discard: (libraryId: string) => Promise<boolean>;
} {
  const [pendingRuns, setPendingRuns] = useState<readonly PendingRunSummary[]>([]);

  useEffect(() => {
    let current = true;
    void bridge.listPendingRuns().then((result) => {
      if (!current) return;
      if (result.ok) setPendingRuns(result.value);
      else onFailure(result.error);
    });
    return () => {
      current = false;
    };
  }, [bridge, onFailure]);

  const refresh = useCallback(async (): Promise<void> => {
    const result = await bridge.listPendingRuns();
    if (result.ok) setPendingRuns(result.value);
    else onFailure(result.error);
  }, [bridge, onFailure]);

  const discard = useCallback(
    async (libraryId: string): Promise<boolean> => {
      let result: Awaited<ReturnType<MangaboundBridge['discardPendingRun']>>;
      try {
        result = await bridge.discardPendingRun(libraryId);
      } catch {
        onFailure({
          code: 'pending_delete_failed',
          message: 'Mangabound could not delete these pending books. Please try again.',
        });
        return false;
      }
      if (!result.ok) {
        onFailure(result.error);
        return false;
      }
      setPendingRuns((current) => current.filter((run) => run.libraryId !== libraryId));
      return true;
    },
    [bridge, onFailure],
  );

  return { pendingRuns, refresh, discard };
}
