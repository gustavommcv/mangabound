import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ShareMenu } from '@/renderer/components/sharing/share-menu';

/** The panel a menu opens has a heading with the id the dialog is named by. */
function Panel(): React.JSX.Element {
  return (
    <section>
      <h2 id="share-title">Share to your e-reader</h2>
      <input aria-label="Inside the panel" />
    </section>
  );
}

function Harness({
  initiallyOpen = false,
  sharing = false,
}: {
  readonly initiallyOpen?: boolean;
  readonly sharing?: boolean;
}): React.JSX.Element {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <>
      <input aria-label="Somewhere else" />
      <button
        onClick={() => {
          setOpen(true);
        }}
        type="button"
      >
        Open from elsewhere
      </button>
      <ShareMenu onOpenChange={setOpen} open={open} sharing={sharing}>
        <Panel />
      </ShareMenu>
    </>
  );
}

describe('ShareMenu', () => {
  it('shows only the button until it is opened, and says whether anything is shared', () => {
    const { rerender } = render(
      <ShareMenu onOpenChange={vi.fn()} open={false} sharing={false}>
        <Panel />
      </ShareMenu>,
    );

    const button = screen.getByRole('button', { name: 'Share' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(
      <ShareMenu onOpenChange={vi.fn()} open={false} sharing>
        <Panel />
      </ShareMenu>,
    );
    // The button carries the state, so it is known without opening anything.
    expect(screen.getByRole('button', { name: 'Sharing' })).toBeVisible();
  });

  it('opens a dialog named by the panel, and moves focus into it', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Share' }));

    const dialog = screen.getByRole('dialog', { name: 'Share to your e-reader' });
    expect(dialog).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Share' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Share' })).toHaveAttribute(
      'aria-controls',
      dialog.id,
    );
    // It is not a modal: the page behind stays reachable and readable.
    expect(dialog).not.toHaveAttribute('aria-modal');
    expect(screen.getByLabelText('Somewhere else')).toBeVisible();
  });

  it('closes when the button is pressed again', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Share' }));

    await user.click(screen.getByRole('button', { name: 'Share' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape and gives focus back to what opened it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Share' }));
    await user.tab();
    expect(screen.getByLabelText('Inside the panel')).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toHaveFocus();
  });

  it('returns focus to whatever else opened it, such as a button on the results screen', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open from elsewhere' });
    await user.click(opener);
    expect(screen.getByRole('dialog')).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(opener).toHaveFocus();
  });

  it('closes with its own close button, and gives focus back', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Share' }));

    await user.click(screen.getByRole('button', { name: 'Close sharing' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toHaveFocus();
  });

  it('ignores other keys', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Share' }));

    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('ignores Escape while it is closed', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <ShareMenu onOpenChange={onOpenChange} open={false} sharing={false}>
        <Panel />
      </ShareMenu>,
    );
    screen.getByRole('button', { name: 'Share' }).focus();

    await user.keyboard('{Escape}');

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('closes on a click anywhere else, and leaves focus with what was clicked', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Share' }));

    await user.click(screen.getByLabelText('Somewhere else'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Somewhere else')).toHaveFocus();
  });

  it('stays open for a click inside it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Share' }));

    await user.click(screen.getByLabelText('Inside the panel'));

    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('can be opened already, as the results screen does', () => {
    render(<Harness initiallyOpen sharing />);

    expect(screen.getByRole('dialog', { name: 'Share to your e-reader' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Sharing' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});
