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
import { defaultPreferences } from '@/domain/preferences';
import { App } from '@/renderer/app';
import type { MangaboundBridge } from '@/shared/runtime-info';
import type { RestoredSettings } from '@/shared/settings-contract';
import type {
  ConversionProgressPayload,
  InspectedInputPayload,
  SelectedInput,
  WorkflowResult,
} from '@/shared/workflow-contract';

const readyToolchain = {
  state: 'ready' as const,
  target: 'win32-x64' as const,
  tools: [],
  message: 'Bundled conversion tools are verified and ready.',
};

const chapters = [
  { id: 'c1', name: 'Chapter 1', path: 'C:\\input\\Chapter 1', pageCount: 2, chapter: 1 },
  { id: 'c2', name: 'Chapter 2', path: 'C:\\input\\Chapter 2', pageCount: 2, chapter: 2 },
] as const;

/** Every chapter already has a volume, as mangabind leaves a folder named Vol.N Ch.N. */
const mapping = createMappingDraft({
  mangaTitle: 'Offline Work',
  chapters,
  volumes: [{ id: 'v1', number: '1', chapterIds: ['c1', 'c2'] }],
});

/** One chapter has no volume yet, so the folder needs a look before it can run. */
const partialMapping = createMappingDraft({
  mangaTitle: 'Offline Work',
  chapters,
  volumes: [{ id: 'v1', number: '1', chapterIds: ['c1'] }],
});

const folder = (name = 'Offline Work', id = 'selection'): SelectedInput => ({
  selectionId: id,
  displayName: name,
  displayPath: `C:\\input\\${name}`,
  kind: 'folder',
});

const cbz: SelectedInput = {
  selectionId: 'cbz-selection',
  displayName: 'Standalone.cbz',
  displayPath: 'C:\\input\\Standalone.cbz',
  kind: 'cbz',
};

function inspection(id: string): WorkflowResult<InspectedInputPayload> {
  return id === cbz.selectionId
    ? {
        ok: true,
        value: { sessionId: 'cbz-session', displayName: cbz.displayName, kind: 'cbz', issues: [] },
      }
    : {
        ok: true,
        value: {
          sessionId: id === 'selection' ? 'session' : `session-${id}`,
          displayName: 'Offline Work',
          kind: 'folder',
          mapping,
          issues: [],
        },
      };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function bridge(overrides: Partial<MangaboundBridge> = {}): MangaboundBridge {
  return {
    runtime: { electron: '44.3.0', platform: 'win32' },
    getToolchainStatus: () => Promise.resolve(readyToolchain),
    chooseInputs: () => Promise.resolve({ ok: true, value: { inputs: [folder()], rejected: [] } }),
    registerDroppedFiles: () =>
      Promise.resolve({ ok: true, value: { inputs: [folder()], rejected: [] } }),
    inspectInput: (id) => Promise.resolve(inspection(id)),
    releaseInput: () => Promise.resolve({ ok: true, value: undefined }),
    chooseLibrary: () =>
      Promise.resolve({
        ok: true,
        value: { libraryId: 'library', displayPath: 'C:\\Books' },
      }),
    getDeviceProfiles: () =>
      Promise.resolve({
        ok: true,
        value: [
          {
            code: 'KV',
            name: 'Kindle Voyage',
            width: 1072,
            height: 1448,
            grayLevels: 16,
            family: 'kindle',
          },
        ],
      }),
    convert: () =>
      Promise.resolve({
        ok: true,
        value: [{ id: 'artifact', name: 'Offline Work.epub', bytes: 2048, format: 'epub' }],
      }),
    planConversion: () =>
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
    cancelConversion: () => Promise.resolve({ ok: true, value: undefined }),
    planLibrary: () => Promise.resolve({ ok: true, value: { titles: [], issues: [] } }),
    writeTitleMapping: () => Promise.resolve({ ok: true, value: undefined }),
    convertLibrary: () => Promise.resolve({ ok: true, value: [] }),
    listMetadataProviders: () => Promise.resolve({ ok: true, value: [] }),
    searchMetadata: () => Promise.resolve({ ok: true, value: [] }),
    suggestVolumes: () => Promise.resolve({ ok: true, value: { volumes: [] } }),
    openProviderHomepage: () => Promise.resolve({ ok: true, value: undefined }),
    openArtifact: () => Promise.resolve({ ok: true, value: undefined }),
    showArtifactInFolder: () => Promise.resolve({ ok: true, value: undefined }),
    onConversionProgress: () => () => undefined,
    listNetworkInterfaces: () => Promise.resolve({ ok: true, value: [] }),
    startSharing: () =>
      Promise.resolve({ ok: true, value: { active: true, authMode: 'token' as const } }),
    stopSharing: () => Promise.resolve({ ok: true, value: undefined }),
    getSharingStatus: () => Promise.resolve({ ok: true, value: { active: false } }),
    loadSettings: () =>
      Promise.resolve({ ok: true, value: { preferences: defaultPreferences, notices: [] } }),
    saveSettings: () => Promise.resolve({ ok: true, value: undefined }),
    ...overrides,
  };
}

/** A bridge that hands back these settings, as if they had been kept from the last session. */
const keptSettings =
  (kept: Partial<RestoredSettings>): MangaboundBridge['loadSettings'] =>
  () =>
    Promise.resolve({
      ok: true,
      value: { preferences: defaultPreferences, notices: [], ...kept },
    });

function installBridge(value: MangaboundBridge): void {
  Object.defineProperty(window, 'mangabound', { configurable: true, value });
}

afterEach(() => {
  Reflect.deleteProperty(window, 'mangabound');
});

/** Adds what the bridge's dialog returns and waits until the tools have read every row. */
async function addFolder(user: UserEvent): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Folder' }));
  await waitFor(() => {
    expect(screen.queryByText('Checking…')).not.toBeInTheDocument();
  });
}

async function chooseOutputFolder(user: UserEvent): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Choose output folder' }));
  expect(await screen.findByText('C:\\Books')).toBeVisible();
}

const runButton = (label: string): Promise<HTMLElement> =>
  screen.findByRole('button', { name: label });

