import { z } from 'zod';

import type {
  BookFormat,
  ConversionProgress,
  InputKind,
  InspectedKind,
  PipelineIssue,
} from '@/domain/conversion';
import {
  type BookDetails,
  languageTagPattern,
  maxDetailLength,
  maxLanguageLength,
} from '@/domain/book-details';
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
  language: z.string().max(40).optional(),
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

export const chooseInputsKindSchema = z.enum(['files', 'folders']);
export const registerInputsCommandSchema = z.object({
  paths: z.array(z.string()).max(1000),
});
export const identifierSchema = z.string().min(1).max(200);
/** The mangapress options a person keeps between sessions (ADR 0014). */
const mangapressSettingFields = {
  deviceProfile: z.string().trim().min(1).max(40),
  // An option added after a release starts with a default: the settings file of someone who
  // updates has no such key, and must still be read (ADR 0014).
  noProcessing: z.boolean().default(false),
  quiet: z.boolean(),
  webtoon: z.boolean().default(false),
  mangaStyle: z.boolean(),
  cropping: z.enum(['disabled', 'margins', 'margins-and-page-numbers']),
  croppingPower: z.number().finite(),
  croppingMinimum: z.number().finite().min(0).max(100),
  preserveMargin: z.number().finite().min(0).max(100),
  splitter: z.enum(['split', 'rotate', 'both']),
  noRotate: z.boolean().default(false),
  rotateFirst: z.boolean().default(false),
  maximizeStrips: z.boolean().default(false),
  upscale: z.boolean(),
  stretch: z.boolean(),
  wallpaper: z.boolean(),
  whiteBorders: z.boolean(),
  blackBorders: z.boolean().default(false),
  spreadShift: z.boolean().default(false),
  onePageLandscape: z.boolean().default(false),
  invertDirection: z.boolean().default(false),
  forceColor: z.boolean().default(false),
  forcePng: z.boolean(),
  noQuantize: z.boolean().default(false),
  pngLegacy: z.boolean().default(false),
  forcePngRgb: z.boolean().default(false),
  jpegQuality: z.number().int().min(1).max(100).optional(),
  rotateRight: z.boolean(),
  gamma: z.number().finite().optional(),
  autoLevel: z.boolean(),
  noAutoContrast: z.boolean(),
  colorAutoContrast: z.boolean().default(false),
  interPanelCrop: z.enum(['disabled', 'horizontal', 'both']),
  eraseRainbow: z.boolean(),
  metadataTitle: z.enum(['series-only', 'combine', 'title-only']),
  keepComicInfo: z.boolean(),
  language: z.string().trim().min(1).max(40),
  customWidth: z.number().int().min(1).optional(),
  customHeight: z.number().int().min(1).optional(),
  combineIntoOneVolume: z.boolean().default(false),
};

const customProfileNeedsASize = {
  check: (settings: {
    readonly deviceProfile: string;
    readonly customWidth?: number | undefined;
    readonly customHeight?: number | undefined;
  }): boolean =>
    settings.deviceProfile !== 'OTHER' ||
    (settings.customWidth !== undefined && settings.customHeight !== undefined),
  message: 'The custom device profile needs both a width and height.',
};

/** The mangapress options, as a run is sent them and as the settings file holds them. */
export const mangapressSettingsSchema = z
  .object(mangapressSettingFields)
  .refine(customProfileNeedsASize.check, { message: customProfileNeedsASize.message });

/** A language tag such as "en" or "pt-br": letters and digits in short groups joined by dashes. */
export const languageTagSchema = z.string().max(maxLanguageLength).regex(languageTagPattern);

/** What a person typed for one book or series; a field left out means the default (ADR 0030). */
export const bookDetailsSchema = z.object({
  title: z.string().trim().min(1).max(maxDetailLength).optional(),
  author: z.string().trim().min(1).max(maxDetailLength).optional(),
  language: languageTagSchema.optional(),
});

export const conversionCommandSchema = z.object({
  jobId: identifierSchema,
  sessionId: identifierSchema,
  libraryId: identifierSchema,
  settings: mangapressSettingsSchema,
  format: z.enum(['epub', 'cbz', 'pdf']),
  mapping: mappingDraftSchema.optional(),
  mode: z.enum(processModes).optional(),
  singleBook: z.boolean().optional(),
  /** The title, author and language typed for this input; the defaults apply where left out. */
  details: bookDetailsSchema.optional(),
});
export const planConversionCommandSchema = conversionCommandSchema.omit({ libraryId: true });

