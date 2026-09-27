import { z } from 'zod';

import type { Preferences } from '@/domain/preferences';
import { processModes } from '@/domain/process-mode';
import type { NetworkInterfaceOption } from '@/shared/opds-contract';
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

export const networkInterfacePreferenceSchema = z.object({
  name: z.string().trim().min(1).max(256),
  address: z.ipv4(),
});

export const saveSettingsCommandSchema = z.object({
  preferences: preferencesSchema,
  /** The output folder, named by the id the window was given for it and never by a path. */
  libraryId: identifierSchema.optional(),
  preferredNetworkInterface: networkInterfacePreferenceSchema.optional(),
});

export interface SaveSettingsCommand {
  readonly preferences: Preferences;
  readonly libraryId?: string;
  readonly preferredNetworkInterface?: NetworkInterfaceOption;
}

/** What the window starts from: saved choices, an available folder, and any notices. */
export interface RestoredSettings {
  readonly preferences: Preferences;
  readonly library?: SelectedLibrary;
  readonly preferredNetworkInterface?: NetworkInterfaceOption;
  readonly notices: readonly string[];
}
