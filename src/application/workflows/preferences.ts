import type { SettingsStorePort } from '@/application/ports/settings-store';
import type { NetworkInterfaceOption } from '@/application/ports/network-interfaces';
import type { Preferences } from '@/domain/preferences';

export interface RestoredPreferences {
  readonly preferences: Preferences;
  /** The last Save-dialog folder from the previous session, when it is still there. */
  readonly outputFolder?: string;
  /** Where a choose-file or choose-folder dialog should open, when that folder is still there. */
  readonly lastPickerFolder?: string;
  readonly preferredNetworkInterface?: NetworkInterfaceOption;
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
    const {
      mode,
      format,
      singleBook,
      settings: options,
      providerId,
      outputFolder,
      lastPickerFolder,
      preferredNetworkInterface,
    } = settings;
    let restoredFolder: string | undefined;
    if (outputFolder !== undefined) {
      if (await this.directoryExists(outputFolder)) {
        restoredFolder = outputFolder;
      } else {
        // A missing legacy folder only affected the suggested Save dialog location.
      }
    }
    // Just a dialog convenience, not a saved choice: gone silently means a dialog opens where it
    // would have anyway, with nothing for the person to be told.
    const restoredPickerFolder =
      lastPickerFolder !== undefined && (await this.directoryExists(lastPickerFolder))
        ? lastPickerFolder
        : undefined;
    return {
      preferences: {
        mode,
        format,
        singleBook,
        settings: options,
        ...(providerId === undefined ? {} : { providerId }),
      },
      ...(restoredFolder === undefined ? {} : { outputFolder: restoredFolder }),
      ...(restoredPickerFolder === undefined ? {} : { lastPickerFolder: restoredPickerFolder }),
      ...(preferredNetworkInterface === undefined ? {} : { preferredNetworkInterface }),
      notices,
    };
  }

  /**
   * `lastPickerFolder` is not one of the options a person sets; it is passed back in on every call
   * so that saving the options a person did set never erases it.
   */
  save(
    preferences: Preferences,
    outputFolder: string | undefined,
    lastPickerFolder: string | undefined,
    preferredNetworkInterface?: NetworkInterfaceOption,
  ): Promise<void> {
    return this.store.save({
      ...preferences,
      ...(outputFolder === undefined ? {} : { outputFolder }),
      ...(lastPickerFolder === undefined ? {} : { lastPickerFolder }),
      ...(preferredNetworkInterface === undefined ? {} : { preferredNetworkInterface }),
    });
  }

  /** Resolves once every save asked for has finished. */
  settled(): Promise<void> {
    return this.store.settled();
  }
}
