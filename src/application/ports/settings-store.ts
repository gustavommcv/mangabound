import type { Preferences } from '@/domain/preferences';

/** Everything kept between sessions: the options, and where finished books are saved. */
export interface StoredSettings extends Preferences {
  /** The absolute path of the output folder last used. */
  readonly outputFolder?: string;
  /** The folder a choose-file or choose-folder dialog last left the person in. */
  readonly lastPickerFolder?: string;
}

export interface SettingsLoad {
  readonly settings: StoredSettings;
  /** True when a file was there but could not be used, so `settings` are the defaults. */
  readonly unreadable: boolean;
}

/** Saving failed; what was saved before is still there. */
export class SettingsSaveError extends Error {
  readonly code = 'settings_save_failed';

  constructor(options?: ErrorOptions) {
    super('The settings could not be saved.', options);
    this.name = 'SettingsSaveError';
  }
}

export interface SettingsStorePort {
  /** Never fails: a missing or unusable file gives the defaults. */
  load(): Promise<SettingsLoad>;
  /** Saves after every save asked for before it, so the last one asked for is the one kept. */
  save(settings: StoredSettings): Promise<void>;
  /** Resolves once every save asked for so far has finished, whether or not it worked. */
  settled(): Promise<void>;
}
