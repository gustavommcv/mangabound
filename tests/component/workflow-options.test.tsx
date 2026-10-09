import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultMangapressSettings } from '@/domain/output-profile';
import { defaultPreferences } from '@/domain/preferences';
import { App } from '@/renderer/app';
import { type MangaboundBridge } from '@/shared/runtime-info';

import {
  addFolder,
  bridge,
  expectNoOutputFolderPicker,
  folder,
  installBridge,
  keptSettings,
  runButton,
} from './support/workflow';

afterEach(() => {
  Reflect.deleteProperty(window, 'mangabound');
});

describe('entering conversion options', () => {
  it('focuses the page on every entry, keeps focus while typing and retains choices after returning to the queue', async () => {
    const user = userEvent.setup();
    installBridge(bridge());
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Advanced conversion options' }));
    expect(await screen.findByRole('heading', { name: 'Conversion options' })).toHaveFocus();

    const quality = screen.getByLabelText(/^JPEG quality/u);
    await user.type(quality, '80');
    expect(quality).toHaveValue(80);
    expect(quality).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Queue' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Advanced conversion options' }));
    expect(await screen.findByRole('heading', { name: 'Conversion options' })).toHaveFocus();
    expect(screen.getByLabelText(/^JPEG quality/u)).toHaveValue(80);
  });
});

describe('the options a run starts with', () => {
  const scribe = {
    code: 'KS',
    name: 'Kindle Scribe 1/2',
    width: 1860,
    height: 2480,
    grayLevels: 16,
    family: 'kindle',
  };
  const paperwhite = {
    code: 'KPW6',
    name: 'Kindle Paperwhite 6',
    width: 1272,
    height: 1696,
    grayLevels: 16,
    family: 'kindle',
  };

  it('sends what Kindle Comic Converter has on, and takes upscaling from the device chosen', async () => {
    const user = userEvent.setup();
    const convert = vi.fn<MangaboundBridge['convert']>(() =>
      Promise.resolve({
        ok: true,
        value: [{ id: 'a1', name: 'Offline Work.epub', bytes: 2048, format: 'epub' }],
      }),
    );
    // Every pick registers under an id of its own, so the second add is a new item.
    const chooseInputs = vi
      .fn<MangaboundBridge['chooseInputs']>()
      .mockResolvedValueOnce({ ok: true, value: { inputs: [folder()], rejected: [] } })
      .mockResolvedValueOnce({
        ok: true,
        value: { inputs: [folder('Offline Work', 'selection-2')], rejected: [] },
      });
    installBridge(
      bridge({
        chooseInputs,
        convert,
        getDeviceProfiles: () => Promise.resolve({ ok: true, value: [paperwhite, scribe] }),
      }),
    );
    render(<App />);
    await addFolder(user);
    expectNoOutputFolderPicker();

    // Nothing has been touched: manga order, both spread modes and upscaling are on.
    await user.click(await runButton(1));
    await screen.findByRole('heading', { name: '1 book ready' });
    expect(convert.mock.calls[0]?.[0].settings).toMatchObject({
      deviceProfile: 'KPW6',
      mangaStyle: true,
      splitter: 'both',
      upscale: true,
    });

    // A Scribe starts without upscaling, and the rest stays as it was.
    await user.click(screen.getByRole('button', { name: 'Convert more' }));
    await addFolder(user);
    await user.selectOptions(screen.getByLabelText('Device'), 'KS');
    await user.click(await runButton(1));
    await screen.findByRole('heading', { name: '1 book ready' });
    expect(convert.mock.calls[1]?.[0].settings).toMatchObject({
      deviceProfile: 'KS',
      mangaStyle: true,
      splitter: 'both',
      upscale: false,
    });
  });

  it('starts from the first device on offer, with its own upscaling, when the default one is missing', async () => {
    const user = userEvent.setup();
    const convert = vi.fn<MangaboundBridge['convert']>(() =>
      Promise.resolve({
        ok: true,
        value: [{ id: 'a1', name: 'Offline Work.epub', bytes: 2048, format: 'epub' }],
      }),
    );
    installBridge(
      bridge({
        convert,
        getDeviceProfiles: () => Promise.resolve({ ok: true, value: [scribe] }),
      }),
    );
    render(<App />);
    await waitFor(() => {
      expect(screen.getByLabelText('Device')).toHaveValue('KS');
    });
    expect(
      screen.getByText(
        'The device profile KPW6 is not available, so Kindle Scribe 1/2 is selected.',
      ),
    ).toBeVisible();
    await addFolder(user);
    expectNoOutputFolderPicker();

    await user.click(await runButton(1));

    await screen.findByRole('heading', { name: '1 book ready' });
    expect(convert.mock.calls[0]?.[0].settings).toMatchObject({
      deviceProfile: 'KS',
      upscale: false,
    });
  });
});

