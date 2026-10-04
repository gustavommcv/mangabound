import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BookCovers } from '@/renderer/components/details/book-covers';

const books = [
  { slot: 1, title: 'Chainsaw Man - Vol.01' },
  { slot: 2, title: 'Chainsaw Man - Vol.02' },
  { slot: 3, title: 'Chainsaw Man - Vol.03' },
] as const;

function actions() {
  return {
    onChoose: vi.fn(),
    onChooseFolder: vi.fn(),
    onDropFiles: vi.fn(),
    onRemove: vi.fn(),
  };
}

const image = (name: string): File => new File(['x'], name, { type: 'image/jpeg' });
const dropped = (files: readonly File[], types = ['Files']) => ({
  dataTransfer: { files, types },
});
const rows = (): HTMLElement[] =>
  within(screen.getByRole('list', { name: 'Books and their covers' })).getAllByRole('listitem');

describe('the covers of the books an item makes', () => {
  it('lists every book with its cover, or with its first page when it has none', () => {
    render(
      <BookCovers
        {...actions()}
        attached={[
          { slot: 1, name: '01.jpg', origin: 'folder' },
          { slot: 2, name: 'IMG_2041.jpg', origin: 'chosen' },
        ]}
        books={books}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Covers' })).toBeVisible();
    const [first, second, third] = rows();
    expect(first).toHaveTextContent('Chainsaw Man - Vol.01');
    // A cover a folder gave says so: it is the kind another folder replaces.
    expect(first).toHaveTextContent('01.jpg · from a folder');
    expect(second).toHaveTextContent('IMG_2041.jpg');
    expect(second).not.toHaveTextContent('from a folder');
    expect(third).toHaveTextContent('First page');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('chooses, changes and removes the cover of one book, and takes a folder for all', async () => {
    const user = userEvent.setup();
    const handlers = actions();
    render(
      <BookCovers
        {...handlers}
        attached={[{ slot: 2, name: 'mine.png', origin: 'chosen' }]}
        books={books}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Choose a cover for Chainsaw Man - Vol.01' }),
    );
    expect(handlers.onChoose).toHaveBeenLastCalledWith(1);
    await user.click(
      screen.getByRole('button', { name: 'Change the cover of Chainsaw Man - Vol.02' }),
    );
    expect(handlers.onChoose).toHaveBeenLastCalledWith(2);
    await user.click(
      screen.getByRole('button', { name: 'Remove the cover of Chainsaw Man - Vol.02' }),
    );
    expect(handlers.onRemove).toHaveBeenCalledExactlyOnceWith(2);
    // A book without a cover has none to remove.
    expect(
      screen.queryByRole('button', { name: 'Remove the cover of Chainsaw Man - Vol.01' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add covers from a folder…' }));
    expect(handlers.onChooseFolder).toHaveBeenCalledOnce();
  });

  it('takes what is dropped on a book for that book, and what is dropped on the list for all', () => {
    const handlers = actions();
    render(<BookCovers {...handlers} attached={[]} books={books} />);
    const [, second] = rows();
    const one = image('two.jpg');

    fireEvent.drop(second!, dropped([one]));
    expect(handlers.onDropFiles).toHaveBeenCalledExactlyOnceWith(2, [one]);

    const several = [image('a.jpg'), image('b.jpg')];
    fireEvent.drop(screen.getByRole('region', { name: 'Covers' }), dropped(several));
    expect(handlers.onDropFiles).toHaveBeenLastCalledWith(undefined, several);
    expect(handlers.onDropFiles).toHaveBeenCalledTimes(2);
  });

  it('accepts a drag only when it carries files, and ignores a drop that brings none', () => {
    const handlers = actions();
    render(<BookCovers {...handlers} attached={[]} books={books} />);
    const [first] = rows();
    const list = screen.getByRole('region', { name: 'Covers' });

    // fireEvent answers false when the handler called preventDefault, which is what allows a drop.
    expect(fireEvent.dragOver(first!, dropped([]))).toBe(false);
    expect(fireEvent.dragOver(list, dropped([]))).toBe(false);
    expect(fireEvent.dragOver(first!, dropped([], ['text/plain']))).toBe(true);

    fireEvent.drop(first!, dropped([image('a.jpg')], ['text/plain']));
    fireEvent.drop(first!, dropped([]));
    expect(handlers.onDropFiles).not.toHaveBeenCalled();
  });

  it('says what the last change left to say', () => {
    render(
      <BookCovers
        {...actions()}
        attached={[]}
        books={books}
        note="2 images were not used: there are 3 books."
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      '2 images were not used: there are 3 books.',
    );
  });

  it('waits for the volumes of a series before offering covers for them', () => {
    render(<BookCovers {...actions()} attached={[]} books={[]} />);

    expect(screen.getByText('Once the volumes are set, each one can take a cover.')).toBeVisible();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add covers from a folder…' }),
    ).not.toBeInTheDocument();
  });

  it('says why covers have no effect when they have none, and still lets them be set', () => {
    render(
      <BookCovers
        {...actions()}
        attached={[]}
        books={books}
        unavailable="A PDF has no cover. What is set here is kept for the other formats."
      />,
    );

    expect(
      screen.getByText('A PDF has no cover. What is set here is kept for the other formats.'),
    ).toBeVisible();
    expect(screen.queryByText(/uses its first page/u)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Choose a cover for Chainsaw Man - Vol.01' }),
    ).toBeEnabled();
  });
});
