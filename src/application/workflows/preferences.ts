import type { SettingsStorePort } from '@/application/ports/settings-store';
import type { Preferences } from '@/domain/preferences';

export interface RestoredPreferences {
  readonly preferences: Preferences;
  /** The output folder from the last session, when it is still there. */
  readonly outputFolder?: string;
  /** What the person should be told about what could not be restored. */
  readonly notices: readonly string[];
}

/**
 * Brings the options back at launch and keeps them as they change (ADR 0014). It checks what the
 * file cannot know: whether the folder it remembers is still there.
 */
export class PreferencesWorkflow {
  constructor(
    private readonly store: SettingsStorePort,
    private readonly directoryExists: (directory: string) => Promise<boolean>,
  ) {}

  async restore(): Promise<RestoredPreferences> {
    const { settings, unreadable } = await this.store.load();
    const notices: string[] = [];
    if (unreadable) {
      notices.push('The saved settings could not be read, so the defaults are in use.');
    }
    const { mode, format, settings: options, providerId, outputFolder } = settings;
    let restoredFolder: string | undefined;
    if (outputFolder !== undefined) {
      if (await this.directoryExists(outputFolder)) {
        restoredFolder = outputFolder;
      } else {
        notices.push(
          `The output folder ${outputFolder} is not available. Choose another to save to.`,
        );
      }
    }
    return {
      preferences: {
        mode,
        format,
        settings: options,
        ...(providerId === undefined ? {} : { providerId }),
      },
      ...(restoredFolder === undefined ? {} : { outputFolder: restoredFolder }),
      notices,
    };
  }

  save(preferences: Preferences, outputFolder: string | undefined): Promise<void> {
    return this.store.save({
      ...preferences,
      ...(outputFolder === undefined ? {} : { outputFolder }),
    });
  }

  /** Resolves once every save asked for has finished. */
  settled(): Promise<void> {
    return this.store.settled();
  }
}
