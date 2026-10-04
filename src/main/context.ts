import type { FsCoverStore } from '@/adapters/covers/fs-cover-store';
import { FsLibraryStore } from '@/adapters/library/fs-library-store';
import type { FsPendingRuns } from '@/adapters/library/fs-pending-runs';
import { createMetadataProviders } from '@/adapters/metadata-providers/registry';
import { type MangapressCliAdapter } from '@/adapters/mangapress/cli';
import { OsNetworkInterfaces } from '@/adapters/network/os-network-interfaces';
import { NodeOpdsServer } from '@/adapters/opds/http-server';
import type { MetadataProviderPort } from '@/application/ports/metadata-provider';
import type { NetworkInterfaceOption } from '@/application/ports/network-interfaces';
import type { OpdsServerHandle } from '@/application/ports/opds-server';
import { LibraryPublisher } from '@/application/workflows/library-publisher';
import { type PreferencesWorkflow } from '@/application/workflows/preferences';
import { type ConversionWorkflow } from '@/application/workflows/conversion-workflow';
import type { InputSelection } from '@/domain/conversion';
import { defaultPreferences, type Preferences } from '@/domain/preferences';

import { PendingRunActivity } from './pending-run-activity';

/**
 * Everything the main process's IPC handlers share, constructed once in index.ts and passed to
 * each `register*Handlers`. A handler function is typed to receive only the slice of this it
 * actually touches (`Pick<MainContext, ...>`), so its real dependencies are visible and checked at
 * its call site instead of implicit through a shared module's closures.
 */
export interface MainContext {
  readonly selectedInputs: Map<string, InputSelection>;
  readonly selectedLibraries: Map<string, string>;
  readonly artifactPaths: Map<string, string>;
  readonly pendingArtifacts: Map<string, { readonly runId: string; readonly relativePath: string }>;
  pendingRuns: FsPendingRuns | undefined;
  /** Where the covers a person attached are kept; set before the workflow is built. */
  coverStore: FsCoverStore | undefined;
  readonly pendingRunActivity: PendingRunActivity;
  readonly activeJobs: Map<string, AbortController>;
  readonly metadataProviders: Map<string, MetadataProviderPort>;
  readonly libraryStore: FsLibraryStore;
  readonly libraryPublisher: LibraryPublisher;
  readonly opdsServer: NodeOpdsServer;
  readonly networkInterfaces: OsNetworkInterfaces;
  preferences: PreferencesWorkflow | undefined;
  activeSharing: OpdsServerHandle | undefined;
  activeSharingLibraryId: string | undefined;
  // Where a choose-file or choose-folder dialog should open next; kept in memory and mirrored to
  // disk so it survives a restart, but never told to the renderer, which never holds paths.
  lastPickerFolder: string | undefined;
  preferredNetworkInterface: NetworkInterfaceOption | undefined;
  // The last preferences and Save-dialog folder, kept so a dialog pick can be
  // written down on its own without reading the file back first: that read would race the
  // renderer's own save of the very same pick, and the slower of the two could lose it.
  currentPreferences: Preferences;
  lastSaveFolder: string | undefined;
  workflow: ConversionWorkflow | undefined;
  mangapressCli: MangapressCliAdapter | undefined;
}

export function createMainContext(): MainContext {
  const libraryStore = new FsLibraryStore();
  return {
    selectedInputs: new Map(),
    selectedLibraries: new Map(),
    artifactPaths: new Map(),
    pendingArtifacts: new Map(),
    pendingRuns: undefined,
    coverStore: undefined,
    pendingRunActivity: new PendingRunActivity(),
    activeJobs: new Map(),
    metadataProviders: new Map(
      createMetadataProviders().map((provider) => [provider.descriptor.id, provider] as const),
    ),
    libraryStore,
    libraryPublisher: new LibraryPublisher(libraryStore),
    opdsServer: new NodeOpdsServer(libraryStore),
    networkInterfaces: new OsNetworkInterfaces(),
    preferences: undefined,
    activeSharing: undefined,
    activeSharingLibraryId: undefined,
    lastPickerFolder: undefined,
    preferredNetworkInterface: undefined,
    currentPreferences: defaultPreferences,
    lastSaveFolder: undefined,
    workflow: undefined,
    mangapressCli: undefined,
  };
}

export function requireWorkflow(context: Pick<MainContext, 'workflow'>): ConversionWorkflow {
  if (context.workflow === undefined)
    throw new Error('The bundled conversion tools are not ready.');
  return context.workflow;
}
