import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/renderer/app';

afterEach(() => {
  Reflect.deleteProperty(window, 'mangabound');
});

describe('application foundation', () => {
  it('identifies the scaffold, saying nothing about tools that are still being checked', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'A deliberate foundation for the manga pipeline.' }),
    ).toBeVisible();
    expect(screen.getByRole('region', { name: 'Foundation boundaries' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Bundled tool status' })).not.toBeInTheDocument();
  });

  it('says nothing once the bridge reports the tools are ready: they are mandatory, not a status', async () => {
    Object.defineProperty(window, 'mangabound', {
      configurable: true,
      value: {
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
        runtime: { electron: '44.3.0', platform: 'win32' },
      },
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Files' })).toBeEnabled();
    });
    expect(screen.queryByRole('region', { name: 'Bundled tool status' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Conversion tools/u)).not.toBeInTheDocument();
  });

  it('presents a safe recovery message if the preload status call fails', async () => {
    Object.defineProperty(window, 'mangabound', {
      configurable: true,
      value: {
        getToolchainStatus: vi.fn().mockRejectedValue(new Error('internal detail')),
        runtime: { electron: '44.3.0', platform: 'win32' },
      },
    });

    render(<App />);

    expect(await screen.findByText('Conversion tools need attention')).toBeVisible();
    expect(screen.getByText('The bundled conversion tools could not be checked.')).toBeVisible();
    expect(screen.queryByText(/internal detail/u)).not.toBeInTheDocument();
  });

  it('shows the repair path when the bridge resolves with a blocked toolchain, not only when it rejects', async () => {
    const message =
      'A bundled conversion tool failed verification. Reinstall Mangabound to restore it.';
    Object.defineProperty(window, 'mangabound', {
      configurable: true,
      value: {
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
        runtime: { electron: '44.3.0', platform: 'win32' },
      },
    });

    render(<App />);

    expect(await screen.findByText('Conversion tools need attention')).toBeVisible();
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.queryByText('Conversion tools ready')).not.toBeInTheDocument();
  });
});
