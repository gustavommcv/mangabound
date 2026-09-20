import { contextBridge, ipcRenderer, webUtils } from 'electron';

import type { MappingDraft } from '../domain/mapping';
import type {
  NetworkInterfaceOption,
  OpdsAuthConfig,
  OpdsSharingStatus,
} from '../shared/opds-contract';
import type { MangaboundBridge } from '../shared/runtime-info';
import type { RestoredSettings, SaveSettingsCommand } from '../shared/settings-contract';
import type { ToolchainStatus } from '../shared/toolchain-status';
import type {
  ArtifactSummary,
  ConversionCommand,
  ConversionProgressPayload,
  DeviceProfileSummary,
  InspectedInputPayload,
  LibraryConversionCommand,
  LibraryPlanSummary,
  LibraryTitleResult,
  MetadataProviderDescriptor,
  MetadataSearchResult,
  PlanSummary,
  RegisteredInputs,
  SelectedLibrary,
  VolumeSuggestion,
  WorkflowResult,
} from '../shared/workflow-contract';

function invoke<T>(channel: string, payload?: unknown): Promise<WorkflowResult<T>> {
  return ipcRenderer.invoke(channel, payload) as Promise<WorkflowResult<T>>;
}

/**
 * The location of a dropped file on disk. Something that is not a File throws, and a File that has
 * no place on disk (dragged out of a web page) gives an empty string. Either way an empty path is
 * handed on, which the main process reports as one item that could not be read.
 */
function droppedFilePath(file: File): string {
  try {
    return webUtils.getPathForFile(file);
  } catch {
    return '';
  }
}

const bridge: MangaboundBridge = Object.freeze({
  getToolchainStatus: async () => {
    const status: unknown = await ipcRenderer.invoke('toolchain:get-status');
    return status as ToolchainStatus;
  },
  chooseInputs: (kind: 'files' | 'folders') =>
    invoke<RegisteredInputs>('workflow:choose-inputs', kind),
  registerDroppedFiles: (files: readonly File[]) =>
    invoke<RegisteredInputs>('workflow:register-inputs', {
      paths: files.map(droppedFilePath),
    }),
  inspectInput: (selectionId: string) =>
    invoke<InspectedInputPayload>('workflow:inspect-input', selectionId),
  releaseInput: (sessionId: string) => invoke<undefined>('workflow:release-input', sessionId),
  chooseLibrary: () => invoke<SelectedLibrary | null>('workflow:choose-library'),
  getDeviceProfiles: () => invoke<readonly DeviceProfileSummary[]>('workflow:get-device-profiles'),
  convert: (command: ConversionCommand) =>
    invoke<readonly ArtifactSummary[]>('workflow:convert', command),
  planConversion: (command: ConversionCommand) => invoke<PlanSummary>('workflow:plan', command),
  cancelConversion: (jobId: string) => invoke<undefined>('workflow:cancel', jobId),
  planLibrary: (jobId: string, sessionId: string) =>
    invoke<LibraryPlanSummary>('workflow:plan-library', { jobId, sessionId }),
  writeTitleMapping: (sessionId: string, title: string, mapping: MappingDraft) =>
    invoke<undefined>('workflow:write-title-mapping', { sessionId, title, mapping }),
  convertLibrary: (command: LibraryConversionCommand) =>
    invoke<readonly LibraryTitleResult[]>('workflow:convert-library', command),
  listMetadataProviders: () =>
    invoke<readonly MetadataProviderDescriptor[]>('workflow:list-metadata-providers'),
  searchMetadata: (jobId: string, providerId: string, title: string) =>
    invoke<readonly MetadataSearchResult[]>('workflow:search-metadata', {
      jobId,
      providerId,
      title,
    }),
  suggestVolumes: (jobId: string, providerId: string, workId: string, language?: string) =>
    invoke<{ volumes: readonly VolumeSuggestion[] }>('workflow:suggest-volumes', {
      jobId,
      providerId,
      workId,
      ...(language === undefined ? {} : { language }),
    }),
  openProviderHomepage: (providerId: string) =>
    invoke<undefined>('workflow:open-provider-homepage', { providerId }),
  openArtifact: (artifactId: string) => invoke<undefined>('artifact:open', artifactId),
  showArtifactInFolder: (artifactId: string) =>
    invoke<undefined>('artifact:show-in-folder', artifactId),
  onConversionProgress: (listener: (progress: ConversionProgressPayload) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: ConversionProgressPayload,
    ): void => {
      listener(payload);
    };
    ipcRenderer.on('workflow:progress', handler);
    return () => {
      ipcRenderer.removeListener('workflow:progress', handler);
    };
  },
  listNetworkInterfaces: () =>
    invoke<readonly NetworkInterfaceOption[]>('opds:list-network-interfaces'),
  startSharing: (libraryId: string, interfaceAddress: string, auth: OpdsAuthConfig) =>
    invoke<OpdsSharingStatus>('opds:start-sharing', { libraryId, interfaceAddress, auth }),
  stopSharing: () => invoke<undefined>('opds:stop-sharing'),
  getSharingStatus: () => invoke<OpdsSharingStatus>('opds:get-status'),
  loadSettings: () => invoke<RestoredSettings>('settings:load'),
  saveSettings: (command: SaveSettingsCommand) => invoke<undefined>('settings:save', command),
  runtime: Object.freeze({
    electron: process.versions.electron,
    platform: process.platform,
  }),
});

contextBridge.exposeInMainWorld('mangabound', bridge);
