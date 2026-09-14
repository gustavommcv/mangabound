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

export const config: WebdriverIO.Config = {
  autoXvfb: process.env.MANGABOUND_WAYLAND !== '1',
  capabilities: [
    {
      browserName: 'electron',
      'wdio:electronServiceOptions': {
        appBinaryPath,
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
