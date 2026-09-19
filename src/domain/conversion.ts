import type { MappingDraft } from './mapping';
import type { MangapressSettings } from './output-profile';
import type { ProcessMode } from './process-mode';

export type InputKind = 'folder' | 'cbz';
/** What an input turned out to be once read: a library is a folder of manga folders. */
export type InspectedKind = InputKind | 'library';
export type BookFormat = 'epub' | 'cbz' | 'pdf';

export interface InputSelection {
  readonly inputPath: string;
  readonly displayName: string;
  readonly kind: InputKind;
}

/** One manga folder inside a library, with the grouping mangabind proposes for it. */
export interface InspectedTitle {
  readonly title: string;
  readonly draft: MappingDraft;
  readonly volumes: readonly PlannedBook[];
  readonly issues: readonly PipelineIssue[];
}

export interface InspectedInput {
  readonly sessionId: string;
  readonly displayName: string;
  readonly kind: InspectedKind;
  readonly mapping?: MappingDraft;
  /** The manga folders of a library. Their paths stay with the workflow. */
  readonly titles?: readonly InspectedTitle[];
  readonly issues: readonly PipelineIssue[];
}

export interface LibraryPlan {
  readonly titles: readonly InspectedTitle[];
  readonly issues: readonly PipelineIssue[];
}

export interface PipelineIssue {
  readonly tool: 'mangabind' | 'mangapress' | 'mangabound';
  readonly severity: 'warning' | 'error';
  readonly code: string;
  readonly stage: string;
  readonly recoverable: boolean;
  readonly message: string;
  readonly diagnostic?: string;
  readonly manga?: string;
  readonly volume?: string;
  readonly chapter?: string;
  readonly page?: number;
  readonly path?: string;
}

export interface ConversionArtifact {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly bytes: number;
  readonly format: BookFormat;
  readonly title: string;
  readonly author: string;
}

export interface PlannedBook {
  readonly name: string;
  readonly pageCount: number;
}

export interface WorkflowPlan {
  readonly tool: 'mangabind' | 'mangapress';
  readonly title: string;
  readonly message: string;
  readonly books: readonly PlannedBook[];
  readonly issues: readonly PipelineIssue[];
}

export interface BatchTitleOutcome {
  readonly title: string;
  readonly status: 'done' | 'failed';
  readonly artifacts: readonly ConversionArtifact[];
  readonly error?: unknown;
}

export interface ConversionProgress {
  readonly stage: 'binding' | 'processing' | 'saving';
  readonly message: string;
  readonly title?: string;
  readonly volume?: string;
  readonly chapter?: string;
  readonly page?: number;
  readonly completed?: number;
  readonly total?: number;
}

export interface ConversionRequest {
  readonly sessionId: string;
  readonly libraryPath: string;
  readonly settings: MangapressSettings;
  readonly format: BookFormat;
  readonly mapping?: MappingDraft;
  /** Defaults to running both tools when omitted. */
  readonly mode?: ProcessMode;
}

export class ConversionWorkflowError extends Error {
  constructor(
    readonly code:
      | 'binding_failed'
      | 'invalid_mapping'
      | 'invalid_settings'
      | 'mapping_save_failed'
      | 'mapping_required'
      | 'no_volumes'
      | 'not_a_library'
      | 'publish_failed'
      | 'session_not_found'
      | 'title_not_found'
      | 'unsupported_mode',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ConversionWorkflowError';
  }
}

export class ToolExecutionError extends Error {
  constructor(
    readonly issue: PipelineIssue,
    readonly exitCode: number | null,
    options?: ErrorOptions,
  ) {
    super(issue.message, options);
    this.name = 'ToolExecutionError';
  }
}
