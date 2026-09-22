import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SharePanel } from '@/renderer/components/sharing/share-panel';

const interfaces = [
  { name: 'Wi-Fi', address: '192.168.1.20' },
  { name: 'Ethernet', address: '10.0.0.5' },
];

describe('SharePanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a message and disables Start when there are no network interfaces', () => {
    render(
      <SharePanel
        interfaces={[]}
        onChooseLibrary={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
        status={{ active: false }}
      />,
    );

    expect(screen.getByText('No network interfaces were detected.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start sharing' })).toBeDisabled();
  });

  it('requires a chosen library before Start is enabled', async () => {
    const user = userEvent.setup();
    const onChooseLibrary = vi.fn();
    render(
      <SharePanel
        interfaces={interfaces}
        onChooseLibrary={onChooseLibrary}
        onStart={vi.fn()}
        onStop={vi.fn()}
        status={{ active: false }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Start sharing' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Choose a library to share' }));
    expect(onChooseLibrary).toHaveBeenCalledOnce();
  });

  it('starts sharing with no credentials when the username and password are left blank', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(
      <SharePanel
        interfaces={interfaces}
        library={{ libraryId: 'library', displayPath: 'C:\\Books' }}
        onChooseLibrary={vi.fn()}
        onStart={onStart}
        onStop={vi.fn()}
        status={{ active: false }}
      />,
    );

    expect(screen.getByText('C:\\Books')).toBeVisible();
    await user.selectOptions(screen.getByLabelText('Network interface'), '10.0.0.5');
    await user.click(screen.getByRole('button', { name: 'Start sharing' }));

    expect(onStart).toHaveBeenCalledWith('10.0.0.5', { username: '', password: '' });
  });

  it('starts sharing with the username and password given', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(
      <SharePanel
        interfaces={interfaces}
        library={{ libraryId: 'library', displayPath: 'C:\\Books' }}
        onChooseLibrary={vi.fn()}
        onStart={onStart}
        onStop={vi.fn()}
        status={{ active: false }}
      />,
    );

    await user.type(screen.getByLabelText('Username'), 'reader');
    await user.type(screen.getByLabelText('Password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Start sharing' }));

    expect(onStart).toHaveBeenCalledWith('192.168.1.20', {
      username: 'reader',
      password: 'hunter2',
    });
  });

  it('shows the catalog address, short enough to type by hand, and calls onStop', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    render(
      <SharePanel
        interfaces={interfaces}
        onChooseLibrary={vi.fn()}
        onStart={vi.fn()}
        onStop={onStop}
        status={{ active: true, url: 'http://192.168.1.20:51234' }}
      />,
    );

    expect(screen.getByLabelText('Catalog address')).toHaveValue('http://192.168.1.20:51234');
    expect(screen.queryByRole('button', { name: 'Start sharing' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Stop sharing' }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it('tells KOReader users where to put the address, and to keep the app open', () => {
    render(
      <SharePanel
        interfaces={interfaces}
        onChooseLibrary={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
        status={{ active: true, url: 'http://192.168.1.20:51234' }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Share to your e-reader' })).toBeVisible();
    expect(
      screen.getByText(/In KOReader: Search, then OPDS catalog, then add this address/u),
    ).toBeVisible();
    expect(screen.getByText(/Keep Mangabound open while it syncs/u)).toBeVisible();
  });

  it('copies the address, and says so', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(
      <SharePanel
        interfaces={interfaces}
        onChooseLibrary={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
        status={{ active: true, url: 'http://192.168.1.24:8080' }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Copy the address' }));

    expect(writeText).toHaveBeenCalledWith('http://192.168.1.24:8080');
    expect(await screen.findByText('Copied')).toBeVisible();
  });

  it('copes with a copy the system refuses, saying nothing was copied', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    render(
      <SharePanel
        interfaces={interfaces}
        onChooseLibrary={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
        status={{ active: true, url: 'http://192.168.1.24:8080' }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Copy the address' }));

    expect(screen.getByRole('button', { name: 'Copy the address' })).toHaveTextContent('Copy');
    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
  });

  it('says leaving the username and password blank shares with no password', () => {
    render(
      <SharePanel
        interfaces={interfaces}
        library={{ libraryId: 'library', displayPath: 'C:\\Books' }}
        onChooseLibrary={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
        status={{ active: false }}
      />,
    );

    expect(screen.getByText('Leave both blank to share with no password.')).toBeVisible();
  });
});
