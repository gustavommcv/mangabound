import { stat } from 'node:fs/promises';

import { shell } from 'electron';

import { identifierSchema } from '@/shared/workflow-contract';

import type { MainContext } from '../context';
import { withSavedBook } from './artifact-access';
import { handle } from './handle';

type ArtifactsContext = Pick<MainContext, 'artifactPaths'>;

/** Opening a saved book, or showing it in its folder, by the artifact id a finished job returned. */
export function registerArtifactHandlers(context: ArtifactsContext): void {
  handle('artifact:open', identifierSchema, (_event, artifactId) =>
    withSavedBook(
      context.artifactPaths,
      artifactId,
      async (artifactPath) => {
        const message = await shell.openPath(artifactPath);
        if (message !== '') throw new Error(message);
      },
      stat,
    ),
  );
  handle('artifact:show-in-folder', identifierSchema, (_event, artifactId) =>
    withSavedBook(
      context.artifactPaths,
      artifactId,
      (artifactPath) => {
        shell.showItemInFolder(artifactPath);
        return Promise.resolve();
      },
      stat,
    ),
  );
}
