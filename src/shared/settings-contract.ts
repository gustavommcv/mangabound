import { z } from 'zod';

import type { Preferences } from '@/domain/preferences';
import { processModes } from '@/domain/process-mode';
import {
  identifierSchema,
  persistedSettingsSchema,
  type SelectedLibrary,
} from '@/shared/workflow-contract';

/**
 * What is kept between sessions (ADR 0014). It is the shape of the settings file and of what the
 * window sends to be saved, so the two are checked by the same rules.
 */
export const preferencesSchema = z.object({
  mode: z.enum(processModes),
  format: z.enum(['epub', 'cbz', 'pdf']),
  settings: persistedSettingsSchema,
  providerId: z.string().min(1).max(64).optional(),
});

export const saveSettingsCommandSchema = z.object({
  preferences: preferencesSchema,
  /** The output folder, named by the id the window was given for it and never by a path. */
  libraryId: identifierSchema.optional(),
});

export interface SaveSettingsCommand {
  readonly preferences: Preferences;
  readonly libraryId?: string;
}

/** What the window starts from: the saved options, the folder if it is still there, and what to say. */
export interface RestoredSettings {
  readonly preferences: Preferences;
  readonly library?: SelectedLibrary;
  readonly notices: readonly string[];
}
