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

  // Electron <44.4.4 has a confirmed bug where 'ready-to-show' never fires for a hidden window
  // using titleBarOverlay on Windows (electron/electron#54025, fixed by #54118) - this project stays
  // updated past that fix, but 'ready-to-show' can still legitimately arrive late for other reasons
  // (Electron's own docs note a complex page's first paint can be slow enough to make the app feel
  // stuck), so this timeout is kept as a second line of defense rather than removed now that the
  // known root cause is patched.
  let shown = false;
  const showFallback = setTimeout(() => {
    shown = true;
    window.show();
  }, readyToShowFallbackMs);
  window.once('ready-to-show', () => {
    clearTimeout(showFallback);
    shown = true;
    window.show();
  });

  // If the renderer never reaches a first paint at all - it crashes outright, or the entry file
  // itself fails to load - waiting out the fallback above would only delay an invisible window by
  // readyToShowFallbackMs before showing a permanently blank one. Quit instead, but only when this
  // window has never shown anything yet: the same events firing later, after a real session is
  // already up, are a very different situation this isn't meant to react to.
  const quitIfNeverShown = (): void => {
    if (shown) return;
    shown = true;
    clearTimeout(showFallback);
    app.quit();
  };
  window.webContents.once('render-process-gone', quitIfNeverShown);
  window.webContents.once(
    'did-fail-load',
    (_event, _errorCode, _errorDescription, _url, isMainFrame) => {
      if (isMainFrame) quitIfNeverShown();
    },
  );

  void window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  return window;
};
