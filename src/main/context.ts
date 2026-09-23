import { FsLibraryStore } from '@/adapters/library/fs-library-store';
import { createMetadataProviders } from '@/adapters/metadata-providers/registry';
import { type MangapressCliAdapter } from '@/adapters/mangapress/cli';
import { OsNetworkInterfaces } from '@/adapters/network/os-network-interfaces';
import { NodeOpdsServer } from '@/adapters/opds/http-server';
import type { MetadataProviderPort } from '@/application/ports/metadata-provider';
import type { OpdsServerHandle } from '@/application/ports/opds-server';
import { LibraryPublisher } from '@/application/workflows/library-publisher';
import { type PreferencesWorkflow } from '@/application/workflows/preferences';
import { type SingleInputWorkflow } from '@/application/workflows/single-input';
import type { InputSelection } from '@/domain/conversion';
import { defaultPreferences, type Preferences } from '@/domain/preferences';

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
  readonly activeJobs: Map<string, AbortController>;
  readonly metadataProviders: Map<string, MetadataProviderPort>;
  readonly libraryStore: FsLibraryStore;
  readonly libraryPublisher: LibraryPublisher;
  readonly opdsServer: NodeOpdsServer;
  readonly networkInterfaces: OsNetworkInterfaces;
  preferences: PreferencesWorkflow | undefined;
  activeSharing: OpdsServerHandle | undefined;
  // Where a choose-file or choose-folder dialog should open next; kept in memory and mirrored to
  // disk so it survives a restart, but never told to the renderer, which never holds paths.
  lastPickerFolder: string | undefined;
  // The last preferences and output folder the renderer asked to save, kept so a dialog pick can be
  // written down on its own without reading the file back first: that read would race the
  // renderer's own save of the very same pick, and the slower of the two could lose it.
  currentPreferences: Preferences;
  currentOutputFolder: string | undefined;
  workflow: SingleInputWorkflow | undefined;
  mangapressCli: MangapressCliAdapter | undefined;
}

export function createMainContext(): MainContext {
  const libraryStore = new FsLibraryStore();
  return {
    selectedInputs: new Map(),
    selectedLibraries: new Map(),
    artifactPaths: new Map(),
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
    lastPickerFolder: undefined,
    currentPreferences: defaultPreferences,
    currentOutputFolder: undefined,
    workflow: undefined,
    mangapressCli: undefined,
  };
}

export function requireWorkflow(context: Pick<MainContext, 'workflow'>): SingleInputWorkflow {
  if (context.workflow === undefined)
    throw new Error('The bundled conversion tools are not ready.');
  return context.workflow;
}
