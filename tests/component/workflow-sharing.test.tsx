import { render, screen, waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultPreferences } from '@/domain/preferences';
import { App } from '@/renderer/app';
import { type MangaboundBridge } from '@/shared/runtime-info';

import {
  addFolder,
  bridge,
  expectNoOutputFolderPicker,
  installBridge,
  keptSettings,
  runButton,
} from './support/workflow';

afterEach(() => {
  Reflect.deleteProperty(window, 'mangabound');
});

describe('sharing to an e-reader', () => {
  const wifi = { name: 'Wi-Fi', address: '192.168.1.24' };
  const radmin = { name: 'Radmin VPN', address: '26.97.251.250' };
  const ethernet = { name: 'Ethernet', address: '192.168.18.39' };
  const sharingOn = {
    active: true as const,
    url: 'http://192.168.1.24:8080',
    interfaceAddress: '192.168.1.24',
    port: 8080,
  };
  const okStart = (): ReturnType<typeof vi.fn<MangaboundBridge['startSharing']>> =>
    vi.fn<MangaboundBridge['startSharing']>(() => Promise.resolve({ ok: true, value: sharingOn }));
  const okStop = (): ReturnType<typeof vi.fn<MangaboundBridge['stopSharing']>> =>
    vi.fn<MangaboundBridge['stopSharing']>(() => Promise.resolve({ ok: true, value: undefined }));

  /** Adds a folder, converts it, and waits on the results screen. */
  async function convertOne(user: UserEvent): Promise<void> {
    await addFolder(user);
    expectNoOutputFolderPicker();
    await user.click(await runButton(1));
    await screen.findByRole('heading', { name: '1 book ready' });
  }

  it('remembers an explicitly chosen interface when the panel closes and the app reopens', async () => {
    const user = userEvent.setup();
    const saveSettings = vi.fn<MangaboundBridge['saveSettings']>(() =>
      Promise.resolve({ ok: true, value: undefined }),
    );
    installBridge(
      bridge({
        listNetworkInterfaces: () => Promise.resolve({ ok: true, value: [radmin, ethernet] }),
        saveSettings,
      }),
    );
    const firstWindow = render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Share' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Network interface')).toHaveValue(radmin.address);
    });
    expect(saveSettings).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText('Network interface'), ethernet.address);
    await waitFor(() => {
      expect(saveSettings).toHaveBeenCalledWith({
        preferences: defaultPreferences,
        preferredNetworkInterface: ethernet,
      });
    });
    await user.click(screen.getByRole('button', { name: 'Close sharing' }));
    await user.click(screen.getByRole('button', { name: 'Share' }));
    expect(screen.getByLabelText('Network interface')).toHaveValue(ethernet.address);

    firstWindow.unmount();
    installBridge(
      bridge({
        listNetworkInterfaces: () => Promise.resolve({ ok: true, value: [radmin, ethernet] }),
        loadSettings: keptSettings({ preferredNetworkInterface: ethernet }),
        saveSettings,
      }),
    );
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Share' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Network interface')).toHaveValue(ethernet.address);
    });
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it('uses the current address of a remembered adapter after its IP changes', async () => {
    const user = userEvent.setup();
    const newEthernet = { name: 'Ethernet', address: '192.168.18.50' };
    const startSharing = okStart();
    installBridge(
      bridge({
        listNetworkInterfaces: () => Promise.resolve({ ok: true, value: [radmin, newEthernet] }),
        loadSettings: keptSettings({ preferredNetworkInterface: ethernet }),
        startSharing,
      }),
    );
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Share' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Network interface')).toHaveValue(newEthernet.address);
    });
    await user.click(screen.getByRole('button', { name: 'Choose a library to share' }));
    await user.click(screen.getByRole('button', { name: 'Start sharing' }));
    expect(startSharing).toHaveBeenCalledWith('library', newEthernet.address, {
      username: '',
      password: '',
    });
  });

  it('has one Share button, in the title bar, that says whether anything is shared', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        listNetworkInterfaces: () => Promise.resolve({ ok: true, value: [wifi] }),
        startSharing: okStart(),
      }),
    );
    render(<App />);

    const share = await screen.findByRole('button', { name: 'Share' });
    expect(share.closest('header')).not.toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(share);
    expect(screen.getByRole('dialog', { name: 'Share to your e-reader' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Choose a library to share' }));
    await user.click(await screen.findByRole('button', { name: 'Start sharing' }));

    expect(await screen.findByLabelText('Catalog address')).toHaveValue('http://192.168.1.24:8080');
    expect(screen.getByRole('button', { name: 'Sharing' })).toBeVisible();
  });

  it('closes the panel with Escape and returns to the button', async () => {
    const user = userEvent.setup();
    installBridge(bridge());
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Share' }));

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toHaveFocus();
  });

  it('opens the same panel from the results screen, with the books just saved chosen', async () => {
    const user = userEvent.setup();
    const startSharing = okStart();
    const stopSharing = okStop();
    installBridge(
      bridge({
        listNetworkInterfaces: () => Promise.resolve({ ok: true, value: [wifi] }),
        startSharing,
        stopSharing,
      }),
    );
    render(<App />);
    await convertOne(user);
    expect(await screen.findByRole('heading', { name: 'Send to KOReader' })).toBeVisible();
    // The card has no controls of its own: there is one place that starts and stops sharing.
    expect(screen.queryByRole('button', { name: 'Start sharing' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Share these books' }));

    const panel = screen.getByRole('dialog', { name: 'Share to your e-reader' });
    expect(panel).toHaveTextContent('Books ready to share');
    await user.click(screen.getByRole('button', { name: 'Start sharing' }));
    expect(startSharing).toHaveBeenCalledWith('pending-run', '192.168.1.24', {
      username: '',
      password: '',
    });
    expect(await screen.findByLabelText('Catalog address')).toHaveValue('http://192.168.1.24:8080');
    // The card and the title bar both say it, from the one state.
    expect(screen.getByRole('button', { name: 'Sharing' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Show sharing' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Stop sharing' }));
    expect(stopSharing).toHaveBeenCalledOnce();
    expect(await screen.findByRole('button', { name: 'Start sharing' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Share these books' })).toBeVisible();
  });

  it('does not change what is being shared when the saved books are offered', async () => {
    const user = userEvent.setup();
    const startSharing = okStart();
    installBridge(
      bridge({
        listNetworkInterfaces: () => Promise.resolve({ ok: true, value: [wifi] }),
        // The first pick is for sharing, the next is the folder the books are saved to.
        chooseLibrary: vi
          .fn<MangaboundBridge['chooseLibrary']>()
          .mockResolvedValueOnce({
            ok: true,
            value: { libraryId: 'elsewhere', displayPath: 'D:\\Elsewhere' },
          })
          .mockResolvedValue({
            ok: true,
            value: { libraryId: 'library', displayPath: 'C:\\Books' },
          }),
        startSharing,
      }),
    );
    render(<App />);
    // Something else is shared first, from the title bar.
    await user.click(await screen.findByRole('button', { name: 'Share' }));
    await user.click(screen.getByRole('button', { name: 'Choose a library to share' }));
    await user.click(await screen.findByRole('button', { name: 'Start sharing' }));
    await screen.findByLabelText('Catalog address');
    await user.keyboard('{Escape}');
    expect(startSharing).toHaveBeenCalledExactlyOnceWith('elsewhere', '192.168.1.24', {
      username: '',
      password: '',
    });

    await convertOne(user);
    await user.click(screen.getByRole('button', { name: 'Show sharing' }));

    // The panel shows what is being shared and nothing was started again.
    expect(screen.getByLabelText('Catalog address')).toBeVisible();
    expect(startSharing).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('reports a sharing failure instead of showing the address', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        listNetworkInterfaces: () => Promise.resolve({ ok: true, value: [wifi] }),
        startSharing: () =>
          Promise.resolve({
            ok: false,
            error: { code: 'sharing_failed', message: 'The port is already in use.' },
          }),
      }),
    );
    render(<App />);
    await convertOne(user);
    await user.click(await screen.findByRole('button', { name: 'Share these books' }));
    await user.click(await screen.findByRole('button', { name: 'Start sharing' }));

    expect(await screen.findByRole('alert', { name: 'Workflow error' })).toHaveTextContent(
      'The port is already in use.',
    );
    expect(screen.queryByLabelText('Catalog address')).not.toBeInTheDocument();
  });

  it('says why choosing a library to share failed', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        chooseLibrary: () =>
          Promise.resolve({
            ok: false,
            error: { code: 'internal_error', message: 'The folder could not be chosen.' },
          }),
      }),
    );
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Share' }));

    await user.click(screen.getByRole('button', { name: 'Choose a library to share' }));

    expect(await screen.findByRole('alert', { name: 'Workflow error' })).toHaveTextContent(
      'The folder could not be chosen.',
    );
  });

  it('starts nothing when no library was chosen to share', async () => {
    const user = userEvent.setup();
    const startSharing = okStart();
    installBridge(
      bridge({
        listNetworkInterfaces: () => Promise.resolve({ ok: true, value: [wifi] }),
        chooseLibrary: () => Promise.resolve({ ok: true, value: null }),
        startSharing,
      }),
    );
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Share' }));
    await user.click(screen.getByRole('button', { name: 'Choose a library to share' }));

    expect(screen.getByRole('button', { name: 'Start sharing' })).toBeDisabled();
    expect(startSharing).not.toHaveBeenCalled();
  });

  it('offers the card only when something was saved', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        convert: () =>
          Promise.resolve({
            ok: false,
            error: { code: 'process_failed', message: 'mangapress crashed.' },
          }),
      }),
    );
    render(<App />);
    await addFolder(user);
    expectNoOutputFolderPicker();
    await user.click(await runButton(1));

    expect(await screen.findByRole('heading', { name: 'No books were produced' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Send to KOReader' })).not.toBeInTheDocument();
  });
});
