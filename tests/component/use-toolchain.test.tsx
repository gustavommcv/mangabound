import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useToolchain } from '@/renderer/hooks/use-toolchain';
import type { MangaboundBridge } from '@/shared/runtime-info';
import type { ToolchainStatus } from '@/shared/toolchain-status';
import type { DeviceProfileSummary, WorkflowFailure } from '@/shared/workflow-contract';

import { inertBridge } from './support/bridge';

const ready: ToolchainStatus = {
  state: 'ready',
  target: 'win32-x64',
  tools: [],
  message: 'Bundled conversion tools are verified and ready.',
};
const blocked: ToolchainStatus = {
  state: 'blocked',
  tools: [],
  message: 'A bundled conversion tool failed verification. Reinstall Mangabound to restore it.',
};
const paperwhite: DeviceProfileSummary = {
  code: 'KPW6',
  name: 'Kindle Paperwhite 6',
  width: 1272,
  height: 1696,
  grayLevels: 16,
  family: 'kindle',
};
const failure: WorkflowFailure = {
  code: 'tool_failed',
  message: 'The device list is unavailable.',
};

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('useToolchain', () => {
  it('reads the devices once the tools are ready', async () => {
    const bridge = inertBridge({
      getToolchainStatus: () => Promise.resolve(ready),
      getDeviceProfiles: () => Promise.resolve({ ok: true, value: [paperwhite] }),
    });

    const onFailure = vi.fn();
    const { result } = renderHook(() => useToolchain(bridge, onFailure));

    expect(result.current).toEqual({ toolchain: undefined, profiles: [] });
    await waitFor(() => {
      expect(result.current.profiles).toEqual([paperwhite]);
    });
    expect(result.current.toolchain).toEqual(ready);
  });

  it('does not ask for the devices while the tools are not ready', async () => {
    const getDeviceProfiles = vi.fn<MangaboundBridge['getDeviceProfiles']>();
    const bridge = inertBridge({
      getToolchainStatus: () => Promise.resolve(blocked),
      getDeviceProfiles,
    });

    const onFailure = vi.fn();
    const { result } = renderHook(() => useToolchain(bridge, onFailure));

    await waitFor(() => {
      expect(result.current.toolchain).toEqual(blocked);
    });
    expect(getDeviceProfiles).not.toHaveBeenCalled();
    expect(result.current.profiles).toEqual([]);
  });

  it('says the tools could not be checked when their status cannot be read', async () => {
    const bridge = inertBridge({
      getToolchainStatus: () => Promise.reject(new Error('internal detail')),
    });

    const onFailure = vi.fn();
    const { result } = renderHook(() => useToolchain(bridge, onFailure));

    await waitFor(() => {
      expect(result.current.toolchain).toEqual({
        state: 'blocked',
        tools: [],
        message: 'The bundled conversion tools could not be checked.',
      });
    });
  });

  it('tells onFailure when the devices cannot be listed, and keeps none', async () => {
    const onFailure = vi.fn();
    const bridge = inertBridge({
      getToolchainStatus: () => Promise.resolve(ready),
      getDeviceProfiles: () => Promise.resolve({ ok: false, error: failure }),
    });

    const { result } = renderHook(() => useToolchain(bridge, onFailure));

    await waitFor(() => {
      expect(onFailure).toHaveBeenCalledExactlyOnceWith(failure);
    });
    expect(result.current.toolchain).toEqual(ready);
    expect(result.current.profiles).toEqual([]);
  });

  it('counts a device lookup that throws as a problem with the tools', async () => {
    const bridge = inertBridge({
      getToolchainStatus: () => Promise.resolve(ready),
      getDeviceProfiles: () => Promise.reject(new Error('internal detail')),
    });

    const onFailure = vi.fn();
    const { result } = renderHook(() => useToolchain(bridge, onFailure));

    await waitFor(() => {
      expect(result.current.toolchain?.message).toBe(
        'The bundled conversion tools could not be checked.',
      );
    });
  });

  it('uses nothing that arrives after the component is gone', async () => {
    const status = deferred<ToolchainStatus>();
    const getDeviceProfiles = vi.fn(() =>
      Promise.resolve({ ok: true as const, value: [paperwhite] }),
    );
    const bridge = inertBridge({ getToolchainStatus: () => status.promise, getDeviceProfiles });

    const onFailure = vi.fn();
    const { unmount } = renderHook(() => useToolchain(bridge, onFailure));
    unmount();
    await act(async () => {
      status.resolve(ready);
      await status.promise;
    });

    expect(getDeviceProfiles).not.toHaveBeenCalled();
  });

  it('does not report a device failure that arrives after the component is gone', async () => {
    const devices = deferred<Awaited<ReturnType<MangaboundBridge['getDeviceProfiles']>>>();
    const onFailure = vi.fn();
    const bridge = inertBridge({
      getToolchainStatus: () => Promise.resolve(ready),
      getDeviceProfiles: () => devices.promise,
    });

    const { unmount } = renderHook(() => useToolchain(bridge, onFailure));
    await act(async () => {
      await Promise.resolve();
    });
    unmount();
    await act(async () => {
      devices.resolve({ ok: false, error: failure });
      await devices.promise;
    });

    expect(onFailure).not.toHaveBeenCalled();
  });

  it('reads again when the bridge changes', async () => {
    const first = inertBridge({ getToolchainStatus: vi.fn(() => Promise.resolve(blocked)) });
    const second = inertBridge({ getToolchainStatus: vi.fn(() => Promise.resolve(ready)) });

    const onFailure = vi.fn();
    const { result, rerender } = renderHook(({ bridge }) => useToolchain(bridge, onFailure), {
      initialProps: { bridge: first },
    });
    await waitFor(() => {
      expect(result.current.toolchain).toEqual(blocked);
    });
    rerender({ bridge: second });

    await waitFor(() => {
      expect(result.current.toolchain).toEqual(ready);
    });
    expect(second.getToolchainStatus).toHaveBeenCalledOnce();
  });
});
