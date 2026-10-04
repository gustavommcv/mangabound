import { tmpdir } from 'node:os';
import path from 'node:path';

import { app, BrowserWindow, ipcMain } from 'electron';
import started from 'electron-squirrel-startup';

import { directoryExists } from '@/adapters/library/directory-exists';
import { FsCoverStore } from '@/adapters/covers/fs-cover-store';
import { removeStaleScratch } from '@/adapters/fs/stale-scratch';
import { FsPendingRuns } from '@/adapters/library/fs-pending-runs';
import { moveLegacyStorage } from '@/adapters/library/legacy-storage';
import { coversRoot, legacyStorageMove, pendingRoot } from '@/adapters/library/pending-path';
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
const oneDay = 24 * 60 * 60 * 1000;
let cleanupStarted = false;

void app.whenReady().then(async () => {
  // Before anything reads them: an earlier version kept these in the installer's own folder on
  // Windows, which uninstalling the app empties.
  const legacyMove = legacyStorageMove(process.platform, process.env, app.getPath('home'));
  if (legacyMove !== undefined) {
    await moveLegacyStorage({
      ...legacyMove,
      onProblem: (message, cause) => {
        console.error(message, cause);
      },
    });
  }
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
  // What a run that was killed left behind: a half-made first book in the pending folder, and the
  // scratch copies of its volumes in the temporary folder. Anything newer than a day may belong to
  // another copy of the app that is still working.
  await context.pendingRuns.pruneAbandoned(oneDay).catch((error: unknown) => {
    console.error('Could not clear a run that was interrupted before its first book.', error);
  });
  await removeStaleScratch(tmpdir(), oneDay).catch((error: unknown) => {
    console.error('Could not clear scratch folders an earlier run left behind.', error);
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
