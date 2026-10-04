import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';

import type { WorkflowFailure, WorkflowResult } from '@/shared/workflow-contract';

import { failed, toFailure } from './result';

/** No-payload commands keep ignoring any argument, as their original handlers did. */
export const ignoredPayloadSchema = z.unknown();

/**
 * Whether a request comes from the main frame of the window's own page. Only that page is the
 * app's: a frame inside it (an iframe, were one ever added) is not, and a request that has lost its
 * frame (it was closed while the request was on its way) has no one to answer. Nothing in the app
 * embeds a frame today; this keeps it true that adding one cannot reach the handlers.
 */
export function fromTheMainFrame(event: IpcMainInvokeEvent): boolean {
  return event.senderFrame !== null && event.senderFrame === event.sender.mainFrame;
}

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
    if (!fromTheMainFrame(event)) {
      console.error(`A request on ${channel} did not come from the window's own page.`);
      return failed({
        code: 'untrusted_sender',
        message: 'Mangabound only takes requests from its own window.',
      });
    }
    try {
      return await run(event, schema.parse(rawCommand));
    } catch (error) {
      return failed(mapFailure(error));
    }
  });
}
