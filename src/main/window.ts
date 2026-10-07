import { app, BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';

import { rendererUrl } from './app-protocol';
import { isPermissionGranted } from './permission-policy';

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
    // --foreground from src/renderer/styles.css. Keep them in step. No show:false/'ready-to-show':
    // Electron's own docs recommend showing immediately on a matching backgroundColor instead, for
    // exactly the case this project hit - 'ready-to-show' arriving late enough to make the app feel
    // like it never started at all. This also removes the class of bug that was possible with it: a
    // window and its process tree alive indefinitely because nothing ever called show().
    backgroundColor: '#121214',
    height: 760,
    // Small enough for half of a 1366px-wide screen with a tiling window manager's gaps and a
    // reader beside it: a tiled window is not allowed under its minimum, so a larger one is drawn
    // past the edge of the screen instead of being made to fit. The pages are laid out and checked
    // down to this width (tests/visual/narrow-window.visual.spec.ts).
    minHeight: 400,
    minWidth: 480,
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
  // Request, check and device handlers are three separate doors: each one that is left alone
  // answers "yes" for everything.
  const { session } = window.webContents;
  session.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(isPermissionGranted(permission));
  });
  session.setPermissionCheckHandler((_contents, permission) => isPermissionGranted(permission));
  session.setDevicePermissionHandler(() => false);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  // Two different ways the entry point can fail to ever appear, needing two different signals:
  // loadURL()'s own rejection (tied to did-fail-load) covers the page failing to load; it does not
  // cover the renderer process dying outright (a crash doesn't reject the navigation, it just never
  // resolves it), which render-process-gone is Electron's dedicated signal for. Either way, quit
  // rather than leave an empty window and its process tree running with nothing to show for it -
  // but only before the first successful load: the same failures after a real session is already up
  // are a different situation this isn't meant to touch.
  let hasLoadedOnce = false;
  window.webContents.once('render-process-gone', () => {
    if (!hasLoadedOnce) app.quit();
  });
  window
    .loadURL(rendererUrl)
    .then(() => {
      hasLoadedOnce = true;
    })
    .catch(() => {
      app.quit();
    });

  return window;
};
