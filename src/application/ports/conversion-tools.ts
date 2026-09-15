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
