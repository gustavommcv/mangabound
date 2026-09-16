import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SharePanel } from '@/renderer/components/sharing/share-panel';

const interfaces = [
  { name: 'Wi-Fi', address: '192.168.1.20' },
  { name: 'Ethernet', address: '10.0.0.5' },
];

describe('SharePanel', () => {
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

  it('starts sharing in token mode with the selected interface once a library is chosen', async () => {
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

    expect(onStart).toHaveBeenCalledWith('10.0.0.5', { mode: 'token' });
  });

  it('reveals username and password fields in basic mode and requires both before Start', async () => {
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

    await user.selectOptions(screen.getByLabelText('Authentication'), 'basic');
    expect(screen.getByRole('button', { name: 'Start sharing' })).toBeDisabled();

    await user.type(screen.getByLabelText('Username'), 'reader');
    expect(screen.getByRole('button', { name: 'Start sharing' })).toBeDisabled();

    await user.type(screen.getByLabelText('Password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Start sharing' }));

    expect(onStart).toHaveBeenCalledWith('192.168.1.20', {
      mode: 'basic',
      username: 'reader',
      password: 'hunter2',
    });
  });

  it('shows the catalog URL with an embedded token and calls onStop', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    render(
      <SharePanel
        interfaces={interfaces}
        onChooseLibrary={vi.fn()}
        onStart={vi.fn()}
        onStop={onStop}
        status={{
          active: true,
          url: 'http://192.168.1.20:51234',
          authMode: 'token',
          token: 'secret',
        }}
      />,
    );

    expect(screen.getByLabelText('Catalog URL')).toHaveValue(
      'http://192.168.1.20:51234/?token=secret',
    );
    expect(screen.queryByRole('button', { name: 'Start sharing' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Stop sharing' }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it('shows the plain catalog URL for basic auth, with no token appended', () => {
    render(
      <SharePanel
        interfaces={interfaces}
        onChooseLibrary={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
        status={{ active: true, url: 'http://192.168.1.20:51234', authMode: 'basic' }}
      />,
    );

    expect(screen.getByLabelText('Catalog URL')).toHaveValue('http://192.168.1.20:51234');
  });
});
