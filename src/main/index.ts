import { randomBytes, randomUUID } from 'node:crypto';
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
import { FsLibraryStore } from '@/adapters/library/fs-library-store';
import { ExternalMetadataProvider } from '@/adapters/external-metadata/metadata-provider';
import { MetadataProviderError } from '@/adapters/external-metadata/protocol';
import { MangapressCliAdapter } from '@/adapters/mangapress/cli';
import { MangapressConversionAdapter } from '@/adapters/mangapress/conversion-port';
import { OsNetworkInterfaces } from '@/adapters/network/os-network-interfaces';
import { NodeOpdsServer } from '@/adapters/opds/http-server';
import { createNodeProcessRunner } from '@/adapters/process/node-process-runner';
import { verifyBundledToolchain } from '@/adapters/toolchain/verification';
import type { OpdsServerHandle } from '@/application/ports/opds-server';
import { ProcessCancelledError } from '@/application/ports/process-runner';
import { LibraryPublisher } from '@/application/workflows/library-publisher';
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
import type { ToolchainStatus, ToolchainTarget } from '@/shared/toolchain-status';
import {
  type ArtifactSummary,
  batchConversionCommandSchema,
  type BatchPlanSummary,
  type BatchTitleResult,
  conversionCommandSchema,
  type DeviceProfileSummary,
  identifierSchema,
  inputKindSchema,
  type InspectedInputPayload,
  type MetadataSearchResult,
  planBatchCommandSchema,
  type PlanSummary,
  searchMetadataCommandSchema,
  type SelectedInput,
  type SelectedLibrary,
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
const metadataProvider = new ExternalMetadataProvider();
const libraryStore = new FsLibraryStore();
const libraryPublisher = new LibraryPublisher(libraryStore);
const opdsServer = new NodeOpdsServer(libraryStore);
const networkInterfaces = new OsNetworkInterfaces();
let activeSharing: OpdsServerHandle | undefined;
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

async function publishArtifacts(
  libraryPath: string,
  artifacts: readonly ConversionArtifact[],
): Promise<void> {
  // Sequential, not Promise.all: FsLibraryStore.publish() reads, merges, and rewrites the
  // whole manifest file, so concurrent calls for the same library would race and could
  // silently drop an entry.
  for (const artifact of artifacts) {
    try {
      await libraryPublisher.publish(libraryPath, artifact);
    } catch (error) {
      console.error('Failed to publish a saved book to the library catalog.', error);
    }
  }
}

function toSharingStatus(handle: OpdsServerHandle | undefined): OpdsSharingStatus {
  if (handle === undefined) return { active: false };
  return {
    active: true,
    url: handle.url,
    interfaceAddress: handle.interfaceAddress,
    port: handle.port,
    authMode: handle.authMode,
    ...(handle.token === undefined ? {} : { token: handle.token }),
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
          auth:
            command.auth.mode === 'token'
              ? { mode: 'token', token: randomBytes(32).toString('base64url') }
              : command.auth,
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

function registerWorkflowHandlers(): void {
  ipcMain.handle(
    'workflow:choose-input',
    async (_event, rawKind: unknown): Promise<WorkflowResult<SelectedInput | null>> => {
      try {
        const kind = inputKindSchema.parse(rawKind);
        const result = await dialog.showOpenDialog({
          title: kind === 'folder' ? 'Choose a manga folder' : 'Choose a CBZ file',
          properties: kind === 'folder' ? ['openDirectory'] : ['openFile'],
          ...(kind === 'cbz'
            ? { filters: [{ name: 'Comic book archive', extensions: ['cbz'] }] }
            : {}),
        });
        const inputPath = result.filePaths[0];
        if (result.canceled || inputPath === undefined) return ok(null);
        const inputStats = await stat(inputPath);
        const validInput =
          kind === 'folder'
            ? inputStats.isDirectory()
            : inputStats.isFile() && path.extname(inputPath).toLowerCase() === '.cbz';
        if (!validInput) {
          return failed({
            code: 'invalid_input',
            message:
              kind === 'folder'
                ? 'Choose a folder containing manga chapters.'
                : 'Choose a valid .cbz file.',
          });
        }
        const selectionId = randomUUID();
        const selection = {
          inputPath,
          displayName: path.basename(inputPath),
          kind,
        };
        selectedInputs.set(selectionId, selection);
        return ok({
          selectionId,
          displayName: selection.displayName,
          displayPath: inputPath,
          kind,
        });
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
    'workflow:choose-input-batch',
    async (): Promise<WorkflowResult<{ parentPath: string; displayName: string } | null>> => {
      try {
        const result = await dialog.showOpenDialog({
          title: 'Choose a folder containing multiple manga',
          properties: ['openDirectory'],
        });
        const parentPath = result.filePaths[0];
        if (result.canceled || parentPath === undefined) return ok(null);
        if (!(await stat(parentPath)).isDirectory()) {
          return failed({
            code: 'invalid_input',
            message: 'Choose a folder containing manga subfolders.',
          });
        }
        return ok({ parentPath, displayName: path.basename(parentPath) });
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
        });
        const libraryPath = result.filePaths[0];
        if (result.canceled || libraryPath === undefined) return ok(null);
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
        try {
          const artifacts = await requireWorkflow().convert(
            {
              sessionId: command.sessionId,
              libraryPath,
              settings: command.settings,
              format: command.format,
              ...(command.mapping === undefined ? {} : { mapping: command.mapping }),
            },
            {
              signal: controller.signal,
              onProgress: (progress) => {
                event.sender.send('workflow:progress', { jobId: command.jobId, ...progress });
              },
            },
          );
          for (const artifact of artifacts) artifactPaths.set(artifact.id, artifact.path);
          await publishArtifacts(libraryPath, artifacts);
          return ok(artifacts.map(({ bytes, format, id, name }) => ({ bytes, format, id, name })));
        } finally {
          activeJobs.delete(command.jobId);
        }
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );

  ipcMain.handle(
    'workflow:plan-batch',
    async (_event, rawCommand: unknown): Promise<WorkflowResult<BatchPlanSummary>> => {
      try {
        const command = planBatchCommandSchema.parse(rawCommand);
        if (activeJobs.has(command.jobId)) {
          return failed({ code: 'job_exists', message: 'That discovery is already running.' });
        }
        const controller = new AbortController();
        activeJobs.set(command.jobId, controller);
        try {
          return ok(await requireWorkflow().planBatch(command.parentPath, controller.signal));
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
        await requireWorkflow().writeTitleMapping(command.inputPath, command.mapping);
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
        if (activeJobs.has(command.jobId)) {
          return failed({ code: 'job_exists', message: 'That search is already running.' });
        }
        const controller = new AbortController();
        activeJobs.set(command.jobId, controller);
        try {
          return ok(await metadataProvider.search(command.title, controller.signal));
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
        if (activeJobs.has(command.jobId)) {
          return failed({ code: 'job_exists', message: 'That lookup is already running.' });
        }
        const controller = new AbortController();
        activeJobs.set(command.jobId, controller);
        try {
          return ok(await metadataProvider.suggestVolumes(command.providerId, controller.signal));
        } finally {
          activeJobs.delete(command.jobId);
        }
      } catch (error) {
        return failed(toFailure(error));
      }
    },
  );

  ipcMain.handle(
    'workflow:convert-batch',
    async (
      event: IpcMainInvokeEvent,
      rawCommand: unknown,
    ): Promise<WorkflowResult<readonly BatchTitleResult[]>> => {
      try {
        const command = batchConversionCommandSchema.parse(rawCommand);
        const libraryPath = selectedLibraries.get(command.libraryId);
        if (libraryPath === undefined) {
          return failed({ code: 'library_not_found', message: 'Choose the output folder again.' });
        }
        if (activeJobs.has(command.jobId)) {
          return failed({ code: 'job_exists', message: 'That conversion is already running.' });
        }
        const controller = new AbortController();
        activeJobs.set(command.jobId, controller);
        try {
          const outcomes = await requireWorkflow().convertBatch(
            {
              parentPath: command.parentPath,
              libraryPath,
              settings: command.settings,
              format: command.format,
              ...(command.titles === undefined ? {} : { titles: command.titles }),
            },
            {
              signal: controller.signal,
              onProgress: (progress) => {
                event.sender.send('workflow:progress', { jobId: command.jobId, ...progress });
              },
            },
          );
          for (const outcome of outcomes) {
            for (const artifact of outcome.artifacts) artifactPaths.set(artifact.id, artifact.path);
          }
          await publishArtifacts(
            libraryPath,
            outcomes.flatMap((outcome) => outcome.artifacts),
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
      : { titleBarOverlay: { color: '#111827', height: 48, symbolColor: '#e5e7eb' } };
  const window = new BrowserWindow({
    backgroundColor: '#0b101b',
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
    );
  }
  ipcMain.handle('toolchain:get-status', () => toolchainStatus);
  registerWorkflowHandlers();
  registerOpdsHandlers();
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('before-quit', (event) => {
  if (cleanupStarted || (workflow === undefined && activeSharing === undefined)) return;
  event.preventDefault();
  cleanupStarted = true;
  for (const controller of activeJobs.values()) controller.abort();
  void Promise.allSettled([workflow?.releaseAll(), activeSharing?.stop()]).finally(() => {
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
