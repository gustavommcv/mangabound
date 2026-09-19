import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/renderer/app';

afterEach(() => {
  Reflect.deleteProperty(window, 'mangabound');
});

describe('application foundation', () => {
  it('identifies the scaffold and explains desktop-only tool verification', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'A deliberate foundation for the manga pipeline.' }),
    ).toBeVisible();
    expect(screen.getByRole('region', { name: 'Foundation boundaries' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Bundled tool status' })).toHaveTextContent(
      /Checking versions, compatibility, and file integrity/i,
    );
  });

  it('shows verified release status returned by the narrow preload bridge', async () => {
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

    expect(await screen.findByText('Conversion tools ready')).toBeVisible();
    expect(screen.getByText('Bundled conversion tools are verified and ready.')).toBeVisible();
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
