import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMappingDraft } from '@/domain/mapping';
import { defaultMangapressSettings } from '@/domain/output-profile';
import { App } from '@/renderer/app';
import type { MangaboundBridge } from '@/shared/runtime-info';

const readyToolchain = {
  state: 'ready' as const,
  target: 'win32-x64' as const,
  tools: [],
  message: 'Bundled conversion tools are verified and ready.',
};

const mapping = createMappingDraft({
  mangaTitle: 'Offline Work',
  chapters: [
    { id: 'c1', name: 'Chapter 1', path: 'C:\\input\\Chapter 1', pageCount: 2, chapter: 1 },
    { id: 'c2', name: 'Chapter 2', path: 'C:\\input\\Chapter 2', pageCount: 2, chapter: 2 },
  ],
  volumes: [{ id: 'v1', number: '1', chapterIds: ['c1', 'c2'] }],
});

function bridge(overrides: Partial<MangaboundBridge> = {}): MangaboundBridge {
  return {
    runtime: { electron: '44.3.0', platform: 'win32' },
    getToolchainStatus: () => Promise.resolve(readyToolchain),
    chooseInput: () =>
      Promise.resolve({
        ok: true,
        value: {
          selectionId: 'selection',
          displayName: 'Offline Work',
          displayPath: 'C:\\input\\Offline Work',
          kind: 'folder',
        },
      }),
    inspectInput: () =>
      Promise.resolve({
        ok: true,
        value: {
          sessionId: 'session',
          displayName: 'Offline Work',
          kind: 'folder',
          mapping,
          issues: [],
        },
      }),
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
    chooseInputBatch: () => Promise.resolve({ ok: true, value: null }),
    planBatch: () => Promise.resolve({ ok: true, value: { titles: [], issues: [] } }),
    writeTitleMapping: () => Promise.resolve({ ok: true, value: undefined }),
    convertBatch: () => Promise.resolve({ ok: true, value: [] }),
    listMetadataProviders: () => Promise.resolve({ ok: true, value: [] }),
    searchMetadata: () => Promise.resolve({ ok: true, value: [] }),
    suggestVolumes: () => Promise.resolve({ ok: true, value: { volumes: [] } }),
    openArtifact: () => Promise.resolve({ ok: true, value: undefined }),
    showArtifactInFolder: () => Promise.resolve({ ok: true, value: undefined }),
    onConversionProgress: () => () => undefined,
    listNetworkInterfaces: () => Promise.resolve({ ok: true, value: [] }),
    startSharing: () =>
      Promise.resolve({ ok: true, value: { active: true, authMode: 'token' as const } }),
    stopSharing: () => Promise.resolve({ ok: true, value: undefined }),
    getSharingStatus: () => Promise.resolve({ ok: true, value: { active: false } }),
    ...overrides,
  };
}

function installBridge(value: MangaboundBridge): void {
  Object.defineProperty(window, 'mangabound', { configurable: true, value });
}

afterEach(() => {
  Reflect.deleteProperty(window, 'mangabound');
});

