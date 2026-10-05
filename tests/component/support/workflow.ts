import { screen, waitFor } from '@testing-library/react';
import { type UserEvent } from '@testing-library/user-event';
import { expect } from 'vitest';
import { createMappingDraft } from '@/domain/mapping';
import { defaultPreferences } from '@/domain/preferences';
import { type MangaboundBridge } from '@/shared/runtime-info';
import { type RestoredSettings } from '@/shared/settings-contract';
import {
  type InspectedInputPayload,
  type SelectedInput,
  type WorkflowResult,
} from '@/shared/workflow-contract';

export const readyToolchain = {
  state: 'ready' as const,
  target: 'win32-x64' as const,
  tools: [],
  message: 'Bundled conversion tools are verified and ready.',
};

export const chapters = [
  { id: 'c1', name: 'Chapter 1', path: 'C:\\input\\Chapter 1', pageCount: 2, chapter: 1 },
  { id: 'c2', name: 'Chapter 2', path: 'C:\\input\\Chapter 2', pageCount: 2, chapter: 2 },
] as const;

/** Every chapter already has a volume, as mangabind leaves a folder named Vol.N Ch.N. */
export const mapping = createMappingDraft({
  mangaTitle: 'Offline Work',
  chapters,
  volumes: [{ id: 'v1', number: '1', chapterIds: ['c1', 'c2'] }],
});

/** One chapter has no volume yet, so the folder needs a look before it can run. */
export const partialMapping = createMappingDraft({
  mangaTitle: 'Offline Work',
  chapters,
  volumes: [{ id: 'v1', number: '1', chapterIds: ['c1'] }],
});

export const folder = (name = 'Offline Work', id = 'selection'): SelectedInput => ({
  selectionId: id,
  displayName: name,
  displayPath: `C:\\input\\${name}`,
  kind: 'folder',
});

export const cbz: SelectedInput = {
  selectionId: 'cbz-selection',
  displayName: 'Standalone.cbz',
  displayPath: 'C:\\input\\Standalone.cbz',
  kind: 'cbz',
};

export function inspection(id: string): WorkflowResult<InspectedInputPayload> {
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

export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export function bridge(overrides: Partial<MangaboundBridge> = {}): MangaboundBridge {
  return {
    listCovers: () => Promise.resolve({ ok: true, value: [] }),
    chooseCover: () => Promise.resolve({ ok: true, value: null }),
    chooseCoversFolder: () => Promise.resolve({ ok: true, value: null }),
    dropCovers: () => Promise.resolve({ ok: true, value: { covers: [] } }),
    removeCover: () => Promise.resolve({ ok: true, value: { covers: [] } }),
    createPendingRun: () => Promise.resolve({ ok: true, value: 'pending-run' }),
    listPendingRuns: () => Promise.resolve({ ok: true, value: [] }),
    discardPendingRun: () => Promise.resolve({ ok: true, value: undefined }),
    saveArtifactAs: () => Promise.resolve({ ok: true, value: { saved: true } }),
    saveAllArtifacts: () => Promise.resolve({ ok: true, value: { savedIds: [], failures: [] } }),
    runtime: { electron: '44.3.0', platform: 'win32', version: '0.1.0-alpha.1' },
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
            code: 'KPW6',
            name: 'Kindle Paperwhite 6',
            width: 1272,
            height: 1696,
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
    saveBookDetails: () => Promise.resolve({ ok: true, value: undefined }),
    convertLibrary: () => Promise.resolve({ ok: true, value: [] }),
    listMetadataProviders: () => Promise.resolve({ ok: true, value: [] }),
    searchMetadata: () => Promise.resolve({ ok: true, value: [] }),
    suggestVolumes: () => Promise.resolve({ ok: true, value: { volumes: [] } }),
    openProviderHomepage: () => Promise.resolve({ ok: true, value: undefined }),
    openArtifact: () => Promise.resolve({ ok: true, value: undefined }),
    showArtifactInFolder: () => Promise.resolve({ ok: true, value: undefined }),
    onConversionProgress: () => () => undefined,
    listNetworkInterfaces: () => Promise.resolve({ ok: true, value: [] }),
    startSharing: () => Promise.resolve({ ok: true, value: { active: true } }),
    stopSharing: () => Promise.resolve({ ok: true, value: undefined }),
    getSharingStatus: () => Promise.resolve({ ok: true, value: { active: false } }),
    loadSettings: () =>
      Promise.resolve({ ok: true, value: { preferences: defaultPreferences, notices: [] } }),
    saveSettings: () => Promise.resolve({ ok: true, value: undefined }),
    ...overrides,
  };
}

/** A bridge that hands back these settings, as if they had been kept from the last session. */
export const keptSettings =
  (kept: Partial<RestoredSettings>): MangaboundBridge['loadSettings'] =>
  () =>
    Promise.resolve({
      ok: true,
      value: { preferences: defaultPreferences, notices: [], ...kept },
    });

export function installBridge(value: MangaboundBridge): void {
  Object.defineProperty(window, 'mangabound', { configurable: true, value });
}

/** Adds what the bridge's dialog returns and waits until the tools have read every row. */
export async function addFolder(user: UserEvent): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Folder' }));
  await waitFor(() => {
    expect(screen.queryByText('Checking…')).not.toBeInTheDocument();
  });
}

export function expectNoOutputFolderPicker(): void {
  expect(screen.queryByRole('button', { name: 'Choose output folder' })).not.toBeInTheDocument();
}

export const runButton = (count: number): Promise<HTMLElement> =>
  screen.findByRole('button', { name: `Process ${count} ${count === 1 ? 'item' : 'items'}` });
