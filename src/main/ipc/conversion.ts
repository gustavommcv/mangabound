import { ipcMain, type IpcMainInvokeEvent } from 'electron';

import type { ConversionArtifact } from '@/domain/conversion';
import {
  type ArtifactSummary,
  conversionCommandSchema,
  type DeviceProfileSummary,
  identifierSchema,
  libraryConversionCommandSchema,
  type LibraryPlanSummary,
  type LibraryTitleResult,
  planLibraryCommandSchema,
  type PlanSummary,
  writeTitleMappingCommandSchema,
  type WorkflowResult,
} from '@/shared/workflow-contract';

import type { MainContext } from '../context';
import { requireWorkflow } from '../context';
import { failed, ok, toFailure } from './result';

type ConversionContext = Pick<
  MainContext,
  | 'mangapressCli'
  | 'selectedLibraries'
  | 'activeJobs'
  | 'workflow'
  | 'artifactPaths'
  | 'libraryPublisher'
>;

/**
 * Keeps the catalog in step with the books written to a library, as each one lands. A run that
 * fails part-way still leaves earlier books on disk, and they belong in the catalog too.
 */
function trackArtifacts(
  libraryPath: string,
  context: Pick<ConversionContext, 'artifactPaths' | 'libraryPublisher'>,
): {
  readonly add: (artifact: ConversionArtifact) => void;
  readonly settled: () => Promise<void>;
} {
  // Chained, not concurrent: FsLibraryStore.publish() reads, merges, and rewrites the whole
  // manifest file, so overlapping calls for the same library would race and could silently
  // drop an entry.
  let chain: Promise<void> = Promise.resolve();
  return {
    add: (artifact) => {
      context.artifactPaths.set(artifact.id, artifact.path);
      chain = chain.then(async () => {
        try {
          await context.libraryPublisher.publish(libraryPath, artifact);
        } catch (error) {
          console.error('Failed to publish a saved book to the library catalog.', error);
        }
      });
    },
    settled: () => chain,
  };
}

/**
 * Planning and running a job: the device list a plan is built against, validating a plan without
 * writing anything, converting a single input or a whole library, and cancelling either by the job
 * id `workflow:plan`/`workflow:convert`/`workflow:convert-library` handed back.
 */
