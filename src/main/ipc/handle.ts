import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';

import type { WorkflowFailure, WorkflowResult } from '@/shared/workflow-contract';

import { failed, toFailure } from './result';

/** No-payload commands keep ignoring any argument, as their original handlers did. */
export const ignoredPayloadSchema = z.unknown();

/** Validate before running, and never throw an implementation error across the bridge. */
export function handle<Command, Value>(
  channel: string,
  schema: z.ZodType<Command>,
  run: (
    event: IpcMainInvokeEvent,
    command: Command,
  ) => WorkflowResult<Value> | Promise<WorkflowResult<Value>>,
  mapFailure: (error: unknown) => WorkflowFailure = toFailure,
): void {
  ipcMain.handle(channel, async (event, rawCommand: unknown): Promise<WorkflowResult<Value>> => {
    try {
      return await run(event, schema.parse(rawCommand));
    } catch (error) {
      return failed(mapFailure(error));
    }
  });
}
