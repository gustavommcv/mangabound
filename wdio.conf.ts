import path from 'node:path';

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
    // The batch spec runs two real, sequential manga-to-book conversions inside one test
    // (mangabind -batch, then mangapress per volume) -- real per-conversion budgets elsewhere
    // in this suite are already 120s each, so this global ceiling must comfortably exceed
    // 2x that plus the batch discovery/mapping steps that precede it.
    timeout: 300_000,
  },
  reporters: ['spec'],
  runner: 'local',
  services: ['electron'],
  specs: isWayland ? ['./tests/e2e/shell.e2e.ts'] : ['./tests/e2e/**/*.e2e.ts'],
  waitforTimeout: 10_000,
};