export function registerConversionHandlers(context: ConversionContext): void {
  ipcMain.handle(
    'workflow:get-device-profiles',
    async (): Promise<WorkflowResult<readonly DeviceProfileSummary[]>> => {
      try {
        if (context.mangapressCli === undefined) throw new Error('mangapress is unavailable.');
        const list = await context.mangapressCli.listProfiles();
        return ok(
          list.profiles.map((profile) => ({
            code: profile.code,
            name: profile.name,
            width: profile.width,
            height: profile.height,
            grayLevels: profile.gray_levels,
            family: profile.family,
          })),
        );
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );

  ipcMain.handle(
    'workflow:plan',
    async (
      _event: IpcMainInvokeEvent,
      rawCommand: unknown,
    ): Promise<WorkflowResult<PlanSummary>> => {
      try {
        const command = conversionCommandSchema.parse(rawCommand);
        const libraryPath = context.selectedLibraries.get(command.libraryId);
        if (libraryPath === undefined) {
          return failed({ code: 'library_not_found', message: 'Choose the output folder again.' });
        }
        if (context.activeJobs.has(command.jobId)) {
          return failed({ code: 'job_exists', message: 'That validation is already running.' });
        }
        const controller = new AbortController();
        context.activeJobs.set(command.jobId, controller);
        try {
          return ok(
            await requireWorkflow(context).plan(
              {
                sessionId: command.sessionId,
                libraryPath,
                settings: command.settings,
                format: command.format,
                ...(command.mapping === undefined ? {} : { mapping: command.mapping }),
                ...(command.mode === undefined ? {} : { mode: command.mode }),
              },
              { signal: controller.signal },
            ),
          );
        } finally {
          context.activeJobs.delete(command.jobId);
        }
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );

  ipcMain.handle(
    'workflow:convert',
    async (
      event: IpcMainInvokeEvent,
      rawCommand: unknown,
    ): Promise<WorkflowResult<readonly ArtifactSummary[]>> => {
      try {
        const command = conversionCommandSchema.parse(rawCommand);
        const libraryPath = context.selectedLibraries.get(command.libraryId);
        if (libraryPath === undefined) {
          return failed({ code: 'library_not_found', message: 'Choose the output folder again.' });
        }
        if (context.activeJobs.has(command.jobId)) {
          return failed({ code: 'job_exists', message: 'That conversion is already running.' });
        }
        const controller = new AbortController();
        context.activeJobs.set(command.jobId, controller);
        const tracked = trackArtifacts(libraryPath, context);
        try {
          const artifacts = await requireWorkflow(context).convert(
            {
              sessionId: command.sessionId,
              libraryPath,
              settings: command.settings,
              format: command.format,
              ...(command.mapping === undefined ? {} : { mapping: command.mapping }),
              ...(command.mode === undefined ? {} : { mode: command.mode }),
            },
            {
              signal: controller.signal,
              onArtifact: tracked.add,
              onProgress: (progress) => {
                event.sender.send('workflow:progress', { jobId: command.jobId, ...progress });
              },
            },
          );
          return ok(artifacts.map(({ bytes, format, id, name }) => ({ bytes, format, id, name })));
        } finally {
          // Even when the run failed: books it already wrote must not be missing from the catalog.
          await tracked.settled();
          context.activeJobs.delete(command.jobId);
        }
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );

  ipcMain.handle(
    'workflow:plan-library',
    async (_event, rawCommand: unknown): Promise<WorkflowResult<LibraryPlanSummary>> => {
      try {
        const command = planLibraryCommandSchema.parse(rawCommand);
        if (context.activeJobs.has(command.jobId)) {
          return failed({ code: 'job_exists', message: 'That discovery is already running.' });
        }
        const controller = new AbortController();
        context.activeJobs.set(command.jobId, controller);
        try {
          return ok(
            await requireWorkflow(context).planLibrary(command.sessionId, controller.signal),
          );
        } finally {
          context.activeJobs.delete(command.jobId);
        }
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );

  ipcMain.handle(
    'workflow:write-title-mapping',
    async (_event, rawCommand: unknown): Promise<WorkflowResult<undefined>> => {
      try {
        const command = writeTitleMappingCommandSchema.parse(rawCommand);
        await requireWorkflow(context).writeTitleMapping(
          command.sessionId,
          command.title,
          command.mapping,
        );
        return ok(undefined);
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );

  ipcMain.handle(
    'workflow:convert-library',
    async (
      event: IpcMainInvokeEvent,
      rawCommand: unknown,
    ): Promise<WorkflowResult<readonly LibraryTitleResult[]>> => {
      try {
        const command = libraryConversionCommandSchema.parse(rawCommand);
        const libraryPath = context.selectedLibraries.get(command.libraryId);
        if (libraryPath === undefined) {
          return failed({ code: 'library_not_found', message: 'Choose the output folder again.' });
        }
        if (context.activeJobs.has(command.jobId)) {
          return failed({ code: 'job_exists', message: 'That conversion is already running.' });
        }
        const controller = new AbortController();
        context.activeJobs.set(command.jobId, controller);
        const tracked = trackArtifacts(libraryPath, context);
        try {
          const outcomes = await requireWorkflow(context).convertLibrary(
            {
              sessionId: command.sessionId,
              libraryPath,
              settings: command.settings,
              format: command.format,
              ...(command.titles === undefined ? {} : { titles: command.titles }),
              ...(command.mode === undefined ? {} : { mode: command.mode }),
            },
            {
              signal: controller.signal,
              onArtifact: tracked.add,
              onProgress: (progress) => {
                event.sender.send('workflow:progress', { jobId: command.jobId, ...progress });
              },
            },
          );
          return ok(
            outcomes.map((outcome) => ({
              title: outcome.title,
              status: outcome.status,
              artifacts: outcome.artifacts.map(({ bytes, format, id, name }) => ({
                bytes,
                format,
                id,
                name,
              })),
              ...(outcome.error === undefined ? {} : { failure: toFailure(outcome.error) }),
            })),
          );
        } finally {
          await tracked.settled();
          context.activeJobs.delete(command.jobId);
        }
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );

  ipcMain.handle('workflow:cancel', (_event, rawJobId: unknown): WorkflowResult<undefined> => {
    try {
      const jobId = identifierSchema.parse(rawJobId);
      const controller = context.activeJobs.get(jobId);
      if (controller === undefined) {
        return failed({ code: 'job_not_found', message: 'That conversion is no longer running.' });
      }
      controller.abort();
      return ok(undefined);
    } catch (error) {
      return failed(toFailure(error));
    }
  });
}