describe('queue application workflow', () => {
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
    // Nothing to run and nowhere to put it yet.
    expect(screen.getByRole('button', { name: 'Convert' })).toBeDisabled();
    await waitFor(() => {
      expect(screen.getByLabelText('Device')).toHaveValue('KV');
    });

    await addFolder(user);
    const list = screen.getByRole('list', { name: 'Queued items' });
    expect(within(list).getByText('Offline Work')).toBeVisible();
    expect(within(list).getByText('1 volume')).toBeVisible();
    expect(screen.getByText('Choose an output folder to continue.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Convert 1 item' })).toBeDisabled();

    await chooseOutputFolder(user);
    await user.click(await runButton('Convert 1 item'));

    expect(await screen.findByRole('heading', { name: '1 book saved' })).toBeVisible();
    expect(screen.getByText('Kindle Voyage · EPUB · C:\\Books')).toBeVisible();
    expect(convert.mock.calls[0]?.[0]).toMatchObject({
      sessionId: 'session',
      libraryId: 'library',
      mode: 'bind-and-convert',
      settings: defaultMangapressSettings,
      format: 'epub',
      mapping,
    });
    await user.click(screen.getByRole('button', { name: 'Open Offline Work.epub' }));
    await user.click(screen.getByRole('button', { name: 'Show Offline Work.epub in its folder' }));
    expect(openArtifact).toHaveBeenCalledWith('artifact');
    expect(showArtifactInFolder).toHaveBeenCalledWith('artifact');

    await user.click(screen.getByRole('button', { name: 'Convert more' }));
    expect(await screen.findByRole('heading', { name: 'Queue' })).toBeVisible();
    // What was saved leaves the queue, and its scratch copy is released.
    expect(screen.queryByRole('list', { name: 'Queued items' })).not.toBeInTheDocument();
    expect(releaseInput).toHaveBeenCalledWith('session');
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
    await chooseOutputFolder(user);
    await user.click(screen.getByRole('button', { name: 'Validate plan' }));

    expect(await screen.findByRole('heading', { name: 'Plan validated' })).toBeVisible();
    expect(screen.getByText('Offline Work - Vol.01.cbz')).toBeVisible();
    expect(screen.getByText('No library files were written.')).toBeVisible();
    expect(planConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session',
        libraryId: 'library',
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
    await chooseOutputFolder(user);
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
    await chooseOutputFolder(user);
    expect(screen.getByText('Needs volumes')).toBeVisible();
    expect(screen.getByText(/1 chapter still has no volume/u)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Convert' })).toBeDisabled();
    expect(screen.getByText('Nothing here can run yet.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Edit volumes for Offline Work' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm mapping' }));

    // Accepting the gap is a decision, so the folder runs with the chapter left out.
    expect(await screen.findByText('1 volume')).toBeVisible();
    expect(screen.getByText('1 chapter left out.')).toBeVisible();
    await user.click(await runButton('Convert 1 item'));
    expect(await screen.findByRole('heading', { name: '1 book saved' })).toBeVisible();
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

    await chooseOutputFolder(user);
    await user.click(await runButton('Convert 1 item'));
    expect(await screen.findByRole('heading', { name: '1 book saved' })).toBeVisible();
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
    await chooseOutputFolder(user);
    await user.click(await runButton('Convert 1 item'));

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
    await chooseOutputFolder(user);
    expect(screen.getByRole('button', { name: 'Convert' })).toBeDisabled();

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

  it('shows the mangapress options for the whole queue and comes back to it', async () => {
    const user = userEvent.setup();
    installBridge(bridge());
    render(<App />);

    await addFolder(user);
    await user.click(screen.getByRole('button', { name: /mangapress options/u }));
    expect(await screen.findByRole('heading', { name: 'mangapress options' })).toBeVisible();
    expect(
      screen.getByText(/They apply to everything in the queue, and are kept for next time\./u),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: /Back/u }));
    expect(await screen.findByRole('heading', { name: 'Queue' })).toBeVisible();
    expect(screen.getByText('Offline Work')).toBeVisible();
  });
});

describe('the options a run starts with', () => {
  const scribe = {
    code: 'KS',
    name: 'Kindle Scribe 1/2',
    width: 1860,
    height: 2480,
    grayLevels: 16,
    family: 'kindle',
  };
  const voyage = {
    code: 'KV',
    name: 'Kindle Voyage',
    width: 1072,
    height: 1448,
    grayLevels: 16,
    family: 'kindle',
  };

  it('sends what Kindle Comic Converter has on, and takes upscaling from the device chosen', async () => {
    const user = userEvent.setup();
    const convert = vi.fn<MangaboundBridge['convert']>(() =>
      Promise.resolve({
        ok: true,
        value: [{ id: 'a1', name: 'Offline Work.epub', bytes: 2048, format: 'epub' }],
      }),
    );
    // Every pick registers under an id of its own, so the second add is a new item.
    const chooseInputs = vi
      .fn<MangaboundBridge['chooseInputs']>()
      .mockResolvedValueOnce({ ok: true, value: { inputs: [folder()], rejected: [] } })
      .mockResolvedValueOnce({
        ok: true,
        value: { inputs: [folder('Offline Work', 'selection-2')], rejected: [] },
      });
    installBridge(
      bridge({
        chooseInputs,
        convert,
        getDeviceProfiles: () => Promise.resolve({ ok: true, value: [voyage, scribe] }),
      }),
    );
    render(<App />);
    await addFolder(user);
    await chooseOutputFolder(user);

    // Nothing has been touched: manga order, both spread modes and upscaling are on.
    await user.click(await runButton('Convert 1 item'));
    await screen.findByRole('heading', { name: '1 book saved' });
    expect(convert.mock.calls[0]?.[0].settings).toMatchObject({
      deviceProfile: 'KV',
      mangaStyle: true,
      splitter: 'both',
      upscale: true,
    });

    // A Scribe starts without upscaling, and the rest stays as it was.
    await user.click(screen.getByRole('button', { name: 'Convert more' }));
    await addFolder(user);
    await user.selectOptions(screen.getByLabelText('Device'), 'KS');
    await user.click(await runButton('Convert 1 item'));
    await screen.findByRole('heading', { name: '1 book saved' });
    expect(convert.mock.calls[1]?.[0].settings).toMatchObject({
      deviceProfile: 'KS',
      mangaStyle: true,
      splitter: 'both',
      upscale: false,
    });
  });

  it('starts from the first device on offer, with its own upscaling, when the default one is missing', async () => {
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
        getDeviceProfiles: () => Promise.resolve({ ok: true, value: [scribe] }),
      }),
    );
    render(<App />);
    await waitFor(() => {
      expect(screen.getByLabelText('Device')).toHaveValue('KS');
    });
    expect(
      screen.getByText('The device profile KV is not available, so Kindle Scribe 1/2 is selected.'),
    ).toBeVisible();
    await addFolder(user);
    await chooseOutputFolder(user);

    await user.click(await runButton('Convert 1 item'));

    await screen.findByRole('heading', { name: '1 book saved' });
    expect(convert.mock.calls[0]?.[0].settings).toMatchObject({
      deviceProfile: 'KS',
      upscale: false,
    });
  });
});

