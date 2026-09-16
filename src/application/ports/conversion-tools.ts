import type {
  BookFormat,
  ConversionArtifact,
  ConversionProgress,
  PipelineIssue,
} from '@/domain/conversion';
import type { MappingDraft } from '@/domain/mapping';
import type { MangapressSettings } from '@/domain/output-profile';

export interface BindingInspection {
  readonly workspaceId: string;
  readonly draft: MappingDraft;
  readonly issues: readonly PipelineIssue[];
}

export type BindingTitleStatus = 'completed' | 'completed_with_warnings' | 'failed';

export interface BindingBatchTitle {
  readonly title: string;
  readonly inputPath: string;
  readonly status: BindingTitleStatus;
  readonly draft: MappingDraft;
  readonly volumes: readonly {
    readonly name: string;
    readonly pageCount: number;
  }[];
  readonly issues: readonly PipelineIssue[];
}

export interface BindingBatchPlan {
  readonly titles: readonly BindingBatchTitle[];
  readonly issues: readonly PipelineIssue[];
}

export interface BindingBatchResult {
  readonly workspaceId: string;
  readonly titles: readonly {
    readonly title: string;
    readonly status: BindingTitleStatus;
    readonly volumePaths: readonly string[];
    readonly issues: readonly PipelineIssue[];
  }[];
  readonly issues: readonly PipelineIssue[];
}

export interface BindingResult {
  readonly volumePaths: readonly string[];
  readonly issues: readonly PipelineIssue[];
}

export interface BindingPlan {
  readonly title: string;
  readonly volumes: readonly {
    readonly name: string;
    readonly pageCount: number;
  }[];
  readonly issues: readonly PipelineIssue[];
}

export interface BindingPort {
  inspect(inputPath: string, signal?: AbortSignal): Promise<BindingInspection>;
  plan(workspaceId: string, mapping: MappingDraft, signal?: AbortSignal): Promise<BindingPlan>;
  bind(workspaceId: string, mapping: MappingDraft, signal?: AbortSignal): Promise<BindingResult>;
  release(workspaceId: string): Promise<void>;
  planBatch?(parentPath: string, signal?: AbortSignal): Promise<BindingBatchPlan>;
  bindBatch?(parentPath: string, signal?: AbortSignal): Promise<BindingBatchResult>;
  writeTitleMapping?(inputPath: string, mapping: MappingDraft): Promise<void>;
}

export interface ConversionPort {
  plan(
    request: {
      readonly inputPath: string;
      readonly outputDirectory: string;
      readonly settings: MangapressSettings;
      readonly format: BookFormat;
    },
    options?: { readonly signal?: AbortSignal },
  ): Promise<{
    readonly title: string;
    readonly name: string;
    readonly pageCount: number;
    readonly profile: string;
    readonly width: number;
    readonly height: number;
  }>;
  convert(
    request: {
      readonly inputPath: string;
      readonly outputDirectory: string;
      readonly settings: MangapressSettings;
      readonly format: BookFormat;
    },
    options: {
      readonly signal?: AbortSignal;
      readonly onProgress: (progress: ConversionProgress) => void;
    },
  ): Promise<ConversionArtifact>;
}
