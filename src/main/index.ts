import path from 'node:path';

import { app, BrowserWindow, ipcMain } from 'electron';
import started from 'electron-squirrel-startup';

import { directoryExists } from '@/adapters/library/directory-exists';
import { FsSettingsStore } from '@/adapters/settings/fs-settings-store';
import { PreferencesWorkflow } from '@/application/workflows/preferences';

import { createMainContext } from './context';
import { registerArtifactHandlers } from './ipc/artifacts';
import { registerConversionHandlers } from './ipc/conversion';
import { registerInputHandlers } from './ipc/inputs';
import { registerMetadataHandlers } from './ipc/metadata';
import { registerOpdsHandlers } from './ipc/opds';
import { registerSettingsHandlers } from './ipc/settings';
import { bootstrapToolchain } from './toolchain-bootstrap';
import { createMainWindow } from './window';

if (started) app.quit();

const context = createMainContext();
let cleanupStarted = false;

void app.whenReady().then(async () => {
  const toolchainStatus = await bootstrapToolchain(context);
  ipcMain.handle('toolchain:get-status', () => toolchainStatus);

  const preferencesWorkflow = new PreferencesWorkflow(
    new FsSettingsStore(path.join(app.getPath('userData'), 'settings.json')),
    directoryExists,
  );
  context.preferences = preferencesWorkflow;

  registerSettingsHandlers(context, preferencesWorkflow);
  registerInputHandlers(context);
  registerConversionHandlers(context);
  registerMetadataHandlers(context);
  registerArtifactHandlers(context);
  registerOpdsHandlers(context);

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
  ]).finally(() => {
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