describe('the options kept between sessions', () => {
  const scribe = {
    code: 'KS',
    name: 'Kindle Scribe 1/2',
    width: 1860,
    height: 2480,
    grayLevels: 16,
    family: 'kindle',
  };
  const paperwhite = {
    code: 'KPW6',
    name: 'Kindle Paperwhite 6',
    width: 1272,
    height: 1696,
    grayLevels: 16,
    family: 'kindle',
  };
  const twoDevices = (): MangaboundBridge['getDeviceProfiles'] => () =>
    Promise.resolve({ ok: true, value: [paperwhite, scribe] });

  const saveCalls = (
    saveSettings: ReturnType<typeof vi.fn<MangaboundBridge['saveSettings']>>,
  ): readonly Parameters<MangaboundBridge['saveSettings']>[0][] =>
    saveSettings.mock.calls.map(([command]) => command);

  const okSave = (): ReturnType<typeof vi.fn<MangaboundBridge['saveSettings']>> =>
    vi.fn<MangaboundBridge['saveSettings']>(() => Promise.resolve({ ok: true, value: undefined }));

  it('opens with saved conversion options but no output-folder control', async () => {
    installBridge(
      bridge({
        getDeviceProfiles: twoDevices(),
        loadSettings: keptSettings({
          preferences: {
            mode: 'convert-only',
            format: 'pdf',
            singleBook: false,
            settings: { ...defaultMangapressSettings, deviceProfile: 'KS', upscale: false },
          },
        }),
      }),
    );
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText('Device')).toHaveValue('KS');
    });
    expect(screen.getByRole('radio', { name: 'PDF' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Group chapters into volumes' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Convert for e-reader' })).toBeChecked();
    expect(screen.queryByText('D:\\Manga\\Saved')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change output folder' })).not.toBeInTheDocument();
    // Nothing went wrong, so nothing is said.
    expect(screen.queryByRole('status', { name: 'Notices' })).not.toBeInTheDocument();
  });

  it('keeps each change, and never an output folder', async () => {
    const user = userEvent.setup();
    const saveSettings = okSave();
    installBridge(bridge({ saveSettings, getDeviceProfiles: twoDevices() }));
    render(<App />);
    await screen.findByRole('heading', { name: 'Queue' });
    await waitFor(() => {
      expect(screen.getByLabelText('Device')).toHaveValue('KPW6');
    });
    // Opening the app changes nothing, so nothing is written.
    expect(saveSettings).not.toHaveBeenCalled();

    expectNoOutputFolderPicker();
    await user.click(screen.getByRole('radio', { name: 'PDF' }));

    await waitFor(() => {
      const last = saveCalls(saveSettings).at(-1);
      expect(last).toEqual({
        preferences: {
          mode: 'bind-and-convert',
          format: 'pdf',
          singleBook: false,
          settings: defaultMangapressSettings,
        },
      });
    });
  });

  it('keeps the source that was chosen, and forgets one the list no longer has', async () => {
    const user = userEvent.setup();
    const saveSettings = okSave();
    const mangaDex = {
      id: 'mangadex',
      displayName: 'MangaDex',
      homepage: 'https://mangadex.org',
      description: 'Community catalogue of manga, with volume and chapter data',
    };
    installBridge(
      bridge({
        saveSettings,
        listMetadataProviders: () => Promise.resolve({ ok: true, value: [mangaDex] }),
        loadSettings: keptSettings({
          preferences: { ...defaultPreferences, providerId: 'removed-in-an-update' },
        }),
      }),
    );
    render(<App />);
    await addFolder(user);
    await user.click(screen.getByRole('button', { name: 'Edit volumes for Offline Work' }));
    await user.click(await screen.findByRole('tab', { name: 'Online source' }));

    // The saved id is not in the list, so nothing is chosen.
    expect(screen.getByRole('combobox', { name: 'Source' })).toHaveTextContent('Select a source');
    await user.click(screen.getByRole('combobox', { name: 'Source' }));
    await user.click(screen.getByRole('option', { name: /MangaDex/u }));

    await waitFor(() => {
      expect(saveCalls(saveSettings).at(-1)?.preferences.providerId).toBe('mangadex');
    });
  });

  it('starts with the source that was kept, when the list has it', async () => {
    const user = userEvent.setup();
    const mangaDex = {
      id: 'mangadex',
      displayName: 'MangaDex',
      homepage: 'https://mangadex.org',
      description: 'Community catalogue of manga, with volume and chapter data',
    };
    installBridge(
      bridge({
        listMetadataProviders: () => Promise.resolve({ ok: true, value: [mangaDex] }),
        loadSettings: keptSettings({
          preferences: { ...defaultPreferences, providerId: 'mangadex' },
        }),
      }),
    );
    render(<App />);
    await addFolder(user);
    await user.click(screen.getByRole('button', { name: 'Edit volumes for Offline Work' }));
    await user.click(await screen.findByRole('tab', { name: 'Online source' }));

    expect(screen.getByRole('combobox', { name: 'Source' })).toHaveTextContent('MangaDex');
  });

  it('saves nothing until what was kept has been read', async () => {
    const user = userEvent.setup();
    const saveSettings = okSave();
    let release: (result: Awaited<ReturnType<MangaboundBridge['loadSettings']>>) => void = () =>
      undefined;
    installBridge(
      bridge({
        saveSettings,
        loadSettings: () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      }),
    );
    render(<App />);
    await screen.findByRole('heading', { name: 'Queue' });
    // The defaults on screen must not be written over what is still being read.
    expect(saveSettings).not.toHaveBeenCalled();

    act(() => {
      release({
        ok: true,
        value: {
          preferences: { ...defaultPreferences, format: 'cbz' },
          notices: [],
        },
      });
    });
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'CBZ' })).toBeChecked();
    });
    // What was read is what is kept already, so reading it writes nothing.
    expect(saveSettings).not.toHaveBeenCalled();

    await user.click(screen.getByRole('radio', { name: 'PDF' }));
    await waitFor(() => {
      expect(saveCalls(saveSettings)).toEqual([
        { preferences: { ...defaultPreferences, format: 'pdf' } },
      ]);
    });
  });

  it.each([
    [
      'answers with a failure',
      () => Promise.resolve({ ok: false as const, error: { code: 'x', message: 'no' } }),
    ],
    ['is rejected', () => Promise.reject(new Error('the bridge is gone'))],
  ])('saves nothing, and says so, when reading what was kept %s', async (_name, loadSettings) => {
    const user = userEvent.setup();
    const saveSettings = okSave();
    installBridge(bridge({ saveSettings, loadSettings }));
    render(<App />);

    expect(await screen.findByText('The saved settings could not be loaded.')).toBeVisible();
    await user.click(screen.getByRole('radio', { name: 'PDF' }));
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('says what could not be restored, until it is dismissed', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        loadSettings: keptSettings({
          notices: [
            'The saved settings could not be read, so the defaults are in use.',
            'The output folder D:\\Gone is not available. Choose another to save to.',
          ],
        }),
      }),
    );
    render(<App />);

    const notices = await screen.findByRole('status', { name: 'Notices' });
    expect(within(notices).getAllByRole('listitem')).toHaveLength(2);
    expect(notices).toHaveTextContent('The saved settings could not be read');
    expect(notices).toHaveTextContent('D:\\Gone is not available');

    await user.click(screen.getByRole('button', { name: 'Dismiss these notices' }));
    expect(screen.queryByRole('status', { name: 'Notices' })).not.toBeInTheDocument();
  });

  it('uses a device the tools still list when the kept one is gone, and says so', async () => {
    const saveSettings = okSave();
    installBridge(
      bridge({
        saveSettings,
        getDeviceProfiles: twoDevices(),
        loadSettings: keptSettings({
          preferences: {
            ...defaultPreferences,
            settings: { ...defaultMangapressSettings, deviceProfile: 'K999' },
          },
        }),
      }),
    );
    render(<App />);

    expect(
      await screen.findByText(
        'The device profile K999 is not available, so Kindle Paperwhite 6 is selected.',
      ),
    ).toBeVisible();
    expect(screen.getByLabelText('Device')).toHaveValue('KPW6');
    await waitFor(() => {
      expect(saveCalls(saveSettings).at(-1)?.preferences.settings.deviceProfile).toBe('KPW6');
    });
  });

  it('tries a save again with the next change after one failed', async () => {
    const user = userEvent.setup();
    const saveSettings = vi
      .fn<MangaboundBridge['saveSettings']>()
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'settings_save_failed', message: 'Your settings could not be saved.' },
      })
      .mockResolvedValue({ ok: true, value: undefined });
    installBridge(bridge({ saveSettings }));
    render(<App />);
    await screen.findByRole('heading', { name: 'Queue' });

    await user.click(screen.getByRole('radio', { name: 'PDF' }));
    expect(await screen.findByText('Your settings could not be saved.')).toBeVisible();
    await user.click(screen.getByRole('radio', { name: 'CBZ' }));

    await waitFor(() => {
      expect(saveSettings).toHaveBeenCalledTimes(2);
    });
    expect(saveCalls(saveSettings).at(-1)?.preferences.format).toBe('cbz');
  });

  it.each([
    [
      'refuses',
      () =>
        Promise.resolve({
          ok: false as const,
          error: { code: 'settings_save_failed', message: 'Your settings could not be saved.' },
        }),
      'Your settings could not be saved.',
    ],
    [
      'is rejected',
      () => Promise.reject(new Error('the bridge is gone')),
      'The settings could not be saved.',
    ],
  ])('says so when saving %s', async (_name, saveSettings, message) => {
    const user = userEvent.setup();
    installBridge(bridge({ saveSettings }));
    render(<App />);
    await screen.findByRole('heading', { name: 'Queue' });

    await user.click(screen.getByRole('radio', { name: 'PDF' }));

    expect(await screen.findByText(message)).toBeVisible();
  });

  it('does not keep an option while it is half typed, and keeps it once it is valid', async () => {
    const user = userEvent.setup();
    const saveSettings = okSave();
    installBridge(bridge({ saveSettings }));
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Advanced conversion options/u }));

    const quality = await screen.findByLabelText(/JPEG quality/u);
    await user.type(quality, '500');
    await user.clear(quality);
    await user.type(quality, '80');

    await waitFor(() => {
      expect(saveCalls(saveSettings).at(-1)?.preferences.settings.jpegQuality).toBe(80);
    });
    // 500 is out of range, so it was never written; the 5 and the 50 on the way to it were.
    expect(
      saveCalls(saveSettings).some((command) => command.preferences.settings.jpegQuality === 500),
    ).toBe(false);
  });

  it('opens with singleBook kept from previous session and saves singleBook: false when turned off', async () => {
    const user = userEvent.setup();
    const saveSettings = okSave();
    installBridge(
      bridge({
        saveSettings,
        loadSettings: keptSettings({
          preferences: {
            ...defaultPreferences,
            singleBook: true,
            mode: 'bind-and-convert',
            format: 'epub',
          },
        }),
      }),
    );
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Queue' })).toBeVisible();
    const singleBookCheckbox = screen.getByRole('checkbox', {
      name: 'Create one book for the series',
    });
    expect(singleBookCheckbox).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Group chapters into volumes' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Convert for e-reader' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'EPUB' })).toBeDisabled();
    expect(
      screen.getAllByText('Turn off “Create one book for the series” to change this.'),
    ).toHaveLength(3);

    await user.click(singleBookCheckbox);

    expect(singleBookCheckbox).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Group chapters into volumes' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'Convert for e-reader' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'EPUB' })).toBeEnabled();
    expect(
      screen.queryByText('Turn off “Create one book for the series” to change this.'),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(saveCalls(saveSettings).at(-1)?.preferences).toMatchObject({
        singleBook: false,
      });
    });
  });

  describe('putting the options back to their defaults', () => {
    async function changeEverything(user: UserEvent): Promise<void> {
      await user.selectOptions(await screen.findByLabelText('Device'), 'KS');
      await user.click(screen.getByRole('radio', { name: 'PDF' }));
      await user.click(screen.getByRole('checkbox', { name: 'Group chapters into volumes' }));
    }

    it('is dimmed while every option is at its default, and does nothing', async () => {
      const user = userEvent.setup();
      installBridge(bridge());
      render(<App />);

      const reset = await screen.findByRole('button', { name: 'Reset to defaults' });
      expect(reset).toHaveAttribute('aria-disabled', 'true');
      expect(reset).toHaveAccessibleDescription('Every option is already at its default.');
      await user.click(reset);
      expect(screen.queryByRole('group', { name: 'Confirm reset' })).not.toBeInTheDocument();
    });

    it('restores each changed queue option independently and keeps the general reset', async () => {
      const user = userEvent.setup();
      const saveSettings = okSave();
      installBridge(bridge({ saveSettings, getDeviceProfiles: twoDevices() }));
      render(<App />);
      await changeEverything(user);

      expect(screen.getByRole('button', { name: 'Reset to defaults' })).toHaveAttribute(
        'aria-disabled',
        'false',
      );
      for (const label of ['Device', 'Format', 'Group chapters into volumes']) {
        expect(screen.getByRole('button', { name: `Restore default for ${label}` })).toBeVisible();
      }

      await user.click(screen.getByRole('button', { name: 'Restore default for Device' }));
      expect(screen.getByLabelText('Device')).toHaveValue('KPW6');
      expect(screen.getByRole('radio', { name: 'PDF' })).toBeChecked();
      expect(
        screen.getByRole('checkbox', { name: 'Group chapters into volumes' }),
      ).not.toBeChecked();

      await user.click(screen.getByRole('button', { name: 'Restore default for Format' }));
      expect(screen.getByRole('radio', { name: 'CBZ' })).toBeChecked();
      expect(
        screen.getByRole('checkbox', { name: 'Group chapters into volumes' }),
      ).not.toBeChecked();

      await user.click(
        screen.getByRole('button', { name: 'Restore default for Group chapters into volumes' }),
      );
      expect(screen.getByRole('checkbox', { name: 'Group chapters into volumes' })).toBeChecked();
      expect(screen.getByRole('button', { name: 'Reset to defaults' })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      await waitFor(() => {
        expect(saveCalls(saveSettings).at(-1)?.preferences).toEqual(defaultPreferences);
      });
    });

    it('saves an individual restore from the detailed options without discarding other changes', async () => {
      const user = userEvent.setup();
      const saveSettings = okSave();
      installBridge(bridge({ saveSettings }));
      render(<App />);
      await user.click(await screen.findByRole('button', { name: /Advanced conversion options/u }));

      await user.selectOptions(screen.getByLabelText('Page format'), 'png');
      await user.clear(screen.getByLabelText('EPUB language'));
      await user.type(screen.getByLabelText('EPUB language'), 'pt-br');
      expect(
        screen.getByRole('button', { name: 'Restore default for EPUB language' }),
      ).toBeVisible();
      expect(screen.getByRole('button', { name: 'Restore default for Page format' })).toBeVisible();

      await user.click(screen.getByRole('button', { name: 'Restore default for EPUB language' }));
      expect(screen.getByLabelText('EPUB language')).toHaveValue('en-US');
      expect(screen.getByLabelText('Page format')).toHaveValue('png');
      expect(screen.getByRole('button', { name: 'Reset to defaults' })).toHaveAttribute(
        'aria-disabled',
        'false',
      );
      await waitFor(() => {
        const preferences = saveCalls(saveSettings).at(-1)?.preferences;
        expect(preferences?.settings.forcePng).toBe(true);
        expect(preferences?.settings).not.toHaveProperty('title');
      });
    });

    it('puts the steps, device, format and options back without choosing a destination', async () => {
      const user = userEvent.setup();
      const saveSettings = okSave();
      installBridge(
        bridge({
          saveSettings,
          getDeviceProfiles: twoDevices(),
        }),
      );
      render(<App />);
      await changeEverything(user);
      expect(screen.getByLabelText('Device')).toHaveValue('KS');

      await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
      const confirm = screen.getByRole('group', { name: 'Confirm reset' });
      expect(confirm).toHaveTextContent(
        'Put the steps, device, format and every mangapress option back to their defaults?',
      );
      await user.click(within(confirm).getByRole('button', { name: 'Reset' }));

      expect(screen.getByLabelText('Device')).toHaveValue('KPW6');
      expect(screen.getByRole('radio', { name: 'CBZ' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Group chapters into volumes' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Convert for e-reader' })).toBeChecked();
      // The old output preference is not restored as a conversion destination.
      expect(screen.queryByText('D:\\Manga\\Saved')).not.toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Confirm reset' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reset to defaults' })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      await waitFor(() => {
        expect(saveCalls(saveSettings).at(-1)).toEqual({
          preferences: defaultPreferences,
        });
      });
    });

    it('changes nothing when the second click is a cancel', async () => {
      const user = userEvent.setup();
      installBridge(bridge({ getDeviceProfiles: twoDevices() }));
      render(<App />);
      await changeEverything(user);

      await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
      await user.click(
        within(screen.getByRole('group', { name: 'Confirm reset' })).getByRole('button', {
          name: 'Cancel',
        }),
      );

      expect(screen.queryByRole('group', { name: 'Confirm reset' })).not.toBeInTheDocument();
      expect(screen.getByLabelText('Device')).toHaveValue('KS');
      expect(screen.getByRole('radio', { name: 'PDF' })).toBeChecked();
    });

    it('resets only what the options screen holds when it is used there', async () => {
      const user = userEvent.setup();
      installBridge(bridge({ getDeviceProfiles: twoDevices() }));
      render(<App />);
      await changeEverything(user);
      await user.click(screen.getByRole('button', { name: /Advanced conversion options/u }));
      await screen.findByRole('heading', { name: 'Conversion options' });
      expect(screen.getByLabelText('Device profile')).toHaveValue('KS');

      await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
      const confirm = screen.getByRole('group', { name: 'Confirm reset' });
      expect(confirm).toHaveTextContent(
        'Put the device, format and every mangapress option back to their defaults?',
      );
      await user.click(within(confirm).getByRole('button', { name: 'Reset' }));

      expect(screen.getByLabelText('Device profile')).toHaveValue('KPW6');
      expect(screen.getByLabelText('Book format')).toHaveValue('cbz');
      await user.click(screen.getByRole('button', { name: 'Back' }));
      // The steps are not on that screen, so they stay as they were set.
      expect(
        await screen.findByRole('checkbox', { name: 'Group chapters into volumes' }),
      ).not.toBeChecked();
    });
  });
});
