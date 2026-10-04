import path from 'node:path';

import { dialog } from 'electron';

import type { AttachedCover } from '@/domain/book-covers';
import {
  coverOfBookCommandSchema,
  type CoversChange,
  coversFolderCommandSchema,
  coverTargetSchema,
  dropCoversCommandSchema,
  type WorkflowResult,
} from '@/shared/workflow-contract';

import type { MainContext } from '../context';
import { requireWorkflow } from '../context';
import { handle } from './handle';
import { ok } from './result';

type CoversContext = Pick<MainContext, 'workflow' | 'lastPickerFolder'>;

const target = (command: {
  readonly sessionId: string;
  readonly title?: string | undefined;
}): { readonly sessionId: string; readonly title?: string } => ({
  sessionId: command.sessionId,
  ...(command.title === undefined ? {} : { title: command.title }),
});

/**
 * The covers a person attaches to the books of an item (ADR 0040). The item is always found from
 * its session; a path only ever comes from a native dialog here or from files dropped on the
 * window (read by the preload from the files themselves), and is checked on disk before use.
 */
export function registerCoverHandlers(context: CoversContext): void {
  handle(
    'covers:list',
    coverTargetSchema,
    async (_event, command): Promise<WorkflowResult<readonly AttachedCover[]>> =>
      ok(await requireWorkflow(context).covers.list(command.sessionId, command.title)),
  );
  handle(
    'covers:choose',
    coverOfBookCommandSchema,
    async (_event, command): Promise<WorkflowResult<CoversChange | null>> => {
      const result = await dialog.showOpenDialog({
        title: 'Choose a cover',
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }],
        ...(context.lastPickerFolder === undefined
          ? {}
          : { defaultPath: context.lastPickerFolder }),
      });
      const chosen = result.filePaths[0];
      if (result.canceled || chosen === undefined) return ok(null);
      return ok(
        await requireWorkflow(context).covers.choose(target(command), command.slot, chosen),
      );
    },
  );
  handle(
    'covers:choose-folder',
    coversFolderCommandSchema,
    async (_event, command): Promise<WorkflowResult<CoversChange | null>> => {
      const result = await dialog.showOpenDialog({
        title: 'Choose a folder of covers',
        properties: ['openDirectory'],
        ...(context.lastPickerFolder === undefined
          ? {}
          : { defaultPath: context.lastPickerFolder }),
      });
      const chosen = result.filePaths[0];
      if (result.canceled || chosen === undefined) return ok(null);
      return ok(
        await requireWorkflow(context).covers.takeInOrder(target(command), command.slots, [chosen]),
      );
    },
  );
  handle(
    'covers:drop',
    dropCoversCommandSchema,
    async (_event, command): Promise<WorkflowResult<CoversChange>> =>
      ok(
        await requireWorkflow(context).covers.drop(
          target(command),
          command.slots,
          command.slot,
          // A file with no place on disk reaches here as an empty path; it is not an image.
          command.paths.filter((dropped) => path.isAbsolute(dropped)),
        ),
      ),
  );
  handle(
    'covers:remove',
    coverOfBookCommandSchema,
    async (_event, command): Promise<WorkflowResult<CoversChange>> =>
      ok(await requireWorkflow(context).covers.remove(target(command), command.slot)),
  );
}