/** A library is named by the session it was read in, never by a path. */
export const planLibraryCommandSchema = z.object({
  jobId: identifierSchema,
  sessionId: identifierSchema,
});

export const libraryConversionCommandSchema = z.object({
  jobId: identifierSchema,
  sessionId: identifierSchema,
  libraryId: identifierSchema,
  settings: mangapressSettingsSchema,
  format: z.enum(['epub', 'cbz', 'pdf']),
  titles: z.array(z.string().min(1)).max(1000).optional(),
  mode: z.enum(batchProcessModes).optional(),
  singleBook: z.boolean().optional(),
  /** What was typed for each title of the library, by the title's name. */
  titleDetails: z
    .array(z.object({ title: z.string().min(1), details: bookDetailsSchema }))
    .max(1000)
    .optional(),
});

/** Keeps the author and language of a folder, or of one title of a library, with that folder. */
export const saveBookDetailsCommandSchema = z.object({
  sessionId: identifierSchema,
  /** The title's name in the library the session read; absent for a folder of its own. */
  title: z.string().min(1).optional(),
  details: bookDetailsSchema,
});

export interface SaveBookDetailsCommand {
  readonly sessionId: string;
  readonly title?: string;
  readonly details: BookDetails;
}

export const writeTitleMappingCommandSchema = z.object({
  sessionId: identifierSchema,
  /** The title's name in the library the session read; its folder is found from that. */
  title: z.string().min(1),
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
  /** The language to group the volumes in, when the folders declare one. */
  language: languageTagSchema.optional(),
});

export const openProviderHomepageCommandSchema = z.object({ providerId: z.string().min(1) });

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

/** One manga of a library, with the grouping mangabind proposes for it. */
export interface LibraryTitleSummary {
  readonly title: string;
  readonly draft: MappingDraft;
  readonly volumes: readonly {
    readonly name: string;
    readonly pageCount: number;
  }[];
  readonly issues: readonly PipelineIssue[];
  /** The author and language kept with the title's folder, when there are any. */
  readonly details?: BookDetails;
}

export interface InspectedInputPayload {
  readonly sessionId: string;
  readonly displayName: string;
  readonly kind: InspectedKind;
  readonly mapping?: MappingDraft;
  /** The author and language kept with the folder, when there are any. */
  readonly details?: BookDetails;
  /** The manga of a library. */
  readonly titles?: readonly LibraryTitleSummary[];
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

export interface PendingArtifactSummary extends ArtifactSummary {
  readonly saved: boolean;
}

export interface PendingRunSummary {
  readonly libraryId: string;
  readonly createdAt: number;
  readonly artifacts: readonly PendingArtifactSummary[];
}

export interface SaveAllResult {
  readonly savedIds: readonly string[];
  readonly failures: readonly { readonly id: string; readonly message: string }[];
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
  readonly singleBook?: boolean;
  /** The title, author and language typed for this input. */
  readonly details?: BookDetails;
}
export type PlanConversionCommand = Omit<ConversionCommand, 'libraryId'>;

export interface ConversionProgressPayload extends ConversionProgress {
  readonly jobId: string;
}

export interface LibraryPlanSummary {
  readonly titles: readonly LibraryTitleSummary[];
  readonly issues: readonly PipelineIssue[];
}

export interface LibraryConversionCommand {
  readonly jobId: string;
  readonly sessionId: string;
  readonly libraryId: string;
  readonly settings: MangapressSettings;
  readonly format: BookFormat;
  readonly titles?: readonly string[];
  readonly mode?: BatchProcessMode;
  readonly singleBook?: boolean;
  /** What was typed for each title of the library, by the title's name. */
  readonly titleDetails?: readonly { readonly title: string; readonly details: BookDetails }[];
}

export interface LibraryTitleResult {
  readonly title: string;
  readonly status: 'done' | 'failed';
  readonly artifacts: readonly ArtifactSummary[];
  readonly failure?: WorkflowFailure;
}

export interface MetadataProviderDescriptor {
  readonly id: string;
  readonly displayName: string;
  /** The service's own site, shown in the list and opened from the credit. */
  readonly homepage: string;
  /** What the service is, in a few words. */
  readonly description: string;
}

export interface MetadataSearchResult {
  readonly id: string;
  readonly title: string;
  readonly provider: string;
  /** Who wrote it, when the source says. */
  readonly authors?: readonly string[];
  /** The year it began, when the source says. */
  readonly year?: number;
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
