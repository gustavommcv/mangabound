import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { BookDetails } from '@/domain/book-details';
import type { SearchMetadata } from '@/renderer/hooks/use-metadata-search';
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

  it('stops a title at what a file name can hold, counted in bytes and cut at a whole character', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const title = screen.getByLabelText('Book title');

    // Ninety Japanese letters are 270 bytes: the first 66 fit, and no half of a letter is kept.
    await user.click(title);
    await user.paste('あ'.repeat(90));

    expect(title).toHaveValue('あ'.repeat(66));
    expect(lastChange(onChange)).toEqual({ title: 'あ'.repeat(66) });
    expect(screen.getByText(/as long as the title of a book can be/u)).toBeVisible();
  });

  it('says nothing about the length of a title until there is no room for one more letter', async () => {
    const user = userEvent.setup();
    render(<Harness onChange={vi.fn()} />);
    const title = screen.getByLabelText('Book title');

    await user.click(title);
    await user.paste('a'.repeat(199));
    expect(screen.queryByText(/as long as the title of a book can be/u)).not.toBeInTheDocument();

    await user.type(title, 'b');
    expect(title).toHaveValue(`${'a'.repeat(199)}b`);
    expect(screen.getByText(/as long as the title of a book can be/u)).toBeVisible();
  });

  it('turns a line break pasted into the title into a space, as it does for the author', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByLabelText('Author'));
    await user.paste('Fujimoto' + String.fromCharCode(0) + 'Tatsuki');

    expect(lastChange(onChange)).toEqual({ author: 'Fujimoto Tatsuki' });
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
    // What is typed stays as it was typed; what goes up is written the way BCP 47 recommends.
    expect(screen.getByLabelText('Language')).toHaveValue('pt-br');
    expect(lastChange(onChange)).toEqual({ language: 'pt-BR' });
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

  it('offers the language the folder names declare, and uses it when it is chosen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness declaredLanguage="pt-br" onChange={onChange} />);

    // The folder says pt-br; it is offered, and written, the way BCP 47 recommends.
    await user.click(screen.getByRole('button', { name: 'Use pt-BR' }));

    expect(screen.getByLabelText('Language')).toHaveValue('pt-BR');
    expect(screen.getByLabelText('Language')).toHaveFocus();
    expect(lastChange(onChange)).toEqual({ language: 'pt-BR' });
    // Taken, so there is nothing left to offer and nothing left to say about the folder.
    expect(screen.queryByRole('button', { name: /^Use / })).not.toBeInTheDocument();
    expect(screen.queryByText(/The folder names say/u)).not.toBeInTheDocument();
    expect(screen.getByText('Used for EPUB output.')).toBeVisible();
  });

  it('replaces another language that was typed when the offer is taken', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness declaredLanguage="pt-br" details={{ language: 'ja' }} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Use pt-BR' }));

    expect(screen.getByLabelText('Language')).toHaveValue('pt-BR');
    expect(lastChange(onChange)).toEqual({ language: 'pt-BR' });
  });

  it('offers nothing when the folder names agree, say nothing useful, or the format has no language', () => {
    const { rerender } = render(<BookDetailsScreen {...base} declaredLanguage="EN-us" />);
    expect(screen.queryByRole('button', { name: /^Use / })).not.toBeInTheDocument();

    rerender(<BookDetailsScreen {...base} declaredLanguage="not a tag" />);
    expect(screen.queryByRole('button', { name: /^Use / })).not.toBeInTheDocument();

    rerender(<BookDetailsScreen {...base} declaredLanguage="pt-br" format="cbz" />);
    expect(screen.queryByRole('button', { name: /^Use / })).not.toBeInTheDocument();
    // The folder is still said to declare it: it is true, and it drives the online lookup.
    expect(screen.getByText('The folder names say pt-br.')).toBeVisible();
  });

  it('says a CBZ file has no author and only EPUB has a language', () => {
    render(<BookDetailsScreen {...base} format="cbz" />);

    expect(screen.getByText(/CBZ files do not store an author/u)).toBeVisible();
    expect(screen.getByText('Only EPUB files carry a language.')).toBeVisible();
  });
});

