import { contextBridge, ipcRenderer } from 'electron';

import type { InputKind } from '../domain/conversion';
import type { MangaboundBridge } from '../shared/runtime-info';
import type { ToolchainStatus } from '../shared/toolchain-status';
import type {
  ArtifactSummary,
  ConversionCommand,
  ConversionProgressPayload,
  DeviceProfileSummary,
  InspectedInputPayload,
  PlanSummary,
  SelectedInput,
  SelectedLibrary,
  WorkflowResult,
} from '../shared/workflow-contract';

function invoke<T>(channel: string, payload?: unknown): Promise<WorkflowResult<T>> {
  return ipcRenderer.invoke(channel, payload) as Promise<WorkflowResult<T>>;
}

const bridge: MangaboundBridge = Object.freeze({
  getToolchainStatus: async () => {
    const status: unknown = await ipcRenderer.invoke('toolchain:get-status');
    return status as ToolchainStatus;
  },
  chooseInput: (kind: InputKind) => invoke<SelectedInput | null>('workflow:choose-input', kind),
  inspectInput: (selectionId: string) =>
    invoke<InspectedInputPayload>('workflow:inspect-input', selectionId),
  releaseInput: (sessionId: string) => invoke<undefined>('workflow:release-input', sessionId),
  chooseLibrary: () => invoke<SelectedLibrary | null>('workflow:choose-library'),
  getDeviceProfiles: () => invoke<readonly DeviceProfileSummary[]>('workflow:get-device-profiles'),
  convert: (command: ConversionCommand) =>
    invoke<readonly ArtifactSummary[]>('workflow:convert', command),
  planConversion: (command: ConversionCommand) => invoke<PlanSummary>('workflow:plan', command),
  cancelConversion: (jobId: string) => invoke<undefined>('workflow:cancel', jobId),
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
  runtime: Object.freeze({
    electron: process.versions.electron,
    platform: process.platform,
  }),
});

contextBridge.exposeInMainWorld('mangabound', bridge);