describe('the options kept between sessions', () => {
  const scribe = {
    code: 'KS',
    name: 'Kindle Scribe 1/2',
    width: 1860,
    height: 2480,
    grayLevels: 16,
    family: 'kindle',
  };
  const voyage = {
    code: 'KV',
    name: 'Kindle Voyage',
    width: 1072,
    height: 1448,
    grayLevels: 16,
    family: 'kindle',
  };
  const twoDevices = (): MangaboundBridge['getDeviceProfiles'] => () =>
    Promise.resolve({ ok: true, value: [voyage, scribe] });
  const savedFolder = { libraryId: 'saved-library', displayPath: 'D:\\Manga\\Saved' };

  const saveCalls = (
    saveSettings: ReturnType<typeof vi.fn<MangaboundBridge['saveSettings']>>,
  ): readonly Parameters<MangaboundBridge['saveSettings']>[0][] =>
    saveSettings.mock.calls.map(([command]) => command);

  const okSave = (): ReturnType<typeof vi.fn<MangaboundBridge['saveSettings']>> =>
    vi.fn<MangaboundBridge['saveSettings']>(() => Promise.resolve({ ok: true, value: undefined }));

  it('opens as it was left: the steps, device, format, options and output folder', async () => {
    installBridge(
      bridge({
        getDeviceProfiles: twoDevices(),
        loadSettings: keptSettings({
          preferences: {
            mode: 'convert-only',
            format: 'pdf',
            settings: { ...defaultMangapressSettings, deviceProfile: 'KS', upscale: false },
          },
          library: savedFolder,
        }),
      }),
    );
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText('Device')).toHaveValue('KS');
    });
    expect(screen.getByRole('radio', { name: 'PDF' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Group chapters into volumes' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Convert for e-reader' })).toBeChecked();
    expect(screen.getByText('D:\\Manga\\Saved')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Change output folder' })).toBeVisible();
    // Nothing went wrong, so nothing is said.
    expect(screen.queryByRole('status', { name: 'Notices' })).not.toBeInTheDocument();
  });

  it('keeps each change, without the title and author, and names the folder by its id', async () => {
    const user = userEvent.setup();
    const saveSettings = okSave();
    installBridge(bridge({ saveSettings, getDeviceProfiles: twoDevices() }));
    render(<App />);
    await screen.findByRole('heading', { name: 'Queue' });
    await waitFor(() => {
      expect(screen.getByLabelText('Device')).toHaveValue('KV');
    });
    // Opening the app changes nothing, so nothing is written.
    expect(saveSettings).not.toHaveBeenCalled();

    await chooseOutputFolder(user);
    await user.click(screen.getByRole('radio', { name: 'PDF' }));
    await user.click(screen.getByRole('button', { name: /mangapress options/u }));
    await user.type(await screen.findByLabelText('Title'), 'Only for this book');

    await waitFor(() => {
      const last = saveCalls(saveSettings).at(-1);
      expect(last).toEqual({
        preferences: {
          mode: 'bind-and-convert',
          format: 'pdf',
          settings: defaultMangapressSettings,
        },
        libraryId: 'library',
      });
    });
    // A title belongs to one book: it is on screen but is not among what is kept.
    expect(screen.getByLabelText('Title')).toHaveValue('Only for this book');
    for (const command of saveCalls(saveSettings)) {
      expect(command.preferences.settings).not.toHaveProperty('title');
    }
  });

  it('keeps the source that was chosen, and forgets one the list no longer has', async () => {
    const user = userEvent.setup();
    const saveSettings = okSave();
    const mangaDex = {
      id: 'mangadex',
      displayName: 'MangaDex',
      homepage: 'https://mangadex.org',
      description: 'Community catalogue of manga, with volume and chapter data',
    };
    installBridge(
      bridge({
        saveSettings,
        listMetadataProviders: () => Promise.resolve({ ok: true, value: [mangaDex] }),
        loadSettings: keptSettings({
          preferences: { ...defaultPreferences, providerId: 'removed-in-an-update' },
        }),
      }),
    );
    render(<App />);
    await addFolder(user);
    await user.click(screen.getByRole('button', { name: 'Edit volumes for Offline Work' }));
    await user.click(await screen.findByRole('tab', { name: 'Online source' }));

    // The saved id is not in the list, so nothing is chosen.
    expect(screen.getByRole('combobox', { name: 'Source' })).toHaveTextContent('Select a source');
    await user.click(screen.getByRole('combobox', { name: 'Source' }));
    await user.click(screen.getByRole('option', { name: /MangaDex/u }));

    await waitFor(() => {
      expect(saveCalls(saveSettings).at(-1)?.preferences.providerId).toBe('mangadex');
    });
  });

  it('starts with the source that was kept, when the list has it', async () => {
    const user = userEvent.setup();
    const mangaDex = {
      id: 'mangadex',
      displayName: 'MangaDex',
      homepage: 'https://mangadex.org',
      description: 'Community catalogue of manga, with volume and chapter data',
    };
    installBridge(
      bridge({
        listMetadataProviders: () => Promise.resolve({ ok: true, value: [mangaDex] }),
        loadSettings: keptSettings({
          preferences: { ...defaultPreferences, providerId: 'mangadex' },
        }),
      }),
    );
    render(<App />);
    await addFolder(user);
    await user.click(screen.getByRole('button', { name: 'Edit volumes for Offline Work' }));
    await user.click(await screen.findByRole('tab', { name: 'Online source' }));

    expect(screen.getByRole('combobox', { name: 'Source' })).toHaveTextContent('MangaDex');
  });

  it('saves nothing until what was kept has been read', async () => {
    const user = userEvent.setup();
    const saveSettings = okSave();
    let release: (result: Awaited<ReturnType<MangaboundBridge['loadSettings']>>) => void = () =>
      undefined;
    installBridge(
      bridge({
        saveSettings,
        loadSettings: () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      }),
    );
    render(<App />);
    await screen.findByRole('heading', { name: 'Queue' });
    // The defaults on screen must not be written over what is still being read.
    expect(saveSettings).not.toHaveBeenCalled();

    act(() => {
      release({
        ok: true,
        value: {
          preferences: { ...defaultPreferences, format: 'cbz' },
          notices: [],
        },
      });
    });
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'CBZ' })).toBeChecked();
    });
    // What was read is what is kept already, so reading it writes nothing.
    expect(saveSettings).not.toHaveBeenCalled();

    await user.click(screen.getByRole('radio', { name: 'PDF' }));
    await waitFor(() => {
      expect(saveCalls(saveSettings)).toEqual([
        { preferences: { ...defaultPreferences, format: 'pdf' } },
      ]);
    });
  });

  it.each([
    [
      'answers with a failure',
      () => Promise.resolve({ ok: false as const, error: { code: 'x', message: 'no' } }),
    ],
    ['is rejected', () => Promise.reject(new Error('the bridge is gone'))],
  ])('saves nothing, and says so, when reading what was kept %s', async (_name, loadSettings) => {
    const user = userEvent.setup();
    const saveSettings = okSave();
    installBridge(bridge({ saveSettings, loadSettings }));
    render(<App />);

    expect(await screen.findByText('The saved settings could not be loaded.')).toBeVisible();
    await user.click(screen.getByRole('radio', { name: 'PDF' }));
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('says what could not be restored, until it is dismissed', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        loadSettings: keptSettings({
          notices: [
            'The saved settings could not be read, so the defaults are in use.',
            'The output folder D:\\Gone is not available. Choose another to save to.',
          ],
        }),
      }),
    );
    render(<App />);

    const notices = await screen.findByRole('status', { name: 'Notices' });
    expect(within(notices).getAllByRole('listitem')).toHaveLength(2);
    expect(notices).toHaveTextContent('The saved settings could not be read');
    expect(notices).toHaveTextContent('D:\\Gone is not available');

    await user.click(screen.getByRole('button', { name: 'Dismiss these notices' }));
    expect(screen.queryByRole('status', { name: 'Notices' })).not.toBeInTheDocument();
  });

  it('uses a device the tools still list when the kept one is gone, and says so', async () => {
    const saveSettings = okSave();
    installBridge(
      bridge({
        saveSettings,
        getDeviceProfiles: twoDevices(),
        loadSettings: keptSettings({
          preferences: {
            ...defaultPreferences,
            settings: { ...defaultMangapressSettings, deviceProfile: 'K999' },
          },
        }),
      }),
    );
    render(<App />);

    expect(
      await screen.findByText(
        'The device profile K999 is not available, so Kindle Voyage is selected.',
      ),
    ).toBeVisible();
    expect(screen.getByLabelText('Device')).toHaveValue('KV');
    await waitFor(() => {
      expect(saveCalls(saveSettings).at(-1)?.preferences.settings.deviceProfile).toBe('KV');
    });
  });

  it('tries a save again with the next change after one failed', async () => {
    const user = userEvent.setup();
    const saveSettings = vi
      .fn<MangaboundBridge['saveSettings']>()
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'settings_save_failed', message: 'Your settings could not be saved.' },
      })
      .mockResolvedValue({ ok: true, value: undefined });
    installBridge(bridge({ saveSettings }));
    render(<App />);
    await screen.findByRole('heading', { name: 'Queue' });

    await user.click(screen.getByRole('radio', { name: 'PDF' }));
    expect(await screen.findByText('Your settings could not be saved.')).toBeVisible();
    await user.click(screen.getByRole('radio', { name: 'CBZ' }));

    await waitFor(() => {
      expect(saveSettings).toHaveBeenCalledTimes(2);
    });
    expect(saveCalls(saveSettings).at(-1)?.preferences.format).toBe('cbz');
  });

  it.each([
    [
      'refuses',
      () =>
        Promise.resolve({
          ok: false as const,
          error: { code: 'settings_save_failed', message: 'Your settings could not be saved.' },
        }),
      'Your settings could not be saved.',
    ],
    [
      'is rejected',
      () => Promise.reject(new Error('the bridge is gone')),
      'The settings could not be saved.',
    ],
  ])('says so when saving %s', async (_name, saveSettings, message) => {
    const user = userEvent.setup();
    installBridge(bridge({ saveSettings }));
    render(<App />);
    await screen.findByRole('heading', { name: 'Queue' });

    await user.click(screen.getByRole('radio', { name: 'PDF' }));

    expect(await screen.findByText(message)).toBeVisible();
  });

  it('does not keep an option while it is half typed, and keeps it once it is valid', async () => {
    const user = userEvent.setup();
    const saveSettings = okSave();
    installBridge(bridge({ saveSettings }));
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /mangapress options/u }));

    const quality = await screen.findByLabelText(/JPEG quality/u);
    await user.type(quality, '500');
    await user.clear(quality);
    await user.type(quality, '80');

    await waitFor(() => {
      expect(saveCalls(saveSettings).at(-1)?.preferences.settings.jpegQuality).toBe(80);
    });
    // 500 is out of range, so it was never written; the 5 and the 50 on the way to it were.
    expect(
      saveCalls(saveSettings).some((command) => command.preferences.settings.jpegQuality === 500),
    ).toBe(false);
  });

  describe('putting the options back to their defaults', () => {
    async function changeEverything(user: UserEvent): Promise<void> {
      await user.selectOptions(await screen.findByLabelText('Device'), 'KS');
      await user.click(screen.getByRole('radio', { name: 'PDF' }));
      await user.click(screen.getByRole('checkbox', { name: 'Group chapters into volumes' }));
    }

    it('is dimmed while every option is at its default, and does nothing', async () => {
      const user = userEvent.setup();
      installBridge(bridge());
      render(<App />);

      const reset = await screen.findByRole('button', { name: 'Reset to defaults' });
      expect(reset).toHaveAttribute('aria-disabled', 'true');
      expect(reset).toHaveAccessibleDescription('Every option is already at its default.');
      await user.click(reset);
      expect(screen.queryByRole('group', { name: 'Confirm reset' })).not.toBeInTheDocument();
    });

    it('puts the steps, device, format and options back, keeps the folder, and saves that', async () => {
      const user = userEvent.setup();
      const saveSettings = okSave();
      installBridge(
        bridge({
          saveSettings,
          getDeviceProfiles: twoDevices(),
          loadSettings: keptSettings({ library: savedFolder }),
        }),
      );
      render(<App />);
      await changeEverything(user);
      expect(screen.getByLabelText('Device')).toHaveValue('KS');

      await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
      const confirm = screen.getByRole('group', { name: 'Confirm reset' });
      expect(confirm).toHaveTextContent(
        'Put the steps, device, format and every mangapress option back to their defaults?',
      );
      await user.click(within(confirm).getByRole('button', { name: 'Reset' }));

      expect(screen.getByLabelText('Device')).toHaveValue('KV');
      expect(screen.getByRole('radio', { name: 'EPUB' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Group chapters into volumes' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Convert for e-reader' })).toBeChecked();
      // A place is not an option: the folder stays.
      expect(screen.getByText('D:\\Manga\\Saved')).toBeVisible();
      expect(screen.queryByRole('group', { name: 'Confirm reset' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reset to defaults' })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      await waitFor(() => {
        expect(saveCalls(saveSettings).at(-1)).toEqual({
          preferences: defaultPreferences,
          libraryId: 'saved-library',
        });
      });
    });

    it('changes nothing when the second click is a cancel', async () => {
      const user = userEvent.setup();
      installBridge(bridge({ getDeviceProfiles: twoDevices() }));
      render(<App />);
      await changeEverything(user);

      await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
      await user.click(
        within(screen.getByRole('group', { name: 'Confirm reset' })).getByRole('button', {
          name: 'Cancel',
        }),
      );

      expect(screen.queryByRole('group', { name: 'Confirm reset' })).not.toBeInTheDocument();
      expect(screen.getByLabelText('Device')).toHaveValue('KS');
      expect(screen.getByRole('radio', { name: 'PDF' })).toBeChecked();
    });

    it('resets only what the options screen holds when it is used there', async () => {
      const user = userEvent.setup();
      installBridge(bridge({ getDeviceProfiles: twoDevices() }));
      render(<App />);
      await changeEverything(user);
      await user.click(screen.getByRole('button', { name: /mangapress options/u }));
      await screen.findByRole('heading', { name: 'mangapress options' });
      expect(screen.getByLabelText('Device profile')).toHaveValue('KS');

      await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
      const confirm = screen.getByRole('group', { name: 'Confirm reset' });
      expect(confirm).toHaveTextContent(
        'Put the device, format and every mangapress option back to their defaults?',
      );
      await user.click(within(confirm).getByRole('button', { name: 'Reset' }));

      expect(screen.getByLabelText('Device profile')).toHaveValue('KV');
      expect(screen.getByLabelText('Book format')).toHaveValue('epub');
      await user.click(screen.getByRole('button', { name: 'Back' }));
      // The steps are not on that screen, so they stay as they were set.
      expect(
        await screen.findByRole('checkbox', { name: 'Group chapters into volumes' }),
      ).not.toBeChecked();
    });
  });
});

