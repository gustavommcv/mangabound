import { z } from 'zod';

import type { BookFormat, ConversionProgress, InputKind, PipelineIssue } from '@/domain/conversion';
import type { MappingDraft } from '@/domain/mapping';

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
export const identifierSchema = z.string().min(1).max(200);
export const conversionCommandSchema = z.object({
  jobId: identifierSchema,
  sessionId: identifierSchema,
  libraryId: identifierSchema,
  profile: z.string().min(1).max(40),
  format: z.enum(['epub', 'cbz', 'pdf']),
  mapping: mappingDraftSchema.optional(),
});

export interface SelectedInput {
  readonly selectionId: string;
  readonly displayName: string;
  readonly displayPath: string;
  readonly kind: InputKind;
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

export interface ConversionCommand {
  readonly jobId: string;
  readonly sessionId: string;
  readonly libraryId: string;
  readonly profile: string;
  readonly format: BookFormat;
  readonly mapping?: MappingDraft;
}

export interface ConversionProgressPayload extends ConversionProgress {
  readonly jobId: string;
}

export interface WorkflowFailure {
  readonly code: string;
  readonly message: string;
  readonly issue?: PipelineIssue;
}

export type WorkflowResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: WorkflowFailure };
