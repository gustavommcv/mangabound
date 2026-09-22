import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import path from 'node:path';

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type BrowserWindowConstructorOptions,
  type IpcMainInvokeEvent,
} from 'electron';
import started from 'electron-squirrel-startup';
import { ZodError } from 'zod';

import { MangabindBindingAdapter } from '@/adapters/mangabind/binding-port';
import { MangabindCliAdapter } from '@/adapters/mangabind/cli';
import { CliProtocolError } from '@/adapters/cli-protocol-error';
import { classifyInputPaths } from '@/adapters/input/classify-input-paths';
import { directoryExists } from '@/adapters/library/directory-exists';
import { FsBookFileStore } from '@/adapters/library/fs-book-file-store';
import { FsLibraryStore } from '@/adapters/library/fs-library-store';
import { MetadataProviderError } from '@/adapters/metadata-providers/errors';
import { createMetadataProviders } from '@/adapters/metadata-providers/registry';
import { MangapressCliAdapter } from '@/adapters/mangapress/cli';
import { MangapressConversionAdapter } from '@/adapters/mangapress/conversion-port';
import { OsNetworkInterfaces } from '@/adapters/network/os-network-interfaces';
import { NodeOpdsServer } from '@/adapters/opds/http-server';
import { createNodeProcessRunner } from '@/adapters/process/node-process-runner';
import { FsSettingsStore } from '@/adapters/settings/fs-settings-store';
import { verifyBundledToolchain } from '@/adapters/toolchain/verification';
import type { OpdsServerHandle } from '@/application/ports/opds-server';
import { ProcessCancelledError } from '@/application/ports/process-runner';
import { SettingsSaveError } from '@/application/ports/settings-store';
import { LibraryPublisher } from '@/application/workflows/library-publisher';
import { PreferencesWorkflow } from '@/application/workflows/preferences';
import { SingleInputWorkflow } from '@/application/workflows/single-input';
import {
  ConversionWorkflowError,
  type ConversionArtifact,
  type InputSelection,
  ToolExecutionError,
} from '@/domain/conversion';
import { LibraryIndexError } from '@/library/manifest';
import {
  type NetworkInterfaceOption,
  type OpdsSharingStatus,
  startSharingCommandSchema,
} from '@/shared/opds-contract';
import { type RestoredSettings, saveSettingsCommandSchema } from '@/shared/settings-contract';
import type { ToolchainStatus, ToolchainTarget } from '@/shared/toolchain-status';
import {
  type ArtifactSummary,
  conversionCommandSchema,
  type DeviceProfileSummary,
  chooseInputsKindSchema,
  identifierSchema,
  type InspectedInputPayload,
  libraryConversionCommandSchema,
  type LibraryPlanSummary,
  type LibraryTitleResult,
  type MetadataProviderDescriptor,
  type MetadataSearchResult,
  planLibraryCommandSchema,
  type PlanSummary,
  type RegisteredInputs,
  registerInputsCommandSchema,
  searchMetadataCommandSchema,
  type SelectedLibrary,
  openProviderHomepageCommandSchema,
  suggestVolumesCommandSchema,
  type VolumeSuggestion,
  type WorkflowFailure,
  type WorkflowResult,
  writeTitleMappingCommandSchema,
} from '@/shared/workflow-contract';

if (started) app.quit();

const selectedInputs = new Map<string, InputSelection>();
const selectedLibraries = new Map<string, string>();
const artifactPaths = new Map<string, string>();
const activeJobs = new Map<string, AbortController>();
const metadataProviders = new Map(
  createMetadataProviders().map((provider) => [provider.descriptor.id, provider] as const),
);
const libraryStore = new FsLibraryStore();
const libraryPublisher = new LibraryPublisher(libraryStore);
const opdsServer = new NodeOpdsServer(libraryStore);
const networkInterfaces = new OsNetworkInterfaces();
let preferences: PreferencesWorkflow | undefined;
let activeSharing: OpdsServerHandle | undefined;
// Where a choose-file or choose-folder dialog should open next; kept in memory and mirrored to
// disk so it survives a restart, but never told to the renderer, which never holds paths.
let lastPickerFolder: string | undefined;
let workflow: SingleInputWorkflow | undefined;
let mangapressCli: MangapressCliAdapter | undefined;
let cleanupStarted = false;

