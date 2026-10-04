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

  it('shows actual binding pages without claiming the archive is complete before it closes', () => {
    const base: ConversionProgress = {
      stage: 'binding',
      message: 'Building volume 1 of 1…',
      bindingState: 'advanced',
      completed: 4,
      total: 4,
    };
    const { rerender } = render(
      <RunningScreen
        onCancel={vi.fn()}
        position={{ name: 'A Work', index: 1, total: 1 }}
        progress={base}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Building volume files for A Work' })).toBeVisible();
    expect(screen.getByText('4 of 4 pages copied')).toBeVisible();
    expect(screen.getByRole('progressbar', { name: '99% complete' })).toBeVisible();

    rerender(
      <RunningScreen
        onCancel={vi.fn()}
        position={{ name: 'A Work', index: 1, total: 1 }}
        progress={{ ...base, bindingState: 'completed' }}
      />,
    );
    expect(screen.getByRole('progressbar', { name: '100% complete' })).toBeVisible();
  });

  describe('for a screen reader', () => {
    /** What every live region says, in the order of the page. */
    const told = (container: HTMLElement): string =>
      [...container.querySelectorAll('[aria-live]')].map((region) => region.textContent).join('|');

    it('is told about a stage or a volume as it comes, and not about each page', () => {
      const pages = (done: number): ConversionProgress => ({
        stage: 'processing',
        message: `Processed page ${String(done)} of 50.`,
        page: done,
        completed: done,
        total: 50,
      });
      const { container, rerender } = render(
        <RunningScreen onCancel={vi.fn()} progress={pages(1)} />,
      );
      const heard = new Set<string>([told(container)]);
      let changes = 0;
      let last = told(container);
      for (let done = 2; done <= 50; done += 1) {
        rerender(<RunningScreen onCancel={vi.fn()} progress={pages(done)} />);
        const now = told(container);
        if (now !== last) changes += 1;
        last = now;
        heard.add(now);
      }

      // Fifty pages, six things said: the start and each tenth, not a line for every page.
      expect(changes).toBeLessThanOrEqual(10);
      expect([...heard].some((line) => line.includes('Processed page'))).toBe(false);
      // The eyes still see the page being processed, and the bar has the exact number.
      expect(screen.getByText('Processed page 50 of 50.')).toBeVisible();
      expect(screen.getByRole('progressbar', { name: '100% complete' })).toBeVisible();
    });

    it('is told a message about a stage or a volume in full, in the region that is read out', () => {
      const { container } = render(<RunningScreen onCancel={vi.fn()} progress={progress} />);

      expect(told(container)).toContain('1 of 3 volumes converted.');
    });

    it('is told nothing before there is anything to tell', () => {
      const { container } = render(<RunningScreen onCancel={vi.fn()} />);

      expect(told(container)).toBe('|');
    });
  });
});
