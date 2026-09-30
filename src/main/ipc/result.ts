import { ZodError } from 'zod';

import { CliProtocolError } from '@/adapters/cli-protocol-error';
import { MetadataProviderError } from '@/adapters/metadata-providers/errors';
import { ProcessCancelledError } from '@/application/ports/process-runner';
import { SettingsSaveError } from '@/application/ports/settings-store';
import { ConversionWorkflowError, ToolExecutionError } from '@/domain/conversion';
import { LibraryIndexError } from '@/library/manifest';
import type { WorkflowFailure, WorkflowResult } from '@/shared/workflow-contract';

export const ok = <T>(value: T): WorkflowResult<T> => ({ ok: true, value });
export const failed = <T>(error: WorkflowFailure): WorkflowResult<T> => ({ ok: false, error });

/** What the operating system says when it does not let a file or folder be used. */
const permissionErrorCodes: ReadonlySet<unknown> = new Set(['EACCES', 'EPERM', 'EROFS']);

/**
 * Keeps the cause in the app's own log. What the person is told is written for the screen and
 * leaves out the stack, the paths and the text of the error itself, which is what says what really
 * went wrong.
 */
function logged(failure: WorkflowFailure, error: unknown): WorkflowFailure {
  console.error(`A request failed (${failure.code}).`, error);
  return failure;
}

/**
 * Turns whatever a handler caught into what the page is told. An error written for the screen
 * keeps its own message; the others get a message that says what to do, and the error itself goes
 * to the log. Errors that only make sense for one handler, such as the ones starting the sharing
 * server, are mapped by that handler before it gets here.
 */
export function toFailure(error: unknown): WorkflowFailure {
  if (error instanceof ToolExecutionError) {
    return { code: error.issue.code, message: error.message, issue: error.issue };
  }
  if (error instanceof ProcessCancelledError) {
    return { code: 'cancelled', message: 'Conversion cancelled.' };
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return { code: 'cancelled', message: 'Cancelled.' };
  }
  if (error instanceof ConversionWorkflowError) {
    const failure = { code: error.code, message: error.message };
    return error.cause === undefined ? failure : logged(failure, error);
  }
  if (error instanceof MetadataProviderError) {
    const failure = { code: error.code, message: error.message };
    return error.cause === undefined ? failure : logged(failure, error);
  }
  if (error instanceof LibraryIndexError) {
    return logged(
      { code: error.code, message: 'The output library catalog could not be read.' },
      error,
    );
  }
  if (error instanceof SettingsSaveError) {
    return logged({ code: error.code, message: 'Your settings could not be saved.' }, error);
  }
  if (error instanceof CliProtocolError) {
    return logged(
      {
        code: error.code,
        message:
          'A bundled conversion tool returned incompatible data. Reinstall Mangabound or open Diagnostics.',
      },
      error,
    );
  }
  if (error instanceof ZodError) {
    return logged(
      { code: 'invalid_request', message: 'Mangabound rejected an invalid workflow request.' },
      error,
    );
  }
  const systemCode = error instanceof Error && 'code' in error ? error.code : undefined;
  if (permissionErrorCodes.has(systemCode)) {
    return logged(
      {
        code: 'file_access_denied',
        message:
          'Mangabound was not allowed to use a file or folder it needs. Check the permissions of that folder and try again.',
      },
      error,
    );
  }
  if (systemCode === 'ENOSPC') {
    return logged(
      {
        code: 'disk_full',
        message: 'There is no space left on the drive. Free some space and try again.',
      },
      error,
    );
  }
  return logged(
    { code: 'internal_error', message: 'Mangabound could not complete that action.' },
    error,
  );
}
