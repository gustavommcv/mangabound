import { app, BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';

import { readyToShowFallbackMs } from './constants';

export const createMainWindow = (): BrowserWindow => {
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
      // The preload runs sandboxed, with no access to the main-process-only `app` module; this is
      // the standard way to hand it a value from main without a round trip through IPC.
      additionalArguments: [`--app-version=${app.getVersion()}`],
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
  // 'ready-to-show' depends on the renderer producing a first composited frame; on some GPU/display
  // setups (observed with a virtual display adapter alongside a real GPU) that signal never arrives,
  // leaving the window permanently created-but-invisible with no error anywhere. This fallback
  // guarantees the window becomes visible either way.
  const showFallback = setTimeout(() => {
    window.show();
  }, readyToShowFallbackMs);
  window.once('ready-to-show', () => {
    clearTimeout(showFallback);
    window.show();
  });
  void window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  return window;
};
