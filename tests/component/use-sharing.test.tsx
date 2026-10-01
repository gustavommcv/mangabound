import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useSharing } from '@/renderer/hooks/use-sharing';
import type { MangaboundBridge } from '@/shared/runtime-info';
import type { SelectedLibrary, WorkflowFailure } from '@/shared/workflow-contract';

import { inertBridge } from './support/bridge';

const wifi = { name: 'Wi-Fi', address: '192.168.1.20' };
const ethernet = { name: 'Ethernet', address: '10.0.0.5' };
const books: SelectedLibrary = { libraryId: 'run-a', displayPath: 'Books ready to share' };
const folder: SelectedLibrary = { libraryId: 'folder-1', displayPath: 'C:\\Books' };
const running = {
  active: true,
  url: 'http://192.168.1.20:48123',
  interfaceAddress: '192.168.1.20',
  port: 48123,
};
const auth = { username: 'reader', password: 'secret' };
const refused: WorkflowFailure = { code: 'sharing_failed', message: 'Port 48123 is in use.' };

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('useSharing', () => {
  it('reads the addresses and the status when it starts', async () => {
    const onFailure = vi.fn();
    const bridge = inertBridge({
      listNetworkInterfaces: () => Promise.resolve({ ok: true, value: [wifi, ethernet] }),
      getSharingStatus: () => Promise.resolve({ ok: true, value: running }),
    });

    const { result } = renderHook(() => useSharing(bridge, onFailure));

    expect(result.current.interfaces).toEqual([]);
    expect(result.current.status).toEqual({ active: false });
    expect(result.current.panelOpen).toBe(false);
    expect(result.current.library).toBeUndefined();
    await waitFor(() => {
      expect(result.current.interfaces).toEqual([wifi, ethernet]);
    });
    expect(result.current.status).toEqual(running);
  });

  it('keeps what it could read when the other read is refused, without reporting it', async () => {
    const onFailure = vi.fn();
    const bridge = inertBridge({
      listNetworkInterfaces: () => Promise.resolve({ ok: true, value: [wifi] }),
      getSharingStatus: () => Promise.resolve({ ok: false, error: refused }),
    });

    const { result } = renderHook(() => useSharing(bridge, onFailure));

    await waitFor(() => {
      expect(result.current.interfaces).toEqual([wifi]);
    });
    expect(result.current.status).toEqual({ active: false });
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('does not let a read of an earlier bridge replace what a later one gave', async () => {
    const onFailure = vi.fn();
    const slow = deferred<Awaited<ReturnType<MangaboundBridge['listNetworkInterfaces']>>>();
    const first = inertBridge({ listNetworkInterfaces: () => slow.promise });
    const second = inertBridge({
      listNetworkInterfaces: () => Promise.resolve({ ok: true, value: [ethernet] }),
    });

    const { result, rerender } = renderHook(({ bridge }) => useSharing(bridge, onFailure), {
      initialProps: { bridge: first },
    });
    rerender({ bridge: second });
    await waitFor(() => {
      expect(result.current.interfaces).toEqual([ethernet]);
    });
    await act(async () => {
      slow.resolve({ ok: true, value: [wifi] });
      await slow.promise;
    });

    expect(result.current.interfaces).toEqual([ethernet]);
  });

  describe('choosing the folder', () => {
    it('keeps the folder that was chosen', async () => {
      const bridge = inertBridge({
        chooseLibrary: () => Promise.resolve({ ok: true, value: folder }),
      });
      const { result } = renderHook(() => useSharing(bridge, vi.fn()));

      await act(async () => {
        await result.current.chooseLibrary();
      });

      expect(result.current.library).toEqual(folder);
    });

    it('changes nothing when the dialog is cancelled', async () => {
      const chooseLibrary = vi
        .fn<MangaboundBridge['chooseLibrary']>()
        .mockResolvedValueOnce({ ok: true, value: folder })
        .mockResolvedValueOnce({ ok: true, value: null });
      const bridge = inertBridge({ chooseLibrary });
      const { result } = renderHook(() => useSharing(bridge, vi.fn()));

      await act(async () => {
        await result.current.chooseLibrary();
      });
      await act(async () => {
        await result.current.chooseLibrary();
      });

      expect(result.current.library).toEqual(folder);
    });

    it('reports a dialog that fails', async () => {
      const onFailure = vi.fn();
      const bridge = inertBridge({
        chooseLibrary: () => Promise.resolve({ ok: false, error: refused }),
      });
      const { result } = renderHook(() => useSharing(bridge, onFailure));

      await act(async () => {
        await result.current.chooseLibrary();
      });

      expect(onFailure).toHaveBeenCalledExactlyOnceWith(refused);
      expect(result.current.library).toBeUndefined();
    });
  });

  describe('starting and stopping', () => {
    it('does nothing until a folder is chosen', async () => {
      const startSharing = vi.fn<MangaboundBridge['startSharing']>();
      const bridge = inertBridge({ startSharing });
      const { result } = renderHook(() => useSharing(bridge, vi.fn()));

      await act(async () => {
        await result.current.start('192.168.1.20', auth);
      });

      expect(startSharing).not.toHaveBeenCalled();
      expect(result.current.status).toEqual({ active: false });
    });

    it('starts sharing the chosen folder on the address, and keeps the status it gets', async () => {
      const startSharing = vi.fn<MangaboundBridge['startSharing']>(() =>
        Promise.resolve({ ok: true, value: running }),
      );
      const bridge = inertBridge({
        chooseLibrary: () => Promise.resolve({ ok: true, value: folder }),
        startSharing,
      });
      const { result } = renderHook(() => useSharing(bridge, vi.fn()));
      await act(async () => {
        await result.current.chooseLibrary();
      });

      await act(async () => {
        await result.current.start('192.168.1.20', auth);
      });

      expect(startSharing).toHaveBeenCalledExactlyOnceWith('folder-1', '192.168.1.20', auth);
      expect(result.current.status).toEqual(running);
    });

    it('reports a refusal to start and stays as it was', async () => {
      const onFailure = vi.fn();
      const bridge = inertBridge({
        chooseLibrary: () => Promise.resolve({ ok: true, value: folder }),
        startSharing: () => Promise.resolve({ ok: false, error: refused }),
      });
      const { result } = renderHook(() => useSharing(bridge, onFailure));
      await act(async () => {
        await result.current.chooseLibrary();
      });

      await act(async () => {
        await result.current.start('192.168.1.20', auth);
      });

      expect(onFailure).toHaveBeenCalledExactlyOnceWith(refused);
      expect(result.current.status).toEqual({ active: false });
    });

    it('stops sharing', async () => {
      const bridge = inertBridge({
        getSharingStatus: () => Promise.resolve({ ok: true, value: running }),
        stopSharing: () => Promise.resolve({ ok: true, value: undefined }),
      });
      const { result } = renderHook(() => useSharing(bridge, vi.fn()));
      await waitFor(() => {
        expect(result.current.status).toEqual(running);
      });

      await act(async () => {
        await result.current.stop();
      });

      expect(result.current.status).toEqual({ active: false });
    });

    it('reports a refusal to stop and keeps sharing', async () => {
      const onFailure = vi.fn();
      const bridge = inertBridge({
        getSharingStatus: () => Promise.resolve({ ok: true, value: running }),
        stopSharing: () => Promise.resolve({ ok: false, error: refused }),
      });
      const { result } = renderHook(() => useSharing(bridge, onFailure));
      await waitFor(() => {
        expect(result.current.status).toEqual(running);
      });

      await act(async () => {
        await result.current.stop();
      });

      expect(onFailure).toHaveBeenCalledExactlyOnceWith(refused);
      expect(result.current.status).toEqual(running);
    });
  });

  describe('sharing the books just saved', () => {
    it('opens the panel with those books chosen', () => {
      const bridge = inertBridge();
      const { result } = renderHook(() => useSharing(bridge, vi.fn()));

      act(() => {
        result.current.shareBooks(books);
      });

      expect(result.current.panelOpen).toBe(true);
      expect(result.current.library).toEqual(books);
    });

    it('leaves what is being shared alone while sharing runs', async () => {
      const bridge = inertBridge({
        chooseLibrary: () => Promise.resolve({ ok: true, value: folder }),
        getSharingStatus: () => Promise.resolve({ ok: true, value: running }),
      });
      const { result } = renderHook(() => useSharing(bridge, vi.fn()));
      await act(async () => {
        await result.current.chooseLibrary();
      });
      await waitFor(() => {
        expect(result.current.status.active).toBe(true);
      });

      act(() => {
        result.current.shareBooks(books);
      });

      expect(result.current.panelOpen).toBe(true);
      expect(result.current.library).toEqual(folder);
    });
  });

  it('opens and closes the panel', () => {
    const bridge = inertBridge();
    const { result } = renderHook(() => useSharing(bridge, vi.fn()));

    act(() => {
      result.current.setPanelOpen(true);
    });
    expect(result.current.panelOpen).toBe(true);
    act(() => {
      result.current.setPanelOpen(false);
    });
    expect(result.current.panelOpen).toBe(false);
  });

  it('lets go of the folder only when it is the one that was deleted', () => {
    const bridge = inertBridge();
    const { result } = renderHook(() => useSharing(bridge, vi.fn()));
    act(() => {
      result.current.shareBooks(books);
    });

    act(() => {
      result.current.forgetLibrary('another-run');
    });
    expect(result.current.library).toEqual(books);
    act(() => {
      result.current.forgetLibrary('run-a');
    });
    expect(result.current.library).toBeUndefined();
  });
});
