import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultPreferences } from '@/domain/preferences';
import { App } from '@/renderer/app';
import { type MangaboundBridge } from '@/shared/runtime-info';

import {
  addFolder,
  bridge,
  cbz,
  inspection,
  installBridge,
  keptSettings,
  runButton,
} from './support/workflow';
import { converted, goodTitle, libraryBridge, looseTitle } from './support/library';

afterEach(() => {
  Reflect.deleteProperty(window, 'mangabound');
});

describe('the title, author and language typed for an item', () => {
  const openDetails = async (user: UserEvent, name = 'Offline Work'): Promise<void> => {
    await user.click(await screen.findByRole('button', { name: `Edit details of ${name}` }));
    expect(await screen.findByRole('heading', { name })).toBeVisible();
  };

  it('are typed on a page of their own, kept when going back, and sent with the conversion', async () => {
    const user = userEvent.setup();
    const convert = vi.fn<MangaboundBridge['convert']>(bridge().convert);
    installBridge(bridge({ convert }));
    render(<App />);
    await addFolder(user);

    await openDetails(user);
    await user.type(screen.getByLabelText('Series title'), 'Chainsaw Man');
    await user.type(screen.getByLabelText('Author'), 'Fujimoto Tatsuki');
    await user.type(screen.getByLabelText('Language'), 'pt-br');
    expect(
      within(screen.getByRole('list', { name: 'Book titles' })).getByText('Chainsaw Man - Vol.01'),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Queue' }));
    expect(await screen.findByRole('heading', { name: 'Queue' })).toBeVisible();
    // The page still has what was typed.
    await openDetails(user);
    expect(screen.getByLabelText('Series title')).toHaveValue('Chainsaw Man');
    await user.click(screen.getByRole('button', { name: 'Queue' }));

    await user.click(await runButton(1));
    expect(await screen.findByRole('heading', { name: '1 book ready' })).toBeVisible();
    expect(convert.mock.calls[0]?.[0].details).toEqual({
      title: 'Chainsaw Man',
      author: 'Fujimoto Tatsuki',
      // Typed pt-br, sent the way BCP 47 recommends.
      language: 'pt-BR',
    });
    // The options no longer carry a title or an author of their own.
    expect(convert.mock.calls[0]?.[0].settings).not.toHaveProperty('title');
    expect(convert.mock.calls[0]?.[0].settings).not.toHaveProperty('author');
  });

  it('send nothing for an item that has none, and clearing them again sends nothing either', async () => {
    const user = userEvent.setup();
    const convert = vi.fn<MangaboundBridge['convert']>(bridge().convert);
    installBridge(bridge({ convert }));
    render(<App />);
    await addFolder(user);

    await openDetails(user);
    await user.type(screen.getByLabelText('Author'), 'Someone');
    await user.clear(screen.getByLabelText('Author'));
    await user.click(screen.getByRole('button', { name: 'Queue' }));
    await user.click(await runButton(1));

    expect(await screen.findByRole('heading', { name: '1 book ready' })).toBeVisible();
    expect(convert.mock.calls[0]?.[0]).not.toHaveProperty('details');
  });

  it('keep a space between two words, and refuse a language that is not a tag', async () => {
    const user = userEvent.setup();
    installBridge(bridge());
    render(<App />);
    await addFolder(user);

    await openDetails(user);
    await user.type(screen.getByLabelText('Series title'), 'Two Words');
    await user.type(screen.getByLabelText('Language'), 'pt-br');
    await user.type(screen.getByLabelText('Language'), ' not');

    expect(screen.getByLabelText('Series title')).toHaveValue('Two Words');
    expect(screen.getByLabelText('Language')).toBeInvalid();
    expect(screen.getByText(/Use a language tag such as en-US or pt-BR/u)).toBeVisible();
  });

  it('are for one book, not a series, when the item makes a single book', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        chooseInputs: () => Promise.resolve({ ok: true, value: { inputs: [cbz], rejected: [] } }),
      }),
    );
    render(<App />);
    await addFolder(user);

    await openDetails(user, 'Standalone.cbz');

    expect(screen.getByLabelText('Book title')).toHaveAttribute('placeholder', 'Standalone');
    expect(screen.getByText('The book will be titled')).toBeVisible();
  });

  it('are not offered when only joining, because mangapress makes no book then', async () => {
    const user = userEvent.setup();
    installBridge(bridge());
    render(<App />);
    await addFolder(user);
    expect(screen.getByRole('button', { name: 'Edit details of Offline Work' })).toBeVisible();

    await user.click(screen.getByRole('checkbox', { name: 'Convert for e-reader' }));

    expect(
      screen.queryByRole('button', { name: 'Edit details of Offline Work' }),
    ).not.toBeInTheDocument();
  });

  it('make a validated plan stale, so it is validated again before running', async () => {
    const user = userEvent.setup();
    installBridge(bridge());
    render(<App />);
    await addFolder(user);
    await user.click(screen.getByRole('button', { name: 'Validate plan' }));
    expect(await screen.findByRole('heading', { name: 'Plan validated' })).toBeVisible();

    await openDetails(user);
    await user.type(screen.getByLabelText('Author'), 'Someone');
    await user.click(screen.getByRole('button', { name: 'Queue' }));

    expect(screen.queryByRole('heading', { name: 'Plan validated' })).not.toBeInTheDocument();
  });

  it('are typed per title in a library, and sent for the titles they were typed for', async () => {
    const user = userEvent.setup();
    const convertLibrary = vi.fn<MangaboundBridge['convertLibrary']>(() =>
      Promise.resolve({ ok: true, value: [converted('Good Manga', 'good-1')] }),
    );
    installBridge(libraryBridge([goodTitle, looseTitle], { convertLibrary }));
    render(<App />);
    await addFolder(user);
    await user.click(screen.getByRole('button', { name: 'Edit titles of Manga Library' }));

    await user.click(await screen.findByRole('button', { name: 'Edit details of Good Manga' }));
    expect(await screen.findByRole('heading', { name: 'Good Manga' })).toBeVisible();
    await user.type(screen.getByLabelText('Author'), 'Someone');
    // Back goes to the library the title belongs to.
    await user.click(screen.getByRole('button', { name: 'Manga Library' }));
    expect(await screen.findByRole('list', { name: 'Titles' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Queue' }));

    await user.click(await runButton(1));

    expect(await screen.findByRole('heading', { name: '1 book ready' })).toBeVisible();
    expect(convertLibrary.mock.calls[0]?.[0].titleDetails).toEqual([
      { title: 'Good Manga', details: { author: 'Someone' } },
    ]);
  });

  it('are not offered for a library when only joining', async () => {
    const user = userEvent.setup();
    installBridge(libraryBridge([goodTitle]));
    render(<App />);
    await addFolder(user);
    await user.click(screen.getByRole('checkbox', { name: 'Convert for e-reader' }));
    await user.click(screen.getByRole('button', { name: 'Edit titles of Manga Library' }));

    expect(await screen.findByRole('list', { name: 'Titles' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Edit details of Good Manga' }),
    ).not.toBeInTheDocument();
  });
});

describe('looking up the author from the details of an item', () => {
  const mangaDex = {
    id: 'mangadex',
    displayName: 'MangaDex',
    homepage: 'https://mangadex.org',
    description: 'Community catalogue of manga, with volume and chapter data',
  };
  const found = {
    id: 'work-1',
    provider: 'mangadex',
    title: 'Offline Work',
    authors: ['Fujimoto Tatsuki'],
    year: 2018,
  };

  const saveCalls = (
    saveSettings: ReturnType<typeof vi.fn<MangaboundBridge['saveSettings']>>,
  ): readonly Parameters<MangaboundBridge['saveSettings']>[0][] =>
    saveSettings.mock.calls.map(([command]) => command);
  const okSave = (): ReturnType<typeof vi.fn<MangaboundBridge['saveSettings']>> =>
    vi.fn<MangaboundBridge['saveSettings']>(() => Promise.resolve({ ok: true, value: undefined }));

  const openLookup = async (user: UserEvent): Promise<void> => {
    await user.click(await screen.findByRole('button', { name: 'Edit details of Offline Work' }));
    await user.click(await screen.findByRole('button', { name: 'Find author' }));
  };

  it('searches the title in the source chosen there, fills the author, and sends it with the conversion', async () => {
    const user = userEvent.setup();
    const searchMetadata = vi.fn<MangaboundBridge['searchMetadata']>(() =>
      Promise.resolve({ ok: true, value: [found] }),
    );
    const convert = vi.fn<MangaboundBridge['convert']>(bridge().convert);
    installBridge(
      bridge({
        convert,
        searchMetadata,
        listMetadataProviders: () => Promise.resolve({ ok: true, value: [mangaDex] }),
      }),
    );
    render(<App />);
    await addFolder(user);
    await openLookup(user);
    // Nothing is sent until the source is chosen and Search is used.
    expect(searchMetadata).not.toHaveBeenCalled();

    await user.click(screen.getByRole('combobox', { name: 'Source' }));
    await user.click(screen.getByRole('option', { name: /MangaDex/u }));
    expect(searchMetadata).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(searchMetadata).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      'mangadex',
      'Offline Work',
    );
    await user.click(
      await screen.findByRole('button', { name: 'Use Fujimoto Tatsuki from Offline Work' }),
    );
    expect(screen.getByLabelText('Author')).toHaveValue('Fujimoto Tatsuki');
    await user.click(screen.getByRole('button', { name: 'Queue' }));
    await user.click(await runButton(1));

    expect(await screen.findByRole('heading', { name: '1 book ready' })).toBeVisible();
    expect(convert.mock.calls[0]?.[0].details).toEqual({ author: 'Fujimoto Tatsuki' });
  });

  it('searches with the title typed there, and shows the failure when the source cannot be reached', async () => {
    const user = userEvent.setup();
    const searchMetadata = vi.fn<MangaboundBridge['searchMetadata']>(() =>
      Promise.resolve({
        ok: false,
        error: { code: 'network_error', message: 'Could not reach MangaDex.' },
      }),
    );
    installBridge(
      bridge({
        searchMetadata,
        listMetadataProviders: () => Promise.resolve({ ok: true, value: [mangaDex] }),
        loadSettings: keptSettings({
          preferences: { ...defaultPreferences, providerId: 'mangadex' },
        }),
      }),
    );
    render(<App />);
    await addFolder(user);
    await openLookup(user);
    await user.type(screen.getByLabelText('Series title'), 'Chainsaw Man');

    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(searchMetadata).toHaveBeenCalledWith(expect.any(String), 'mangadex', 'Chainsaw Man');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach MangaDex.');
  });

  it('shares the source with the volume editor, and keeps it', async () => {
    const user = userEvent.setup();
    const saveSettings = okSave();
    installBridge(
      bridge({
        saveSettings,
        listMetadataProviders: () => Promise.resolve({ ok: true, value: [mangaDex] }),
      }),
    );
    render(<App />);
    await addFolder(user);
    await openLookup(user);
    await user.click(screen.getByRole('combobox', { name: 'Source' }));
    await user.click(screen.getByRole('option', { name: /MangaDex/u }));

    await waitFor(() => {
      expect(saveCalls(saveSettings).at(-1)?.preferences.providerId).toBe('mangadex');
    });
    await user.click(screen.getByRole('button', { name: 'Queue' }));
    await user.click(screen.getByRole('button', { name: 'Edit volumes for Offline Work' }));
    await user.click(await screen.findByRole('tab', { name: 'Online source' }));

    expect(screen.getByRole('combobox', { name: 'Source' })).toHaveTextContent('MangaDex');
  });

  it('is not offered when the app has no source to ask', async () => {
    const user = userEvent.setup();
    installBridge(bridge());
    render(<App />);
    await addFolder(user);

    await user.click(await screen.findByRole('button', { name: 'Edit details of Offline Work' }));

    expect(await screen.findByLabelText('Author')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Find author' })).not.toBeInTheDocument();
  });
});

describe('keeping the author and language with the folder', () => {
  const saveBookDetails = () =>
    vi.fn<MangaboundBridge['saveBookDetails']>(() =>
      Promise.resolve({ ok: true, value: undefined }),
    );

  const inspectedWith =
    (details: { author?: string; language?: string }): MangaboundBridge['inspectInput'] =>
    (id) => {
      const base = inspection(id);
      return Promise.resolve(base.ok ? { ok: true, value: { ...base.value, details } } : base);
    };

  const openDetails = async (user: UserEvent, name = 'Offline Work'): Promise<void> => {
    await user.click(await screen.findByRole('button', { name: `Edit details of ${name}` }));
    expect(await screen.findByRole('heading', { name })).toBeVisible();
  };

  it('are saved when the page is left after the author was typed, for the folder of the item', async () => {
    const user = userEvent.setup();
    const save = saveBookDetails();
    installBridge(bridge({ saveBookDetails: save }));
    render(<App />);
    await addFolder(user);
    await openDetails(user);

    await user.type(screen.getByLabelText('Author'), 'Fujimoto Tatsuki');
    await user.type(screen.getByLabelText('Language'), 'pt-br');
    // Nothing is written while typing, only once the page is left.
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Queue' }));

    expect(save).toHaveBeenCalledExactlyOnceWith({
      sessionId: 'session',
      details: { author: 'Fujimoto Tatsuki', language: 'pt-BR' },
    });
  });

  it('are not saved when nothing that a folder keeps changed, or only the title did', async () => {
    const user = userEvent.setup();
    const save = saveBookDetails();
    installBridge(bridge({ saveBookDetails: save }));
    render(<App />);
    await addFolder(user);

    await openDetails(user);
    await user.click(screen.getByRole('button', { name: 'Queue' }));
    await openDetails(user);
    await user.type(screen.getByLabelText('Series title'), 'A title for this run');
    await user.click(screen.getByRole('button', { name: 'Queue' }));

    expect(save).not.toHaveBeenCalled();
  });

  it('are saved as cleared when what was kept is emptied', async () => {
    const user = userEvent.setup();
    const save = saveBookDetails();
    installBridge(
      bridge({ saveBookDetails: save, inspectInput: inspectedWith({ author: 'Old Author' }) }),
    );
    render(<App />);
    await addFolder(user);
    await openDetails(user);
    expect(screen.getByLabelText('Author')).toHaveValue('Old Author');

    await user.clear(screen.getByLabelText('Author'));
    await user.click(screen.getByRole('button', { name: 'Queue' }));

    expect(save).toHaveBeenCalledExactlyOnceWith({ sessionId: 'session', details: {} });
  });

  it('come back with the folder, colored on its row and sent with the conversion', async () => {
    const user = userEvent.setup();
    const convert = vi.fn<MangaboundBridge['convert']>(bridge().convert);
    installBridge(
      bridge({
        convert,
        inspectInput: inspectedWith({ author: 'Kept Author', language: 'ja' }),
      }),
    );
    render(<App />);
    await addFolder(user);

    expect(screen.getByRole('button', { name: 'Edit details of Offline Work' })).toHaveClass(
      'text-accent',
    );
    await user.click(await runButton(1));

    expect(await screen.findByRole('heading', { name: '1 book ready' })).toBeVisible();
    expect(convert.mock.calls[0]?.[0].details).toEqual({ author: 'Kept Author', language: 'ja' });
  });

  it('are not offered a place to be kept for a loose CBZ, which has no folder', async () => {
    const user = userEvent.setup();
    const save = saveBookDetails();
    installBridge(
      bridge({
        saveBookDetails: save,
        chooseInputs: () => Promise.resolve({ ok: true, value: { inputs: [cbz], rejected: [] } }),
      }),
    );
    render(<App />);
    await addFolder(user);
    await openDetails(user, 'Standalone.cbz');

    await user.type(screen.getByLabelText('Author'), 'Someone');
    await user.click(screen.getByRole('button', { name: 'Queue' }));

    expect(save).not.toHaveBeenCalled();
  });

  it('say so when they could not be saved, and stay for the session', async () => {
    const user = userEvent.setup();
    const save = vi.fn<MangaboundBridge['saveBookDetails']>(() =>
      Promise.resolve({
        ok: false,
        error: {
          code: 'details_save_failed',
          message: "Couldn't keep the author and language with the source folder.",
        },
      }),
    );
    installBridge(bridge({ saveBookDetails: save }));
    render(<App />);
    await addFolder(user);
    await openDetails(user);
    await user.type(screen.getByLabelText('Author'), 'Someone');

    await user.click(screen.getByRole('button', { name: 'Queue' }));

    expect(await screen.findByRole('status', { name: 'Notices' })).toHaveTextContent(
      "Couldn't keep the author and language with the source folder.",
    );
    await openDetails(user);
    expect(screen.getByLabelText('Author')).toHaveValue('Someone');
  });

  it('are kept with the folder of a title in a library, and the titles come with theirs', async () => {
    const user = userEvent.setup();
    const save = saveBookDetails();
    const kept = { ...goodTitle, details: { author: 'Kept Author' } };
    installBridge(libraryBridge([kept, looseTitle], { saveBookDetails: save }));
    render(<App />);
    await addFolder(user);
    await user.click(screen.getByRole('button', { name: 'Edit titles of Manga Library' }));

    // The title read with an author shows it kept, and the other has none.
    expect(await screen.findByRole('button', { name: 'Edit details of Good Manga' })).toHaveClass(
      'text-accent',
    );
    expect(screen.getByRole('button', { name: 'Edit details of Broken Manga' })).not.toHaveClass(
      'text-accent',
    );
    await user.click(screen.getByRole('button', { name: 'Edit details of Broken Manga' }));
    await user.type(await screen.findByLabelText('Author'), 'Someone');
    await user.click(screen.getByRole('button', { name: 'Manga Library' }));

    expect(save).toHaveBeenCalledExactlyOnceWith({
      sessionId: 'library-session',
      title: 'Broken Manga',
      details: { author: 'Someone' },
    });
  });
});