const ok = <T>(value: T): WorkflowResult<T> => ({ ok: true, value });
const failed = <T>(error: WorkflowFailure): WorkflowResult<T> => ({ ok: false, error });

function toFailure(error: unknown): WorkflowFailure {
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
  if (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'EADDRNOTAVAIL' || error.code === 'EADDRINUSE' || error.code === 'EACCES')
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

function executablePath(
  toolchainRoot: string,
  target: ToolchainTarget,
  tool: 'mangabind' | 'mangapress',
): string {
  const extension = target.startsWith('win32-') ? '.exe' : '';
  return path.join(toolchainRoot, target, `${tool}${extension}`);
}

function requireWorkflow(): SingleInputWorkflow {
  if (workflow === undefined) throw new Error('The bundled conversion tools are not ready.');
  return workflow;
}

/**
 * Keeps the catalog in step with the books written to a library, as each one lands. A run that
 * fails part-way still leaves earlier books on disk, and they belong in the catalog too.
 */
function trackArtifacts(libraryPath: string): {
  readonly add: (artifact: ConversionArtifact) => void;
  readonly settled: () => Promise<void>;
} {
  // Chained, not concurrent: FsLibraryStore.publish() reads, merges, and rewrites the whole
  // manifest file, so overlapping calls for the same library would race and could silently
  // drop an entry.
  let chain: Promise<void> = Promise.resolve();
  return {
    add: (artifact) => {
      artifactPaths.set(artifact.id, artifact.path);
      chain = chain.then(async () => {
        try {
          await libraryPublisher.publish(libraryPath, artifact);
        } catch (error) {
          console.error('Failed to publish a saved book to the library catalog.', error);
        }
      });
    },
    settled: () => chain,
  };
}

function toSharingStatus(handle: OpdsServerHandle | undefined): OpdsSharingStatus {
  if (handle === undefined) return { active: false };
  return {
    active: true,
    url: handle.url,
    interfaceAddress: handle.interfaceAddress,
    port: handle.port,
  };
}

function registerOpdsHandlers(): void {
  ipcMain.handle(
    'opds:list-network-interfaces',
    (): WorkflowResult<readonly NetworkInterfaceOption[]> => ok(networkInterfaces.list()),
  );

  ipcMain.handle(
    'opds:start-sharing',
    async (_event, rawCommand: unknown): Promise<WorkflowResult<OpdsSharingStatus>> => {
      try {
        const command = startSharingCommandSchema.parse(rawCommand);
        const libraryPath = selectedLibraries.get(command.libraryId);
        if (libraryPath === undefined) {
          return failed({ code: 'library_not_found', message: 'Choose the output folder again.' });
        }
        if (activeSharing !== undefined) {
          return failed({
            code: 'sharing_already_active',
            message: 'Sharing is already running.',
          });
        }
        // The listener never reads the catalog on start, so a corrupt one would otherwise only
        // surface as a broken feed on the reader. A missing catalog is fine (read() returns an
        // empty one); only unreadable content stops sharing here. Any read failure gets the same
        // message: a permissions error must not fall through to toFailure()'s network-address
        // wording.
        try {
          await libraryStore.read(libraryPath);
        } catch (error) {
          return failed({
            code: error instanceof LibraryIndexError ? error.code : 'library_unreadable',
            message: 'The output library catalog could not be read.',
          });
        }
        activeSharing = await opdsServer.start({
          libraryPath,
          libraryTitle: path.basename(libraryPath),
          interfaceAddress: command.interfaceAddress,
          auth: command.auth,
        });
        return ok(toSharingStatus(activeSharing));
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );

  ipcMain.handle('opds:stop-sharing', async (): Promise<WorkflowResult<undefined>> => {
    try {
      if (activeSharing === undefined) {
        return failed({ code: 'sharing_not_active', message: 'Sharing is not running.' });
      }
      await activeSharing.stop();
      activeSharing = undefined;
      return ok(undefined);
    } catch (error) {
      return failed(toFailure(error));
    }
  });

  ipcMain.handle('opds:get-status', (): WorkflowResult<OpdsSharingStatus> =>
    ok(toSharingStatus(activeSharing)),
  );
}

/**
 * Turns paths into inputs the renderer can refer to by id. The paths come from a native dialog or
 * from files dropped on the window (read by the preload from the dropped files themselves), and
 * each is checked against the disk before it is accepted.
 */
async function registerInputPaths(paths: readonly string[]): Promise<RegisteredInputs> {
  const { accepted, rejected } = await classifyInputPaths(paths);
  const inputs = accepted.map(({ path: inputPath, kind }) => {
    const selectionId = randomUUID();
    const selection = { inputPath, displayName: path.basename(inputPath), kind };
    selectedInputs.set(selectionId, selection);
    return { selectionId, displayName: selection.displayName, displayPath: inputPath, kind };
  });
  return { inputs, rejected };
}

function registerSettingsHandlers(workflows: PreferencesWorkflow): void {
  ipcMain.handle('settings:load', async (): Promise<WorkflowResult<RestoredSettings>> => {
    try {
      const restored = await workflows.restore();
      lastPickerFolder = restored.lastPickerFolder;
      // The window is given the folder the way a dialog would give it: by an id, never a path.
      let library: SelectedLibrary | undefined;
      if (restored.outputFolder !== undefined) {
        const libraryId = randomUUID();
        selectedLibraries.set(libraryId, restored.outputFolder);
        library = { libraryId, displayPath: restored.outputFolder };
      }
      return ok({
        preferences: restored.preferences,
        ...(library === undefined ? {} : { library }),
        notices: restored.notices,
      });
    } catch (error) {
      return failed(toFailure(error));
    }
  });

  ipcMain.handle(
    'settings:save',
    async (_event, rawCommand: unknown): Promise<WorkflowResult<undefined>> => {
      try {
        const command = saveSettingsCommandSchema.parse(rawCommand);
        const outputFolder =
          command.libraryId === undefined ? undefined : selectedLibraries.get(command.libraryId);
        await workflows.save(command.preferences, outputFolder, lastPickerFolder);
        return ok(undefined);
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );
}

/** Updates where the next dialog opens, in memory now and on disk once it is safe to. */
function rememberPickerFolder(folder: string): void {
  lastPickerFolder = folder;
  void preferences?.rememberFolder(folder);
}

function registerWorkflowHandlers(): void {
  ipcMain.handle(
    'workflow:choose-inputs',
    async (_event, rawKind: unknown): Promise<WorkflowResult<RegisteredInputs>> => {
      try {
        const kind = chooseInputsKindSchema.parse(rawKind);
        const result = await dialog.showOpenDialog({
          title: kind === 'folders' ? 'Choose manga folders' : 'Choose comic files',
          properties:
            kind === 'folders'
              ? ['openDirectory', 'multiSelections']
              : ['openFile', 'multiSelections'],
          ...(kind === 'files'
            ? { filters: [{ name: 'Comic book archive', extensions: ['cbz'] }] }
            : {}),
          ...(lastPickerFolder === undefined ? {} : { defaultPath: lastPickerFolder }),
        });
        const firstPath = result.filePaths[0];
        if (!result.canceled && firstPath !== undefined) {
          rememberPickerFolder(kind === 'folders' ? firstPath : path.dirname(firstPath));
        }
        return ok(await registerInputPaths(result.canceled ? [] : result.filePaths));
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );

  ipcMain.handle(
    'workflow:register-inputs',
    async (_event, rawCommand: unknown): Promise<WorkflowResult<RegisteredInputs>> => {
      try {
        const command = registerInputsCommandSchema.parse(rawCommand);
        return ok(await registerInputPaths(command.paths));
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );

  ipcMain.handle(
    'workflow:inspect-input',
    async (_event, rawSelectionId: unknown): Promise<WorkflowResult<InspectedInputPayload>> => {
      try {
        const selectionId = identifierSchema.parse(rawSelectionId);
        const selection = selectedInputs.get(selectionId);
        if (selection === undefined) {
          return failed({ code: 'selection_not_found', message: 'Choose the input again.' });
        }
        try {
          return ok(await requireWorkflow().inspect(selection));
        } finally {
          selectedInputs.delete(selectionId);
        }
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );

  ipcMain.handle(
    'workflow:release-input',
    async (_event, rawSessionId: unknown): Promise<WorkflowResult<undefined>> => {
      try {
        const sessionId = identifierSchema.parse(rawSessionId);
        await requireWorkflow().release(sessionId);
        return ok(undefined);
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );

  ipcMain.handle(
    'workflow:choose-library',
    async (): Promise<WorkflowResult<SelectedLibrary | null>> => {
      try {
        const result = await dialog.showOpenDialog({
          title: 'Choose the output library',
          buttonLabel: 'Use this folder',
          properties: ['openDirectory', 'createDirectory'],
          ...(lastPickerFolder === undefined ? {} : { defaultPath: lastPickerFolder }),
        });
        const libraryPath = result.filePaths[0];
        if (result.canceled || libraryPath === undefined) return ok(null);
        rememberPickerFolder(libraryPath);
        const libraryId = randomUUID();
        selectedLibraries.set(libraryId, libraryPath);
        return ok({ libraryId, displayPath: libraryPath });
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );

  ipcMain.handle(
    'workflow:get-device-profiles',
    async (): Promise<WorkflowResult<readonly DeviceProfileSummary[]>> => {
      try {
        if (mangapressCli === undefined) throw new Error('mangapress is unavailable.');
        const list = await mangapressCli.listProfiles();
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
        const libraryPath = selectedLibraries.get(command.libraryId);
        if (libraryPath === undefined) {
          return failed({ code: 'library_not_found', message: 'Choose the output folder again.' });
        }
        if (activeJobs.has(command.jobId)) {
          return failed({ code: 'job_exists', message: 'That validation is already running.' });
        }
        const controller = new AbortController();
        activeJobs.set(command.jobId, controller);
        try {
          return ok(
            await requireWorkflow().plan(
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
          activeJobs.delete(command.jobId);
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
        const libraryPath = selectedLibraries.get(command.libraryId);
        if (libraryPath === undefined) {
          return failed({ code: 'library_not_found', message: 'Choose the output folder again.' });
        }
        if (activeJobs.has(command.jobId)) {
          return failed({ code: 'job_exists', message: 'That conversion is already running.' });
        }
        const controller = new AbortController();
        activeJobs.set(command.jobId, controller);
        const tracked = trackArtifacts(libraryPath);
        try {
          const artifacts = await requireWorkflow().convert(
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
          activeJobs.delete(command.jobId);
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
        if (activeJobs.has(command.jobId)) {
          return failed({ code: 'job_exists', message: 'That discovery is already running.' });
        }
        const controller = new AbortController();
        activeJobs.set(command.jobId, controller);
        try {
          return ok(await requireWorkflow().planLibrary(command.sessionId, controller.signal));
        } finally {
          activeJobs.delete(command.jobId);
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
        await requireWorkflow().writeTitleMapping(
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
    'workflow:list-metadata-providers',
    (): WorkflowResult<readonly MetadataProviderDescriptor[]> =>
      ok([...metadataProviders.values()].map((provider) => provider.descriptor)),
  );

  ipcMain.handle(
    'workflow:open-provider-homepage',
    async (_event, rawCommand: unknown): Promise<WorkflowResult<undefined>> => {
      try {
        const command = openProviderHomepageCommandSchema.parse(rawCommand);
        const provider = metadataProviders.get(command.providerId);
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
        const provider = metadataProviders.get(command.providerId);
        if (provider === undefined) {
          return failed({ code: 'provider_not_found', message: 'That source is not available.' });
        }
        if (activeJobs.has(command.jobId)) {
          return failed({ code: 'job_exists', message: 'That search is already running.' });
        }
        const controller = new AbortController();
        activeJobs.set(command.jobId, controller);
        try {
          return ok(await provider.search(command.title, controller.signal));
        } finally {
          activeJobs.delete(command.jobId);
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
        const provider = metadataProviders.get(command.providerId);
        if (provider === undefined) {
          return failed({ code: 'provider_not_found', message: 'That source is not available.' });
        }
        if (activeJobs.has(command.jobId)) {
          return failed({ code: 'job_exists', message: 'That lookup is already running.' });
        }
        const controller = new AbortController();
        activeJobs.set(command.jobId, controller);
        try {
          return ok(
            await provider.suggestVolumes(command.workId, {
              ...(command.language === undefined ? {} : { language: command.language }),
              signal: controller.signal,
            }),
          );
        } finally {
          activeJobs.delete(command.jobId);
        }
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
        const libraryPath = selectedLibraries.get(command.libraryId);
        if (libraryPath === undefined) {
          return failed({ code: 'library_not_found', message: 'Choose the output folder again.' });
        }
        if (activeJobs.has(command.jobId)) {
          return failed({ code: 'job_exists', message: 'That conversion is already running.' });
        }
        const controller = new AbortController();
        activeJobs.set(command.jobId, controller);
        const tracked = trackArtifacts(libraryPath);
        try {
          const outcomes = await requireWorkflow().convertLibrary(
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
          activeJobs.delete(command.jobId);
        }
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );

  ipcMain.handle('workflow:cancel', (_event, rawJobId: unknown): WorkflowResult<undefined> => {
    try {
      const jobId = identifierSchema.parse(rawJobId);
      const controller = activeJobs.get(jobId);
      if (controller === undefined) {
        return failed({ code: 'job_not_found', message: 'That conversion is no longer running.' });
      }
      controller.abort();
      return ok(undefined);
    } catch (error) {
      return failed(toFailure(error));
    }
  });

  ipcMain.handle('artifact:open', async (_event, rawArtifactId: unknown) =>
    withArtifact(rawArtifactId, async (artifactPath) => {
      const message = await shell.openPath(artifactPath);
      if (message !== '') throw new Error(message);
    }),
  );
  ipcMain.handle('artifact:show-in-folder', (_event, rawArtifactId: unknown) =>
    withArtifact(rawArtifactId, (artifactPath) => {
      shell.showItemInFolder(artifactPath);
      return Promise.resolve();
    }),
  );
}

async function withArtifact(
  rawArtifactId: unknown,
  action: (artifactPath: string) => Promise<void>,
): Promise<WorkflowResult<undefined>> {
  try {
    const artifactId = identifierSchema.parse(rawArtifactId);
    const artifactPath = artifactPaths.get(artifactId);
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

const createMainWindow = (): BrowserWindow => {
  const platformTitleBar: Pick<
    BrowserWindowConstructorOptions,
    'titleBarOverlay' | 'trafficLightPosition'
  > =
    process.platform === 'darwin'
      ? { trafficLightPosition: { x: 16, y: 16 } }
      : // The overlay is the window's own buttons, drawn over the top 48px: the same height as the
        // title bar in the page, which draws no line of its own for that reason (see Titlebar).
        { titleBarOverlay: { color: '#121214', height: 48, symbolColor: '#e8e8eb' } };
  const window = new BrowserWindow({
    // Electron cannot read CSS variables: these hex values are the theme's --background and
    // --foreground from src/renderer/styles.css. Keep them in step.
    backgroundColor: '#121214',
    height: 760,
    minHeight: 600,
    minWidth: 900,
    show: false,
    title: 'Mangabound',
    titleBarStyle: 'hidden',
    width: 1180,
    ...platformTitleBar,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  window.once('ready-to-show', () => {
    window.show();
  });
  void window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  return window;
};

void app.whenReady().then(async () => {
  const toolchainRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'toolchain')
    : path.join(app.getAppPath(), 'vendor', 'toolchain');
  let toolchainStatus: ToolchainStatus;
  try {
    toolchainStatus = await verifyBundledToolchain({
      arch: process.arch,
      platform: process.platform,
      toolchainRoot,
    });
  } catch {
    toolchainStatus = {
      state: 'blocked',
      tools: [],
      message: 'The bundled-tool manifest could not be verified. Reinstall Mangabound.',
    };
  }
  if (toolchainStatus.state === 'ready' && toolchainStatus.target !== undefined) {
    const runner = createNodeProcessRunner();
    const mangabindCli = new MangabindCliAdapter(
      executablePath(toolchainRoot, toolchainStatus.target, 'mangabind'),
      runner,
    );
    mangapressCli = new MangapressCliAdapter(
      executablePath(toolchainRoot, toolchainStatus.target, 'mangapress'),
      runner,
    );
    workflow = new SingleInputWorkflow(
      new MangabindBindingAdapter(mangabindCli),
      new MangapressConversionAdapter(mangapressCli),
      randomUUID,
      new FsBookFileStore(),
    );
  }
  ipcMain.handle('toolchain:get-status', () => toolchainStatus);
  preferences = new PreferencesWorkflow(
    new FsSettingsStore(path.join(app.getPath('userData'), 'settings.json')),
    directoryExists,
  );
  registerSettingsHandlers(preferences);
  registerWorkflowHandlers();
  registerOpdsHandlers();
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('before-quit', (event) => {
  if (cleanupStarted) return;
  event.preventDefault();
  cleanupStarted = true;
  for (const controller of activeJobs.values()) controller.abort();
  // A change made an instant before quitting is still written.
  void Promise.allSettled([
    workflow?.releaseAll(),
    activeSharing?.stop(),
    preferences?.settled(),
  ]).finally(() => {
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
