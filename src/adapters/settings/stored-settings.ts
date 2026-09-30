import { z } from 'zod';

import type { StoredSettings } from '@/application/ports/settings-store';
import { defaultPreferences } from '@/domain/preferences';
import { networkInterfacePreferenceSchema, preferencesSchema } from '@/shared/settings-contract';

export const settingsFileVersion = 1;

const storedSettingsSchema = preferencesSchema.extend({
  version: z.literal(settingsFileVersion),
  outputFolder: z.string().min(1).max(4096).optional(),
  lastPickerFolder: z.string().min(1).max(4096).optional(),
  preferredNetworkInterface: networkInterfacePreferenceSchema.optional(),
});

export const defaultStoredSettings: StoredSettings = defaultPreferences;

/**
 * What a settings file holds, or undefined when it cannot be used: not JSON, another version, or a
 * value of the wrong kind or out of range (the rules a conversion request is held to, so the file
 * cannot hold what a run would refuse). Keys that are not known are dropped, so nothing outside
 * what is kept (such as the title and author an older version once had) gets back in through the
 * file.
 */
export function parseStoredSettings(raw: string): StoredSettings | undefined {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof json === 'object' && json !== null) {
    const rawObj = json as Record<string, unknown>;
    const rawSettings = rawObj.settings as Record<string, unknown> | undefined;
    if (rawObj.singleBook === undefined) {
      if (rawObj.combineIntoOneVolume === true || rawSettings?.combineIntoOneVolume === true) {
        rawObj.singleBook = true;
      }
    }
    if (rawSettings && 'combineIntoOneVolume' in rawSettings) {
      delete rawSettings.combineIntoOneVolume;
    }
    if ('combineIntoOneVolume' in rawObj) {
      delete rawObj.combineIntoOneVolume;
    }
  }
  const parsed = storedSettingsSchema.safeParse(json);
  if (!parsed.success) return undefined;
  const {
    mode,
    format,
    singleBook,
    settings,
    providerId,
    outputFolder,
    lastPickerFolder,
    preferredNetworkInterface,
  } = parsed.data;
  return {
    mode,
    format,
    singleBook,
    settings: { ...settings, combineIntoOneVolume: false },
    ...(providerId === undefined ? {} : { providerId }),
    ...(outputFolder === undefined ? {} : { outputFolder }),
    ...(lastPickerFolder === undefined ? {} : { lastPickerFolder }),
    ...(preferredNetworkInterface === undefined ? {} : { preferredNetworkInterface }),
  };
}

export function serializeStoredSettings(settings: StoredSettings): string {
  return `${JSON.stringify({ version: settingsFileVersion, ...settings }, null, 2)}\n`;
}
