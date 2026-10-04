import { z } from 'zod';

import type { StoredSettings } from '@/application/ports/settings-store';
import { defaultMangapressSettings, type MangapressSettings } from '@/domain/output-profile';
import { defaultPreferences } from '@/domain/preferences';
import { networkInterfacePreferenceSchema, preferencesSchema } from '@/shared/settings-contract';
import { mangapressSettingFields, mangapressSettingsSchema } from '@/shared/workflow-contract';

export const settingsFileVersion = 1;

const storedFields = {
  outputFolder: z.string().min(1).max(4096),
  lastPickerFolder: z.string().min(1).max(4096),
  preferredNetworkInterface: networkInterfacePreferenceSchema,
};

export const defaultStoredSettings: StoredSettings = defaultPreferences;

/** A settings file that could be read, and the options in it that could not. */
export interface ParsedSettings {
  readonly settings: StoredSettings;
  /**
   * The options whose saved value was of the wrong kind or out of range, which are back to their
   * defaults, in the words an option is called in the interface ("cropping minimum").
   */
  readonly reset: readonly string[];
}

/** `croppingMinimum` as "cropping minimum": an option's name, said the way a person would. */
function spoken(name: string): string {
  return name.replace(/[A-Z]/gu, (letter) => ` ${letter.toLowerCase()}`);
}

/**
 * What a settings file holds, or undefined when the file as a whole cannot be used: not JSON,
 * not an object, or another version. A single value of the wrong kind or out of range (a hand
 * edit, or a range tightened by a later version) does not cost the person the rest: that option
 * goes back to its default, the others are kept, and the ones that were reset are named. The
 * ranges are the ones a conversion request is held to, so the file cannot hold what a run would
 * refuse. Keys that are not known are dropped, so nothing outside what is kept (such as the title
 * and author an older version once had) gets back in through the file.
 */
export function parseStoredSettings(raw: string): ParsedSettings | undefined {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return undefined;
  const file = json as Record<string, unknown>;
  if (file.version !== settingsFileVersion) return undefined;

  const rawSettings =
    typeof file.settings === 'object' && file.settings !== null && !Array.isArray(file.settings)
      ? { ...(file.settings as Record<string, unknown>) }
      : {};
  // An earlier version kept "bind the whole series" among the options; it is a choice of its own now.
  const wasCombining =
    file.combineIntoOneVolume === true || rawSettings.combineIntoOneVolume === true;

  const reset: string[] = [];
  /** The value if the file has one that is good, `undefined` and a note if it has a bad one. */
  const read = <Schema extends z.ZodType>(
    name: string,
    schema: Schema,
    value: unknown,
  ): z.output<Schema> | undefined => {
    if (value === undefined) return undefined;
    const parsed = schema.safeParse(value);
    if (parsed.success) return parsed.data;
    reset.push(spoken(name));
    return undefined;
  };

  const options: Record<string, unknown> = { ...defaultMangapressSettings };
  for (const [name, schema] of Object.entries(mangapressSettingFields)) {
    const value = read(name, schema, rawSettings[name]);
    if (value !== undefined) options[name] = value;
  }
  // The options hold together or not at all: a custom device with no size is not a device.
  if (!mangapressSettingsSchema.safeParse(options).success) {
    for (const name of ['deviceProfile', 'customWidth', 'customHeight'] as const) {
      delete options[name];
      if (name === 'deviceProfile') options[name] = defaultMangapressSettings.deviceProfile;
    }
    reset.push('custom device size');
  }

  const choices = preferencesSchema.shape;
  const mode = read('mode', choices.mode, file.mode);
  const format = read('format', choices.format, file.format);
  const singleBook = read('single book', choices.singleBook, file.singleBook);
  const providerId = read('online source', choices.providerId, file.providerId);
  const outputFolder = read('save folder', storedFields.outputFolder, file.outputFolder);
  const lastPickerFolder = read(
    'last folder',
    storedFields.lastPickerFolder,
    file.lastPickerFolder,
  );
  const preferredNetworkInterface = read(
    'sharing network',
    storedFields.preferredNetworkInterface,
    file.preferredNetworkInterface,
  );

  const settings: StoredSettings = {
    mode: mode ?? defaultPreferences.mode,
    format: format ?? defaultPreferences.format,
    singleBook: singleBook ?? (wasCombining ? true : defaultPreferences.singleBook),
    settings: { ...(options as unknown as MangapressSettings), combineIntoOneVolume: false },
    ...(providerId === undefined ? {} : { providerId }),
    ...(outputFolder === undefined ? {} : { outputFolder }),
    ...(lastPickerFolder === undefined ? {} : { lastPickerFolder }),
    ...(preferredNetworkInterface === undefined ? {} : { preferredNetworkInterface }),
  };
  return { settings, reset };
}

export function serializeStoredSettings(settings: StoredSettings): string {
  return `${JSON.stringify({ version: settingsFileVersion, ...settings }, null, 2)}\n`;
}
