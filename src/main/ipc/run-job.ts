import type { ConversionArtifact } from '@/domain/conversion';
import { toLibraryRelativePath } from '@/library/paths';
import type { WorkflowResult } from '@/shared/workflow-contract';

import type { MainContext } from '../context';
import { failed, ok } from './result';

type JobContext = Pick<
  MainContext,
  'selectedLibraries' | 'activeJobs' | 'artifactPaths' | 'pendingArtifacts' | 'pendingRunActivity'
> & {
  readonly libraryPublisher: Pick<MainContext['libraryPublisher'], 'publish'>;
};

/** Both conversion commands own the same cancellation and ordered catalog-publication lifetime. */
export async function runJob<Value>(
  command: { readonly libraryId: string; readonly jobId: string },
  context: JobContext,
  run: (
    libraryPath: string,
    options: {
      readonly signal: AbortSignal;
      readonly onArtifact: (artifact: ConversionArtifact) => void;
    },
  ) => Promise<Value>,
): Promise<WorkflowResult<Value>> {
  const libraryPath = context.selectedLibraries.get(command.libraryId);
  if (libraryPath === undefined) {
    return failed({
      code: 'library_not_found',
      message: 'The pending conversion is no longer available.',
    });
  }
  if (context.pendingRunActivity.isDeleting(command.libraryId)) {
    return failed({ code: 'pending_in_use', message: 'The pending conversion is being deleted.' });
  }
  if (context.activeJobs.has(command.jobId)) {
    return failed({ code: 'job_exists', message: 'That conversion is already running.' });
  }
  const controller = new AbortController();
  context.activeJobs.set(command.jobId, controller);
  // Chained, not concurrent: catalog publication reads, merges and rewrites a whole manifest.
  let chain: Promise<void> = Promise.resolve();
  try {
    return ok(
      await run(libraryPath, {
        signal: controller.signal,
        onArtifact: (artifact) => {
          context.artifactPaths.set(artifact.id, artifact.path);
          context.pendingArtifacts.set(artifact.id, {
            runId: command.libraryId,
            relativePath: toLibraryRelativePath(libraryPath, artifact.path),
          });
          chain = chain.then(async () => {
            try {
              await context.libraryPublisher.publish(libraryPath, artifact);
            } catch (error) {
              console.error('Failed to publish a saved book to the library catalog.', error);
            }
          });
        },
      }),
    );
  } finally {
    // Even when conversion fails, earlier books must reach the catalog before the job disappears.
    await chain;
    context.activeJobs.delete(command.jobId);
  }
}
