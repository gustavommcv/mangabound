import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DropTarget, type DropTargetProps } from '@/renderer/components/queue/drop-target';

function renderTarget(overrides: Partial<DropTargetProps> = {}): {
  readonly onAddFiles: ReturnType<typeof vi.fn>;
  readonly onAddFolders: ReturnType<typeof vi.fn>;
  readonly onDropFiles: ReturnType<typeof vi.fn>;
} {
  const handlers = { onAddFiles: vi.fn(), onAddFolders: vi.fn(), onDropFiles: vi.fn() };
  render(<DropTarget disabled={false} empty {...handlers} {...overrides} />);
  return handlers;
}

const files = (): File[] => [new File(['x'], 'Vol.01.cbz')];

/** A drag carrying files, which jsdom does not build on its own. */
function drag(target: HTMLElement, type: 'dragEnter' | 'dragOver' | 'dragLeave' | 'drop'): void {
  const event = createEvent[type](target, {
    dataTransfer: { types: ['Files'], files: files() },
  });
  fireEvent(target, event);
}

describe('DropTarget', () => {
  it('invites a click as well as a drop, and opens a menu of the two choices when clicked', async () => {
    const user = userEvent.setup();
    const { onAddFiles, onAddFolders } = renderTarget();
    const hint = screen.getByRole('button', {
      name: 'Drop manga folders, libraries or .cbz files here, or click to choose.',
    });
    expect(hint).toHaveAttribute('aria-haspopup', 'menu');
    expect(hint).toHaveAttribute('aria-expanded', 'false');

    await user.click(hint);

    expect(hint).toHaveAttribute('aria-expanded', 'true');
    const menu = await screen.findByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent?.trim()),
    ).toEqual(['Choose files', 'Choose a folder']);
    // Asking what to add adds nothing yet.
    expect(onAddFiles).not.toHaveBeenCalled();
    expect(onAddFolders).not.toHaveBeenCalled();
  });

  it('opens the menu from a click anywhere in the empty area, not only on the words', async () => {
    const user = userEvent.setup();
    renderTarget();

    await user.click(screen.getByTestId('drop-target'));

    expect(await screen.findByRole('menu')).toBeVisible();
  });

  it('puts the menu away when the area is clicked again, and does not open it a second time', async () => {
    const user = userEvent.setup();
    renderTarget();
    await user.click(screen.getByTestId('drop-target'));
    await screen.findByRole('menu');

    await user.click(screen.getByTestId('drop-target'));

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
    // And it opens again from the next click, as it did the first time.
    await user.click(screen.getByTestId('drop-target'));
    expect(await screen.findByRole('menu')).toBeVisible();
  });

  it('puts the menu away for a click somewhere else on the page, which still does its own job', async () => {
    const user = userEvent.setup();
    const onSomewhereElse = vi.fn();
    render(
      <>
        <button onClick={onSomewhereElse} type="button">
          Somewhere else
        </button>
        <DropTarget
          disabled={false}
          empty
          onAddFiles={vi.fn()}
          onAddFolders={vi.fn()}
          onDropFiles={vi.fn()}
        />
      </>,
    );
    await user.click(screen.getByTestId('drop-target'));
    await screen.findByRole('menu');

    await user.click(screen.getByRole('button', { name: 'Somewhere else' }));

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
    expect(onSomewhereElse).toHaveBeenCalledOnce();
  });

  it('asks for files when Choose files is picked, and puts the menu away', async () => {
    const user = userEvent.setup();
    const { onAddFiles, onAddFolders } = renderTarget();
    await user.click(screen.getByTestId('drop-target'));

    await user.click(await screen.findByRole('menuitem', { name: 'Choose files' }));

    expect(onAddFiles).toHaveBeenCalledOnce();
    expect(onAddFolders).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  it('asks for a folder when Choose a folder is picked, and puts the menu away', async () => {
    const user = userEvent.setup();
    const { onAddFiles, onAddFolders } = renderTarget();
    await user.click(screen.getByTestId('drop-target'));

    await user.click(await screen.findByRole('menuitem', { name: 'Choose a folder' }));

    expect(onAddFolders).toHaveBeenCalledOnce();
    expect(onAddFiles).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  it('works from the keyboard: Enter opens it, the arrows move, Enter picks, and focus comes back', async () => {
    const user = userEvent.setup();
    const { onAddFolders } = renderTarget();
    await user.tab();
    const hint = screen.getByRole('button', { name: /click to choose/u });
    expect(hint).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menuitem', { name: 'Choose files' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Choose a folder' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(onAddFolders).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
    expect(hint).toHaveFocus();
  });

  it('puts the menu away with Escape and gives focus back to the hint', async () => {
    const user = userEvent.setup();
    const { onAddFiles, onAddFolders } = renderTarget();
    await user.tab();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /click to choose/u })).toHaveFocus();
    expect(onAddFiles).not.toHaveBeenCalled();
    expect(onAddFolders).not.toHaveBeenCalled();
  });

  it('answers the pointer over the whole area while the queue is empty', () => {
    renderTarget();

    // It lights up under the pointer wherever that is, shows the hand, and the words follow it.
    const area = screen.getByTestId('drop-target');
    expect(area).toHaveClass('cursor-pointer', 'hover:bg-muted/30');
    const hint = screen.getByRole('button', { name: /click to choose/u });
    expect(hint).toHaveClass('cursor-pointer', 'group-hover:text-foreground');
  });

  it('leaves the rest of the area alone once the queue has items: only its own line is clickable', async () => {
    const user = userEvent.setup();
    renderTarget({ empty: false, children: <p>A row</p> });
    const area = screen.getByTestId('drop-target');
    expect(area).not.toHaveClass('cursor-pointer');

    await user.click(area);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Drop files or folders here, or click to choose.' }),
    );
    expect(await screen.findByRole('menu')).toBeVisible();
  });

  it('does nothing when it is disabled, until the tools are ready', async () => {
    const user = userEvent.setup();
    renderTarget({ disabled: true });
    const area = screen.getByTestId('drop-target');

    await user.click(area);

    expect(screen.getByRole('button', { name: /click to choose/u })).toBeDisabled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    // Nor does it invite a click it would ignore.
    expect(area).not.toHaveClass('cursor-pointer');
  });

  it('puts the menu away if the area gets disabled while it is open', async () => {
    const user = userEvent.setup();
    const handlers = { onAddFiles: vi.fn(), onAddFolders: vi.fn(), onDropFiles: vi.fn() };
    const { rerender } = render(<DropTarget disabled={false} empty {...handlers} />);
    await user.click(screen.getByTestId('drop-target'));
    await screen.findByRole('menu');

    rerender(<DropTarget disabled empty {...handlers} />);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('hands over what is dropped, and says it will take it while a drag is over', () => {
    const { onDropFiles } = renderTarget();
    const target = screen.getByTestId('drop-target');

    drag(target, 'dragEnter');
    expect(screen.getByRole('button', { name: 'Release to add them' })).toBeVisible();
    drag(target, 'dragOver');
    drag(target, 'drop');

    expect(onDropFiles).toHaveBeenCalledOnce();
    expect(onDropFiles.mock.calls[0]?.[0]).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Release to add them' })).not.toBeInTheDocument();
  });

  it('stops saying so when the drag leaves without dropping', () => {
    const { onDropFiles } = renderTarget();
    const target = screen.getByTestId('drop-target');

    drag(target, 'dragEnter');
    drag(target, 'dragLeave');

    expect(screen.queryByRole('button', { name: 'Release to add them' })).not.toBeInTheDocument();
    expect(onDropFiles).not.toHaveBeenCalled();
  });

  it('ignores a drag that carries no files, such as selected text', () => {
    renderTarget();
    const target = screen.getByTestId('drop-target');

    fireEvent(
      target,
      createEvent.dragEnter(target, { dataTransfer: { types: ['text/plain'], files: [] } }),
    );
    fireEvent(
      target,
      createEvent.dragOver(target, { dataTransfer: { types: ['text/plain'], files: [] } }),
    );

    expect(screen.queryByRole('button', { name: 'Release to add them' })).not.toBeInTheDocument();
  });

  it('ignores a drop of nothing', () => {
    const { onDropFiles } = renderTarget();
    const target = screen.getByTestId('drop-target');

    fireEvent(target, createEvent.drop(target, { dataTransfer: { types: ['Files'], files: [] } }));

    expect(onDropFiles).not.toHaveBeenCalled();
  });

  it('ignores drags and drops while it is disabled', () => {
    const { onDropFiles } = renderTarget({ disabled: true });
    const target = screen.getByTestId('drop-target');

    drag(target, 'dragEnter');
    drag(target, 'dragOver');
    drag(target, 'drop');

    expect(onDropFiles).not.toHaveBeenCalled();
    expect(screen.queryByText('Release to add them')).not.toBeInTheDocument();
  });
});
