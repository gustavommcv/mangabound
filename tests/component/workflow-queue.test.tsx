import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMappingDraft } from '@/domain/mapping';
import { defaultMangapressSettings } from '@/domain/output-profile';
import { App } from '@/renderer/app';
import { type MangaboundBridge } from '@/shared/runtime-info';
import {
  type ConversionProgressPayload,
  type InspectedInputPayload,
  type WorkflowResult,
} from '@/shared/workflow-contract';

import {
  addFolder,
  bridge,
  cbz,
  chapters,
  deferred,
  expectNoOutputFolderPicker,
  folder,
  inspection,
  installBridge,
  mapping,
  partialMapping,
  runButton,
} from './support/workflow';

afterEach(() => {
  Reflect.deleteProperty(window, 'mangabound');
});

describe('queue application workflow', () => {
  it('recovers an unsaved book after reopening and lets it be saved without rerunning conversion', async () => {
    const user = userEvent.setup();
    const saveArtifactAs = vi.fn<MangaboundBridge['saveArtifactAs']>(() =>
      Promise.resolve({
        ok: true,
        value: { saved: true, warning: 'The destination catalog could not be updated.' },
      }),
    );
    const convert = vi.fn<MangaboundBridge['convert']>();
    installBridge(
      bridge({
        convert,
        saveArtifactAs,
        listPendingRuns: () =>
          Promise.resolve({
            ok: true,
            value: [
              {
                libraryId: 'recovered-run',
                createdAt: 1_000,
                artifacts: [
                  {
                    id: 'recovered-book',
                    name: 'Recovered.epub',
                    bytes: 2048,
                    format: 'epub',
                    saved: false,
                  },
                ],
              },
            ],
          }),
      }),
    );
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Ready books' })).toBeVisible();
    expect(screen.getByText('Recovered.epub')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'View books from Recovered.epub' }));
    expect(screen.getByRole('heading', { name: '1 book ready' })).toBeVisible();
    expect(screen.getByText('2.0 KB · Not saved yet')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save Recovered.epub as' }));
    await waitFor(() => expect(screen.getByText('2.0 KB · Saved')).toBeVisible());
    expect(screen.getByText('The destination catalog could not be updated.')).toBeVisible();
    expect(saveArtifactAs).toHaveBeenCalledWith('recovered-book');
    expect(convert).not.toHaveBeenCalled();
  });

  it('identifies separate pending conversions by their books', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        listPendingRuns: () =>
          Promise.resolve({
            ok: true,
            value: [
              {
                libraryId: 'first-run',
                createdAt: 1_000,
                artifacts: [
                  {
                    id: 'first-book',
                    name: 'First.epub',
                    bytes: 1024,
                    format: 'epub',
                    saved: false,
                  },
                ],
              },
              {
                libraryId: 'second-run',
                createdAt: 2_000,
                artifacts: [
                  {
                    id: 'second-book',
                    name: 'Second.epub',
                    bytes: 2048,
                    format: 'epub',
                    saved: false,
                  },
                ],
              },
            ],
          }),
      }),
    );
    render(<App />);

    expect(await screen.findByText('First.epub')).toBeVisible();
    expect(screen.getByText('Second.epub')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'View books from Second.epub' }));
    expect(screen.getByRole('list', { name: 'Ready books' })).toHaveTextContent('Second.epub');
    expect(screen.getByRole('list', { name: 'Ready books' })).not.toHaveTextContent('First.epub');
  });

  it('confirms deletion of one pending conversion without removing another', async () => {
    const user = userEvent.setup();
    const discardPendingRun = vi.fn<MangaboundBridge['discardPendingRun']>(() =>
      Promise.resolve({ ok: true, value: undefined }),
    );
    installBridge(
      bridge({
        discardPendingRun,
        listPendingRuns: () =>
          Promise.resolve({
            ok: true,
            value: [
              {
                libraryId: 'first-run',
                createdAt: 1_000,
                artifacts: [{ id: 'a', name: 'Same.epub', bytes: 5, format: 'epub', saved: false }],
              },
              {
                libraryId: 'second-run',
                createdAt: 2_000,
                artifacts: [{ id: 'b', name: 'Same.epub', bytes: 5, format: 'epub', saved: false }],
              },
            ],
          }),
      }),
    );
    render(<App />);

    const buttons = await screen.findAllByRole('button', {
      name: 'Delete pending books from Same.epub',
    });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[0]!);
    expect(screen.getByRole('group', { name: 'Confirm deletion of Same.epub' })).toHaveTextContent(
      'Books saved elsewhere will stay untouched.',
    );
    // The question has the focus, and Tab goes on to its buttons.
    expect(screen.getByRole('group', { name: 'Confirm deletion of Same.epub' })).toHaveFocus();
    expect(discardPendingRun).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(discardPendingRun).not.toHaveBeenCalled();

    await user.click(buttons[0]!);
    await user.click(screen.getByRole('button', { name: 'Delete books' }));
    await waitFor(() => {
      expect(discardPendingRun).toHaveBeenCalledWith('first-run');
    });
    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: 'Delete pending books from Same.epub' }),
      ).toHaveLength(1);
    });
    await user.click(screen.getByRole('button', { name: 'View books from Same.epub' }));
    expect(screen.getByRole('list', { name: 'Ready books' })).toHaveTextContent('Same.epub');
  });

  it('keeps pending books visible when deletion fails', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        listPendingRuns: () =>
          Promise.resolve({
            ok: true,
            value: [
              {
                libraryId: 'run',
                createdAt: 1_000,
                artifacts: [
                  { id: 'book', name: 'Keep.epub', bytes: 5, format: 'epub', saved: false },
                ],
              },
            ],
          }),
        discardPendingRun: () =>
          Promise.resolve({
            ok: false,
            error: {
              code: 'pending_in_use',
              message: 'Stop sharing these books before deleting their pending copies.',
            },
          }),
      }),
    );
    render(<App />);
    await user.click(
      await screen.findByRole('button', { name: 'Delete pending books from Keep.epub' }),
    );
    await user.click(screen.getByRole('button', { name: 'Delete books' }));
    expect(
      await screen.findByText('Stop sharing these books before deleting their pending copies.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'View books from Keep.epub' })).toBeVisible();
  });

  it('keeps batch saving available after a warning is dismissed', async () => {
    const user = userEvent.setup();
    const saveAllArtifacts = vi.fn<MangaboundBridge['saveAllArtifacts']>(() =>
      Promise.resolve({
        ok: true,
        value: {
          savedIds: ['first-book', 'second-book'],
          failures: [{ id: 'first-book', message: 'The catalog could not be updated.' }],
        },
      }),
    );
    installBridge(
      bridge({
        saveAllArtifacts,
        listPendingRuns: () =>
          Promise.resolve({
            ok: true,
            value: [
              {
                libraryId: 'recovered-run',
                createdAt: 1_000,
                artifacts: [
                  {
                    id: 'first-book',
                    name: 'First.epub',
                    bytes: 1024,
                    format: 'epub',
                    saved: false,
                  },
                  {
                    id: 'second-book',
                    name: 'Second.epub',
                    bytes: 2048,
                    format: 'epub',
                    saved: false,
                  },
                ],
              },
            ],
          }),
      }),
    );
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'View books from First.epub' }));
    await user.click(screen.getByRole('button', { name: 'Save all to folder…' }));
    expect(await screen.findByText('First.epub: The catalog could not be updated.')).toBeVisible();
    expect(screen.getAllByText(/ · Saved$/u)).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Dismiss these notices' }));
    await user.click(screen.getByRole('button', { name: 'Save all to folder…' }));
    expect(saveAllArtifacts).toHaveBeenCalledTimes(2);
    expect(saveAllArtifacts).toHaveBeenLastCalledWith(['first-book', 'second-book']);
  });

  it('reads a folder into the queue, converts it and hands the books to the operating system', async () => {
    const user = userEvent.setup();
    const convert = vi.fn<MangaboundBridge['convert']>(() =>
      Promise.resolve({
        ok: true,
        value: [{ id: 'artifact', name: 'Offline Work.epub', bytes: 2048, format: 'epub' }],
      }),
    );
    const openArtifact = vi.fn<MangaboundBridge['openArtifact']>(() =>
      Promise.resolve({ ok: true, value: undefined }),
    );
    const showArtifactInFolder = vi.fn<MangaboundBridge['showArtifactInFolder']>(() =>
      Promise.resolve({ ok: true, value: undefined }),
    );
    const releaseInput = vi.fn<MangaboundBridge['releaseInput']>(() =>
      Promise.resolve({ ok: true, value: undefined }),
    );
    installBridge(bridge({ convert, openArtifact, releaseInput, showArtifactInFolder }));
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Queue' })).toBeVisible();
    expect(screen.getByText(/Drop manga folders, libraries or \.cbz files here/u)).toBeVisible();
    // Nothing to run yet; choosing a destination is no longer required.
    expect(screen.getByRole('button', { name: 'Process' })).toBeDisabled();
    await waitFor(() => {
      expect(screen.getByLabelText('Device')).toHaveValue('KPW6');
    });

    await addFolder(user);
    const list = screen.getByRole('list', { name: 'Queued items' });
    expect(within(list).getByText('Offline Work')).toBeVisible();
    expect(within(list).getByText('1 volume')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Process 1 item' })).toBeEnabled();

    expectNoOutputFolderPicker();
    await user.click(await runButton(1));

    expect(await screen.findByRole('heading', { name: '1 book ready' })).toBeVisible();
    expect(screen.getByText('Kindle Paperwhite 6 · EPUB')).toBeVisible();
    expect(convert.mock.calls[0]?.[0]).toMatchObject({
      sessionId: 'session',
      libraryId: 'pending-run',
      mode: 'bind-and-convert',
      settings: defaultMangapressSettings,
      format: 'epub',
      mapping,
    });
    await user.click(screen.getByRole('button', { name: 'Open Offline Work.epub' }));
    await user.click(screen.getByRole('button', { name: 'Save Offline Work.epub as' }));
    await user.click(screen.getByRole('button', { name: 'Show Offline Work.epub in its folder' }));
    expect(openArtifact).toHaveBeenCalledWith('artifact');
    expect(showArtifactInFolder).toHaveBeenCalledWith('artifact');

    await user.click(screen.getByRole('button', { name: 'Convert more' }));
    expect(await screen.findByRole('heading', { name: 'Queue' })).toBeVisible();
    // What was saved leaves the queue, and its scratch copy is released.
    expect(screen.queryByRole('list', { name: 'Queued items' })).not.toBeInTheDocument();
    expect(releaseInput).toHaveBeenCalledWith('session');
  });

  it('does not carry an error about a book it could not open to the queue it goes back to', async () => {
    const user = userEvent.setup();
    const convert = vi.fn<MangaboundBridge['convert']>(() =>
      Promise.resolve({
        ok: true,
        value: [{ id: 'artifact', name: 'Offline Work.epub', bytes: 2048, format: 'epub' }],
      }),
    );
    const openArtifact = vi.fn<MangaboundBridge['openArtifact']>(() =>
      Promise.resolve({
        ok: false,
        error: { code: 'artifact_not_found', message: 'The saved book is no longer available.' },
      }),
    );
    installBridge(bridge({ convert, openArtifact }));
    render(<App />);
    await addFolder(user);
    await user.click(await runButton(1));
    expect(await screen.findByRole('heading', { name: '1 book ready' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Open Offline Work.epub' }));
    expect(await screen.findByText('The saved book is no longer available.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Convert more' }));

    expect(await screen.findByRole('heading', { name: 'Queue' })).toBeVisible();
    expect(screen.queryByText('The saved book is no longer available.')).not.toBeInTheDocument();
  });

  it('says on the row, and in the editor, which folders mangabind could not read as chapters', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        inspectInput: (id) => {
          const read = inspection(id);
          return Promise.resolve(
            read.ok
              ? {
                  ok: true as const,
                  value: { ...read.value, unrecognized: ['Omake', 'Ch.004 [GroupA]'] },
                }
              : read,
          );
        },
      }),
    );
    render(<App />);

    await addFolder(user);

    const told =
      '2 folders have a name mangabind cannot read as a chapter, so they are left out of the books: Omake, Ch.004 [GroupA]. Rename them to include a chapter number (Ch.005, for one), then add the folder again.';
    const list = screen.getByRole('list', { name: 'Queued items' });
    expect(within(list).getByText(told)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Edit volumes for Offline Work' }));
    expect(await screen.findByRole('heading', { name: 'Folders left out' })).toBeVisible();
    expect(screen.getByText(told)).toBeVisible();
  });

  it('says on the row that a folder holds no manga because they are links, not to turn grouping off', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        inspectInput: (id) => {
          const read = inspection(id);
          return Promise.resolve(
            read.ok
              ? {
                  ok: true as const,
                  value: {
                    ...read.value,
                    mapping: createMappingDraft({ mangaTitle: 'Offline Work', chapters: [] }),
                    skippedLinks: ['Berserk', 'Vagabond'],
                  },
                }
              : read,
          );
        },
      }),
    );
    render(<App />);

    await addFolder(user);

    const list = screen.getByRole('list', { name: 'Queued items' });
    expect(
      within(list).getByText(
        '2 folders in it are links, and mangabind does not follow links to a series, so they were not read: Berserk, Vagabond. Put the real folders in the library and add it again.',
      ),
    ).toBeVisible();
    expect(within(list).queryByText(/Turn off "Group chapters into volumes"/u)).toBeNull();
  });

  it('focuses the Queue heading as soon as the app opens', async () => {
    installBridge(bridge());
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Queue' })).toHaveFocus();
  });

  it('focuses the running heading once a conversion starts', async () => {
    const user = userEvent.setup();
    const convert = vi.fn<MangaboundBridge['convert']>(() => new Promise(() => undefined));
    installBridge(bridge({ convert }));
    render(<App />);

    await addFolder(user);
    expectNoOutputFolderPicker();
    await user.click(await runButton(1));

    expect(await screen.findByRole('heading', { name: 'Converting Offline Work' })).toHaveFocus();
  });

  it('focuses the conversion options heading when it is opened', async () => {
    const user = userEvent.setup();
    installBridge(bridge());
    render(<App />);

    await addFolder(user);
    await user.click(screen.getByRole('button', { name: /Advanced conversion options/u }));

    expect(await screen.findByRole('heading', { name: 'Conversion options' })).toHaveFocus();
  });

  it('shows a successful no-output plan before conversion and forgets it once anything changes', async () => {
    const user = userEvent.setup();
    const planConversion = vi.fn<MangaboundBridge['planConversion']>(() =>
      Promise.resolve({
        ok: true,
        value: {
          tool: 'mangabind',
          title: 'Offline Work',
          message: 'mangabind validated 1 volume · no library files written',
          books: [{ name: 'Offline Work - Vol.01.cbz', pageCount: 4 }],
          issues: [],
        },
      }),
    );
    installBridge(bridge({ planConversion }));
    render(<App />);

    await addFolder(user);
    expectNoOutputFolderPicker();
    await user.click(screen.getByRole('button', { name: 'Validate plan' }));

    expect(await screen.findByRole('heading', { name: 'Plan validated' })).toBeVisible();
    expect(screen.getByText('Offline Work - Vol.01.cbz')).toBeVisible();
    expect(screen.getByText('No library files were written.')).toBeVisible();
    expect(planConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session',
        settings: defaultMangapressSettings,
      }),
    );

    await user.click(screen.getByRole('radio', { name: 'PDF' }));
    expect(screen.queryByRole('heading', { name: 'Plan validated' })).not.toBeInTheDocument();
  });

  it('stops a failed plan and reports it', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        planConversion: () =>
          Promise.resolve({
            ok: false,
            error: { code: 'plan_failed', message: 'mangabind could not plan this.' },
          }),
      }),
    );
    render(<App />);

    await addFolder(user);
    expectNoOutputFolderPicker();
    await user.click(screen.getByRole('button', { name: 'Validate plan' }));

    expect(await screen.findByRole('alert', { name: 'Workflow error' })).toHaveTextContent(
      'mangabind could not plan this.',
    );
    expect(screen.queryByRole('heading', { name: 'Plan validated' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Validate plan' })).toBeEnabled();
  });

  it('leaves out a folder that still needs volumes until the editor confirms them', async () => {
    const user = userEvent.setup();
    const convert = vi.fn<MangaboundBridge['convert']>(() =>
      Promise.resolve({
        ok: true,
        value: [{ id: 'a1', name: 'Offline Work.epub', bytes: 2048, format: 'epub' }],
      }),
    );
    installBridge(
      bridge({
        convert,
        inspectInput: () =>
          Promise.resolve({
            ok: true,
            value: {
              sessionId: 'session',
              displayName: 'Offline Work',
              kind: 'folder',
              mapping: partialMapping,
              issues: [],
            },
          }),
      }),
    );
    render(<App />);

    await addFolder(user);
    expectNoOutputFolderPicker();
    expect(screen.getByText('Needs volumes')).toBeVisible();
    expect(screen.getByText(/1 chapter still has no volume/u)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Process' })).toBeDisabled();
    expect(screen.getByText('Nothing here can run yet.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Edit volumes for Offline Work' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm mapping' }));

    // Accepting the gap is a decision, so the folder runs with the chapter left out.
    expect(await screen.findByText('1 volume')).toBeVisible();
    expect(screen.getByText('1 chapter left out.')).toBeVisible();
    await user.click(await runButton(1));
    expect(await screen.findByRole('heading', { name: '1 book ready' })).toBeVisible();
    expect(convert.mock.calls[0]?.[0].mapping?.volumes).toHaveLength(1);
  });

  const mangaDex = {
    id: 'mangadex',
    displayName: 'MangaDex',
    homepage: 'https://mangadex.org',
    description: 'Community catalogue of manga, with volume and chapter data',
  };

  /** Opens the editor of the folder in the queue and picks MangaDex from the list of sources. */
  async function chooseMangaDex(user: UserEvent): Promise<void> {
    await user.click(screen.getByRole('button', { name: 'Edit volumes for Offline Work' }));
    await user.click(await screen.findByRole('tab', { name: 'Online source' }));
    await user.click(screen.getByRole('combobox', { name: 'Source' }));
    await user.click(screen.getByRole('option', { name: /MangaDex/u }));
  }

  it('offers the sources as a list with none chosen, and searches only when asked', async () => {
    const user = userEvent.setup();
    const searchMetadata = vi.fn<MangaboundBridge['searchMetadata']>(() =>
      Promise.resolve({
        ok: true,
        value: [{ id: 'work-1', title: 'A Quiet Journey', provider: 'mangadex' }],
      }),
    );
    const suggestVolumes = vi.fn<MangaboundBridge['suggestVolumes']>(() =>
      Promise.resolve({ ok: true, value: { volumes: [{ number: '1', chapterNumbers: [1, 2] }] } }),
    );
    const openProviderHomepage = vi.fn<MangaboundBridge['openProviderHomepage']>(() =>
      Promise.resolve({ ok: true, value: undefined }),
    );
    installBridge(
      bridge({
        listMetadataProviders: () => Promise.resolve({ ok: true, value: [mangaDex] }),
        searchMetadata,
        suggestVolumes,
        openProviderHomepage,
      }),
    );
    render(<App />);

    await addFolder(user);
    await user.click(screen.getByRole('button', { name: 'Edit volumes for Offline Work' }));
    await user.click(await screen.findByRole('tab', { name: 'Online source' }));
    // Nothing is chosen, and opening the editor sent nothing.
    expect(screen.getByRole('combobox', { name: 'Source' })).toHaveTextContent('Select a source');
    expect(searchMetadata).not.toHaveBeenCalled();

    await user.click(screen.getByRole('combobox', { name: 'Source' }));
    await user.click(screen.getByRole('option', { name: /MangaDex/u }));
    expect(searchMetadata).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Open MangaDex in your browser' }));
    expect(openProviderHomepage).toHaveBeenCalledExactlyOnceWith('mangadex');

    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('A Quiet Journey')).toBeVisible();
    expect(searchMetadata).toHaveBeenCalledWith(expect.any(String), 'mangadex', 'Offline Work');

    await user.click(screen.getByRole('button', { name: 'Use these volumes' }));
    expect(await screen.findByText('Suggested by MangaDex')).toBeVisible();
    expect(suggestVolumes).toHaveBeenCalledWith(
      expect.any(String),
      'mangadex',
      'work-1',
      // The folders of this test declare no language.
      undefined,
    );
  });

  it('remembers the source that was chosen when the next title is edited', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({ listMetadataProviders: () => Promise.resolve({ ok: true, value: [mangaDex] }) }),
    );
    render(<App />);
    await addFolder(user);
    await chooseMangaDex(user);

    await user.click(screen.getByRole('button', { name: 'Queue' }));
    await user.click(screen.getByRole('button', { name: 'Edit volumes for Offline Work' }));
    await user.click(await screen.findByRole('tab', { name: 'Online source' }));

    expect(screen.getByRole('combobox', { name: 'Source' })).toHaveTextContent('MangaDex');
    expect(screen.getByText('Volume data by')).toBeVisible();
  });

  it('says why the site of a source could not be opened', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        listMetadataProviders: () => Promise.resolve({ ok: true, value: [mangaDex] }),
        openProviderHomepage: () =>
          Promise.resolve({
            ok: false,
            error: { code: 'provider_not_found', message: 'That source is not available.' },
          }),
      }),
    );
    render(<App />);
    await addFolder(user);
    await chooseMangaDex(user);

    await user.click(screen.getByRole('button', { name: 'Open MangaDex in your browser' }));

    expect(await screen.findByRole('alert', { name: 'Workflow error' })).toHaveTextContent(
      'That source is not available.',
    );
  });

  it('looks volumes up in the language the folders declare, and shows a lookup that failed', async () => {
    const user = userEvent.setup();
    const suggestVolumes = vi.fn<MangaboundBridge['suggestVolumes']>(() =>
      Promise.resolve({
        ok: false,
        error: { code: 'network_error', message: 'Could not reach MangaDex.' },
      }),
    );
    installBridge(
      bridge({
        listMetadataProviders: () => Promise.resolve({ ok: true, value: [mangaDex] }),
        searchMetadata: () =>
          Promise.resolve({
            ok: true,
            value: [{ id: 'work-1', title: 'Offline Work', provider: 'mangadex' }],
          }),
        suggestVolumes,
        inspectInput: () =>
          Promise.resolve({
            ok: true,
            value: {
              sessionId: 'session',
              displayName: 'Offline Work',
              kind: 'folder',
              mapping: createMappingDraft({
                mangaTitle: 'Offline Work',
                chapters: chapters.map((chapter) => ({ ...chapter, language: 'pt-br' })),
              }),
              issues: [],
            },
          }),
      }),
    );
    render(<App />);
    await addFolder(user);
    await chooseMangaDex(user);
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await user.click(await screen.findByRole('button', { name: 'Use these volumes' }));

    expect(suggestVolumes).toHaveBeenCalledWith(expect.any(String), 'mangadex', 'work-1', 'pt-br');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach MangaDex.');
  });

  it('shows a failed search in the panel, without an error for the whole page', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        listMetadataProviders: () => Promise.resolve({ ok: true, value: [mangaDex] }),
        searchMetadata: () =>
          Promise.resolve({
            ok: false,
            error: { code: 'rate_limited', message: 'MangaDex is rate-limiting requests.' },
          }),
      }),
    );
    render(<App />);
    await addFolder(user);
    await chooseMangaDex(user);

    await user.click(screen.getByRole('button', { name: 'Search' }));

    // The lookup is optional: its failure is beside it, and the page has no error of its own.
    expect(await screen.findByText('MangaDex is rate-limiting requests.')).toBeVisible();
    expect(screen.queryByRole('alert', { name: 'Workflow error' })).not.toBeInTheDocument();
  });

  it.each([
    ['no source is configured', () => Promise.resolve({ ok: true as const, value: [] })],
    [
      'the source list cannot be read',
      () =>
        Promise.resolve({
          ok: false as const,
          error: { code: 'internal_error', message: 'Mangabound could not complete that action.' },
        }),
    ],
    ['the source list call fails', () => Promise.reject(new Error('IPC down'))],
  ])('offers no online source and shows no error when %s', async (_name, listMetadataProviders) => {
    const user = userEvent.setup();
    installBridge(bridge({ listMetadataProviders }));
    render(<App />);

    await addFolder(user);
    await user.click(screen.getByRole('button', { name: 'Edit volumes for Offline Work' }));

    expect(await screen.findByRole('button', { name: 'Confirm mapping' })).toBeVisible();
    expect(screen.queryByRole('tab', { name: 'Online source' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('takes a CBZ straight to mangapress and explains that it is already one volume', async () => {
    const user = userEvent.setup();
    const convert = vi.fn<MangaboundBridge['convert']>(() =>
      Promise.resolve({
        ok: true,
        value: [{ id: 'a1', name: 'Standalone.epub', bytes: 2048, format: 'epub' }],
      }),
    );
    installBridge(
      bridge({
        convert,
        chooseInputs: () => Promise.resolve({ ok: true, value: { inputs: [cbz], rejected: [] } }),
      }),
    );
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Files' }));
    await waitFor(() => {
      expect(screen.getByText('Ready')).toBeVisible();
    });

    expect(screen.getByText('Standalone.cbz')).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Group chapters into volumes' })).toBeDisabled();
    expect(
      screen.getByText('A CBZ is already one volume, so there is nothing to join.'),
    ).toBeVisible();
    // A CBZ has no volumes to edit.
    expect(
      screen.queryByRole('button', { name: 'Edit volumes for Standalone.cbz' }),
    ).not.toBeInTheDocument();

    expectNoOutputFolderPicker();
    await user.click(await runButton(1));
    expect(await screen.findByRole('heading', { name: '1 book ready' })).toBeVisible();
    expect(convert.mock.calls[0]?.[0]).toMatchObject({
      sessionId: 'cbz-session',
      mode: 'convert-only',
      format: 'epub',
    });
    expect(convert.mock.calls[0]?.[0].mapping).toBeUndefined();
  });

  it('keeps actionable failures persistent with collapsed technical details', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        chooseInputs: () =>
          Promise.resolve({
            ok: false,
            error: {
              code: 'input_read_failed',
              message: 'Couldn’t read the selected folder.',
              issue: {
                tool: 'mangabind',
                severity: 'error',
                code: 'input_read_failed',
                stage: 'scan',
                recoverable: true,
                message: 'Couldn’t read the selected folder.',
                diagnostic: 'permission denied at C:\\input',
              },
            },
          }),
      }),
    );
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Folder' }));

    expect(screen.getByRole('alert', { name: 'Workflow error' })).toHaveTextContent(
      'Couldn’t read the selected folder.',
    );
    const details = screen.getByText('Technical details').closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(details).toHaveTextContent('permission denied');
  });

  it('shows which item is running and how far it is, and offers cancellation', async () => {
    const user = userEvent.setup();
    const cancelConversion = vi.fn<MangaboundBridge['cancelConversion']>(() =>
      Promise.resolve({ ok: true, value: undefined }),
    );
    const convert = vi.fn<MangaboundBridge['convert']>(() => new Promise(() => undefined));
    let emit: (progress: ConversionProgressPayload) => void = () => undefined;
    installBridge(
      bridge({
        cancelConversion,
        convert,
        onConversionProgress: (listener) => {
          emit = listener;
          return () => undefined;
        },
      }),
    );
    render(<App />);

    await addFolder(user);
    expectNoOutputFolderPicker();
    await user.click(await runButton(1));

    expect(await screen.findByRole('heading', { name: 'Converting Offline Work' })).toBeVisible();
    expect(screen.getByText('Item 1 of 1')).toBeVisible();
    const jobId = convert.mock.calls[0]?.[0].jobId ?? '';
    act(() => {
      // Updates for another job are not this run's business.
      emit({ jobId: 'someone-else', stage: 'processing', message: 'Elsewhere.' });
      emit({
        jobId,
        stage: 'processing',
        message: 'Processed page 3 of 10.',
        completed: 3,
        total: 10,
      });
    });
    expect(await screen.findByText('Processed page 3 of 10.')).toBeVisible();
    expect(screen.getByRole('progressbar', { name: '30% complete' })).toBeVisible();
    expect(screen.queryByText('Elsewhere.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel conversion' }));
    expect(cancelConversion).toHaveBeenCalledWith(jobId);
  });

  it('shows what a job reports before the screen has been drawn again for it', async () => {
    const user = userEvent.setup();
    let emit: (progress: ConversionProgressPayload) => void = () => undefined;
    // The tool's first word arrives while the call is being made, ahead of the render that follows
    // the item starting: it belongs to the run all the same.
    const convert = vi.fn<MangaboundBridge['convert']>((command) => {
      act(() => {
        emit({ jobId: command.jobId, stage: 'processing', message: 'Opened the first chapter.' });
      });
      return new Promise(() => undefined);
    });
    installBridge(
      bridge({
        convert,
        onConversionProgress: (listener) => {
          emit = listener;
          return () => undefined;
        },
      }),
    );
    render(<App />);
    await addFolder(user);

    await user.click(await runButton(1));

    expect(await screen.findByText('Opened the first chapter.')).toBeVisible();
  });

  it('says why an item was not added and lets the message be dismissed', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        chooseInputs: () =>
          Promise.resolve({
            ok: true,
            value: {
              inputs: [],
              rejected: [
                { name: 'notes.txt', reason: 'Only folders and .cbz files can be added.' },
              ],
            },
          }),
      }),
    );
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Files' }));

    expect(await screen.findByText(/was not added\. Only folders and \.cbz files/u)).toBeVisible();
    expect(screen.getByText('notes.txt')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Dismiss this message' }));
    expect(screen.queryByText('notes.txt')).not.toBeInTheDocument();
  });

  it('says when an item cannot be read, keeps it out of the run and lets it be removed', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        inspectInput: () =>
          Promise.resolve({
            ok: false,
            error: { code: 'input_read_failed', message: 'The folder could not be read.' },
          }),
      }),
    );
    render(<App />);

    await addFolder(user);

    expect(screen.getByText('Could not read')).toBeVisible();
    expect(screen.getByText('The folder could not be read.')).toBeVisible();
    expectNoOutputFolderPicker();
    expect(screen.getByRole('button', { name: 'Process' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Remove Offline Work' }));
    expect(screen.queryByRole('list', { name: 'Queued items' })).not.toBeInTheDocument();
  });

  it('releases what an item held when it is removed while the tools were still reading it', async () => {
    const user = userEvent.setup();
    const reading = deferred<WorkflowResult<InspectedInputPayload>>();
    const releaseInput = vi.fn<MangaboundBridge['releaseInput']>(() =>
      Promise.resolve({ ok: true, value: undefined }),
    );
    installBridge(bridge({ inspectInput: () => reading.promise, releaseInput }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Folder' }));
    expect(await screen.findByText('Checking…')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Remove Offline Work' }));
    expect(releaseInput).not.toHaveBeenCalled();

    await act(async () => {
      reading.resolve(inspection('selection'));
      await reading.promise;
    });
    await waitFor(() => {
      expect(releaseInput).toHaveBeenCalledWith('session');
    });
    expect(screen.queryByRole('list', { name: 'Queued items' })).not.toBeInTheDocument();
  });

  it('clears the whole queue and releases every session it held', async () => {
    const user = userEvent.setup();
    const releaseInput = vi.fn<MangaboundBridge['releaseInput']>(() =>
      Promise.resolve({ ok: true, value: undefined }),
    );
    installBridge(bridge({ releaseInput }));
    render(<App />);

    await addFolder(user);
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.queryByRole('list', { name: 'Queued items' })).not.toBeInTheDocument();
    expect(releaseInput).toHaveBeenCalledWith('session');
  });

  it('does not read the same folder twice when it is added again', async () => {
    const user = userEvent.setup();
    const inspectInput = vi.fn<MangaboundBridge['inspectInput']>((id) =>
      Promise.resolve(inspection(id)),
    );
    installBridge(bridge({ inspectInput }));
    render(<App />);

    await addFolder(user);
    await addFolder(user);

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(inspectInput).toHaveBeenCalledTimes(1);
  });

  it('adds what is dropped on the queue by way of the bridge, and ignores drops anywhere else', async () => {
    const registerDroppedFiles = vi.fn<MangaboundBridge['registerDroppedFiles']>(() =>
      Promise.resolve({
        ok: true,
        value: { inputs: [folder('Dropped Work', 'dropped')], rejected: [] },
      }),
    );
    installBridge(bridge({ registerDroppedFiles }));
    render(<App />);
    const target = await screen.findByTestId('drop-target');
    const dropped = new File(['x'], 'Dropped Work');

    // Dragging text or anything that is not a file does not light the target up.
    fireEvent.dragEnter(target, { dataTransfer: { types: ['text/plain'], files: [] } });
    expect(screen.queryByText('Release to add them')).not.toBeInTheDocument();

    fireEvent.dragEnter(target, { dataTransfer: { types: ['Files'], files: [dropped] } });
    expect(screen.getByText('Release to add them')).toBeVisible();
    fireEvent.dragOver(target, { dataTransfer: { types: ['Files'], files: [dropped] } });
    fireEvent.dragLeave(target);
    expect(screen.queryByText('Release to add them')).not.toBeInTheDocument();

    fireEvent.drop(target, { dataTransfer: { types: ['Files'], files: [dropped] } });
    await waitFor(() => {
      expect(registerDroppedFiles).toHaveBeenCalledWith([dropped]);
    });
    expect(await screen.findByText('Dropped Work')).toBeVisible();
    expect(screen.queryByText('Release to add them')).not.toBeInTheDocument();

    // A drop that carries no files registers nothing.
    fireEvent.drop(target, { dataTransfer: { types: [], files: [] } });
    expect(registerDroppedFiles).toHaveBeenCalledTimes(1);

    // Anywhere else in the window a drop is swallowed instead of navigating to the file.
    const stray = createEvent.drop(document.body);
    fireEvent(document.body, stray);
    expect(stray.defaultPrevented).toBe(true);
    const strayOver = createEvent.dragOver(document.body);
    fireEvent(document.body, strayOver);
    expect(strayOver.defaultPrevented).toBe(true);
  });

  it('adds nothing from a drop while the conversion tools are not ready', async () => {
    const registerDroppedFiles = vi.fn<MangaboundBridge['registerDroppedFiles']>(() =>
      Promise.resolve({ ok: true, value: { inputs: [folder()], rejected: [] } }),
    );
    installBridge(
      bridge({
        registerDroppedFiles,
        getToolchainStatus: () =>
          Promise.resolve({ state: 'blocked', tools: [], message: 'A tool failed verification.' }),
      }),
    );
    render(<App />);
    expect(await screen.findByText('Conversion tools need attention')).toBeVisible();
    const target = screen.getByTestId('drop-target');
    const file = new File(['x'], 'Work');

    fireEvent.dragEnter(target, { dataTransfer: { types: ['Files'], files: [file] } });
    fireEvent.dragOver(target, { dataTransfer: { types: ['Files'], files: [file] } });
    fireEvent.drop(target, { dataTransfer: { types: ['Files'], files: [file] } });

    expect(screen.queryByText('Release to add them')).not.toBeInTheDocument();
    expect(registerDroppedFiles).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Folder' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Files' })).toBeDisabled();
  });

  it('reports a failed drop registration', async () => {
    installBridge(
      bridge({
        registerDroppedFiles: () =>
          Promise.resolve({
            ok: false,
            error: { code: 'invalid_request', message: 'That drop could not be read.' },
          }),
      }),
    );
    render(<App />);

    fireEvent.drop(await screen.findByTestId('drop-target'), {
      dataTransfer: { types: ['Files'], files: [new File(['x'], 'Work')] },
    });

    expect(await screen.findByRole('alert', { name: 'Workflow error' })).toHaveTextContent(
      'That drop could not be read.',
    );
  });

  it('shows the conversion options for the whole queue and comes back to it', async () => {
    const user = userEvent.setup();
    installBridge(bridge());
    render(<App />);

    await addFolder(user);
    await user.click(screen.getByRole('button', { name: /Advanced conversion options/u }));
    expect(await screen.findByRole('heading', { name: 'Conversion options' })).toBeVisible();
    expect(screen.getByText(/Your choices are saved for next time\./u)).toBeVisible();

    await user.click(screen.getByRole('button', { name: /Back/u }));
    expect(await screen.findByRole('heading', { name: 'Queue' })).toBeVisible();
    expect(screen.getByText('Offline Work')).toBeVisible();
  });
});
