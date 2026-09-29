import { ipcMain } from 'electron';

import type { PreferencesWorkflow } from '@/application/workflows/preferences';
import { type RestoredSettings, saveSettingsCommandSchema } from '@/shared/settings-contract';
import type { WorkflowResult } from '@/shared/workflow-contract';

import type { MainContext } from '../context';
import { failed, ok, toFailure } from './result';

/**
 * Loading and saving renderer preferences. A legacy output folder is retained only as the next
 * native Save dialog's suggested location. `workflows` is
 * passed separately from the shared context: it is guaranteed constructed by the time this is
 * called, unlike the context's own optional `preferences` field (kept for the handlers that may
 * run before or without it, such as remembering a picker folder).
 */
export function registerSettingsHandlers(
  context: Pick<
    MainContext,
    'currentPreferences' | 'lastSaveFolder' | 'lastPickerFolder' | 'preferredNetworkInterface'
  >,
  workflows: PreferencesWorkflow,
): void {
  ipcMain.handle('settings:load', async (): Promise<WorkflowResult<RestoredSettings>> => {
    try {
      const restored = await workflows.restore();
      // An old output-folder preference is only a starting place for a native Save dialog.
      // Restoring it must never silently send new conversions to that folder.
      context.lastPickerFolder = restored.lastPickerFolder;
      context.preferredNetworkInterface = restored.preferredNetworkInterface;
      context.currentPreferences = restored.preferences;
      context.lastSaveFolder = restored.outputFolder;
      return ok({
        preferences: restored.preferences,
        ...(restored.preferredNetworkInterface === undefined
          ? {}
          : { preferredNetworkInterface: restored.preferredNetworkInterface }),
        notices: restored.notices,
      });
    } catch (error) {
      return failed(toFailure(error));
    }
  });

  ipcMain.handle(
    'settings:save',
    async (_event, rawCommand: unknown): Promise<WorkflowResult<undefined>> => {
      try {
        const command = saveSettingsCommandSchema.parse(rawCommand);
        const outputFolder = context.lastSaveFolder;
        context.currentPreferences = command.preferences;
        context.preferredNetworkInterface = command.preferredNetworkInterface;
        await workflows.save(
          command.preferences,
          outputFolder,
          context.lastPickerFolder,
          context.preferredNetworkInterface,
        );
        return ok(undefined);
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );
}
