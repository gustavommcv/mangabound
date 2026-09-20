import type { BookFormat } from './conversion';
import { defaultMangapressSettings, type MangapressSettings } from './output-profile';
import { defaultProcessMode, type ProcessMode } from './process-mode';

/**
 * The mangapress options that are kept between sessions: all of them but the title and the author,
 * which name one book rather than a person's preferences (ADR 0014).
 */
export type PersistedMangapressSettings = Omit<MangapressSettings, 'title' | 'author'>;

/** What a person chose that outlives the session. */
export interface Preferences {
  readonly mode: ProcessMode;
  readonly format: BookFormat;
  readonly settings: PersistedMangapressSettings;
  /** The id of the online source chosen for volume data, when one was. */
  readonly providerId?: string;
}

export const defaultFormat: BookFormat = 'epub';

/** Where everything starts, and where a reset returns it. */
export const defaultPreferences: Preferences = Object.freeze({
  mode: defaultProcessMode,
  format: defaultFormat,
  settings: defaultMangapressSettings,
});

const bookIdentityFields: ReadonlySet<string> = new Set(['title', 'author']);

/** The settings as they are kept: without what belongs to the book in hand. */
export function persistedSettings(settings: MangapressSettings): PersistedMangapressSettings {
  return Object.fromEntries(
    Object.entries(settings).filter(([field]) => !bookIdentityFields.has(field)),
  ) as unknown as PersistedMangapressSettings;
}

/** Whether two sets of options are the same, an option that was cleared counting as one never set. */
export function sameSettings(a: MangapressSettings, b: MangapressSettings): boolean {
  const fields = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof MangapressSettings>;
  return [...fields].every((field) => a[field] === b[field]);
}

/** Whether the format and the mangapress options are exactly what a fresh start has. */
export function isDefaultMangapress(format: BookFormat, settings: MangapressSettings): boolean {
  return format === defaultFormat && sameSettings(settings, defaultMangapressSettings);
}