describe('process control in the queue', () => {
  it('joins the volumes only: mangapress is not run, its controls lock, and only defaults are sent', async () => {
    const user = userEvent.setup();
    const convert = vi.fn<MangaboundBridge['convert']>(() =>
      Promise.resolve({
        ok: true,
        value: [{ id: 'a1', name: 'Offline Work - Vol.01.cbz', bytes: 4096, format: 'cbz' }],
      }),
    );
    installBridge(bridge({ convert }));
    render(<App />);
    await addFolder(user);
    await user.click(screen.getByRole('radio', { name: 'PDF' }));

    await user.click(screen.getByRole('checkbox', { name: 'Convert for e-reader' }));

    expect(screen.getByLabelText('Device')).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'PDF' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /mangapress options/u })).not.toBeInTheDocument();
    await chooseOutputFolder(user);
    await user.click(await runButton('Join 1 item'));

    expect(await screen.findByRole('heading', { name: '1 book saved' })).toBeVisible();
    expect(screen.getByText('Joined volumes · CBZ · C:\\Books')).toBeVisible();
    // The PDF choice was for mangapress, which did not run.
    expect(convert.mock.calls[0]?.[0]).toMatchObject({
      sessionId: 'session',
      libraryId: 'library',
      mode: 'bind-only',
      settings: defaultMangapressSettings,
      format: 'cbz',
      mapping,
    });
  });

  it('sends a folder straight to mangapress as one book, without its volumes', async () => {
    const user = userEvent.setup();
    const planConversion = vi.fn<MangaboundBridge['planConversion']>(() =>
      Promise.resolve({
        ok: true,
        value: {
          tool: 'mangapress',
          title: 'Offline Work',
          message: 'mangapress validated KV',
          books: [{ name: 'Offline Work.epub', pageCount: 4 }],
          issues: [],
        },
      }),
    );
    const convert = vi.fn<MangaboundBridge['convert']>(() =>
      Promise.resolve({
        ok: true,
        value: [{ id: 'a1', name: 'Offline Work.epub', bytes: 2048, format: 'epub' }],
      }),
    );
    installBridge(bridge({ convert, planConversion }));
    render(<App />);
    await addFolder(user);

    await user.click(screen.getByRole('checkbox', { name: 'Group chapters into volumes' }));

    expect(screen.getByText('One book')).toBeVisible();
    expect(screen.getByText(/2 chapters · not grouped/u)).toBeVisible();
    // No volumes are in play, so there is nothing to edit.
    expect(
      screen.queryByRole('button', { name: 'Edit volumes for Offline Work' }),
    ).not.toBeInTheDocument();

    await chooseOutputFolder(user);
    await user.click(screen.getByRole('button', { name: 'Validate plan' }));
    expect(await screen.findByRole('heading', { name: 'Plan validated' })).toBeVisible();
    expect(planConversion.mock.calls[0]?.[0]).toMatchObject({ mode: 'convert-only' });
    expect(planConversion.mock.calls[0]?.[0].mapping).toBeUndefined();

    await user.click(await runButton('Convert 1 item'));
    expect(await screen.findByRole('heading', { name: '1 book saved' })).toBeVisible();
    expect(convert.mock.calls[0]?.[0]).toMatchObject({
      mode: 'convert-only',
      settings: defaultMangapressSettings,
      format: 'epub',
    });
    expect(convert.mock.calls[0]?.[0].mapping).toBeUndefined();
  });

  it('skips grouping from the editor, which sends the queue straight to mangapress', async () => {
    const user = userEvent.setup();
    installBridge(bridge());
    render(<App />);
    await addFolder(user);

    await user.click(screen.getByRole('button', { name: 'Edit volumes for Offline Work' }));
    await user.click(await screen.findByRole('button', { name: 'Skip grouping' }));

    expect(await screen.findByRole('heading', { name: 'Queue' })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Group chapters into volumes' })).not.toBeChecked();
    expect(screen.getByText('One book')).toBeVisible();
  });

  it('leaves a CBZ out of a join-only run and says so, with nothing to fix', async () => {
    const user = userEvent.setup();
    const convert = vi.fn<MangaboundBridge['convert']>(() =>
      Promise.resolve({
        ok: true,
        value: [{ id: 'a1', name: 'Offline Work - Vol.01.cbz', bytes: 4096, format: 'cbz' }],
      }),
    );
    installBridge(
      bridge({
        convert,
        chooseInputs: () =>
          Promise.resolve({ ok: true, value: { inputs: [folder(), cbz], rejected: [] } }),
      }),
    );
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Folder' }));
    await waitFor(() => {
      expect(screen.queryByText('Checking…')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('checkbox', { name: 'Convert for e-reader' }));
    expect(screen.getByText('Nothing to join')).toBeVisible();
    await chooseOutputFolder(user);
    expect(
      screen.getByText('1 item will be left out. Use the pencil on a row to fix it.'),
    ).toBeVisible();
    await user.click(await runButton('Join 1 item'));

    expect(await screen.findByRole('heading', { name: '1 book saved' })).toBeVisible();
    expect(convert).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Standalone.cbz was skipped')).toBeVisible();
    expect(
      screen.getByText('A CBZ is already one volume, so there is nothing to join.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Fix Standalone.cbz' })).not.toBeInTheDocument();
    // The CBZ stays in the queue: it was not processed.
    await user.click(screen.getByRole('button', { name: 'Convert more' }));
    expect(screen.getByText('Standalone.cbz')).toBeVisible();
    expect(screen.queryByText('Offline Work')).not.toBeInTheDocument();
  });

  it('runs the queue one item at a time and keeps the ones that failed for another try', async () => {
    const user = userEvent.setup();
    const convert = vi
      .fn<MangaboundBridge['convert']>()
      .mockResolvedValueOnce({
        ok: true,
        value: [{ id: 'a1', name: 'First.epub', bytes: 2048, format: 'epub' }],
      })
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'process_failed', message: 'mangapress crashed.' },
      });
    installBridge(
      bridge({
        convert,
        chooseInputs: () =>
          Promise.resolve({
            ok: true,
            value: {
              inputs: [folder('First', 'first'), folder('Second', 'second')],
              rejected: [],
            },
          }),
      }),
    );
    render(<App />);
    await addFolder(user);
    await chooseOutputFolder(user);

    await user.click(await runButton('Convert 2 items'));

    expect(await screen.findByRole('heading', { name: '1 book saved' })).toBeVisible();
    expect(convert.mock.calls.map(([command]) => command.sessionId)).toEqual([
      'session-first',
      'session-second',
    ]);
    expect(screen.getByText('Second could not be converted')).toBeVisible();
    expect(screen.getByText('mangapress crashed.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Convert more' }));
    const list = screen.getByRole('list', { name: 'Queued items' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByText('Second')).toBeVisible();
  });

  it('stops the queue at the item that was cancelled', async () => {
    const user = userEvent.setup();
    const convert = vi.fn<MangaboundBridge['convert']>(() =>
      Promise.resolve({
        ok: false,
        error: { code: 'cancelled', message: 'The conversion was cancelled.' },
      }),
    );
    installBridge(
      bridge({
        convert,
        chooseInputs: () =>
          Promise.resolve({
            ok: true,
            value: {
              inputs: [folder('First', 'first'), folder('Second', 'second')],
              rejected: [],
            },
          }),
      }),
    );
    render(<App />);
    await addFolder(user);
    await chooseOutputFolder(user);

    await user.click(await runButton('Convert 2 items'));

    expect(await screen.findByRole('heading', { name: 'Nothing was saved' })).toBeVisible();
    expect(convert).toHaveBeenCalledOnce();
    expect(screen.getByText('First could not be converted')).toBeVisible();
  });

  it('offers to fix a folder that was left out, and opens its volumes', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        chooseInputs: () =>
          Promise.resolve({
            ok: true,
            value: {
              inputs: [folder('Good', 'good'), folder('Loose', 'loose')],
              rejected: [],
            },
          }),
        inspectInput: (id) =>
          Promise.resolve({
            ok: true,
            value: {
              sessionId: `session-${id}`,
              displayName: id,
              kind: 'folder',
              mapping:
                id === 'loose' ? createMappingDraft({ mangaTitle: 'Loose', chapters }) : mapping,
              issues: [],
            },
          }),
      }),
    );
    render(<App />);
    await addFolder(user);
    await chooseOutputFolder(user);
    expect(
      screen.getByText('1 item will be left out. Use the pencil on a row to fix it.'),
    ).toBeVisible();

    await user.click(await runButton('Convert 1 item'));

    expect(await screen.findByText('Loose was skipped')).toBeVisible();
    expect(
      screen.getByText('No volumes yet. Open Edit volumes to group the chapters.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Fix Loose' }));
    expect(await screen.findByRole('button', { name: 'Confirm mapping' })).toBeVisible();
  });

  it('keeps a queue of only CBZ files on its one process', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        chooseInputs: () => Promise.resolve({ ok: true, value: { inputs: [cbz], rejected: [] } }),
      }),
    );
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Files' }));
    await waitFor(() => {
      expect(screen.getByText('Ready')).toBeVisible();
    });

    // Neither step can change: one is meaningless for a CBZ and the other is the only one left.
    expect(screen.getByRole('checkbox', { name: 'Group chapters into volumes' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Convert for e-reader' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Convert for e-reader' })).toBeChecked();
    expect(screen.getByText('Keep at least one step on.')).toBeVisible();
  });
});

