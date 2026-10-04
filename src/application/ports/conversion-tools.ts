import type { BookDetails } from '@/domain/book-details';
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

/** One volume file mangabind wrote, with the number it is volume of the series. */
export interface BoundVolume {
  readonly number: number;
  readonly path: string;
}

export interface BindingBatchResult {
  readonly workspaceId: string;
  readonly titles: readonly {
    readonly title: string;
    readonly status: BindingTitleStatus;
    readonly volumes: readonly BoundVolume[];
    readonly combinedOutputPath?: string;
    readonly issues: readonly PipelineIssue[];
  }[];
  readonly issues: readonly PipelineIssue[];
}

export interface BindingResult {
  readonly volumes: readonly BoundVolume[];
  /**
   * Set instead of volumes having an entry per volume, when combine was requested: the whole
   * series in one file. volumes is empty when this is set.
   */
  readonly combinedOutputPath?: string;
  readonly issues: readonly PipelineIssue[];
}

export interface BindingPlan {
  readonly title: string;
  readonly volumes: readonly {
    readonly name: string;
    readonly pageCount: number;
    /** The volume's number in its series, when the tool said it. */
    readonly number?: number;
  }[];
  readonly issues: readonly PipelineIssue[];
}

/** Actual work reported by mangabind; counts are pages copied, not an estimate. */
export type BindingProgress =
  | {
      readonly stage: 'inspect';
      readonly state: 'started' | 'completed';
      readonly manga: string;
    }
  | {
      readonly stage: 'write';
      readonly state: 'started' | 'advanced' | 'completed';
      readonly manga: string;
      readonly volumeIndex: number;
      readonly volumeCount: number;
      readonly completedPages: number;
      readonly totalPages: number;
    };

export interface BindingPort {
  inspect(inputPath: string, signal?: AbortSignal): Promise<BindingInspection>;
  plan(workspaceId: string, mapping: MappingDraft, signal?: AbortSignal): Promise<BindingPlan>;
  bind(
    workspaceId: string,
    mapping: MappingDraft,
    signal?: AbortSignal,
    combine?: boolean,
    onProgress?: (progress: BindingProgress) => void,
  ): Promise<BindingResult>;
  release(workspaceId: string): Promise<void>;
  /** Reads a library (a folder of manga folders) with one mangabind `--batch` dry run. */
  planBatch(parentPath: string, signal?: AbortSignal): Promise<BindingBatchPlan>;
  /** Joins every title of a library with one mangabind `--batch` run. */
  bindBatch(
    parentPath: string,
    signal?: AbortSignal,
    combine?: boolean,
    onProgress?: (progress: BindingProgress) => void,
  ): Promise<BindingBatchResult>;
  /** Saves the mapping a user confirmed for one title as that title folder's mangabind.json. */
  writeTitleMapping(inputPath: string, mapping: MappingDraft): Promise<void>;
  /**
   * The author and language kept with a folder (in its mangabind.json, ADR 0032). It never fails:
   * a folder with nothing kept, or nothing readable, has no details.
   */
  readDetails(inputPath: string): Promise<BookDetails>;
  /** Keeps the author and language with a folder, or forgets them when there are none. */
  writeDetails(inputPath: string, details: BookDetails): Promise<void>;
}

export interface ConversionPort {
  plan(
    request: {
      readonly inputPath: string;
      readonly outputDirectory: string;
      readonly settings: MangapressSettings;
      /** The title, author and language of this book, where they were set for it. */
      readonly book?: BookDetails;
      readonly format: BookFormat;
      readonly nestedToc?: boolean;
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
      /** The title, author and language of this book, where they were set for it. */
      readonly book?: BookDetails;
      /** An image of the person's own to make this book's cover from, in the place of its first. */
      readonly cover?: string;
      readonly format: BookFormat;
      readonly nestedToc?: boolean;
    },
    options: {
      readonly signal?: AbortSignal;
      readonly onProgress: (progress: ConversionProgress) => void;
    },
  ): Promise<ConversionArtifact>;
}
