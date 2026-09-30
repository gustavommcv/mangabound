import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { BookDetails } from '@/domain/book-details';
import {
  BookDetailsScreen,
  type BookDetailsScreenProps,
} from '@/renderer/screens/book-details-screen';

const base: BookDetailsScreenProps = {
  backLabel: 'Queue',
  defaultLanguage: 'en-US',
  defaultTitle: 'Chainsaw Man',
  details: {},
  format: 'epub',
  name: 'Chainsaw Man',
  onBack: () => undefined,
  onChange: () => undefined,
};

/** Keeps what is typed and reports every change, the way the queue does. */
function Harness({
  onChange,
  ...props
}: Partial<BookDetailsScreenProps> & {
  readonly onChange: (details: BookDetails) => void;
}): React.JSX.Element {
  const [details, setDetails] = useState<BookDetails>(props.details ?? {});
  return (
    <BookDetailsScreen
      {...base}
      {...props}
      details={details}
      onChange={(next) => {
        setDetails(next);
        onChange(next);
      }}
    />
  );
}

const lastChange = (onChange: ReturnType<typeof vi.fn>): BookDetails =>
  onChange.mock.calls.at(-1)?.[0] as BookDetails;

describe('the book details screen', () => {
  it('moves focus to its heading and goes back where it came from', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(
      <BookDetailsScreen {...base} backLabel="Manga Library" name="Vagabond" onBack={onBack} />,
    );

    expect(screen.getByRole('heading', { name: 'Vagabond' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Manga Library' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('shows what every field falls back to when nothing is typed', () => {
    render(<BookDetailsScreen {...base} volumes={[1, 2]} />);

    expect(screen.getByLabelText('Series title')).toHaveAttribute('placeholder', 'Chainsaw Man');
    expect(screen.getByLabelText('Author')).toHaveAttribute(
      'placeholder',
      'Leave blank if unknown',
    );
    expect(screen.getByLabelText('Language')).toHaveAttribute('placeholder', 'en-US');
    const titles = within(screen.getByRole('list', { name: 'Book titles' }));
    expect(titles.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Chainsaw Man - Vol.01',
      'Chainsaw Man - Vol.02',
    ]);
  });

  it('lists the first volumes and counts the rest, and uses the title as typed', async () => {
    const user = userEvent.setup();
    render(<Harness onChange={vi.fn()} volumes={[1, 2, 3, 4, 5]} />);

    await user.type(screen.getByLabelText('Series title'), '  Deluxe ');

    const titles = within(screen.getByRole('list', { name: 'Book titles' }));
    expect(titles.getByText('Deluxe - Vol.01')).toBeVisible();
    expect(titles.getByText('Deluxe - Vol.03')).toBeVisible();
    expect(titles.queryByText('Deluxe - Vol.04')).not.toBeInTheDocument();
    expect(titles.getByText(/and 2 more/u)).toBeVisible();
  });

  it('says what will happen once the volumes are set, for a series that has none yet', () => {
    render(<BookDetailsScreen {...base} volumes={[]} />);

    expect(screen.getByLabelText('Series title')).toBeVisible();
    expect(screen.getByText(/Once the volumes are set/u)).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Book titles' })).not.toBeInTheDocument();
  });

  it('names one book, with no volumes, when it makes a single book', () => {
    render(<BookDetailsScreen {...base} defaultTitle="Vagabond Vol.03" />);

    expect(screen.getByLabelText('Book title')).toBeVisible();
    expect(screen.getByText('The book will be titled')).toBeVisible();
    expect(screen.getByRole('list', { name: 'Book titles' })).toHaveTextContent('Vagabond Vol.03');
  });

  it('reports the cleaned-up details as they are typed, and none once everything is cleared', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.type(screen.getByLabelText('Book title'), ' Chainsaw Man ');
    await user.type(screen.getByLabelText('Author'), 'Fujimoto Tatsuki');
    expect(lastChange(onChange)).toEqual({ title: 'Chainsaw Man', author: 'Fujimoto Tatsuki' });

    await user.clear(screen.getByLabelText('Book title'));
    await user.clear(screen.getByLabelText('Author'));
    expect(lastChange(onChange)).toEqual({});
  });

  it('starts from the details already typed', () => {
    render(
      <BookDetailsScreen
        {...base}
        details={{ title: 'Berserk', author: 'Kentaro Miura', language: 'ja' }}
      />,
    );

    expect(screen.getByLabelText('Book title')).toHaveValue('Berserk');
    expect(screen.getByLabelText('Author')).toHaveValue('Kentaro Miura');
    expect(screen.getByLabelText('Language')).toHaveValue('ja');
  });

  it('keeps the last good language while what is typed is not a tag, and says so', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness details={{ language: 'ja' }} onChange={onChange} />);

    await user.type(screen.getByLabelText('Language'), ' now');

    expect(screen.getByLabelText('Language')).toBeInvalid();
    expect(screen.getByText(/It is not used until it is valid/u)).toBeVisible();
    expect(lastChange(onChange)).toEqual({ language: 'ja' });

    await user.clear(screen.getByLabelText('Language'));
    await user.type(screen.getByLabelText('Language'), 'pt-br');
    expect(screen.getByLabelText('Language')).toBeValid();
    expect(lastChange(onChange)).toEqual({ language: 'pt-br' });
  });

  it('keeps no language at all while a first attempt is not a tag', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.type(screen.getByLabelText('Language'), 'x');

    expect(lastChange(onChange)).toEqual({});
  });

  it('says what the folder names declare only when it differs from the language in use', () => {
    const { rerender } = render(<BookDetailsScreen {...base} declaredLanguage="pt-br" />);
    expect(screen.getByText('The folder names say pt-br.')).toBeVisible();

    rerender(<BookDetailsScreen {...base} declaredLanguage="EN-us" />);
    expect(screen.queryByText(/The folder names say/u)).not.toBeInTheDocument();
    expect(screen.getByText('Used for EPUB output.')).toBeVisible();
  });

  it('says a CBZ file has no author and only EPUB has a language', () => {
    render(<BookDetailsScreen {...base} format="cbz" />);

    expect(screen.getByText(/CBZ files do not store an author/u)).toBeVisible();
    expect(screen.getByText('Only EPUB files carry a language.')).toBeVisible();
  });
});
