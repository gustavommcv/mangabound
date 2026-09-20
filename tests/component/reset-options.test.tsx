import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Notices } from '@/renderer/components/shared/notices';
import { ResetOptions } from '@/renderer/components/settings/reset-options';

const scope = 'the device and every option';

describe('ResetOptions', () => {
  it('stays in place, dimmed and explained, when nothing differs from the defaults', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(<ResetOptions changed={false} onReset={onReset} scope={scope} />);

    const trigger = screen.getByRole('button', { name: 'Reset to defaults' });
    // Dimmed, not disabled, so it can be found and focused, and it says why it does nothing.
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(trigger).not.toBeDisabled();
    expect(trigger).toHaveAccessibleDescription('Every option is already at its default.');
    await user.click(trigger);
    expect(screen.queryByRole('group', { name: 'Confirm reset' })).not.toBeInTheDocument();
    expect(onReset).not.toHaveBeenCalled();
  });

  it('asks for a second click, saying what goes back, before it resets anything', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(<ResetOptions changed onReset={onReset} scope={scope} />);
    const trigger = screen.getByRole('button', { name: 'Reset to defaults' });
    expect(trigger).toHaveAttribute('aria-disabled', 'false');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);

    expect(onReset).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const confirm = screen.getByRole('group', { name: 'Confirm reset' });
    expect(trigger).toHaveAttribute('aria-controls', confirm.id);
    expect(confirm).toHaveTextContent(`Put ${scope} back to their defaults?`);
  });

  it('resets once on the second click, says so for screen readers, and keeps focus on the button', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(<ResetOptions changed onReset={onReset} scope={scope} />);
    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));

    await user.click(
      within(screen.getByRole('group', { name: 'Confirm reset' })).getByRole('button', {
        name: 'Reset',
      }),
    );

    expect(onReset).toHaveBeenCalledOnce();
    expect(screen.queryByRole('group', { name: 'Confirm reset' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset to defaults' })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Every option is back to its default.');
  });

  it('forgets the announcement when asked again', async () => {
    const user = userEvent.setup();
    render(<ResetOptions changed onReset={vi.fn()} scope={scope} />);
    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByRole('status')).not.toBeEmptyDOMElement();

    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('cancels with the button, and puts focus back on the one that opened it', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(<ResetOptions changed onReset={onReset} scope={scope} />);
    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onReset).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'Confirm reset' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset to defaults' })).toHaveFocus();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('cancels with Escape from inside the question', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(<ResetOptions changed onReset={onReset} scope={scope} />);
    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    await user.tab();
    expect(screen.getByRole('button', { name: 'Reset' })).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(onReset).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'Confirm reset' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset to defaults' })).toHaveFocus();
  });

  it('ignores other keys pressed inside the question', async () => {
    const user = userEvent.setup();
    render(<ResetOptions changed onReset={vi.fn()} scope={scope} />);
    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    await user.tab();

    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('group', { name: 'Confirm reset' })).toBeVisible();
  });

  it('closes the question when the options turn out to be at their defaults already', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ResetOptions changed onReset={vi.fn()} scope={scope} />);
    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));

    rerender(<ResetOptions changed={false} onReset={vi.fn()} scope={scope} />);

    expect(screen.queryByRole('group', { name: 'Confirm reset' })).not.toBeInTheDocument();
  });
});

describe('Notices', () => {
  it('shows nothing when there is nothing to say', () => {
    const { container } = render(<Notices notices={[]} onDismiss={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('lists what it was given, politely announced, and is dismissed with one button', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<Notices notices={['First thing.', 'Second thing.']} onDismiss={onDismiss} />);

    const region = screen.getByRole('status', { name: 'Notices' });
    expect(
      within(region)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['First thing.', 'Second thing.']);
    await user.click(screen.getByRole('button', { name: 'Dismiss these notices' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