describe('single-input application workflow', () => {
  it('runs a folder through mapping and settings to OS-delegated artifact actions', async () => {
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

    await user.click(await screen.findByRole('button', { name: /Manga folder/i }));
    await user.click(await screen.findByRole('button', { name: 'Confirm mapping' }));
    expect(await screen.findByRole('heading', { name: 'Convert Offline Work' })).toBeVisible();
    expect(screen.getByLabelText('Device profile')).toHaveValue('KV');

    await user.click(screen.getByRole('button', { name: 'Choose output folder' }));
    expect(await screen.findByText('C:\\Books')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Start conversion' }));

    expect(await screen.findByRole('heading', { name: '1 book saved' })).toBeVisible();
    expect(convert.mock.calls[0]?.[0]).toMatchObject({
      sessionId: 'session',
      libraryId: 'library',
      settings: defaultMangapressSettings,
      format: 'epub',
      mapping,
    });
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: 'Show in folder' }));
    expect(openArtifact).toHaveBeenCalledWith('artifact');
    expect(showArtifactInFolder).toHaveBeenCalledWith('artifact');
    expect(screen.getByText(/operating system’s default app/i)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Convert something else' }));
    expect(await screen.findByRole('heading', { name: 'What are you bringing in?' })).toBeVisible();
    expect(releaseInput).toHaveBeenCalledWith('session');
  });

  it('wires the mapping editor to the metadata bridge only when a source exists and Search is used', async () => {
    const user = userEvent.setup();
    const searchMetadata = vi.fn<MangaboundBridge['searchMetadata']>(() =>
      Promise.resolve({
        ok: true,
        value: [{ id: 'work-1', title: 'A Quiet Journey', provider: 'External API' }],
      }),
    );
    const suggestVolumes = vi.fn<MangaboundBridge['suggestVolumes']>(() =>
      Promise.resolve({ ok: true, value: { volumes: [{ number: '1', chapterNumbers: [1, 2] }] } }),
    );
    installBridge(
      bridge({
        listMetadataProviders: () =>
          Promise.resolve({ ok: true, value: [{ id: 'external', displayName: 'External API' }] }),
        searchMetadata,
        suggestVolumes,
      }),
    );
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Manga folder/i }));
    expect(await screen.findByText('Suggest from external API')).toBeVisible();
    // Opening the editor sends nothing.
    expect(searchMetadata).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('A Quiet Journey')).toBeVisible();
    expect(searchMetadata).toHaveBeenCalledWith(expect.any(String), 'external', 'Offline Work');

    await user.click(screen.getByRole('button', { name: 'Use this' }));
    expect(await screen.findByText('Suggested by External API')).toBeVisible();
    expect(suggestVolumes).toHaveBeenCalledWith(expect.any(String), 'external', 'work-1');
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
  ])(
    'hides the suggestion panel and shows no error when %s',
    async (_name, listMetadataProviders) => {
      const user = userEvent.setup();
      installBridge(bridge({ listMetadataProviders }));
      render(<App />);

      await user.click(await screen.findByRole('button', { name: /Manga folder/i }));

      expect(await screen.findByRole('button', { name: 'Confirm mapping' })).toBeVisible();
      expect(screen.queryByText('Suggest from external API')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('takes a direct CBZ to output settings without showing the mapping editor', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        chooseInput: () =>
          Promise.resolve({
            ok: true,
            value: {
              selectionId: 'cbz-selection',
              displayName: 'Standalone.cbz',
              displayPath: 'C:\\input\\Standalone.cbz',
              kind: 'cbz',
            },
          }),
        inspectInput: () =>
          Promise.resolve({
            ok: true,
            value: {
              sessionId: 'cbz-session',
              displayName: 'Standalone.cbz',
              kind: 'cbz',
              issues: [],
            },
          }),
      }),
    );
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /One CBZ file/i }));

    expect(await screen.findByRole('heading', { name: 'Convert Standalone.cbz' })).toBeVisible();
    expect(screen.getByText('This CBZ will go directly to mangapress.')).toBeVisible();
    expect(screen.queryByText('Chapter mapping')).not.toBeInTheDocument();
  });

  it('shows a successful no-output plan before conversion', async () => {
    const user = userEvent.setup();
    const planConversion = vi.fn<MangaboundBridge['planConversion']>(() =>
      Promise.resolve({
        ok: true,
        value: {
          tool: 'mangabind',
          title: 'Offline Work',
          message: 'mangabind validated 1 volume · no library files written',
          books: [{ name: 'Offline Work - Vol.01.cbz', pageCount: 4 }],
          issues: [
            {
              tool: 'mangabind',
              severity: 'warning',
              code: 'chapter_name_normalized',
              stage: 'plan',
              recoverable: true,
              message: 'One chapter name was normalized.',
            },
          ],
        },
      }),
    );
    installBridge(bridge({ planConversion }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Manga folder/i }));
    await user.click(await screen.findByRole('button', { name: 'Confirm mapping' }));
    await user.click(screen.getByRole('button', { name: 'Choose output folder' }));
    await user.click(screen.getByRole('button', { name: 'Validate plan' }));

    expect(await screen.findByRole('heading', { name: 'Plan validated' })).toBeVisible();
    expect(screen.getByText('Offline Work - Vol.01.cbz')).toBeVisible();
    expect(screen.getByText('1 warning reported by mangabind.')).toBeVisible();
    expect(planConversion).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session', settings: defaultMangapressSettings }),
    );
  });

  it('keeps actionable failures persistent with collapsed technical details', async () => {
    const user = userEvent.setup();
    installBridge(
      bridge({
        chooseInput: () =>
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

    await user.click(await screen.findByRole('button', { name: /Manga folder/i }));

    expect(screen.getByRole('alert', { name: 'Workflow error' })).toHaveTextContent(
      'Couldn’t read the selected folder.',
    );
    const details = screen.getByText('Technical details').closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(details).toHaveTextContent('permission denied');
  });

  it('offers cancellation while a conversion is running', async () => {
    const user = userEvent.setup();
    const cancelConversion = vi.fn<MangaboundBridge['cancelConversion']>(() =>
      Promise.resolve({ ok: true, value: undefined }),
    );
    installBridge(
      bridge({
        cancelConversion,
        convert: () => new Promise(() => undefined),
      }),
    );
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Manga folder/i }));
    await user.click(await screen.findByRole('button', { name: 'Confirm mapping' }));
    await user.click(screen.getByRole('button', { name: 'Choose output folder' }));
    await user.click(await screen.findByRole('button', { name: 'Start conversion' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel conversion' }));

    expect(cancelConversion).toHaveBeenCalledOnce();
  });
});

const goodTitleDraft = createMappingDraft({
  mangaTitle: 'Good Manga',
  chapters: [
    {
      id: 'g1',
      name: 'Chapter 1',
      path: 'C:\\Library\\Good Manga\\Chapter 1',
      pageCount: 2,
      chapter: 1,
    },
  ],
  volumes: [{ id: 'gv1', number: '1', chapterIds: ['g1'] }],
});
const brokenTitleDraft = createMappingDraft({
  mangaTitle: 'Broken Manga',
  chapters: [
    {
      id: 'b1',
      name: 'Chapter 1',
      path: 'C:\\Library\\Broken Manga\\Chapter 1',
      pageCount: 1,
      chapter: 1,
    },
  ],
  volumes: [{ id: 'bv1', number: '1', chapterIds: ['b1'] }],
});

function batchPlan(brokenStatus: 'completed' | 'failed') {
  return {
    titles: [
      {
        title: 'Good Manga',
        inputPath: 'C:\\Library\\Good Manga',
        status: 'completed' as const,
        draft: goodTitleDraft,
        volumes: [{ name: 'Good Manga - Vol.01.cbz', pageCount: 2 }],
        issues: [],
      },
      {
        title: 'Broken Manga',
        inputPath: 'C:\\Library\\Broken Manga',
        status: brokenStatus,
        draft: brokenTitleDraft,
        volumes:
          brokenStatus === 'completed' ? [{ name: 'Broken Manga - Vol.01.cbz', pageCount: 1 }] : [],
        issues:
          brokenStatus === 'failed'
            ? [
                {
                  tool: 'mangabind' as const,
                  severity: 'error' as const,
                  code: 'metadata_load_failed',
                  stage: 'group',
                  recoverable: true,
                  message: 'mangabind.json could not be parsed.',
                },
              ]
            : [],
      },
    ],
    issues: [],
  };
}

describe('batch application workflow', () => {
  it('reviews a discovered library, fixes a mapping, converts, and retries a failure', async () => {
    const user = userEvent.setup();
    const planBatch = vi
      .fn<MangaboundBridge['planBatch']>()
      .mockResolvedValueOnce({ ok: true, value: batchPlan('failed') })
      .mockResolvedValue({ ok: true, value: batchPlan('completed') });
    const writeTitleMapping = vi.fn<MangaboundBridge['writeTitleMapping']>(() =>
      Promise.resolve({ ok: true, value: undefined }),
    );
    const convertBatch = vi
      .fn<MangaboundBridge['convertBatch']>()
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            title: 'Good Manga',
            status: 'done',
            artifacts: [{ id: 'good-1', name: 'Good Manga.epub', bytes: 2048, format: 'epub' }],
          },
          {
            title: 'Broken Manga',
            status: 'failed',
            artifacts: [],
            failure: { code: 'process_failed', message: 'mangapress crashed.' },
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            title: 'Broken Manga',
            status: 'done',
            artifacts: [{ id: 'broken-1', name: 'Broken Manga.epub', bytes: 1024, format: 'epub' }],
          },
        ],
      });
    installBridge(
      bridge({
        chooseInputBatch: () =>
          Promise.resolve({
            ok: true,
            value: { parentPath: 'C:\\Library', displayName: 'My Library' },
          }),
        planBatch,
        writeTitleMapping,
        convertBatch,
      }),
    );
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Manga library \(batch\)/i }));
    expect(await screen.findByRole('heading', { name: 'Convert My Library' })).toBeVisible();
    expect(screen.getByText(/No volumes could be assigned automatically/i)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Fix mapping' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm mapping' }));
    expect(writeTitleMapping).toHaveBeenCalledWith('C:\\Library\\Broken Manga', brokenTitleDraft);
    expect(await screen.findByRole('heading', { name: 'Convert My Library' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Fix mapping' })).not.toBeInTheDocument();
    expect(planBatch).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: 'Choose output folder' }));
    await user.click(await screen.findByRole('button', { name: 'Start batch conversion' }));

    expect(await screen.findByText('mangapress crashed.')).toBeVisible();
    expect(convertBatch.mock.calls[0]?.[0]).toMatchObject({
      parentPath: 'C:\\Library',
      libraryId: 'library',
    });
    expect(convertBatch.mock.calls[0]?.[0].titles).toBeUndefined();

    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    });
    expect(screen.queryByText('mangapress crashed.')).not.toBeInTheDocument();
    expect(convertBatch.mock.calls[1]?.[0]).toMatchObject({ titles: ['Broken Manga'] });
  });

  it('stops the queue before the next title once the batch is cancelled', async () => {
    const user = userEvent.setup();
    const cancelConversion = vi.fn<MangaboundBridge['cancelConversion']>(() =>
      Promise.resolve({ ok: true, value: undefined }),
    );
    installBridge(
      bridge({
        chooseInputBatch: () =>
          Promise.resolve({
            ok: true,
            value: { parentPath: 'C:\\Library', displayName: 'My Library' },
          }),
        planBatch: () => Promise.resolve({ ok: true, value: batchPlan('completed') }),
        convertBatch: () => new Promise(() => undefined),
        cancelConversion,
      }),
    );
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Manga library \(batch\)/i }));
    await screen.findByRole('heading', { name: 'Convert My Library' });
    await user.click(screen.getByRole('button', { name: 'Choose output folder' }));
    await user.click(await screen.findByRole('button', { name: 'Start batch conversion' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel batch' }));

    expect(cancelConversion).toHaveBeenCalledOnce();
  });
});
