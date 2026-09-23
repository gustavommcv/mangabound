import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { dialog, ipcMain } from 'electron';

import { classifyInputPaths } from '@/adapters/input/classify-input-paths';
import {
  chooseInputsKindSchema,
  identifierSchema,
  type InspectedInputPayload,
  type RegisteredInputs,
  registerInputsCommandSchema,
  type SelectedLibrary,
  type WorkflowResult,
} from '@/shared/workflow-contract';

import type { MainContext } from '../context';
import { requireWorkflow } from '../context';
import { failed, ok, toFailure } from './result';

type InputsContext = Pick<
  MainContext,
  | 'selectedInputs'
  | 'selectedLibraries'
  | 'lastPickerFolder'
  | 'preferences'
  | 'currentPreferences'
  | 'currentOutputFolder'
  | 'workflow'
>;

/**
 * Turns paths into inputs the renderer can refer to by id. The paths come from a native dialog or
 * from files dropped on the window (read by the preload from the dropped files themselves), and
 * each is checked against the disk before it is accepted.
 */
async function registerInputPaths(
  paths: readonly string[],
  context: Pick<InputsContext, 'selectedInputs'>,
): Promise<RegisteredInputs> {
  const { accepted, rejected } = await classifyInputPaths(paths);
  const inputs = accepted.map(({ path: inputPath, kind }) => {
    const selectionId = randomUUID();
    const selection = { inputPath, displayName: path.basename(inputPath), kind };
    context.selectedInputs.set(selectionId, selection);
    return { selectionId, displayName: selection.displayName, displayPath: inputPath, kind };
  });
  return { inputs, rejected };
}

/**
 * Updates where the next dialog opens, in memory now and on disk right away: writes the last
 * known preferences and output folder back unchanged, alongside the new picker folder, rather
 * than reading them from the file first (see `currentPreferences` for why).
 */
function rememberPickerFolder(
  folder: string,
  context: Pick<
    InputsContext,
    'lastPickerFolder' | 'preferences' | 'currentPreferences' | 'currentOutputFolder'
  >,
): void {
  context.lastPickerFolder = folder;
  void context.preferences?.save(context.currentPreferences, context.currentOutputFolder, folder);
}

/**
 * Choosing and preparing what a job runs against: files, folders, a library to read, and the
 * output library to save into. Every handler here ends in a selection the renderer can only ever
 * refer to by an id these register.
 */
export function registerInputHandlers(context: InputsContext): void {
  ipcMain.handle(
    'workflow:choose-inputs',
    async (_event, rawKind: unknown): Promise<WorkflowResult<RegisteredInputs>> => {
      try {
        const kind = chooseInputsKindSchema.parse(rawKind);
        const result = await dialog.showOpenDialog({
          title: kind === 'folders' ? 'Choose manga folders' : 'Choose comic files',
          properties:
            kind === 'folders'
              ? ['openDirectory', 'multiSelections']
              : ['openFile', 'multiSelections'],
          ...(kind === 'files'
            ? { filters: [{ name: 'Comic book archive', extensions: ['cbz'] }] }
            : {}),
          ...(context.lastPickerFolder === undefined
            ? {}
            : { defaultPath: context.lastPickerFolder }),
        });
        const firstPath = result.filePaths[0];
        if (!result.canceled && firstPath !== undefined) {
          rememberPickerFolder(kind === 'folders' ? firstPath : path.dirname(firstPath), context);
        }
        return ok(await registerInputPaths(result.canceled ? [] : result.filePaths, context));
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );

  ipcMain.handle(
    'workflow:register-inputs',
    async (_event, rawCommand: unknown): Promise<WorkflowResult<RegisteredInputs>> => {
      try {
        const command = registerInputsCommandSchema.parse(rawCommand);
        return ok(await registerInputPaths(command.paths, context));
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );

  ipcMain.handle(
    'workflow:inspect-input',
    async (_event, rawSelectionId: unknown): Promise<WorkflowResult<InspectedInputPayload>> => {
      try {
        const selectionId = identifierSchema.parse(rawSelectionId);
        const selection = context.selectedInputs.get(selectionId);
        if (selection === undefined) {
          return failed({ code: 'selection_not_found', message: 'Choose the input again.' });
        }
        try {
          return ok(await requireWorkflow(context).inspect(selection));
        } finally {
          context.selectedInputs.delete(selectionId);
        }
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );

  ipcMain.handle(
    'workflow:release-input',
    async (_event, rawSessionId: unknown): Promise<WorkflowResult<undefined>> => {
      try {
        const sessionId = identifierSchema.parse(rawSessionId);
        await requireWorkflow(context).release(sessionId);
        return ok(undefined);
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );

  ipcMain.handle(
    'workflow:choose-library',
    async (): Promise<WorkflowResult<SelectedLibrary | null>> => {
      try {
        const result = await dialog.showOpenDialog({
          title: 'Choose the output library',
          buttonLabel: 'Use this folder',
          properties: ['openDirectory', 'createDirectory'],
          ...(context.lastPickerFolder === undefined
            ? {}
            : { defaultPath: context.lastPickerFolder }),
        });
        const libraryPath = result.filePaths[0];
        if (result.canceled || libraryPath === undefined) return ok(null);
        rememberPickerFolder(libraryPath, context);
        const libraryId = randomUUID();
        context.selectedLibraries.set(libraryId, libraryPath);
        return ok({ libraryId, displayPath: libraryPath });
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );
}
