import type { WorkflowFailure } from '@/shared/workflow-contract';

import { opdsPort } from '../constants';

/**
 * What an operating-system error from starting the sharing server means for the person, or
 * `undefined` when it is not one of those. Only the call that starts the server may use this: the
 * same error codes come from file operations too, and there they do not mean the network.
 */
export function sharingFailure(error: unknown): WorkflowFailure | undefined {
  const code = error instanceof Error && 'code' in error ? error.code : undefined;
  if (code === 'EADDRINUSE') {
    return {
      code: 'sharing_failed',
      message: `Port ${String(opdsPort)} is already used by another program on this device. Close it and try again.`,
    };
  }
  if (code === 'EADDRNOTAVAIL' || code === 'EACCES') {
    return {
      code: 'sharing_failed',
      message: 'The sharing server could not be started on that network address.',
    };
  }
  return undefined;
}
