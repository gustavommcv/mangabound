import { type BookDetails, volumeBookTitle } from './book-details';
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
  /** The author and language kept with the title's folder, when there are any. */
  readonly details?: BookDetails;
}

export interface InspectedInput {
  readonly sessionId: string;
  readonly displayName: string;
  readonly kind: InspectedKind;
  readonly mapping?: MappingDraft;
  /** The author and language kept with the folder, when there are any. */
  readonly details?: BookDetails;
  /** The manga folders of a library. Their paths stay with the workflow. */
  readonly titles?: readonly InspectedTitle[];
  /** The names of the folders of a manga that its tool could not read as chapters: left out of every book. */
  readonly unrecognized?: readonly string[];
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

/** Something mangapress noticed about a book and went on from: the book was still made. */
export interface BookWarning {
  /** The tool's stable code; what is shown is chosen by it, never by the English text. */
  readonly code: string;
  /** The tool's own sentence, shown as it is for a code the app does not know. */
  readonly message: string;
}

export interface ConversionArtifact {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly bytes: number;
  readonly format: BookFormat;
  readonly title: string;
  readonly author: string;
  readonly warnings?: readonly BookWarning[];
}

export interface PlannedBook {
  readonly name: string;
  readonly pageCount: number;
}

/**
 * The name of the book mangapress makes of one joined volume, which is not the name of the CBZ
 * mangabind joined it into: the typed title and the number of the volume if there is a title, else
 * the file's own name, and the extension of the format chosen. (A Kobo's EPUB has another
 * extension, which this does not know.)
 */
export function plannedVolumeBookName(
  volume: { readonly name: string; readonly number?: number },
  typedTitle: string | undefined,
  format: BookFormat,
): string {
  const title =
    typedTitle !== undefined && volume.number !== undefined
      ? volumeBookTitle(typedTitle, volume.number)
      : volume.name.replace(/\.cbz$/iu, '');
  return `${title}.${format}`;
}

/** A combined series is one planned EPUB; its volumes remain table-of-contents sections. */
export function plannedSingleBook(title: string, volumes: readonly PlannedBook[]): PlannedBook {
  return {
    name: `One EPUB for ${title}`,
    pageCount: volumes.reduce((total, volume) => total + volume.pageCount, 0),
  };
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

export interface VolumeConversionProgress {
  /** 1-based position in the bound series. */
  readonly number: number;
  readonly status: 'waiting' | 'processing' | 'saving' | 'done';
  readonly completed?: number;
  readonly total?: number;
}

export interface ConversionProgress {
  readonly stage: 'binding' | 'processing' | 'saving';
  readonly message: string;
  /** The final page can be copied before the CBZ archive has closed successfully. */
  readonly bindingState?: 'started' | 'advanced' | 'completed';
  readonly title?: string;
  readonly volume?: string;
  readonly chapter?: string;
  readonly page?: number;
  readonly completed?: number;
  readonly total?: number;
  /** Snapshot for the optional per-volume details; absent for a single book. */
  readonly volumes?: readonly VolumeConversionProgress[];
}

export interface ConversionRequest {
  readonly sessionId: string;
  readonly libraryPath: string;
  readonly settings: MangapressSettings;
  readonly format: BookFormat;
  readonly mapping?: MappingDraft;
  /** Defaults to running both tools when omitted. */
  readonly mode?: ProcessMode;
  readonly singleBook?: boolean;
  /** What was typed for this input's title, author and language; the defaults apply otherwise. */
  readonly details?: BookDetails;
}

export class ConversionWorkflowError extends Error {
  constructor(
    readonly code:
      | 'binding_failed'
      | 'details_save_failed'
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