describe('looking up the author of a work', () => {
  const mangaDex = {
    id: 'mangadex',
    displayName: 'MangaDex',
    homepage: 'https://mangadex.org',
    description: 'Community catalogue of manga',
  };
  const otherSource = {
    id: 'other',
    displayName: 'Other Catalogue',
    homepage: 'https://other.example',
    description: 'Another catalogue',
  };
  const work = {
    id: 'w1',
    provider: 'mangadex',
    title: 'Chainsaw Man',
    authors: ['Fujimoto Tatsuki'],
    year: 2018,
  };

  /** A lookup that keeps the source chosen, the way the app does, and records what is asked. */
  function LookingUp({
    onChange = vi.fn(),
    onSearch,
    onOpenHomepage = vi.fn(),
    providers = [mangaDex],
    selected,
    ...props
  }: Partial<BookDetailsScreenProps> & {
    readonly onSearch: SearchMetadata;
    readonly onOpenHomepage?: (providerId: string) => void;
    readonly providers?: readonly (typeof mangaDex)[];
    readonly selected?: string;
  }): React.JSX.Element {
    const [selectedId, setSelectedId] = useState<string | undefined>(selected);
    return (
      <Harness
        {...props}
        lookup={{
          onOpenHomepage,
          onSearch,
          onSelect: setSelectedId,
          providers,
          selectedId,
        }}
        onChange={onChange}
      />
    );
  }

  const openLookup = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
    await user.click(screen.getByRole('button', { name: 'Find author' }));
  };
  const chooseSource = async (
    user: ReturnType<typeof userEvent.setup>,
    name = /MangaDex/u,
  ): Promise<void> => {
    await user.click(screen.getByRole('combobox', { name: 'Source' }));
    await user.click(screen.getByRole('option', { name }));
  };

  it('is offered only where there is a source to ask', () => {
    const { rerender } = render(<BookDetailsScreen {...base} />);
    expect(screen.queryByRole('button', { name: 'Find author' })).not.toBeInTheDocument();

    rerender(
      <BookDetailsScreen
        {...base}
        lookup={{
          onOpenHomepage: vi.fn(),
          onSearch: vi.fn(),
          onSelect: vi.fn(),
          providers: [],
          selectedId: undefined,
        }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Find author' })).not.toBeInTheDocument();
  });

  it('opens on its own, asking for a source first and sending nothing', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<LookingUp onSearch={onSearch} />);
    expect(screen.getByRole('button', { name: 'Find author' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    await openLookup(user);

    expect(screen.getByRole('button', { name: 'Find author' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText(/Pick a source to look up who wrote it/u)).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Source' })).toHaveTextContent('Select a source');
    expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument();
    expect(onSearch).not.toHaveBeenCalled();

    await openLookup(user);
    expect(screen.queryByRole('combobox', { name: 'Source' })).not.toBeInTheDocument();
  });

  it('says what would be sent and to whom, following the title as it is typed, and credits the source', async () => {
    const user = userEvent.setup();
    const onOpenHomepage = vi.fn();
    render(<LookingUp onOpenHomepage={onOpenHomepage} onSearch={vi.fn()} />);
    await openLookup(user);

    await chooseSource(user);

    expect(screen.getByText('Author data by')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Open MangaDex in your browser' }));
    expect(onOpenHomepage).toHaveBeenCalledExactlyOnceWith('mangadex');
    // With no title typed, it is the item's own name that would be searched.
    expect(screen.getByText(/Will search MangaDex for “Chainsaw Man”/u)).toBeVisible();
    await user.type(screen.getByLabelText('Book title'), '  Berserk ');
    expect(screen.getByText(/Will search MangaDex for “Berserk”/u)).toBeVisible();
    expect(screen.getByText(/Only author names and years are used/u)).toBeVisible();
  });

  it('searches the title only when Search is used, and lists each work with its authors and year', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn(() =>
      Promise.resolve([
        work,
        { id: 'w2', provider: 'mangadex', title: 'Chainsaw Man (Fan Colored)', year: 2019 },
        { id: 'w3', provider: 'mangadex', title: 'Two Hands', authors: ['A One', 'B Two'] },
      ]),
    );
    render(<LookingUp onSearch={onSearch} />);
    await openLookup(user);
    await chooseSource(user);
    expect(onSearch).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(onSearch).toHaveBeenCalledExactlyOnceWith(
      'mangadex',
      'Chainsaw Man',
      expect.any(AbortSignal),
    );
    const matches = within(await screen.findByRole('list', { name: 'Matches' }));
    const rows = matches.getAllByRole('listitem').map((row) => row.textContent);
    expect(rows).toEqual([
      'Chainsaw ManFujimoto Tatsuki · 2018Use author',
      'Chainsaw Man (Fan Colored)No author listed · 2019',
      'Two HandsA One, B TwoUse author',
    ]);
  });

  it('takes the authors of the work chosen as the author, closes, and goes back to the field', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onSearch = vi.fn(() =>
      Promise.resolve([{ ...work, authors: ['Fujimoto Tatsuki', 'Someone Else'] }]),
    );
    render(<LookingUp onChange={onChange} onSearch={onSearch} />);
    await openLookup(user);
    await chooseSource(user);
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await user.click(
      await screen.findByRole('button', {
        name: 'Use Fujimoto Tatsuki, Someone Else from Chainsaw Man',
      }),
    );

    expect(screen.getByLabelText('Author')).toHaveValue('Fujimoto Tatsuki, Someone Else');
    expect(screen.getByLabelText('Author')).toHaveFocus();
    expect(lastChange(onChange)).toEqual({ author: 'Fujimoto Tatsuki, Someone Else' });
    expect(screen.queryByRole('combobox', { name: 'Source' })).not.toBeInTheDocument();
  });

  it('keeps a work found in a source already chosen, so a second title needs only Search', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn(() => Promise.resolve([work]));
    render(<LookingUp onSearch={onSearch} selected="mangadex" />);

    await openLookup(user);

    expect(screen.getByRole('combobox', { name: 'Source' })).toHaveTextContent('MangaDex');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByRole('list', { name: 'Matches' })).toBeVisible();
  });

  it('says what found nothing and to change the title, quoting what was searched', async () => {
    const user = userEvent.setup();
    render(
      <LookingUp
        defaultTitle="Chainsaw Man - EN"
        onSearch={vi.fn(() => Promise.resolve([]))}
        selected="mangadex"
      />,
    );
    await openLookup(user);

    await user.click(screen.getByRole('button', { name: 'Search' }));

    const notice = await screen.findByRole('status', { name: 'No matches' });
    expect(notice).toHaveTextContent('No matches for “Chainsaw Man - EN”.');
    expect(notice).toHaveTextContent(
      'Extra characters in the title can keep a work from being found.',
    );
    expect(notice).toHaveTextContent('Try a simpler title above and search again.');
  });

  it('shows why a search failed, and leaves the author to be typed', async () => {
    const user = userEvent.setup();
    render(
      <LookingUp
        onSearch={vi.fn(() => Promise.reject(new Error('Could not reach MangaDex.')))}
        selected="mangadex"
      />,
    );
    await openLookup(user);

    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach MangaDex.');
    await user.type(screen.getByLabelText('Author'), 'Typed By Hand');
    expect(screen.getByLabelText('Author')).toHaveValue('Typed By Hand');
  });

  it('shows a generic message when the failure carries none', async () => {
    const user = userEvent.setup();
    // The point of this test is a failure that is not an Error, which a source could still throw.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const failing = vi.fn(() => Promise.reject('nope'));
    render(<LookingUp onSearch={failing} selected="mangadex" />);
    await openLookup(user);

    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The search could not be completed.',
    );
  });

  it('forgets what was found when another source is chosen', async () => {
    const user = userEvent.setup();
    render(
      <LookingUp
        onSearch={vi.fn(() => Promise.resolve([work]))}
        providers={[mangaDex, otherSource]}
        selected="mangadex"
      />,
    );
    await openLookup(user);
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByRole('list', { name: 'Matches' })).toBeVisible();

    await chooseSource(user, /Other Catalogue/u);

    expect(screen.queryByRole('list', { name: 'Matches' })).not.toBeInTheDocument();
    expect(screen.getByText(/Will search Other Catalogue for/u)).toBeVisible();
  });

  it('cannot search with no title at all', async () => {
    const user = userEvent.setup();
    render(<LookingUp defaultTitle="" onSearch={vi.fn()} selected="mangadex" />);

    await openLookup(user);

    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
  });

  const coverControls = {
    attached: [],
    onChoose: () => undefined,
    onChooseFolder: () => undefined,
    onDropFiles: () => undefined,
    onRemove: () => undefined,
  };
  const coverRows = (): HTMLElement[] =>
    within(screen.getByRole('list', { name: 'Books and their covers' })).getAllByRole('listitem');

  it('offers a cover for every volume of a series, under the title each book will have', async () => {
    const user = userEvent.setup();
    render(<Harness covers={coverControls} onChange={vi.fn()} volumes={[1, 2, 3.5, 4, 5]} />);

    // Every volume, not only the few the titles preview lists.
    expect(coverRows()).toHaveLength(5);
    expect(coverRows()[2]).toHaveTextContent('Chainsaw Man - Vol.3.5');

    await user.type(screen.getByLabelText('Series title'), 'CSM');
    expect(coverRows()[0]).toHaveTextContent('CSM - Vol.01');
  });

  it('offers one cover for an item that makes a single book', () => {
    render(<BookDetailsScreen {...base} covers={coverControls} defaultTitle="Vagabond Vol.03" />);

    expect(coverRows()).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'Choose a cover for Vagabond Vol.03' }),
    ).toBeVisible();
  });

  it('says a PDF has no cover, and offers no covers at all where mangapress makes no book', () => {
    const { rerender } = render(
      <BookDetailsScreen {...base} covers={coverControls} format="pdf" volumes={[1]} />,
    );
    expect(
      screen.getByText('A PDF has no cover. What is set here is kept for the other formats.'),
    ).toBeVisible();

    rerender(<BookDetailsScreen {...base} volumes={[1]} />);
    expect(screen.queryByRole('heading', { name: 'Covers' })).not.toBeInTheDocument();
  });
});
