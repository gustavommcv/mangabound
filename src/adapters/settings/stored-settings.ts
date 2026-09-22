import { z } from 'zod';

import type { StoredSettings } from '@/application/ports/settings-store';
import { defaultPreferences } from '@/domain/preferences';
import { preferencesSchema } from '@/shared/settings-contract';

export const settingsFileVersion = 1;

const storedSettingsSchema = preferencesSchema.extend({
  version: z.literal(settingsFileVersion),
  outputFolder: z.string().min(1).max(4096).optional(),
  lastPickerFolder: z.string().min(1).max(4096).optional(),
});

export const defaultStoredSettings: StoredSettings = defaultPreferences;

/**
 * What a settings file holds, or undefined when it cannot be used: not JSON, another version, or a
 * value of the wrong kind or out of range (the rules a conversion request is held to, so the file
 * cannot hold what a run would refuse). Keys that are not known are dropped, so nothing outside
 * what is kept (a title, an author) gets back in through the file.
 */
export function parseStoredSettings(raw: string): StoredSettings | undefined {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const parsed = storedSettingsSchema.safeParse(json);
  if (!parsed.success) return undefined;
  const { mode, format, settings, providerId, outputFolder, lastPickerFolder } = parsed.data;
  return {
    mode,
    format,
    settings,
    ...(providerId === undefined ? {} : { providerId }),
    ...(outputFolder === undefined ? {} : { outputFolder }),
    ...(lastPickerFolder === undefined ? {} : { lastPickerFolder }),
  };
}

export function serializeStoredSettings(settings: StoredSettings): string {
  return `${JSON.stringify({ version: settingsFileVersion, ...settings }, null, 2)}\n`;
}
