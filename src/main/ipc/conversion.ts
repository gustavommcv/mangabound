import type { IpcMainInvokeEvent } from 'electron';

import type { ConversionArtifact } from '@/domain/conversion';
import {
  type ArtifactSummary,
  conversionCommandSchema,
  type DeviceProfileSummary,
  identifierSchema,
  libraryConversionCommandSchema,
  planConversionCommandSchema,
  type LibraryPlanSummary,
  type LibraryTitleResult,
  planLibraryCommandSchema,
  type PlanSummary,
  saveBookDetailsCommandSchema,
  writeTitleMappingCommandSchema,
  type WorkflowResult,
} from '@/shared/workflow-contract';

import type { MainContext } from '../context';
import { requireWorkflow } from '../context';
import { handle, ignoredPayloadSchema } from './handle';
import { failed, ok, toFailure } from './result';
import { runJob } from './run-job';

/** What the screen is told about a finished book: never its path, and its warnings if it has any. */
function toArtifactSummary({
  bytes,
  format,
  id,
  name,
  warnings,
}: ConversionArtifact): ArtifactSummary {
  return { bytes, format, id, name, ...(warnings === undefined ? {} : { warnings }) };
}
type ConversionContext = Pick<
  MainContext,
  | 'mangapressCli'
  | 'selectedLibraries'
  | 'activeJobs'
  | 'workflow'
  | 'artifactPaths'
  | 'libraryPublisher'
  | 'pendingRuns'
  | 'pendingArtifacts'
  | 'pendingRunActivity'
>;

/**
 * Planning and running a job: the device list a plan is built against, validating a plan without
 * writing anything, converting a single input or a whole library, and cancelling either by the job
 * id `workflow:plan`/`workflow:convert`/`workflow:convert-library` handed back.
 */
export function registerConversionHandlers(context: ConversionContext): void {
  handle(
    'workflow:get-device-profiles',
    ignoredPayloadSchema,
    async (): Promise<WorkflowResult<readonly DeviceProfileSummary[]>> => {
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
    },
  );
  handle(
    'workflow:plan',
    planConversionCommandSchema,
    async (_event: IpcMainInvokeEvent, command): Promise<WorkflowResult<PlanSummary>> => {
      const libraryPath = await context.pendingRuns?.prepare();
      if (libraryPath === undefined) throw new Error('Pending storage is unavailable.');
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
              ...(command.singleBook === undefined ? {} : { singleBook: command.singleBook }),
              ...(command.details === undefined ? {} : { details: command.details }),
            },
            { signal: controller.signal },
          ),
        );
      } finally {
        context.activeJobs.delete(command.jobId);
      }
    },
  );
  handle(
    'workflow:convert',
    conversionCommandSchema,
    async (
      event: IpcMainInvokeEvent,
      command,
    ): Promise<WorkflowResult<readonly ArtifactSummary[]>> => {
      return runJob(command, context, async (libraryPath, options) => {
        const artifacts = await requireWorkflow(context).convert(
          {
            sessionId: command.sessionId,
            libraryPath,
            settings: command.settings,
            format: command.format,
            ...(command.mapping === undefined ? {} : { mapping: command.mapping }),
            ...(command.mode === undefined ? {} : { mode: command.mode }),
            ...(command.singleBook === undefined ? {} : { singleBook: command.singleBook }),
            ...(command.details === undefined ? {} : { details: command.details }),
          },
          {
            ...options,
            onProgress: (progress) => {
              event.sender.send('workflow:progress', { jobId: command.jobId, ...progress });
            },
          },
        );
        return artifacts.map(toArtifactSummary);
      });
    },
  );
  handle(
    'workflow:plan-library',
    planLibraryCommandSchema,
    async (_event, command): Promise<WorkflowResult<LibraryPlanSummary>> => {
      if (context.activeJobs.has(command.jobId)) {
        return failed({ code: 'job_exists', message: 'That discovery is already running.' });
      }
      const controller = new AbortController();
      context.activeJobs.set(command.jobId, controller);
      try {
        return ok(await requireWorkflow(context).planLibrary(command.sessionId, controller.signal));
      } finally {
        context.activeJobs.delete(command.jobId);
      }
    },
  );
  handle(
    'workflow:write-title-mapping',
    writeTitleMappingCommandSchema,
    async (_event, command): Promise<WorkflowResult<undefined>> => {
      await requireWorkflow(context).writeTitleMapping(
        command.sessionId,
        command.title,
        command.mapping,
      );
      return ok(undefined);
    },
  );
  handle(
    'workflow:save-book-details',
    saveBookDetailsCommandSchema,
    async (_event, command): Promise<WorkflowResult<undefined>> => {
      await requireWorkflow(context).saveDetails(command.sessionId, command.details, command.title);
      return ok(undefined);
    },
  );
  handle(
    'workflow:convert-library',
    libraryConversionCommandSchema,
    async (
      event: IpcMainInvokeEvent,
      command,
    ): Promise<WorkflowResult<readonly LibraryTitleResult[]>> => {
      return runJob(command, context, async (libraryPath, options) => {
        const outcomes = await requireWorkflow(context).convertLibrary(
          {
            sessionId: command.sessionId,
            libraryPath,
            settings: command.settings,
            format: command.format,
            ...(command.titles === undefined ? {} : { titles: command.titles }),
            ...(command.mode === undefined ? {} : { mode: command.mode }),
            ...(command.singleBook === undefined ? {} : { singleBook: command.singleBook }),
            ...(command.titleDetails === undefined ? {} : { titleDetails: command.titleDetails }),
          },
          {
            ...options,
            onProgress: (progress) => {
              event.sender.send('workflow:progress', { jobId: command.jobId, ...progress });
            },
          },
        );
        return outcomes.map((outcome) => ({
          title: outcome.title,
          status: outcome.status,
          artifacts: outcome.artifacts.map(toArtifactSummary),
          ...(outcome.error === undefined ? {} : { failure: toFailure(outcome.error) }),
        }));
      });
    },
  );
  handle('workflow:cancel', identifierSchema, (_event, jobId): WorkflowResult<undefined> => {
    const controller = context.activeJobs.get(jobId);
    if (controller === undefined) {
      return failed({ code: 'job_not_found', message: 'That conversion is no longer running.' });
    }
    controller.abort();
    return ok(undefined);
  });
}
