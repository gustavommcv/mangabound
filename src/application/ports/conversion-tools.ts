import type {
  BookFormat,
  ConversionArtifact,
  ConversionProgress,
  PipelineIssue,
} from '@/domain/conversion';
import type { MappingDraft } from '@/domain/mapping';

export interface BindingInspection {
  readonly workspaceId: string;
  readonly draft: MappingDraft;
  readonly issues: readonly PipelineIssue[];
}

export interface BindingResult {
  readonly volumePaths: readonly string[];
  readonly issues: readonly PipelineIssue[];
}

export interface BindingPort {
  inspect(inputPath: string, signal?: AbortSignal): Promise<BindingInspection>;
  bind(workspaceId: string, mapping: MappingDraft, signal?: AbortSignal): Promise<BindingResult>;
  release(workspaceId: string): Promise<void>;
}

export interface ConversionPort {
  convert(
    request: {
      readonly inputPath: string;
      readonly outputDirectory: string;
      readonly profile: string;
      readonly format: BookFormat;
    },
    options: {
      readonly signal?: AbortSignal;
      readonly onProgress: (progress: ConversionProgress) => void;
    },
  ): Promise<ConversionArtifact>;
}
