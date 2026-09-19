import { z } from 'zod';

import type { BookFormat, ConversionProgress, InputKind, PipelineIssue } from '@/domain/conversion';
import type { MappingDraft } from '@/domain/mapping';
import type { MangapressSettings } from '@/domain/output-profile';
import {
  batchProcessModes,
  type BatchProcessMode,
  processModes,
  type ProcessMode,
} from '@/domain/process-mode';

const chapterSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  path: z.string(),
  pageCount: z.number().int().nonnegative(),
  chapter: z.number().nonnegative().optional(),
  special: z.string().optional(),
  parsedVolume: z.number().nonnegative().optional(),
});
const volumeSchema = z.object({
  id: z.string().min(1),
  number: z.string().min(1),
  chapterIds: z.array(z.string().min(1)),
});
export const mappingDraftSchema = z.object({
  mangaTitle: z.string(),
  chapters: z.array(chapterSchema),
  volumes: z.array(volumeSchema),
  source: z.object({ provider: z.string(), id: z.string() }).optional(),
});

export const inputKindSchema = z.enum(['folder', 'cbz']);
export const chooseInputsKindSchema = z.enum(['files', 'folders']);
export const registerInputsCommandSchema = z.object({
  paths: z.array(z.string()).max(1000),
});
export const identifierSchema = z.string().min(1).max(200);
const mangapressSettingsSchema = z
  .object({
    deviceProfile: z.string().trim().min(1).max(40),
    quiet: z.boolean(),
    mangaStyle: z.boolean(),
    cropping: z.enum(['disabled', 'margins', 'margins-and-page-numbers']),
    croppingPower: z.number().finite(),
    croppingMinimum: z.number().finite().min(0).max(100),
    preserveMargin: z.number().finite().min(0).max(100),
    splitter: z.enum(['split', 'rotate', 'both']),
    upscale: z.boolean(),
    stretch: z.boolean(),
    wallpaper: z.boolean(),
    whiteBorders: z.boolean(),
    forcePng: z.boolean(),
    jpegQuality: z.number().int().min(1).max(100).optional(),
    rotateRight: z.boolean(),
    gamma: z.number().finite().optional(),
    autoLevel: z.boolean(),
    noAutoContrast: z.boolean(),
    interPanelCrop: z.enum(['disabled', 'horizontal', 'both']),
    eraseRainbow: z.boolean(),
    title: z.string().max(300).optional(),
    author: z.string().max(300).optional(),
    metadataTitle: z.enum(['series-only', 'combine', 'title-only']),
    keepComicInfo: z.boolean(),
    language: z.string().trim().min(1).max(40),
    customWidth: z.number().int().min(1).optional(),
    customHeight: z.number().int().min(1).optional(),
  })
  .refine(
    (settings) =>
      settings.deviceProfile !== 'OTHER' ||
      (settings.customWidth !== undefined && settings.customHeight !== undefined),
    { message: 'The custom device profile needs both a width and height.' },
  );
export const conversionCommandSchema = z.object({
  jobId: identifierSchema,
  sessionId: identifierSchema,
  libraryId: identifierSchema,
  settings: mangapressSettingsSchema,
  format: z.enum(['epub', 'cbz', 'pdf']),
  mapping: mappingDraftSchema.optional(),
  mode: z.enum(processModes).optional(),
});

export const planBatchCommandSchema = z.object({
  jobId: identifierSchema,
  parentPath: z.string().min(1),
});

export const batchConversionCommandSchema = z.object({
  jobId: identifierSchema,
  parentPath: z.string().min(1),
  libraryId: identifierSchema,
  settings: mangapressSettingsSchema,
  format: z.enum(['epub', 'cbz', 'pdf']),
  titles: z.array(z.string().min(1)).optional(),
  mode: z.enum(batchProcessModes).optional(),
});

export const writeTitleMappingCommandSchema = z.object({
  inputPath: z.string().min(1),
  mapping: mappingDraftSchema,
});

export const searchMetadataCommandSchema = z.object({
  jobId: identifierSchema,
  providerId: z.string().min(1),
  title: z.string().min(1),
});

export const suggestVolumesCommandSchema = z.object({
  jobId: identifierSchema,
  providerId: z.string().min(1),
  /** The provider's own id for the work a search returned. */
  workId: z.string().min(1),
});

export interface SelectedInput {
  readonly selectionId: string;
  readonly displayName: string;
  readonly displayPath: string;
  readonly kind: InputKind;
}

/** What one add (a dialog, or files dropped on the window) turned into. */
export interface RegisteredInputs {
  readonly inputs: readonly SelectedInput[];
  readonly rejected: readonly { readonly name: string; readonly reason: string }[];
}

export interface SelectedLibrary {
  readonly libraryId: string;
  readonly displayPath: string;
}

export interface InspectedInputPayload {
  readonly sessionId: string;
  readonly displayName: string;
  readonly kind: InputKind;
  readonly mapping?: MappingDraft;
  readonly issues: readonly PipelineIssue[];
}

export interface DeviceProfileSummary {
  readonly code: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly grayLevels: number;
  readonly family: string;
}

export interface ArtifactSummary {
  readonly id: string;
  readonly name: string;
  readonly bytes: number;
  readonly format: BookFormat;
}

export interface PlanSummary {
  readonly tool: 'mangabind' | 'mangapress';
  readonly title: string;
  readonly message: string;
  readonly books: readonly {
    readonly name: string;
    readonly pageCount: number;
  }[];
  readonly issues: readonly PipelineIssue[];
}

export interface ConversionCommand {
  readonly jobId: string;
  readonly sessionId: string;
  readonly libraryId: string;
  readonly settings: MangapressSettings;
  readonly format: BookFormat;
  readonly mapping?: MappingDraft;
  readonly mode?: ProcessMode;
}

export interface ConversionProgressPayload extends ConversionProgress {
  readonly jobId: string;
}

export type BatchTitleStatus = 'completed' | 'completed_with_warnings' | 'failed';

export interface BatchPlanTitle {
  readonly title: string;
  readonly inputPath: string;
  readonly status: BatchTitleStatus;
  readonly draft: MappingDraft;
  readonly volumes: readonly {
    readonly name: string;
    readonly pageCount: number;
  }[];
  readonly issues: readonly PipelineIssue[];
}

export interface BatchPlanSummary {
  readonly titles: readonly BatchPlanTitle[];
  readonly issues: readonly PipelineIssue[];
}

export interface BatchConversionCommand {
  readonly jobId: string;
  readonly parentPath: string;
  readonly libraryId: string;
  readonly settings: MangapressSettings;
  readonly format: BookFormat;
  readonly titles?: readonly string[];
  readonly mode?: BatchProcessMode;
}

export interface BatchTitleResult {
  readonly title: string;
  readonly status: 'done' | 'failed';
  readonly artifacts: readonly ArtifactSummary[];
  readonly failure?: WorkflowFailure;
}

export interface MetadataProviderDescriptor {
  readonly id: string;
  readonly displayName: string;
}

export interface MetadataSearchResult {
  readonly id: string;
  readonly title: string;
  readonly provider: string;
}

export interface VolumeSuggestion {
  readonly number: string;
  readonly chapterNumbers: readonly number[];
}

export interface WorkflowFailure {
  readonly code: string;
  readonly message: string;
  readonly issue?: PipelineIssue;
}

export type WorkflowResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: WorkflowFailure };
