import { stat } from 'node:fs/promises';

import { shell } from 'electron';

import { identifierSchema, type WorkflowResult } from '@/shared/workflow-contract';

import type { MainContext } from '../context';
import { handle } from './handle';
import { failed, ok } from './result';

type ArtifactsContext = Pick<MainContext, 'artifactPaths'>;

async function withArtifact(
  artifactId: string,
  action: (artifactPath: string) => Promise<void>,
  context: ArtifactsContext,
): Promise<WorkflowResult<undefined>> {
  const artifactPath = context.artifactPaths.get(artifactId);
  if (artifactPath === undefined) {
    return failed({
      code: 'artifact_not_found',
      message: 'The saved book is no longer available.',
    });
  }
  try {
    if (!(await stat(artifactPath)).isFile()) {
      return failed({
        code: 'artifact_not_found',
        message: 'The saved book is no longer available.',
      });
    }
  } catch {
    return failed({
      code: 'artifact_not_found',
      message: 'The saved book is no longer available.',
    });
  }
  await action(artifactPath);
  return ok(undefined);
}

/** Opening a saved book, or showing it in its folder, by the artifact id a finished job returned. */
export function registerArtifactHandlers(context: ArtifactsContext): void {
  handle('artifact:open', identifierSchema, (_event, artifactId) =>
    withArtifact(
      artifactId,
      async (artifactPath) => {
        const message = await shell.openPath(artifactPath);
        if (message !== '') throw new Error(message);
      },
      context,
    ),
  );
  handle('artifact:show-in-folder', identifierSchema, (_event, artifactId) =>
    withArtifact(
      artifactId,
      (artifactPath) => {
        shell.showItemInFolder(artifactPath);
        return Promise.resolve();
      },
      context,
    ),
  );
}
