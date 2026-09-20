import { createEvent, fireEvent, render, screen } from '@testing-library/react';
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
  it('invites a click as well as a drop, and asks what to add when clicked', async () => {
    const user = userEvent.setup();
    const { onAddFiles, onAddFolders } = renderTarget();
    const hint = screen.getByRole('button', {
      name: 'Drop manga folders, libraries or .cbz files here, or click to choose.',
    });
    expect(hint).toHaveAttribute('aria-expanded', 'false');

    await user.click(hint);

    expect(hint).toHaveAttribute('aria-expanded', 'true');
    const chooser = screen.getByRole('group', { name: 'What to add' });
    expect(hint).toHaveAttribute('aria-controls', chooser.id);
    expect(onAddFiles).not.toHaveBeenCalled();
    expect(onAddFolders).not.toHaveBeenCalled();
  });

  it('opens the chooser from a click anywhere in the empty area, not only on the words', async () => {
    const user = userEvent.setup();
    renderTarget();

    await user.click(screen.getByTestId('drop-target'));

    expect(screen.getByRole('group', { name: 'What to add' })).toBeVisible();
    await user.click(screen.getByTestId('drop-target'));
    expect(screen.queryByRole('group', { name: 'What to add' })).not.toBeInTheDocument();
  });

  it('asks for files, and puts the question away', async () => {
    const user = userEvent.setup();
    const { onAddFiles, onAddFolders } = renderTarget();
    await user.click(screen.getByTestId('drop-target'));

    await user.click(screen.getByRole('button', { name: 'Choose files' }));

    expect(onAddFiles).toHaveBeenCalledOnce();
    expect(onAddFolders).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'What to add' })).not.toBeInTheDocument();
  });

  it('asks for a folder, and puts the question away', async () => {
    const user = userEvent.setup();
    const { onAddFiles, onAddFolders } = renderTarget();
    await user.click(screen.getByTestId('drop-target'));

    await user.click(screen.getByRole('button', { name: 'Choose a folder' }));

    expect(onAddFolders).toHaveBeenCalledOnce();
    expect(onAddFiles).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'What to add' })).not.toBeInTheDocument();
  });

  it('works from the keyboard, and Escape puts the question away and keeps focus on the hint', async () => {
    const user = userEvent.setup();
    renderTarget();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('group', { name: 'What to add' })).toBeVisible();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Choose files' })).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('group', { name: 'What to add' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /click to choose/u })).toHaveFocus();
  });

  it('ignores other keys while the question is open', async () => {
    const user = userEvent.setup();
    renderTarget();
    await user.click(screen.getByTestId('drop-target'));
    await user.tab();

    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('group', { name: 'What to add' })).toBeVisible();
  });

  it('leaves the rest of the area alone once the queue has items: only its own line is clickable', async () => {
    const user = userEvent.setup();
    renderTarget({ empty: false, children: <p>A row</p> });

    await user.click(screen.getByTestId('drop-target'));
    expect(screen.queryByRole('group', { name: 'What to add' })).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Drop files or folders here, or click to choose.' }),
    );
    expect(screen.getByRole('group', { name: 'What to add' })).toBeVisible();
  });

  it('does nothing when it is disabled, until the tools are ready', async () => {
    const user = userEvent.setup();
    renderTarget({ disabled: true });

    await user.click(screen.getByTestId('drop-target'));

    expect(screen.getByRole('button', { name: /click to choose/u })).toBeDisabled();
    expect(screen.queryByRole('group', { name: 'What to add' })).not.toBeInTheDocument();
  });

  it('closes the question if the area gets disabled while it is open', async () => {
    const user = userEvent.setup();
    const handlers = { onAddFiles: vi.fn(), onAddFolders: vi.fn(), onDropFiles: vi.fn() };
    const { rerender } = render(<DropTarget disabled={false} empty {...handlers} />);
    await user.click(screen.getByTestId('drop-target'));

    rerender(<DropTarget disabled empty {...handlers} />);

    expect(screen.queryByRole('group', { name: 'What to add' })).not.toBeInTheDocument();
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
