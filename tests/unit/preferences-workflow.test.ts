import { describe, expect, it, vi } from 'vitest';

import type {
  SettingsLoad,
  SettingsStorePort,
  StoredSettings,
} from '@/application/ports/settings-store';
import { PreferencesWorkflow } from '@/application/workflows/preferences';
import { defaultMangapressSettings } from '@/domain/output-profile';
import { defaultPreferences } from '@/domain/preferences';

const kept: StoredSettings = {
  mode: 'convert-only',
  format: 'pdf',
  settings: { ...defaultMangapressSettings, deviceProfile: 'KS' },
  providerId: 'mangadex',
  outputFolder: '/books',
};

function store(load: SettingsLoad): {
  readonly port: SettingsStorePort;
  readonly save: ReturnType<typeof vi.fn<SettingsStorePort['save']>>;
  readonly settled: ReturnType<typeof vi.fn<SettingsStorePort['settled']>>;
} {
  const save = vi.fn<SettingsStorePort['save']>(() => Promise.resolve());
  const settled = vi.fn<SettingsStorePort['settled']>(() => Promise.resolve());
  return { port: { load: () => Promise.resolve(load), save, settled }, save, settled };
}

describe('restoring the options', () => {
  it('gives back what was kept, with the folder when it is still there', async () => {
    const { port } = store({ settings: kept, unreadable: false });
    const directoryExists = vi.fn(() => Promise.resolve(true));

    const restored = await new PreferencesWorkflow(port, directoryExists).restore();

    expect(restored).toEqual({
      preferences: {
        mode: 'convert-only',
        format: 'pdf',
        settings: kept.settings,
        providerId: 'mangadex',
      },
      outputFolder: '/books',
      notices: [],
    });
    expect(directoryExists).toHaveBeenCalledExactlyOnceWith('/books');
  });

  it('says so, and gives no folder, when the folder is gone', async () => {
    const { port } = store({ settings: kept, unreadable: false });

    const restored = await new PreferencesWorkflow(port, () => Promise.resolve(false)).restore();

    expect(restored.outputFolder).toBeUndefined();
    expect(restored).not.toHaveProperty('outputFolder');
    expect(restored.notices).toEqual([
      'The output folder /books is not available. Choose another to save to.',
    ]);
    // Everything else that was kept still comes back.
    expect(restored.preferences.format).toBe('pdf');
  });

  it('does not look for a folder that was never chosen, and leaves out a source that was never chosen', async () => {
    const { port } = store({ settings: defaultPreferences, unreadable: false });
    const directoryExists = vi.fn(() => Promise.resolve(true));

    const restored = await new PreferencesWorkflow(port, directoryExists).restore();

    expect(restored).toEqual({ preferences: defaultPreferences, notices: [] });
    expect(restored.preferences).not.toHaveProperty('providerId');
    expect(directoryExists).not.toHaveBeenCalled();
  });

  it('gives back where a dialog was left, when that folder is still there', async () => {
    const { port } = store({
      settings: { ...defaultPreferences, lastPickerFolder: '/downloads' },
      unreadable: false,
    });
    const directoryExists = vi.fn(() => Promise.resolve(true));

    const restored = await new PreferencesWorkflow(port, directoryExists).restore();

    expect(restored.lastPickerFolder).toBe('/downloads');
    expect(directoryExists).toHaveBeenCalledExactlyOnceWith('/downloads');
  });

  it('leaves out where a dialog was left, quietly, when that folder is gone', async () => {
    const { port } = store({
      settings: { ...defaultPreferences, lastPickerFolder: '/downloads' },
      unreadable: false,
    });

    const restored = await new PreferencesWorkflow(port, () => Promise.resolve(false)).restore();

    expect(restored).not.toHaveProperty('lastPickerFolder');
    // Unlike the output folder, a missing dialog folder is not worth a notice: it is only ever a
    // starting point for a dialog that would otherwise have opened somewhere else anyway.
    expect(restored.notices).toEqual([]);
  });

  it('says so when the saved settings could not be read, and starts from the defaults', async () => {
    const { port } = store({ settings: defaultPreferences, unreadable: true });

    const restored = await new PreferencesWorkflow(port, () => Promise.resolve(true)).restore();

    expect(restored.preferences).toEqual(defaultPreferences);
    expect(restored.notices).toEqual([
      'The saved settings could not be read, so the defaults are in use.',
    ]);
  });
});

describe('keeping the options', () => {
  it('saves the options with the folder they were used with', async () => {
    const { port, save } = store({ settings: defaultPreferences, unreadable: false });
    const workflow = new PreferencesWorkflow(port, () => Promise.resolve(true));

    await workflow.save({ ...defaultPreferences, format: 'cbz' }, '/books', '/downloads');

    expect(save).toHaveBeenCalledExactlyOnceWith({
      ...defaultPreferences,
      format: 'cbz',
      outputFolder: '/books',
      lastPickerFolder: '/downloads',
    });
  });

  it('saves without a folder when none was chosen, or a dialog was never opened', async () => {
    const { port, save } = store({ settings: defaultPreferences, unreadable: false });

    await new PreferencesWorkflow(port, () => Promise.resolve(true)).save(
      defaultPreferences,
      undefined,
      undefined,
    );

    expect(save.mock.calls[0]?.[0]).toEqual(defaultPreferences);
    expect(save.mock.calls[0]?.[0]).not.toHaveProperty('outputFolder');
    expect(save.mock.calls[0]?.[0]).not.toHaveProperty('lastPickerFolder');
  });

  it('waits for the saves the store still has to write', async () => {
    const { port, settled } = store({ settings: defaultPreferences, unreadable: false });

    await new PreferencesWorkflow(port, () => Promise.resolve(true)).settled();

    expect(settled).toHaveBeenCalledOnce();
  });
});
