import type { WorkflowResult } from '@/shared/workflow-contract';

import { failed, ok } from './result';

const unavailable = {
  code: 'artifact_not_found',
  message: 'The saved book is no longer available.',
} as const;

/**
 * Acts on a saved book by the id a finished job returned, only if the id is one the app gave and
 * what it stands for is still a file. A folder, a file that was moved away or one that cannot be
 * looked at is "no longer available": the system is never asked to open it.
 */
export async function withSavedBook(
  paths: ReadonlyMap<string, string>,
  artifactId: string,
  act: (artifactPath: string) => Promise<void>,
  statFile: (artifactPath: string) => Promise<{ readonly isFile: () => boolean }>,
): Promise<WorkflowResult<undefined>> {
  const artifactPath = paths.get(artifactId);
  if (artifactPath === undefined) return failed(unavailable);
  try {
    if (!(await statFile(artifactPath)).isFile()) return failed(unavailable);
  } catch {
    return failed(unavailable);
  }
  await act(artifactPath);
  return ok(undefined);
}
