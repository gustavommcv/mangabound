import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { usePendingRuns } from '@/renderer/hooks/use-pending-runs';
import type { MangaboundBridge } from '@/shared/runtime-info';
import type { PendingRunSummary, WorkflowFailure } from '@/shared/workflow-contract';

import { inertBridge } from './support/bridge';

const artifact = (id: string, saved = false) => ({
  id,
  name: `${id}.epub`,
  bytes: 1024,
  format: 'epub' as const,
  saved,
});
const runA: PendingRunSummary = { libraryId: 'run-a', createdAt: 2, artifacts: [artifact('a1')] };
const runB: PendingRunSummary = {
  libraryId: 'run-b',
  createdAt: 1,
  artifacts: [artifact('b1', true)],
};
const unreadable: WorkflowFailure = {
  code: 'pending_unreadable',
  message: 'Pending books could not be loaded.',
};
const inUse: WorkflowFailure = {
  code: 'pending_in_use',
  message: 'Stop sharing these books before deleting their pending copies.',
};

type ListResult = Awaited<ReturnType<MangaboundBridge['listPendingRuns']>>;

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('usePendingRuns', () => {
  it('reads the pending conversions when it starts', async () => {
    const onFailure = vi.fn();
    const bridge = inertBridge({
      listPendingRuns: () => Promise.resolve({ ok: true, value: [runA, runB] }),
    });

    const { result } = renderHook(() => usePendingRuns(bridge, onFailure));

    expect(result.current.pendingRuns).toEqual([]);
    await waitFor(() => {
      expect(result.current.pendingRuns).toEqual([runA, runB]);
    });
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('reports a list that cannot be read, and keeps none', async () => {
    const onFailure = vi.fn();
    const bridge = inertBridge({
      listPendingRuns: () => Promise.resolve({ ok: false, error: unreadable }),
    });

    const { result } = renderHook(() => usePendingRuns(bridge, onFailure));

    await waitFor(() => {
      expect(onFailure).toHaveBeenCalledExactlyOnceWith(unreadable);
    });
    expect(result.current.pendingRuns).toEqual([]);
  });

  it('does not report a result that arrives after the component is gone', async () => {
    const onFailure = vi.fn();
    const listing = deferred<ListResult>();
    const bridge = inertBridge({ listPendingRuns: () => listing.promise });

    const { unmount } = renderHook(() => usePendingRuns(bridge, onFailure));
    unmount();
    await act(async () => {
      listing.resolve({ ok: false, error: unreadable });
      await listing.promise;
    });

    expect(onFailure).not.toHaveBeenCalled();
  });

  it('reads the list again on refresh', async () => {
    const onFailure = vi.fn();
    const listPendingRuns = vi
      .fn<MangaboundBridge['listPendingRuns']>()
      .mockResolvedValueOnce({ ok: true, value: [runA] })
      .mockResolvedValueOnce({ ok: true, value: [runA, runB] });
    const bridge = inertBridge({ listPendingRuns });

    const { result } = renderHook(() => usePendingRuns(bridge, onFailure));
    await waitFor(() => {
      expect(result.current.pendingRuns).toEqual([runA]);
    });
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.pendingRuns).toEqual([runA, runB]);
  });

  it('reports a refresh that fails and keeps the list it had', async () => {
    const onFailure = vi.fn();
    const listPendingRuns = vi
      .fn<MangaboundBridge['listPendingRuns']>()
      .mockResolvedValueOnce({ ok: true, value: [runA] })
      .mockResolvedValueOnce({ ok: false, error: unreadable });
    const bridge = inertBridge({ listPendingRuns });

    const { result } = renderHook(() => usePendingRuns(bridge, onFailure));
    await waitFor(() => {
      expect(result.current.pendingRuns).toEqual([runA]);
    });
    await act(async () => {
      await result.current.refresh();
    });

    expect(onFailure).toHaveBeenCalledExactlyOnceWith(unreadable);
    expect(result.current.pendingRuns).toEqual([runA]);
  });

  it('removes only the run it deleted, and says it was deleted', async () => {
    const onFailure = vi.fn();
    const discardPendingRun = vi.fn<MangaboundBridge['discardPendingRun']>(() =>
      Promise.resolve({ ok: true, value: undefined }),
    );
    const bridge = inertBridge({
      listPendingRuns: () => Promise.resolve({ ok: true, value: [runA, runB] }),
      discardPendingRun,
    });

    const { result } = renderHook(() => usePendingRuns(bridge, onFailure));
    await waitFor(() => {
      expect(result.current.pendingRuns).toHaveLength(2);
    });
    let discarded: boolean | undefined;
    await act(async () => {
      discarded = await result.current.discard('run-a');
    });

    expect(discarded).toBe(true);
    expect(discardPendingRun).toHaveBeenCalledExactlyOnceWith('run-a');
    expect(result.current.pendingRuns).toEqual([runB]);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('keeps the run and reports why when it cannot be deleted', async () => {
    const onFailure = vi.fn();
    const bridge = inertBridge({
      listPendingRuns: () => Promise.resolve({ ok: true, value: [runA] }),
      discardPendingRun: () => Promise.resolve({ ok: false, error: inUse }),
    });

    const { result } = renderHook(() => usePendingRuns(bridge, onFailure));
    await waitFor(() => {
      expect(result.current.pendingRuns).toEqual([runA]);
    });
    let discarded: boolean | undefined;
    await act(async () => {
      discarded = await result.current.discard('run-a');
    });

    expect(discarded).toBe(false);
    expect(onFailure).toHaveBeenCalledExactlyOnceWith(inUse);
    expect(result.current.pendingRuns).toEqual([runA]);
  });

  it('says only that the deletion failed when the call itself throws', async () => {
    const onFailure = vi.fn();
    const bridge = inertBridge({
      listPendingRuns: () => Promise.resolve({ ok: true, value: [runA] }),
      discardPendingRun: () => Promise.reject(new Error('EBUSY: C:\\private\\path')),
    });

    const { result } = renderHook(() => usePendingRuns(bridge, onFailure));
    await waitFor(() => {
      expect(result.current.pendingRuns).toEqual([runA]);
    });
    let discarded: boolean | undefined;
    await act(async () => {
      discarded = await result.current.discard('run-a');
    });

    expect(discarded).toBe(false);
    expect(onFailure).toHaveBeenCalledExactlyOnceWith({
      code: 'pending_delete_failed',
      message: 'Mangabound could not delete these pending books. Please try again.',
    });
    expect(result.current.pendingRuns).toEqual([runA]);
  });

  it('hands out the same functions on every render, so they can be dependencies', async () => {
    const onFailure = vi.fn();
    const bridge = inertBridge({
      listPendingRuns: () => Promise.resolve({ ok: true, value: [runA] }),
    });

    const { result, rerender } = renderHook(() => usePendingRuns(bridge, onFailure));
    await waitFor(() => {
      expect(result.current.pendingRuns).toEqual([runA]);
    });
    const { refresh, discard } = result.current;
    rerender();

    expect(result.current.refresh).toBe(refresh);
    expect(result.current.discard).toBe(discard);
  });

  it('reads again when the bridge changes', async () => {
    const onFailure = vi.fn();
    const first = inertBridge({
      listPendingRuns: () => Promise.resolve({ ok: true, value: [runA] }),
    });
    const second = inertBridge({
      listPendingRuns: vi.fn(() => Promise.resolve({ ok: true as const, value: [runB] })),
    });

    const { result, rerender } = renderHook(({ bridge }) => usePendingRuns(bridge, onFailure), {
      initialProps: { bridge: first },
    });
    await waitFor(() => {
      expect(result.current.pendingRuns).toEqual([runA]);
    });
    rerender({ bridge: second });

    await waitFor(() => {
      expect(result.current.pendingRuns).toEqual([runB]);
    });
    expect(second.listPendingRuns).toHaveBeenCalledOnce();
  });
});
