import type { ToolchainStatus } from './toolchain-status';
import type {
  ArtifactSummary,
  ConversionCommand,
  ConversionProgressPayload,
  DeviceProfileSummary,
  InspectedInputPayload,
  SelectedInput,
  SelectedLibrary,
  WorkflowResult,
} from './workflow-contract';

import type { InputKind } from '@/domain/conversion';

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
  readonly cancelConversion: (jobId: string) => Promise<WorkflowResult<undefined>>;
  readonly openArtifact: (artifactId: string) => Promise<WorkflowResult<undefined>>;
  readonly showArtifactInFolder: (artifactId: string) => Promise<WorkflowResult<undefined>>;
  readonly onConversionProgress: (
    listener: (progress: ConversionProgressPayload) => void,
  ) => () => void;
}