describe('sending the saved books to KOReader', () => {
  const wifi = { name: 'Wi-Fi', address: '192.168.1.24' };

  it('serves the output folder from the results screen and stops again on request', async () => {
    const user = userEvent.setup();
    const startSharing = vi.fn<MangaboundBridge['startSharing']>(() =>
      Promise.resolve({
        ok: true,
        value: {
          active: true,
          url: 'http://192.168.1.24:8080/opds',
          interfaceAddress: '192.168.1.24',
          port: 8080,
          authMode: 'token',
          token: 'abc123',
        },
      }),
    );
    const stopSharing = vi.fn<MangaboundBridge['stopSharing']>(() =>
      Promise.resolve({ ok: true, value: undefined }),
    );
    installBridge(
      bridge({
        listNetworkInterfaces: () => Promise.resolve({ ok: true, value: [wifi] }),
        startSharing,
        stopSharing,
      }),
    );
    render(<App />);
    await addFolder(user);
    await chooseOutputFolder(user);
    await user.click(await runButton('Convert 1 item'));
    expect(await screen.findByRole('heading', { name: 'Send to KOReader' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Start sharing' }));

    expect(startSharing).toHaveBeenCalledWith('library', '192.168.1.24', { mode: 'token' });
    expect(await screen.findByLabelText('Address')).toHaveValue(
      'http://192.168.1.24:8080/opds/?token=abc123',
    );
    expect(screen.getByText('Sharing')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Stop sharing' }));
    expect(stopSharing).toHaveBeenCalledOnce();
    expect(await screen.findByRole('button', { name: 'Start sharing' })).toBeVisible();
  });

  it('reports a sharing failure instead of showing the address', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        listNetworkInterfaces: () => Promise.resolve({ ok: true, value: [wifi] }),
        startSharing: () =>
          Promise.resolve({
            ok: false,
            error: { code: 'sharing_failed', message: 'The port is already in use.' },
          }),
      }),
    );
    render(<App />);
    await addFolder(user);
    await chooseOutputFolder(user);
    await user.click(await runButton('Convert 1 item'));
    await user.click(await screen.findByRole('button', { name: 'Start sharing' }));

    expect(await screen.findByRole('alert', { name: 'Workflow error' })).toHaveTextContent(
      'The port is already in use.',
    );
    expect(screen.queryByLabelText('Address')).not.toBeInTheDocument();
  });

  it('offers the card only when something was saved', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        convert: () =>
          Promise.resolve({
            ok: false,
            error: { code: 'process_failed', message: 'mangapress crashed.' },
          }),
      }),
    );
    render(<App />);
    await addFolder(user);
    await chooseOutputFolder(user);
    await user.click(await runButton('Convert 1 item'));

    expect(await screen.findByRole('heading', { name: 'Nothing was saved' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Send to KOReader' })).not.toBeInTheDocument();
  });
});

