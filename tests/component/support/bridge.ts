import { defaultPreferences } from '@/domain/preferences';
import type { MangaboundBridge } from '@/shared/runtime-info';

const nothing = Promise.resolve({ ok: true as const, value: undefined });

/**
 * A complete bridge whose every call answers with nothing in it, so a test names only the calls it
 * is about. The app calls the whole bridge, and a missing method is an error there, not an option.
 */
export function inertBridge(overrides: Partial<MangaboundBridge> = {}): MangaboundBridge {
  return {
    listCovers: () => Promise.resolve({ ok: true, value: [] }),
    chooseCover: () => Promise.resolve({ ok: true, value: null }),
    chooseCoversFolder: () => Promise.resolve({ ok: true, value: null }),
    dropCovers: () => Promise.resolve({ ok: true, value: { covers: [] } }),
    removeCover: () => Promise.resolve({ ok: true, value: { covers: [] } }),
    runtime: { electron: '44.3.0', platform: 'win32', version: '0.1.0-alpha.1' },
    getToolchainStatus: () =>
      Promise.resolve({
        state: 'ready',
        target: 'win32-x64',
        tools: [],
        message: 'Bundled conversion tools are verified and ready.',
      }),
    chooseInputs: () => Promise.resolve({ ok: true, value: { inputs: [], rejected: [] } }),
    registerDroppedFiles: () => Promise.resolve({ ok: true, value: { inputs: [], rejected: [] } }),
    inspectInput: () =>
      Promise.resolve({
        ok: false,
        error: { code: 'selection_not_found', message: 'Choose the input again.' },
      }),
    releaseInput: () => nothing,
    chooseLibrary: () => Promise.resolve({ ok: true, value: null }),
    getDeviceProfiles: () => Promise.resolve({ ok: true, value: [] }),
    convert: () => Promise.resolve({ ok: true, value: [] }),
    planConversion: () =>
      Promise.resolve({
        ok: true,
        value: { tool: 'mangabind', title: '', message: '', books: [], issues: [] },
      }),
    createPendingRun: () => Promise.resolve({ ok: true, value: 'pending-run' }),
    listPendingRuns: () => Promise.resolve({ ok: true, value: [] }),
    discardPendingRun: () => nothing,
    saveArtifactAs: () => Promise.resolve({ ok: true, value: { saved: false } }),
    saveAllArtifacts: () => Promise.resolve({ ok: true, value: null }),
    cancelConversion: () => nothing,
    planLibrary: () => Promise.resolve({ ok: true, value: { titles: [], issues: [] } }),
    writeTitleMapping: () => nothing,
    saveBookDetails: () => nothing,
    convertLibrary: () => Promise.resolve({ ok: true, value: [] }),
    listMetadataProviders: () => Promise.resolve({ ok: true, value: [] }),
    searchMetadata: () => Promise.resolve({ ok: true, value: [] }),
    suggestVolumes: () => Promise.resolve({ ok: true, value: { volumes: [] } }),
    openProviderHomepage: () => nothing,
    openArtifact: () => nothing,
    showArtifactInFolder: () => nothing,
    onConversionProgress: () => () => undefined,
    listNetworkInterfaces: () => Promise.resolve({ ok: true, value: [] }),
    startSharing: () => Promise.resolve({ ok: true, value: { active: false } }),
    stopSharing: () => nothing,
    getSharingStatus: () => Promise.resolve({ ok: true, value: { active: false } }),
    loadSettings: () =>
      Promise.resolve({ ok: true, value: { preferences: defaultPreferences, notices: [] } }),
    saveSettings: () => nothing,
    ...overrides,
  };
}
