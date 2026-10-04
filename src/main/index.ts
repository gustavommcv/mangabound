import path from 'node:path';

import { app, BrowserWindow, ipcMain } from 'electron';
import started from 'electron-squirrel-startup';

import { directoryExists } from '@/adapters/library/directory-exists';
import { FsCoverStore } from '@/adapters/covers/fs-cover-store';
import { FsPendingRuns } from '@/adapters/library/fs-pending-runs';
import { coversRoot, pendingRoot } from '@/adapters/library/pending-path';
import { FsSettingsStore } from '@/adapters/settings/fs-settings-store';
import { PreferencesWorkflow } from '@/application/workflows/preferences';

import { registerRendererScheme, serveRenderer } from './app-protocol';
import { createMainContext } from './context';
import { registerArtifactHandlers } from './ipc/artifacts';
import { registerConversionHandlers } from './ipc/conversion';
import { registerCoverHandlers } from './ipc/covers';
import { registerInputHandlers } from './ipc/inputs';
import { registerMetadataHandlers } from './ipc/metadata';
import { registerOpdsHandlers } from './ipc/opds';
import { registerPendingHandlers } from './ipc/pending';
import { registerSettingsHandlers } from './ipc/settings';
import { bootstrapToolchain } from './toolchain-bootstrap';
import { createMainWindow } from './window';

if (started) app.quit();

// Electron accepts a new scheme's privileges only before the app is ready.
registerRendererScheme();

const context = createMainContext();
let cleanupStarted = false;

void app.whenReady().then(async () => {
  context.coverStore = new FsCoverStore(
    coversRoot(process.platform, process.env, app.getPath('home')),
  );
  const toolchainStatus = await bootstrapToolchain(context);
  ipcMain.handle('toolchain:get-status', () => toolchainStatus);

  const preferencesWorkflow = new PreferencesWorkflow(
    new FsSettingsStore(path.join(app.getPath('userData'), 'settings.json')),
    directoryExists,
  );
  context.preferences = preferencesWorkflow;
  context.pendingRuns = new FsPendingRuns(
    pendingRoot(process.platform, process.env, app.getPath('home')),
    context.libraryStore,
  );
  await context.pendingRuns.pruneCompleted().catch((error: unknown) => {
    console.error('Could not clear previously exported pending books.', error);
  });

  registerSettingsHandlers(context, preferencesWorkflow);
  registerInputHandlers(context);
  registerConversionHandlers(context);
  registerCoverHandlers(context);
  registerMetadataHandlers(context);
  registerArtifactHandlers(context);
  registerPendingHandlers(context);
  registerOpdsHandlers(context);

  serveRenderer();
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('before-quit', (event) => {
  if (cleanupStarted) return;
  event.preventDefault();
  cleanupStarted = true;
  for (const controller of context.activeJobs.values()) controller.abort();
  // A change made an instant before quitting is still written.
  void Promise.allSettled([
    context.workflow?.releaseAll(),
    context.activeSharing?.stop(),
    context.preferences?.settled(),
  ])
    .then(async () => {
      await context.pendingRuns?.pruneCompleted();
    })
    .catch((error: unknown) => {
      console.error('Could not clear exported pending books.', error);
    })
    .finally(() => {
      app.quit();
    });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