const goodTitle = {
  title: 'Good Manga',
  draft: createMappingDraft({
    mangaTitle: 'Good Manga',
    chapters: [
      {
        id: 'g1',
        name: 'Chapter 1',
        path: 'C:\\input\\Manga Library\\Good Manga\\Chapter 1',
        pageCount: 2,
        chapter: 1,
      },
    ],
    volumes: [{ id: 'gv1', number: '1', chapterIds: ['g1'] }],
  }),
  volumes: [{ name: 'Good Manga - Vol.01.cbz', pageCount: 2 }],
  issues: [],
};
/** A title mangabind could not group: it has chapters and no volumes. */
const looseTitle = {
  title: 'Broken Manga',
  draft: createMappingDraft({
    mangaTitle: 'Broken Manga',
    chapters: [
      {
        id: 'b1',
        name: 'Chapter 1',
        path: 'C:\\input\\Manga Library\\Broken Manga\\Chapter 1',
        pageCount: 1,
        chapter: 1,
      },
    ],
  }),
  volumes: [],
  issues: [],
};
/** The same title once it has volumes. */
const groupedTitle = {
  ...looseTitle,
  draft: createMappingDraft({
    mangaTitle: 'Broken Manga',
    chapters: looseTitle.draft.chapters,
    volumes: [{ id: 'bv1', number: '1', chapterIds: ['b1'] }],
  }),
  volumes: [{ name: 'Broken Manga - Vol.01.cbz', pageCount: 1 }],
};

const libraryFolder: SelectedInput = {
  selectionId: 'library-selection',
  displayName: 'Manga Library',
  displayPath: 'C:\\input\\Manga Library',
  kind: 'folder',
};

/** A bridge whose folder is a library holding these titles. */
function libraryBridge(
  titles: readonly (typeof goodTitle)[],
  overrides: Partial<MangaboundBridge> = {},
): MangaboundBridge {
  return bridge({
    chooseInputs: () =>
      Promise.resolve({ ok: true, value: { inputs: [libraryFolder], rejected: [] } }),
    inspectInput: () =>
      Promise.resolve({
        ok: true,
        value: {
          sessionId: 'library-session',
          displayName: 'Manga Library',
          kind: 'library',
          titles,
          issues: [],
        },
      }),
    ...overrides,
  });
}

const converted = (title: string, id: string) => ({
  title,
  status: 'done' as const,
  artifacts: [{ id, name: `${title}.epub`, bytes: 2048, format: 'epub' as const }],
});

