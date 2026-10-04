import path from 'node:path';
import os from 'node:os';
import { mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';

import type {} from '@wdio/electron-service';
import type {} from '@wdio/types';

const packageDirectory = path.resolve('out', `Mangabound-${process.platform}-${process.arch}`);
const appBinaryPath =
  process.platform === 'win32'
    ? path.join(packageDirectory, 'mangabound.exe')
    : process.platform === 'darwin'
      ? path.join(packageDirectory, 'Mangabound.app', 'Contents', 'MacOS', 'mangabound')
      : path.join(packageDirectory, 'mangabound');

const isWayland = process.env.MANGABOUND_WAYLAND === '1';
// Everything a run of the suite writes outside the checkout goes under one folder, so that one
// removal at the end takes all of it. WebdriverIO evaluates this file in the launcher first and
// then again in each worker; a worker inherits the environment the launcher had by then, so the
// folder is the launcher's and not one per worker (each worker used to make its own, named by its
// own process id, and nothing removed them). The app's scratch folders and the spec files' own
// fixtures land in it too, because the temporary folder of the whole run is moved into it.
const runRoot =
  process.env.MANGABOUND_E2E_RUN_ROOT ??
  path.join(os.tmpdir(), `mangabound-e2e-${String(process.pid)}`);
process.env.MANGABOUND_E2E_RUN_ROOT = runRoot;
const scratchRoot = path.join(runRoot, 'tmp');
mkdirSync(scratchRoot, { recursive: true });
for (const name of ['TMPDIR', 'TMP', 'TEMP']) process.env[name] = scratchRoot;
// Each worker still has pending books and covers of its own, kept apart from other spec files'.
process.env.MANGABOUND_PENDING_ROOT = path.join(runRoot, `pending-${String(process.pid)}`);
process.env.MANGABOUND_COVERS_ROOT = path.join(runRoot, `covers-${String(process.pid)}`);

export const config: WebdriverIO.Config = {
  autoXvfb: !isWayland,
  capabilities: [
    {
      browserName: 'electron',
      'wdio:electronServiceOptions': {
        appBinaryPath,
        // electron-service only supplies its own essential default
        // (`appArgs = ['--no-sandbox']`, confirmed by reading
        // @wdio/electron-service's source directly) when this key is
        // completely absent -- a JS destructuring default only fires on
        // `undefined`, not on an explicit `[]`. An earlier version of this
        // fix set `appArgs: []` for the non-Wayland case and `appArgs:
        // [ozone flags]` (without --no-sandbox) for Wayland; both silently
        // dropped --no-sandbox and broke Chrome's launch in CI regardless of
        // Wayland. So the key is omitted entirely unless Wayland needs it,
        // and --no-sandbox is carried alongside the Wayland-specific flags
        // rather than assumed to still apply.
        //
        // ELECTRON_OZONE_PLATFORM_HINT alone depends on the electron-service
        // child process inheriting our custom env vars, which isn't
        // guaranteed -- passing the same choice as an explicit CLI switch is
        // the reliable way Electron actually selects the Wayland Ozone
        // backend instead of falling back to (and failing without) X11.
        ...(isWayland && {
          appArgs: [
            '--no-sandbox',
            '--ozone-platform=wayland',
            '--enable-features=UseOzonePlatform',
          ],
        }),
      },
    },
  ],
  framework: 'mocha',
  logLevel: 'warn',
  maxInstances: 1,
  mochaOpts: {
    timeout: 180_000,
  },
  reporters: ['spec'],
  runner: 'local',
  services: ['electron'],
  specs: isWayland ? ['./tests/e2e/shell.e2e.ts'] : ['./tests/e2e/**/*.e2e.ts'],
  waitforTimeout: 10_000,
  onComplete: async () => {
    // The folder is named by the launcher, which is the only process that gets here.
    if (!path.basename(runRoot).startsWith('mangabound-e2e-')) {
      throw new Error('Refusing to remove a test folder that this suite did not name.');
    }
    // Windows can hold a folder for a moment after the app that used it has gone.
    await rm(runRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  },
};
