import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { dialog } from 'electron';

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
import { handle, ignoredPayloadSchema } from './handle';
import { rememberPickerFolder } from './remembered-folders';
import { ok } from './result';
import { inspectOnce } from './selections';

type InputsContext = Pick<
  MainContext,
  | 'selectedInputs'
  | 'selectedLibraries'
  | 'lastPickerFolder'
  | 'preferences'
  | 'currentPreferences'
  | 'lastSaveFolder'
  | 'preferredNetworkInterface'
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
 * Choosing and preparing what a job runs against: files, folders, a library to read, and the
 * a library to share. Every handler here ends in a selection the renderer can only ever
 * refer to by an id these register.
 */
export function registerInputHandlers(context: InputsContext): void {
  handle(
    'workflow:choose-inputs',
    chooseInputsKindSchema,
    async (_event, kind): Promise<WorkflowResult<RegisteredInputs>> => {
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
        rememberPickerFolder(context, kind === 'folders' ? firstPath : path.dirname(firstPath));
      }
      return ok(await registerInputPaths(result.canceled ? [] : result.filePaths, context));
    },
  );
  handle(
    'workflow:register-inputs',
    registerInputsCommandSchema,
    async (_event, command): Promise<WorkflowResult<RegisteredInputs>> => {
      return ok(await registerInputPaths(command.paths, context));
    },
  );
  handle(
    'workflow:inspect-input',
    identifierSchema,
    (_event, selectionId): Promise<WorkflowResult<InspectedInputPayload>> =>
      inspectOnce(context.selectedInputs, selectionId, (selection) =>
        requireWorkflow(context).inspect(selection),
      ),
  );
  handle(
    'workflow:release-input',
    identifierSchema,
    async (_event, sessionId): Promise<WorkflowResult<undefined>> => {
      await requireWorkflow(context).release(sessionId);
      return ok(undefined);
    },
  );
  handle(
    'workflow:choose-library',
    ignoredPayloadSchema,
    async (): Promise<WorkflowResult<SelectedLibrary | null>> => {
      const result = await dialog.showOpenDialog({
        title: 'Choose a library to share',
        buttonLabel: 'Use this folder',
        properties: ['openDirectory', 'createDirectory'],
        ...(context.lastPickerFolder === undefined
          ? {}
          : { defaultPath: context.lastPickerFolder }),
      });
      const libraryPath = result.filePaths[0];
      if (result.canceled || libraryPath === undefined) return ok(null);
      rememberPickerFolder(context, libraryPath);
      const libraryId = randomUUID();
      context.selectedLibraries.set(libraryId, libraryPath);
      return ok({ libraryId, displayPath: libraryPath });
    },
  );
}