describe('libraries in the queue', () => {
  it('is added like any folder, read as a library, and converted title by title', async () => {
    const user = userEvent.setup();
    const convertLibrary = vi.fn<MangaboundBridge['convertLibrary']>(() =>
      Promise.resolve({ ok: true, value: [converted('Good Manga', 'good-1')] }),
    );
    installBridge(libraryBridge([goodTitle, looseTitle], { convertLibrary }));
    render(<App />);

    await addFolder(user);
    const list = screen.getByRole('list', { name: 'Queued items' });
    expect(within(list).getByText('Manga Library')).toBeVisible();
    expect(within(list).getByText('1 title')).toBeVisible();
    expect(within(list).getByText('Library · 2 titles · 1 volume')).toBeVisible();
    expect(within(list).getByText('1 title left out until they have volumes.')).toBeVisible();

    await chooseOutputFolder(user);
    await user.click(await runButton('Convert 1 item'));

    expect(await screen.findByRole('heading', { name: '1 book saved' })).toBeVisible();
    expect(convertLibrary.mock.calls[0]?.[0]).toMatchObject({
      sessionId: 'library-session',
      libraryId: 'library',
      mode: 'bind-and-convert',
      settings: defaultMangapressSettings,
      format: 'epub',
      // Only the title that has volumes goes; the other waits.
      titles: ['Good Manga'],
    });
    expect(convertLibrary.mock.calls[0]?.[0]).not.toHaveProperty('parentPath');
    // What was left out is reported, with a way to fix it.
    expect(screen.getByText('Manga Library was skipped')).toBeVisible();
    expect(screen.getByText('1 title left out until they have volumes.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Convert more' }));
    // The library stays, with the title that was saved no longer counted.
    expect(screen.getByText('Needs volumes')).toBeVisible();
  });

  it('has the volumes of a title that has none set in the editor, and is read again', async () => {
    const user = userEvent.setup();
    const writeTitleMapping = vi.fn<MangaboundBridge['writeTitleMapping']>(() =>
      Promise.resolve({ ok: true, value: undefined }),
    );
    const planLibrary = vi.fn<MangaboundBridge['planLibrary']>(() =>
      Promise.resolve({ ok: true, value: { titles: [goodTitle, groupedTitle], issues: [] } }),
    );
    const convertLibrary = vi.fn<MangaboundBridge['convertLibrary']>(() =>
      Promise.resolve({
        ok: true,
        value: [converted('Good Manga', 'good-1'), converted('Broken Manga', 'broken-1')],
      }),
    );
    installBridge(
      libraryBridge([goodTitle, looseTitle], { writeTitleMapping, planLibrary, convertLibrary }),
    );
    render(<App />);
    await addFolder(user);
    await chooseOutputFolder(user);

    await user.click(screen.getByRole('button', { name: 'Edit titles of Manga Library' }));
    expect(await screen.findByRole('heading', { name: 'Manga Library' })).toBeVisible();
    const titles = screen.getByRole('list', { name: 'Titles' });
    expect(within(titles).getByText('1 volume')).toBeVisible();
    expect(within(titles).getByText('Needs volumes')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Edit volumes for Broken Manga' }));
    // Nothing grouped this title, so its volume is made by hand.
    await user.click(await screen.findByRole('button', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Add volume' }));
    await user.click(screen.getByRole('button', { name: 'Assign selected' }));
    await user.click(screen.getByRole('button', { name: 'Confirm mapping' }));

    // Saved by session and title name, then the library is read again.
    await waitFor(() => {
      expect(writeTitleMapping).toHaveBeenCalledWith(
        'library-session',
        'Broken Manga',
        expect.objectContaining({ mangaTitle: 'Broken Manga' }),
      );
    });
    expect(planLibrary).toHaveBeenCalledWith(expect.any(String), 'library-session');
    expect(await screen.findByRole('list', { name: 'Titles' })).toBeVisible();
    expect(
      within(screen.getByRole('list', { name: 'Titles' })).getAllByText('1 volume'),
    ).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Queue' }));
    expect(await screen.findByText('2 titles')).toBeVisible();
    await user.click(await runButton('Convert 1 item'));
    expect(await screen.findByRole('heading', { name: '2 books saved' })).toBeVisible();
    expect(convertLibrary.mock.calls[0]?.[0].titles).toEqual(['Good Manga', 'Broken Manga']);
    // Everything in it was saved, so it leaves the queue.
    await user.click(screen.getByRole('button', { name: 'Convert more' }));
    expect(screen.queryByRole('list', { name: 'Queued items' })).not.toBeInTheDocument();
  });

  it('keeps a title that failed for another try, and runs only what was not saved', async () => {
    const user = userEvent.setup();
    const convertLibrary = vi
      .fn<MangaboundBridge['convertLibrary']>()
      .mockResolvedValueOnce({
        ok: true,
        value: [
          converted('Good Manga', 'good-1'),
          {
            title: 'Broken Manga',
            status: 'failed',
            artifacts: [],
            failure: { code: 'process_failed', message: 'mangapress crashed.' },
          },
        ],
      })
      .mockResolvedValueOnce({ ok: true, value: [converted('Broken Manga', 'broken-1')] });
    installBridge(libraryBridge([goodTitle, groupedTitle], { convertLibrary }));
    render(<App />);
    await addFolder(user);
    await chooseOutputFolder(user);

    await user.click(await runButton('Convert 1 item'));

    expect(await screen.findByRole('heading', { name: '1 book saved' })).toBeVisible();
    expect(screen.getByText('Manga Library · Broken Manga could not be converted')).toBeVisible();
    expect(screen.getByText('mangapress crashed.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Convert more' }));
    expect(screen.getByText('1 title failed last time and will run again.')).toBeVisible();
    await user.click(await runButton('Convert 1 item'));

    expect(await screen.findByRole('heading', { name: '1 book saved' })).toBeVisible();
    expect(convertLibrary.mock.calls[1]?.[0].titles).toEqual(['Broken Manga']);
    await user.click(screen.getByRole('button', { name: 'Convert more' }));
    expect(screen.queryByRole('list', { name: 'Queued items' })).not.toBeInTheDocument();
  });

  it('reports a library that could not be run at all', async () => {
    const user = userEvent.setup();
    installBridge(
      libraryBridge([goodTitle], {
        convertLibrary: () =>
          Promise.resolve({
            ok: false,
            error: { code: 'not_a_library', message: 'This input is not a library.' },
          }),
      }),
    );
    render(<App />);
    await addFolder(user);
    await chooseOutputFolder(user);

    await user.click(await runButton('Convert 1 item'));

    expect(await screen.findByRole('heading', { name: 'Nothing was saved' })).toBeVisible();
    expect(screen.getByText('Manga Library could not be converted')).toBeVisible();
    expect(screen.getByText('This input is not a library.')).toBeVisible();
  });

  it('stops the queue at a library that was cancelled', async () => {
    const user = userEvent.setup();
    const convert = vi.fn<MangaboundBridge['convert']>(() =>
      Promise.resolve({ ok: true, value: [] }),
    );
    installBridge(
      libraryBridge([goodTitle], {
        convert,
        chooseInputs: () =>
          Promise.resolve({
            ok: true,
            value: { inputs: [libraryFolder, folder('Second', 'second')], rejected: [] },
          }),
        inspectInput: (id) =>
          Promise.resolve(
            id === 'library-selection'
              ? {
                  ok: true,
                  value: {
                    sessionId: 'library-session',
                    displayName: 'Manga Library',
                    kind: 'library',
                    titles: [goodTitle],
                    issues: [],
                  },
                }
              : inspection(id),
          ),
        convertLibrary: () =>
          Promise.resolve({
            ok: true,
            value: [
              {
                title: 'Good Manga',
                status: 'failed',
                artifacts: [],
                failure: { code: 'cancelled', message: 'Cancelled.' },
              },
            ],
          }),
      }),
    );
    render(<App />);
    await addFolder(user);
    await chooseOutputFolder(user);

    await user.click(await runButton('Convert 2 items'));

    expect(await screen.findByRole('heading', { name: 'Nothing was saved' })).toBeVisible();
    expect(convert).not.toHaveBeenCalled();
  });

  it('is a queue of its own kind that cannot skip joining', async () => {
    const user = userEvent.setup();
    installBridge(libraryBridge([goodTitle]));
    render(<App />);

    await addFolder(user);

    // A library is joined title by title first, so the step is locked with the reason shown.
    expect(screen.getByRole('checkbox', { name: 'Group chapters into volumes' })).toBeDisabled();
    expect(
      screen.getByText(
        'A library is grouped title by title first, so it cannot skip joining volumes.',
      ),
    ).toBeVisible();
  });

  it('joins a library without converting, sending defaults for what mangapress would need', async () => {
    const user = userEvent.setup();
    const convertLibrary = vi.fn<MangaboundBridge['convertLibrary']>(() =>
      Promise.resolve({
        ok: true,
        value: [
          {
            title: 'Good Manga',
            status: 'done',
            artifacts: [{ id: 'a', name: 'Good Manga - Vol.01.cbz', bytes: 10, format: 'cbz' }],
          },
        ],
      }),
    );
    installBridge(libraryBridge([goodTitle], { convertLibrary }));
    render(<App />);
    await addFolder(user);
    await user.click(screen.getByRole('radio', { name: 'PDF' }));

    await user.click(screen.getByRole('checkbox', { name: 'Convert for e-reader' }));
    await chooseOutputFolder(user);
    await user.click(await runButton('Join 1 item'));

    expect(await screen.findByRole('heading', { name: '1 book saved' })).toBeVisible();
    expect(convertLibrary.mock.calls[0]?.[0]).toMatchObject({
      mode: 'bind-only',
      settings: defaultMangapressSettings,
      format: 'cbz',
    });
  });

  it('is left out, with the reason, next to a folder when the run does not group', async () => {
    const user = userEvent.setup();
    const convert = vi.fn<MangaboundBridge['convert']>(() =>
      Promise.resolve({
        ok: true,
        value: [{ id: 'a1', name: 'Offline Work.epub', bytes: 2048, format: 'epub' }],
      }),
    );
    const convertLibrary = vi.fn<MangaboundBridge['convertLibrary']>(() =>
      Promise.resolve({ ok: true, value: [] }),
    );
    installBridge(
      libraryBridge([goodTitle], {
        convert,
        convertLibrary,
        chooseInputs: () =>
          Promise.resolve({
            ok: true,
            value: { inputs: [libraryFolder, folder('Offline Work', 'plain')], rejected: [] },
          }),
        inspectInput: (id) =>
          Promise.resolve(
            id === 'library-selection'
              ? {
                  ok: true,
                  value: {
                    sessionId: 'library-session',
                    displayName: 'Manga Library',
                    kind: 'library',
                    titles: [goodTitle],
                    issues: [],
                  },
                }
              : inspection(id),
          ),
      }),
    );
    render(<App />);
    await addFolder(user);
    await chooseOutputFolder(user);

    await user.click(screen.getByRole('checkbox', { name: 'Group chapters into volumes' }));
    expect(screen.getByText('Needs grouping')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Edit titles of Manga Library' }),
    ).not.toBeInTheDocument();
    await user.click(await runButton('Convert 1 item'));

    expect(await screen.findByRole('heading', { name: '1 book saved' })).toBeVisible();
    expect(convertLibrary).not.toHaveBeenCalled();
    expect(screen.getByText('Manga Library was skipped')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Fix Manga Library' })).not.toBeInTheDocument();
  });

  it('shows what a library would make by reading it again, without writing anything', async () => {
    const user = userEvent.setup();
    const planLibrary = vi.fn<MangaboundBridge['planLibrary']>(() =>
      Promise.resolve({ ok: true, value: { titles: [goodTitle, looseTitle], issues: [] } }),
    );
    installBridge(libraryBridge([goodTitle, looseTitle], { planLibrary }));
    render(<App />);
    await addFolder(user);
    await chooseOutputFolder(user);

    await user.click(screen.getByRole('button', { name: 'Validate plan' }));

    expect(await screen.findByRole('heading', { name: 'Plan validated' })).toBeVisible();
    expect(planLibrary).toHaveBeenCalledWith(expect.any(String), 'library-session');
    expect(
      screen.getByText('mangabind validated 1 title · 1 volume · no library files written'),
    ).toBeVisible();
    expect(screen.getByText('Good Manga - Vol.01.cbz')).toBeVisible();
    expect(screen.queryByText('Broken Manga - Vol.01.cbz')).not.toBeInTheDocument();
  });

  it('says when the plan of a library could not be read', async () => {
    const user = userEvent.setup();
    installBridge(
      libraryBridge([goodTitle], {
        planLibrary: () =>
          Promise.resolve({
            ok: false,
            error: { code: 'process_failed', message: 'mangabind could not read this library.' },
          }),
      }),
    );
    render(<App />);
    await addFolder(user);
    await chooseOutputFolder(user);

    await user.click(screen.getByRole('button', { name: 'Validate plan' }));

    expect(await screen.findByRole('alert', { name: 'Workflow error' })).toHaveTextContent(
      'mangabind could not read this library.',
    );
  });

  it('stays in the title editor and says why when the mapping could not be saved', async () => {
    const user = userEvent.setup();
    const planLibrary = vi.fn<MangaboundBridge['planLibrary']>(() =>
      Promise.resolve({ ok: true, value: { titles: [goodTitle], issues: [] } }),
    );
    installBridge(
      libraryBridge([goodTitle], {
        planLibrary,
        writeTitleMapping: () =>
          Promise.resolve({
            ok: false,
            error: { code: 'mapping_save_failed', message: 'The folder is read-only.' },
          }),
      }),
    );
    render(<App />);
    await addFolder(user);

    await user.click(screen.getByRole('button', { name: 'Edit titles of Manga Library' }));
    await user.click(await screen.findByRole('button', { name: 'Edit volumes for Good Manga' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm mapping' }));

    expect(await screen.findByRole('alert', { name: 'Workflow error' })).toHaveTextContent(
      'The folder is read-only.',
    );
    expect(planLibrary).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Confirm mapping' })).toBeVisible();
  });

  it('stays in the title editor and says why when the library could not be read again', async () => {
    const user = userEvent.setup();
    installBridge(
      libraryBridge([goodTitle], {
        planLibrary: () =>
          Promise.resolve({
            ok: false,
            error: { code: 'process_failed', message: 'mangabind could not read this library.' },
          }),
      }),
    );
    render(<App />);
    await addFolder(user);

    await user.click(screen.getByRole('button', { name: 'Edit titles of Manga Library' }));
    await user.click(await screen.findByRole('button', { name: 'Edit volumes for Good Manga' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm mapping' }));

    expect(await screen.findByRole('alert', { name: 'Workflow error' })).toHaveTextContent(
      'mangabind could not read this library.',
    );
    expect(screen.getByRole('button', { name: 'Confirm mapping' })).toBeVisible();
  });

  it('goes back to the queue, and from the title editor to the library', async () => {
    const user = userEvent.setup();
    installBridge(libraryBridge([goodTitle]));
    render(<App />);
    await addFolder(user);

    await user.click(screen.getByRole('button', { name: 'Edit titles of Manga Library' }));
    await user.click(await screen.findByRole('button', { name: 'Edit volumes for Good Manga' }));
    await user.click(await screen.findByRole('button', { name: /Manga Library/u }));
    expect(await screen.findByRole('list', { name: 'Titles' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Queue' }));

    expect(await screen.findByRole('heading', { name: 'Queue' })).toBeVisible();
  });

  it('offers to fix a library that was left out, opening its titles', async () => {
    const user = userEvent.setup();
    installBridge(
      libraryBridge([goodTitle, looseTitle], {
        convertLibrary: () =>
          Promise.resolve({ ok: true, value: [converted('Good Manga', 'good-1')] }),
      }),
    );
    render(<App />);
    await addFolder(user);
    await chooseOutputFolder(user);
    await user.click(await runButton('Convert 1 item'));
    await screen.findByText('Manga Library was skipped');

    await user.click(screen.getByRole('button', { name: 'Fix Manga Library' }));

    expect(await screen.findByRole('list', { name: 'Titles' })).toBeVisible();
  });
});
