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
        // ELECTRON_OZONE_PLATFORM_HINT alone depends on the electron-service
        // child process inheriting our custom env vars, which isn't
        // guaranteed -- passing the same choice as an explicit CLI switch is
        // the reliable way Electron actually selects the Wayland Ozone
        // backend instead of falling back to (and failing without) X11.
        appArgs: isWayland
          ? ['--ozone-platform=wayland', '--enable-features=UseOzonePlatform']
          : [],
      },
    },
  ],
  framework: 'mocha',
  logLevel: 'warn',
  maxInstances: 1,
  mochaOpts: {
    timeout: 30_000,
  },
  reporters: ['spec'],
  runner: 'local',
  services: ['electron'],
  specs: ['./tests/e2e/**/*.e2e.ts'],
  waitforTimeout: 10_000,
};
