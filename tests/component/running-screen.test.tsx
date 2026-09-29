import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ConversionProgress } from '@/domain/conversion';
import { RunningScreen } from '@/renderer/screens/running-screen';

const progress: ConversionProgress = {
  stage: 'processing',
  message: '1 of 3 volumes converted.',
  completed: 1.5,
  total: 3,
  volumes: [
    { number: 1, status: 'done', completed: 20, total: 20 },
    { number: 2, status: 'processing', completed: 10, total: 20 },
    { number: 3, status: 'waiting' },
  ],
};

describe('RunningScreen', () => {
  it('keeps the summary stable and reveals individual bars only when requested', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { rerender } = render(
      <RunningScreen
        onCancel={onCancel}
        position={{ name: 'Chainsaw Man', index: 1, total: 1 }}
        progress={progress}
      />,
    );

    expect(screen.getByText('1 of 3 volumes converted.')).toBeVisible();
    expect(screen.getByRole('progressbar', { name: '50% complete' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Volume details' })).not.toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: 'Show details' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    trigger.focus();
    await user.keyboard('{Enter}');

    const details = screen.getByRole('region', { name: 'Volume details' });
    const hide = screen.getByRole('button', { name: 'Hide details' });
    expect(hide).toBe(trigger);
    expect(hide).toHaveAttribute('aria-expanded', 'true');
    expect(hide).toHaveAttribute('aria-controls', details.id);
    expect(within(details).getByText('Waiting')).toBeVisible();
    expect(within(details).getByRole('progressbar', { name: 'Volume 1 progress' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
    expect(within(details).getByRole('progressbar', { name: 'Volume 2 progress' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    );
    expect(
      within(details).getByRole('progressbar', { name: 'Volume 3 progress' }),
    ).not.toHaveAttribute('aria-valuenow');

    rerender(
      <RunningScreen
        onCancel={onCancel}
        position={{ name: 'Chainsaw Man', index: 1, total: 1 }}
        progress={{
          ...progress,
          completed: 1.99,
          volumes: [
            progress.volumes![0]!,
            { number: 2, status: 'saving', completed: 20, total: 20 },
            progress.volumes![2]!,
          ],
        }}
      />,
    );
    expect(screen.getByText('1 of 3 volumes converted.')).toBeVisible();
    expect(within(details).getByText('Saving · 99%')).toBeVisible();
    expect(screen.getByRole('progressbar', { name: '66% complete' })).toBeVisible();

    await user.click(hide);
    expect(screen.queryByRole('region', { name: 'Volume details' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel conversion' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('does not offer volume details for a single book or before progress is known', () => {
    const { rerender } = render(<RunningScreen onCancel={vi.fn()} />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show details' })).not.toBeInTheDocument();

    rerender(
      <RunningScreen
        onCancel={vi.fn()}
        progress={{ stage: 'processing', message: 'Converting the book…', volumes: [] }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Show details' })).not.toBeInTheDocument();
  });
});
