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
  PlanSummary,
  SelectedInput,
  SelectedLibrary,
  WorkflowResult,
} from './workflow-contract';

import type { InputKind } from '@/domain/conversion';
import type { MappingDraft } from '@/domain/mapping';

export interface RuntimeInfo {
  readonly electron: string;
  readonly platform: NodeJS.Platform;
}

export interface MangaboundBridge {
  readonly runtime: RuntimeInfo;
  readonly getToolchainStatus: () => Promise<ToolchainStatus>;
  readonly chooseInput: (kind: InputKind) => Promise<WorkflowResult<SelectedInput | null>>;
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
  readonly openArtifact: (artifactId: string) => Promise<WorkflowResult<undefined>>;
  readonly showArtifactInFolder: (artifactId: string) => Promise<WorkflowResult<undefined>>;
  readonly onConversionProgress: (
    listener: (progress: ConversionProgressPayload) => void,
  ) => () => void;
}
