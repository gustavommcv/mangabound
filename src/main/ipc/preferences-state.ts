import type { PreferencesWorkflow, RestoredPreferences } from '@/application/workflows/preferences';
import type { SaveSettingsCommand } from '@/shared/settings-contract';

import type { MainContext } from '../context';

type PreferencesState = Pick<
  MainContext,
  'currentPreferences' | 'lastSaveFolder' | 'lastPickerFolder' | 'preferredNetworkInterface'
>;

/**
 * Takes what the settings file brought back as what the app remembers. An old output-folder
 * preference is only a starting place for a native Save dialog: restoring it must never silently
 * send new conversions to that folder.
 */
export function remember(state: PreferencesState, restored: RestoredPreferences): void {
  state.lastPickerFolder = restored.lastPickerFolder;
  state.preferredNetworkInterface = restored.preferredNetworkInterface;
  state.currentPreferences = restored.preferences;
  state.lastSaveFolder = restored.outputFolder;
}

/**
 * Keeps what the window chose, and writes it down with the two folders the window never holds. The
 * sharing network is the window's choice and travels with it: leaving it out here would forget it.
 */
export function saveChosen(
  state: PreferencesState,
  workflows: Pick<PreferencesWorkflow, 'save'>,
  command: SaveSettingsCommand,
): Promise<void> {
  const outputFolder = state.lastSaveFolder;
  state.currentPreferences = command.preferences;
  state.preferredNetworkInterface = command.preferredNetworkInterface;
  return workflows.save(
    command.preferences,
    outputFolder,
    state.lastPickerFolder,
    state.preferredNetworkInterface,
  );
}
