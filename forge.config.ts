import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { FuseVersion, FuseV1Options } from '@electron/fuses';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import type { ForgeConfig } from '@electron-forge/shared-types';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';

const buildForPackagedE2e = process.env.MANGABOUND_E2E === '1';

const { version } = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'package.json'), 'utf8'),
) as { version: string };

const acquireToolchain = (platform: string, arch: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['scripts/acquire-toolchain.mjs', '--target', `${platform}-${arch}`],
      {
        cwd: import.meta.dirname,
        stdio: 'inherit',
        windowsHide: true,
      },
    );
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Toolchain acquisition exited with code ${String(code)}`));
    });
  });

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName: 'mangabound',
    extraResource: [path.join(import.meta.dirname, 'vendor', 'toolchain')],
    // Apple documents CFBundleShortVersionString/CFBundleVersion as period-separated
    // integers; electron-packager writes appVersion into both verbatim, with no
    // validation. Strip the prerelease suffix only for that OS metadata - the full
    // SemVer string (from package.json, untouched) is what app.getVersion() reads at
    // runtime and what the UI shows, so nothing about the visible alpha label changes.
    // Windows keeps the full string: its readable ProductVersion/FileVersion resources
    // already display it correctly without any override (see RELEASING.md).
    ...(process.platform === 'darwin' ? { appVersion: version.split('-')[0] } : {}),
  },
  hooks: {
    generateAssets: async (_configuration, platform, arch) => {
      await acquireToolchain(platform, arch);
    },
  },
  rebuildConfig: {},
  makers: [new MakerSquirrel({}), new MakerZIP({}, ['darwin']), new MakerRpm({}), new MakerDeb({})],
  plugins: [
    new WebpackPlugin({
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './src/renderer/index.html',
            js: './src/renderer/index.tsx',
            name: 'main_window',
            preload: {
              js: './src/preload/index.ts',
            },
          },
        ],
      },
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      // WebdriverIO's supported Electron-API mocking requires the main-process
      // inspector. Production packages keep it fused off; only the disposable
      // packaged E2E build enables it so native dialogs can be deterministic.
      [FuseV1Options.EnableNodeCliInspectArguments]: buildForPackagedE2e,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
