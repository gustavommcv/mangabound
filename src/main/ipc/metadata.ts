import { ipcMain, shell } from 'electron';

import {
  type MetadataProviderDescriptor,
  type MetadataSearchResult,
  openProviderHomepageCommandSchema,
  searchMetadataCommandSchema,
  suggestVolumesCommandSchema,
  type VolumeSuggestion,
  type WorkflowResult,
} from '@/shared/workflow-contract';

import type { MainContext } from '../context';
import { failed, ok, toFailure } from './result';

type MetadataContext = Pick<MainContext, 'metadataProviders' | 'activeJobs'>;

/**
 * The built-in online-source registry: what it offers, opening a source's own homepage, and the
 * two calls a source itself can answer (search by title, list a work's volumes; ADR 0013).
 */
export function registerMetadataHandlers(context: MetadataContext): void {
  ipcMain.handle(
    'workflow:list-metadata-providers',
    (): WorkflowResult<readonly MetadataProviderDescriptor[]> =>
      ok([...context.metadataProviders.values()].map((provider) => provider.descriptor)),
  );

  ipcMain.handle(
    'workflow:open-provider-homepage',
    async (_event, rawCommand: unknown): Promise<WorkflowResult<undefined>> => {
      try {
        const command = openProviderHomepageCommandSchema.parse(rawCommand);
        const provider = context.metadataProviders.get(command.providerId);
        if (provider === undefined) {
          return failed({ code: 'provider_not_found', message: 'That source is not available.' });
        }
        // Only the address a provider is registered with is ever opened, and only when it is https:
        // the page can name a provider but never an address.
        const homepage = new URL(provider.descriptor.homepage);
        if (homepage.protocol !== 'https:') {
          return failed({ code: 'invalid_homepage', message: 'That source has no safe address.' });
        }
        await shell.openExternal(homepage.href);
        return ok(undefined);
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );

  ipcMain.handle(
    'workflow:search-metadata',
    async (
      _event,
      rawCommand: unknown,
    ): Promise<WorkflowResult<readonly MetadataSearchResult[]>> => {
      try {
        const command = searchMetadataCommandSchema.parse(rawCommand);
        const provider = context.metadataProviders.get(command.providerId);
        if (provider === undefined) {
          return failed({ code: 'provider_not_found', message: 'That source is not available.' });
        }
        if (context.activeJobs.has(command.jobId)) {
          return failed({ code: 'job_exists', message: 'That search is already running.' });
        }
        const controller = new AbortController();
        context.activeJobs.set(command.jobId, controller);
        try {
          return ok(await provider.search(command.title, controller.signal));
        } finally {
          context.activeJobs.delete(command.jobId);
        }
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );

  ipcMain.handle(
    'workflow:suggest-volumes',
    async (
      _event,
      rawCommand: unknown,
    ): Promise<WorkflowResult<{ volumes: readonly VolumeSuggestion[] }>> => {
      try {
        const command = suggestVolumesCommandSchema.parse(rawCommand);
        const provider = context.metadataProviders.get(command.providerId);
        if (provider === undefined) {
          return failed({ code: 'provider_not_found', message: 'That source is not available.' });
        }
        if (context.activeJobs.has(command.jobId)) {
          return failed({ code: 'job_exists', message: 'That lookup is already running.' });
        }
        const controller = new AbortController();
        context.activeJobs.set(command.jobId, controller);
        try {
          return ok(
            await provider.suggestVolumes(command.workId, {
              ...(command.language === undefined ? {} : { language: command.language }),
              signal: controller.signal,
            }),
          );
        } finally {
          context.activeJobs.delete(command.jobId);
        }
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );
}
