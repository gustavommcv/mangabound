import { ZodError } from 'zod';

import { CliProtocolError } from '@/adapters/cli-protocol-error';
import { MetadataProviderError } from '@/adapters/metadata-providers/errors';
import { ProcessCancelledError } from '@/application/ports/process-runner';
import { SettingsSaveError } from '@/application/ports/settings-store';
import { ConversionWorkflowError, ToolExecutionError } from '@/domain/conversion';
import { LibraryIndexError } from '@/library/manifest';
import type { WorkflowFailure, WorkflowResult } from '@/shared/workflow-contract';

import { opdsPort } from '../constants';

export const ok = <T>(value: T): WorkflowResult<T> => ({ ok: true, value });
export const failed = <T>(error: WorkflowFailure): WorkflowResult<T> => ({ ok: false, error });

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
    return { code: error.code, message: error.message };
  }
  if (error instanceof MetadataProviderError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof LibraryIndexError) {
    return { code: error.code, message: 'The output library catalog could not be read.' };
  }
  if (error instanceof SettingsSaveError) {
    return { code: error.code, message: 'Your settings could not be saved.' };
  }
  if (error instanceof Error && 'code' in error && error.code === 'EADDRINUSE') {
    return {
      code: 'sharing_failed',
      message: `Port ${String(opdsPort)} is already used by another program on this device. Close it and try again.`,
    };
  }
  if (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'EADDRNOTAVAIL' || error.code === 'EACCES')
  ) {
    return {
      code: 'sharing_failed',
      message: 'The sharing server could not be started on that network address.',
    };
  }
  if (error instanceof CliProtocolError) {
    return {
      code: error.code,
      message:
        'A bundled conversion tool returned incompatible data. Reinstall Mangabound or open Diagnostics.',
    };
  }
  if (error instanceof ZodError) {
    return { code: 'invalid_request', message: 'Mangabound rejected an invalid workflow request.' };
  }
  return { code: 'internal_error', message: 'Mangabound could not complete that action.' };
}
