import path from 'node:path';

import { app, BrowserWindow, ipcMain, type BrowserWindowConstructorOptions } from 'electron';
import started from 'electron-squirrel-startup';

import { verifyBundledToolchain } from '@/adapters/toolchain/verification';
import type { ToolchainStatus } from '@/shared/toolchain-status';

if (started) {
  app.quit();
}

const createMainWindow = (): BrowserWindow => {
  const platformTitleBar: Pick<
    BrowserWindowConstructorOptions,
    'titleBarOverlay' | 'trafficLightPosition'
  > =
    process.platform === 'darwin'
      ? { trafficLightPosition: { x: 16, y: 16 } }
      : {
          titleBarOverlay: {
            color: '#111827',
            height: 48,
            symbolColor: '#e5e7eb',
          },
        };

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
  ipcMain.handle('toolchain:get-status', () => toolchainStatus);
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
