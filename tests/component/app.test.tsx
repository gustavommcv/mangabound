import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/renderer/app';
import { WorkflowApp } from '@/renderer/workflow-app';

import { inertBridge } from './support/bridge';

afterEach(() => {
  Reflect.deleteProperty(window, 'mangabound');
});

function installBridge(overrides: Parameters<typeof inertBridge>[0]): void {
  Object.defineProperty(window, 'mangabound', {
    configurable: true,
    value: inertBridge(overrides),
  });
}

describe('application startup', () => {
  it('gives recovery instructions instead of the old scaffold when the desktop bridge is missing', () => {
    render(<App />);

    const error = screen.getByRole('alert', { name: 'Startup error' });
    expect(
      within(error).getByRole('heading', { name: 'Mangabound could not start correctly.' }),
    ).toBeVisible();
    expect(
      within(error).getByText('Restart the app. If the problem persists, reinstall Mangabound.'),
    ).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Queue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Architecture checkpoint|Foundation/u)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Bundled tool status' })).not.toBeInTheDocument();
  });

  it.each(['absent', 'different'] as const)(
    'uses the supplied bridge for actions and subscription cleanup when the window bridge is %s',
    async (windowBridge) => {
      const user = userEvent.setup();
      const otherChooseInputs = vi.fn();
      if (windowBridge === 'different') {
        installBridge({
          chooseInputs: otherChooseInputs,
          runtime: { electron: '44.3.0', platform: 'win32', version: '99.99.99' },
        });
      }
      const message = 'The selected files could not be opened.';
      const chooseInputs = vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'file_access_denied', message },
      });
      const unsubscribe = vi.fn();
      const supplied = inertBridge({
        chooseInputs,
        onConversionProgress: () => unsubscribe,
      });

      const { unmount } = render(<WorkflowApp bridge={supplied} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Files' })).toBeEnabled();
      });
      expect(screen.getByText(`v${supplied.runtime.version}`)).toBeVisible();
      expect(screen.queryByText('v99.99.99')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Files' }));
      expect(await screen.findByText(message)).toBeVisible();
      expect(chooseInputs).toHaveBeenCalledExactlyOnceWith('files');
      expect(otherChooseInputs).not.toHaveBeenCalled();

      unmount();
      expect(unsubscribe).toHaveBeenCalledOnce();
    },
  );

  it('says nothing once the bridge reports the tools are ready: they are mandatory, not a status', async () => {
    installBridge({
      getToolchainStatus: vi.fn().mockResolvedValue({
        state: 'ready',
        target: 'win32-x64',
        tools: [
          {
            name: 'mangabind',
            releaseTag: 'v0.4.0',
            state: 'ready',
            message: 'mangabind v0.4.0 is verified.',
          },
          {
            name: 'mangapress',
            releaseTag: 'v0.5.0',
            state: 'ready',
            message: 'mangapress v0.5.0 is verified.',
          },
        ],
        message: 'Bundled conversion tools are verified and ready.',
      }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Files' })).toBeEnabled();
    });
    expect(screen.queryByRole('region', { name: 'Bundled tool status' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Conversion tools/u)).not.toBeInTheDocument();
  });

  it('presents a safe recovery message if the preload status call fails', async () => {
    installBridge({
      getToolchainStatus: vi.fn().mockRejectedValue(new Error('internal detail')),
    });

    render(<App />);

    expect(await screen.findByText('Conversion tools need attention')).toBeVisible();
    expect(screen.getByText('The bundled conversion tools could not be checked.')).toBeVisible();
    expect(screen.queryByText(/internal detail/u)).not.toBeInTheDocument();
  });

  it('shows the repair path when the bridge resolves with a blocked toolchain, not only when it rejects', async () => {
    const message =
      'A bundled conversion tool failed verification. Reinstall Mangabound to restore it.';
    installBridge({
      getToolchainStatus: vi.fn().mockResolvedValue({
        state: 'blocked',
        target: 'win32-x64',
        tools: [
          {
            name: 'mangabind',
            releaseTag: 'v0.4.0',
            state: 'failed',
            message: 'mangabind failed verification. Reinstall Mangabound to restore it.',
          },
          {
            name: 'mangapress',
            releaseTag: 'v0.5.0',
            state: 'ready',
            message: 'mangapress v0.5.0 is verified.',
          },
        ],
        message,
      }),
    });

    render(<App />);

    expect(await screen.findByText('Conversion tools need attention')).toBeVisible();
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.queryByText('Conversion tools ready')).not.toBeInTheDocument();
  });
});
