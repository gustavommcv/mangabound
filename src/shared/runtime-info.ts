import type { NetworkInterfaceOption, OpdsAuthConfig, OpdsSharingStatus } from './opds-contract';
import type { ToolchainStatus } from './toolchain-status';
import type {
  ArtifactSummary,
  BatchConversionCommand,
  BatchPlanSummary,
  BatchTitleResult,
  ConversionCommand,
  ConversionProgressPayload,
  DeviceProfileSummary,
  InspectedInputPayload,
  MetadataProviderDescriptor,
  MetadataSearchResult,
  PlanSummary,
  RegisteredInputs,
  SelectedLibrary,
  VolumeSuggestion,
  WorkflowResult,
} from './workflow-contract';

import type { MappingDraft } from '@/domain/mapping';

export interface RuntimeInfo {
  readonly electron: string;
  readonly platform: NodeJS.Platform;
}

export interface MangaboundBridge {
  readonly runtime: RuntimeInfo;
  readonly getToolchainStatus: () => Promise<ToolchainStatus>;
  /** Opens a native picker for several comic files or several manga folders. */
  readonly chooseInputs: (kind: 'files' | 'folders') => Promise<WorkflowResult<RegisteredInputs>>;
  /** Registers files dropped on the window; the paths are read from the files, not typed in. */
  readonly registerDroppedFiles: (
    files: readonly File[],
  ) => Promise<WorkflowResult<RegisteredInputs>>;
  readonly inspectInput: (selectionId: string) => Promise<WorkflowResult<InspectedInputPayload>>;
  readonly releaseInput: (sessionId: string) => Promise<WorkflowResult<undefined>>;
  readonly chooseLibrary: () => Promise<WorkflowResult<SelectedLibrary | null>>;
  readonly getDeviceProfiles: () => Promise<WorkflowResult<readonly DeviceProfileSummary[]>>;
  readonly convert: (
    command: ConversionCommand,
  ) => Promise<WorkflowResult<readonly ArtifactSummary[]>>;
  readonly planConversion: (command: ConversionCommand) => Promise<WorkflowResult<PlanSummary>>;
  readonly cancelConversion: (jobId: string) => Promise<WorkflowResult<undefined>>;
  readonly chooseInputBatch: () => Promise<
    WorkflowResult<{ parentPath: string; displayName: string } | null>
  >;
  readonly planBatch: (
    jobId: string,
    parentPath: string,
  ) => Promise<WorkflowResult<BatchPlanSummary>>;
  readonly writeTitleMapping: (
    inputPath: string,
    mapping: MappingDraft,
  ) => Promise<WorkflowResult<undefined>>;
  readonly convertBatch: (
    command: BatchConversionCommand,
  ) => Promise<WorkflowResult<readonly BatchTitleResult[]>>;
  readonly listMetadataProviders: () => Promise<
    WorkflowResult<readonly MetadataProviderDescriptor[]>
  >;
  readonly searchMetadata: (
    jobId: string,
    providerId: string,
    title: string,
  ) => Promise<WorkflowResult<readonly MetadataSearchResult[]>>;
  readonly suggestVolumes: (
    jobId: string,
    providerId: string,
    workId: string,
  ) => Promise<WorkflowResult<{ volumes: readonly VolumeSuggestion[] }>>;
  readonly openArtifact: (artifactId: string) => Promise<WorkflowResult<undefined>>;
  readonly showArtifactInFolder: (artifactId: string) => Promise<WorkflowResult<undefined>>;
  readonly onConversionProgress: (
    listener: (progress: ConversionProgressPayload) => void,
  ) => () => void;
  readonly listNetworkInterfaces: () => Promise<WorkflowResult<readonly NetworkInterfaceOption[]>>;
  readonly startSharing: (
    libraryId: string,
    interfaceAddress: string,
    auth: OpdsAuthConfig,
  ) => Promise<WorkflowResult<OpdsSharingStatus>>;
  readonly stopSharing: () => Promise<WorkflowResult<undefined>>;
  readonly getSharingStatus: () => Promise<WorkflowResult<OpdsSharingStatus>>;
}
