import { randomUUID } from 'node:crypto';

import { ipcMain } from 'electron';

import type { PreferencesWorkflow } from '@/application/workflows/preferences';
import { type RestoredSettings, saveSettingsCommandSchema } from '@/shared/settings-contract';
import type { SelectedLibrary, WorkflowResult } from '@/shared/workflow-contract';

import type { MainContext } from '../context';
import { failed, ok, toFailure } from './result';

/**
 * Loading and saving the renderer's preferences and its chosen output library. `workflows` is
 * passed separately from the shared context: it is guaranteed constructed by the time this is
 * called, unlike the context's own optional `preferences` field (kept for the handlers that may
 * run before or without it, such as remembering a picker folder).
 */
export function registerSettingsHandlers(
  context: Pick<
    MainContext,
    'selectedLibraries' | 'currentPreferences' | 'currentOutputFolder' | 'lastPickerFolder'
  >,
  workflows: PreferencesWorkflow,
): void {
  ipcMain.handle('settings:load', async (): Promise<WorkflowResult<RestoredSettings>> => {
    try {
      const restored = await workflows.restore();
      context.lastPickerFolder = restored.lastPickerFolder;
      context.currentPreferences = restored.preferences;
      context.currentOutputFolder = restored.outputFolder;
      // The window is given the folder the way a dialog would give it: by an id, never a path.
      let library: SelectedLibrary | undefined;
      if (restored.outputFolder !== undefined) {
        const libraryId = randomUUID();
        context.selectedLibraries.set(libraryId, restored.outputFolder);
        library = { libraryId, displayPath: restored.outputFolder };
      }
      return ok({
        preferences: restored.preferences,
        ...(library === undefined ? {} : { library }),
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
        const outputFolder =
          command.libraryId === undefined
            ? undefined
            : context.selectedLibraries.get(command.libraryId);
        context.currentPreferences = command.preferences;
        context.currentOutputFolder = outputFolder;
        await workflows.save(command.preferences, outputFolder, context.lastPickerFolder);
        return ok(undefined);
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );
}
