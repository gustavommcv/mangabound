import { stat } from 'node:fs/promises';

import { ipcMain, shell } from 'electron';

import { identifierSchema, type WorkflowResult } from '@/shared/workflow-contract';

import type { MainContext } from '../context';
import { failed, ok, toFailure } from './result';

type ArtifactsContext = Pick<MainContext, 'artifactPaths'>;

async function withArtifact(
  rawArtifactId: unknown,
  action: (artifactPath: string) => Promise<void>,
  context: ArtifactsContext,
): Promise<WorkflowResult<undefined>> {
  try {
    const artifactId = identifierSchema.parse(rawArtifactId);
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
  } catch (error) {
    return failed(toFailure(error));
  }
}

/** Opening a saved book, or showing it in its folder, by the artifact id a finished job returned. */
export function registerArtifactHandlers(context: ArtifactsContext): void {
  ipcMain.handle('artifact:open', async (_event, rawArtifactId: unknown) =>
    withArtifact(
      rawArtifactId,
      async (artifactPath) => {
        const message = await shell.openPath(artifactPath);
        if (message !== '') throw new Error(message);
      },
      context,
    ),
  );
  ipcMain.handle('artifact:show-in-folder', (_event, rawArtifactId: unknown) =>
    withArtifact(
      rawArtifactId,
      (artifactPath) => {
        shell.showItemInFolder(artifactPath);
        return Promise.resolve();
      },
      context,
    ),
  );
}
