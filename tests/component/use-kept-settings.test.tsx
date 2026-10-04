import { act, type RenderHookResult, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { defaultMangapressSettings } from '@/domain/output-profile';
import { defaultPreferences, type Preferences } from '@/domain/preferences';
import { useKeptSettings } from '@/renderer/hooks/use-kept-settings';
import type { MangaboundBridge } from '@/shared/runtime-info';
import type { RestoredSettings } from '@/shared/settings-contract';

import { inertBridge } from './support/bridge';

const wifi = { name: 'Wi-Fi', address: '192.168.1.20' };
const kept: Preferences = {
  mode: 'bind-only',
  format: 'cbz',
  singleBook: false,
  settings: { ...defaultMangapressSettings, quiet: true },
  providerId: 'anilist',
};

function reading(value: RestoredSettings): MangaboundBridge['loadSettings'] {
  return () => Promise.resolve({ ok: true, value });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Renders the hook against a bridge whose kept settings were read, and lets them be applied. */
async function restoredFrom(
  value: RestoredSettings,
  overrides: Partial<MangaboundBridge> = {},
  notify: (message: string) => void = vi.fn(),
): Promise<RenderHookResult<ReturnType<typeof useKeptSettings>, unknown>> {
  const bridge = inertBridge({ loadSettings: reading(value), ...overrides });
  const rendered = renderHook(() => useKeptSettings(bridge, notify));
  await act(async () => {
    await new Promise((done) => setTimeout(done, 0));
  });
  return rendered;
}

describe('useKeptSettings', () => {
  describe('restoring', () => {
    it('starts from the defaults and saves nothing before what was kept has been read', () => {
      const read = deferred<Awaited<ReturnType<MangaboundBridge['loadSettings']>>>();
      const saveSettings = vi.fn<MangaboundBridge['saveSettings']>();
      const bridge = inertBridge({ loadSettings: () => read.promise, saveSettings });

      const { result } = renderHook(() => useKeptSettings(bridge, vi.fn()));
      act(() => {
        result.current.setMode('convert-only');
      });

      expect(result.current.mode).toBe('convert-only');
      expect(result.current.format).toBe(defaultPreferences.format);
      expect(result.current.settings).toEqual(defaultMangapressSettings);
      expect(result.current.singleBook).toBe(false);
      expect(result.current.selectedProviderId).toBeUndefined();
      expect(result.current.preferredNetworkInterface).toBeUndefined();
      expect(saveSettings).not.toHaveBeenCalled();
    });

    it('replaces the defaults with what was kept, and does not write it back', async () => {
      const saveSettings = vi.fn<MangaboundBridge['saveSettings']>();

      const { result } = await restoredFrom(
        { preferences: kept, preferredNetworkInterface: wifi, notices: [] },
        { saveSettings },
      );

      expect(result.current.mode).toBe('bind-only');
      expect(result.current.format).toBe('cbz');
      expect(result.current.settings).toEqual(kept.settings);
      expect(result.current.singleBook).toBe(false);
      expect(result.current.selectedProviderId).toBe('anilist');
      expect(result.current.preferredNetworkInterface).toEqual(wifi);
      expect(saveSettings).not.toHaveBeenCalled();
    });

    it('puts a choice made before the kept ones arrive over them, and saves it', async () => {
      const read = deferred<Awaited<ReturnType<MangaboundBridge['loadSettings']>>>();
      const saveSettings = vi.fn<MangaboundBridge['saveSettings']>(() =>
        Promise.resolve({ ok: true, value: undefined }),
      );
      const notify = vi.fn();
      const bridge = inertBridge({ loadSettings: () => read.promise, saveSettings });
      const { result } = renderHook(() => useKeptSettings(bridge, notify));

      // The person clicks PDF while the settings are still being read.
      act(() => {
        result.current.setFormat('pdf');
      });
      await act(async () => {
        read.resolve({ ok: true, value: { preferences: kept, notices: [] } });
        await new Promise((done) => setTimeout(done, 0));
      });

      expect(result.current.format).toBe('pdf');
      // Everything they did not touch is what was kept.
      expect(result.current.mode).toBe('bind-only');
      expect(result.current.settings).toEqual(kept.settings);
      expect(result.current.selectedProviderId).toBe('anilist');
      await waitFor(() => {
        expect(saveSettings).toHaveBeenCalledOnce();
      });
      expect(saveSettings.mock.calls[0]?.[0].preferences).toMatchObject({
        format: 'pdf',
        mode: 'bind-only',
        providerId: 'anilist',
      });
    });

    it('applies an option changed before the kept ones arrive on top of the kept options', async () => {
      const read = deferred<Awaited<ReturnType<MangaboundBridge['loadSettings']>>>();
      const notify = vi.fn();
      const bridge = inertBridge({ loadSettings: () => read.promise });
      const { result } = renderHook(() => useKeptSettings(bridge, notify));

      act(() => {
        result.current.setSettings((current) => ({ ...current, upscale: true }));
        result.current.setSettings((current) => ({ ...current, stretch: true }));
      });
      await act(async () => {
        read.resolve({
          ok: true,
          value: { preferences: kept, notices: [] },
        });
        await new Promise((done) => setTimeout(done, 0));
      });

      expect(result.current.settings).toEqual({
        ...kept.settings,
        upscale: true,
        stretch: true,
      });
    });

    it('does not put a choice made after the kept ones arrived over anything a second time', async () => {
      const { result } = await restoredFrom({ preferences: kept, notices: [] });

      act(() => {
        result.current.setFormat('pdf');
      });
      act(() => {
        result.current.setFormat('epub');
      });

      expect(result.current.format).toBe('epub');
    });

    it('keeps a choice made before the kept ones could not be read, with the defaults', async () => {
      const notify = vi.fn();
      const bridge = inertBridge({
        loadSettings: () => Promise.resolve({ ok: false, error: { code: 'x', message: 'no' } }),
      });
      const { result } = renderHook(() => useKeptSettings(bridge, notify));
      act(() => {
        result.current.setFormat('pdf');
      });
      await act(async () => {
        await new Promise((done) => setTimeout(done, 0));
      });

      expect(result.current.format).toBe('pdf');
      expect(result.current.mode).toBe(defaultPreferences.mode);
    });

    it('is told about whatever could not be restored', async () => {
      const notify = vi.fn();

      await restoredFrom(
        { preferences: kept, notices: ['The saved format was not valid.', 'The device is gone.'] },
        {},
        notify,
      );

      expect(notify.mock.calls).toEqual([
        ['The saved format was not valid.'],
        ['The device is gone.'],
      ]);
    });

    it('keeps one book per series as EPUB with binding and conversion, whatever else was saved', async () => {
      const { result } = await restoredFrom({
        preferences: { ...kept, mode: 'convert-only', format: 'pdf', singleBook: true },
        notices: [],
      });

      expect(result.current.singleBook).toBe(true);
      expect(result.current.mode).toBe('bind-and-convert');
      expect(result.current.format).toBe('epub');
    });

    it('never restores the whole-series volume, which is chosen again each time', async () => {
      const { result } = await restoredFrom({
        preferences: {
          ...kept,
          format: 'epub',
          settings: { ...kept.settings, combineIntoOneVolume: true },
        },
        notices: [],
      });

      expect(result.current.settings.combineIntoOneVolume).toBe(false);
      expect(result.current.settings.quiet).toBe(true);
    });

    it('says so when the saved settings cannot be read, and keeps the defaults', async () => {
      const notify = vi.fn();
      const bridge = inertBridge({
        loadSettings: () =>
          Promise.resolve({
            ok: false,
            error: { code: 'settings_failed', message: 'Unreadable.' },
          }),
      });

      const { result } = renderHook(() => useKeptSettings(bridge, notify));

      await waitFor(() => {
        expect(notify).toHaveBeenCalledExactlyOnceWith('The saved settings could not be loaded.');
      });
      expect(result.current.mode).toBe(defaultPreferences.mode);
    });

    it('says the same when reading throws', async () => {
      const notify = vi.fn();
      const bridge = inertBridge({
        loadSettings: () => Promise.reject(new Error('The bridge is gone.')),
      });

      renderHook(() => useKeptSettings(bridge, notify));

      await waitFor(() => {
        expect(notify).toHaveBeenCalledExactlyOnceWith('The saved settings could not be loaded.');
      });
    });

    it('never saves over what it could not read', async () => {
      const notify = vi.fn();
      const saveSettings = vi.fn<MangaboundBridge['saveSettings']>();
      const bridge = inertBridge({
        loadSettings: () =>
          Promise.resolve({
            ok: false,
            error: { code: 'settings_failed', message: 'Unreadable.' },
          }),
        saveSettings,
      });
      const { result } = renderHook(() => useKeptSettings(bridge, notify));
      await waitFor(() => {
        expect(notify).toHaveBeenCalled();
      });

      act(() => {
        result.current.setMode('bind-only');
      });

      expect(saveSettings).not.toHaveBeenCalled();
    });

    it('uses nothing that is read after it is gone', async () => {
      const notify = vi.fn();
      const read = deferred<Awaited<ReturnType<MangaboundBridge['loadSettings']>>>();
      const bridge = inertBridge({ loadSettings: () => read.promise });
      const { unmount } = renderHook(() => useKeptSettings(bridge, notify));

      unmount();
      await act(async () => {
        read.resolve({
          ok: true,
          value: { preferences: kept, notices: ['The device is gone.'] },
        });
        await read.promise;
      });

      expect(notify).not.toHaveBeenCalled();
    });

    it('reads again when the bridge changes', async () => {
      const first = vi.fn(reading({ preferences: kept, notices: [] }));
      const second = vi.fn(reading({ preferences: defaultPreferences, notices: [] }));
      const notify = vi.fn();

      const { rerender } = renderHook(({ bridge }) => useKeptSettings(bridge, notify), {
        initialProps: { bridge: inertBridge({ loadSettings: first }) },
      });
      rerender({ bridge: inertBridge({ loadSettings: second }) });

      await waitFor(() => {
        expect(second).toHaveBeenCalledOnce();
      });
      expect(first).toHaveBeenCalledOnce();
    });
  });

  describe('saving', () => {
    it('saves a change, with only what was chosen', async () => {
      const saveSettings = vi.fn<MangaboundBridge['saveSettings']>(() =>
        Promise.resolve({ ok: true, value: undefined }),
      );
      const { result } = await restoredFrom(
        { preferences: defaultPreferences, notices: [] },
        { saveSettings },
      );

      act(() => {
        result.current.setMode('bind-only');
      });

      expect(saveSettings).toHaveBeenCalledOnce();
      expect(saveSettings.mock.calls[0]?.[0]).toStrictEqual({
        preferences: {
          mode: 'bind-only',
          format: defaultPreferences.format,
          settings: defaultPreferences.settings,
          singleBook: false,
        },
      });
    });

    it('saves the online source and the network address once they are chosen', async () => {
      const saveSettings = vi.fn<MangaboundBridge['saveSettings']>(() =>
        Promise.resolve({ ok: true, value: undefined }),
      );
      const { result } = await restoredFrom(
        { preferences: defaultPreferences, notices: [] },
        { saveSettings },
      );

      act(() => {
        result.current.setSelectedProviderId('anilist');
        result.current.setPreferredNetworkInterface(wifi);
      });

      expect(saveSettings).toHaveBeenCalledOnce();
      expect(saveSettings.mock.calls[0]?.[0]).toStrictEqual({
        preferences: { ...defaultPreferences, providerId: 'anilist' },
        preferredNetworkInterface: wifi,
      });
    });

    it('saves a change to each of the choices it keeps', async () => {
      const saveSettings = vi.fn<MangaboundBridge['saveSettings']>(() =>
        Promise.resolve({ ok: true, value: undefined }),
      );
      const { result } = await restoredFrom(
        { preferences: defaultPreferences, notices: [] },
        { saveSettings },
      );

      act(() => {
        result.current.setFormat('pdf');
      });
      act(() => {
        result.current.setSingleBook(true);
      });
      act(() => {
        result.current.setSettings((current) => ({ ...current, quiet: true }));
      });

      expect(saveSettings.mock.calls.map(([command]) => command.preferences)).toStrictEqual([
        { ...defaultPreferences, format: 'pdf' },
        { ...defaultPreferences, format: 'pdf', singleBook: true },
        {
          ...defaultPreferences,
          format: 'pdf',
          singleBook: true,
          settings: { ...defaultPreferences.settings, quiet: true },
        },
      ]);
    });

    it('does not save options that are not valid yet', async () => {
      const saveSettings = vi.fn<MangaboundBridge['saveSettings']>(() =>
        Promise.resolve({ ok: true, value: undefined }),
      );
      const { result } = await restoredFrom(
        { preferences: defaultPreferences, notices: [] },
        { saveSettings },
      );

      act(() => {
        result.current.setSettings((current) => ({ ...current, deviceProfile: '' }));
      });
      expect(saveSettings).not.toHaveBeenCalled();

      act(() => {
        result.current.setSettings((current) => ({ ...current, deviceProfile: 'KCC' }));
      });
      expect(saveSettings).toHaveBeenCalledOnce();
    });

    it('does not write again what it has just saved', async () => {
      const saveSettings = vi.fn<MangaboundBridge['saveSettings']>(() =>
        Promise.resolve({ ok: true, value: undefined }),
      );
      const { result } = await restoredFrom(
        { preferences: defaultPreferences, notices: [] },
        { saveSettings },
      );
      act(() => {
        result.current.setMode('bind-only');
      });

      act(() => {
        result.current.setSettings((current) => ({ ...current }));
      });

      expect(saveSettings).toHaveBeenCalledOnce();
    });

    it('does not save what is already saved', async () => {
      const saveSettings = vi.fn<MangaboundBridge['saveSettings']>(() =>
        Promise.resolve({ ok: true, value: undefined }),
      );
      const { result } = await restoredFrom(
        { preferences: defaultPreferences, notices: [] },
        { saveSettings },
      );

      act(() => {
        result.current.setSettings((current) => ({ ...current }));
      });

      expect(saveSettings).not.toHaveBeenCalled();
    });

    it('says so when a save is refused, and writes again with the next change', async () => {
      const notify = vi.fn();
      const saveSettings = vi
        .fn<MangaboundBridge['saveSettings']>()
        .mockResolvedValueOnce({
          ok: false,
          error: { code: 'settings_failed', message: 'The disk is full.' },
        })
        .mockResolvedValue({ ok: true, value: undefined });
      const { result } = await restoredFrom(
        { preferences: defaultPreferences, notices: [] },
        { saveSettings },
        notify,
      );

      act(() => {
        result.current.setMode('bind-only');
      });
      await waitFor(() => {
        expect(notify).toHaveBeenCalledExactlyOnceWith('The disk is full.');
      });
      act(() => {
        result.current.setSettings((current) => ({ ...current }));
      });

      expect(saveSettings).toHaveBeenCalledTimes(2);
      expect(saveSettings.mock.calls[1]?.[0]).toStrictEqual(saveSettings.mock.calls[0]?.[0]);
    });

    it('says so when saving throws, and writes again with the next change', async () => {
      const notify = vi.fn();
      const saveSettings = vi
        .fn<MangaboundBridge['saveSettings']>()
        .mockRejectedValueOnce(new Error('The bridge is gone.'))
        .mockResolvedValue({ ok: true, value: undefined });
      const { result } = await restoredFrom(
        { preferences: defaultPreferences, notices: [] },
        { saveSettings },
        notify,
      );

      act(() => {
        result.current.setMode('bind-only');
      });
      await waitFor(() => {
        expect(notify).toHaveBeenCalledExactlyOnceWith('The settings could not be saved.');
      });
      act(() => {
        result.current.setSettings((current) => ({ ...current }));
      });

      expect(saveSettings).toHaveBeenCalledTimes(2);
    });
  });
});
