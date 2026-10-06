import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { FuseVersion, FuseV1Options } from '@electron/fuses';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import type { ForgeConfig } from '@electron-forge/shared-types';

import { bundleVersionOf, withBundleVersion } from './scripts/lib/bundle-version';
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
    // No appVersion here, on any platform. The packager writes it into the packaged app's own
    // package.json, so that app.getVersion() returns it (@electron/packager 20 does; 18 only wrote it
    // into the OS metadata), and an appVersion of `0.1.0` for macOS made the title bar read v0.1.0
    // instead of the full SemVer string. The package.json version stays what app.getVersion() reads
    // and the UI shows: the visible alpha label does not change. macOS's Info.plist wants integers,
    // and gets them from the postPackage hook below. Windows keeps the full string: its readable
    // ProductVersion/FileVersion resources already display it correctly (see RELEASING.md).
  },
  hooks: {
    generateAssets: async (_configuration, platform, arch) => {
      await acquireToolchain(platform, arch);
    },
    // The target's platform, not the one running the build. Done here and not through packager
    // options because the packager merges `extendInfo` before it writes the version, and would
    // overwrite it. The app is not signed while it is packaged; one that is would need this done
    // before signing, since the plist is part of what a signature covers.
    postPackage: async (_configuration, { platform, outputPaths }) => {
      if (platform !== 'darwin') return;
      for (const outputPath of outputPaths) {
        const bundles = (await readdir(outputPath)).filter((name) => name.endsWith('.app'));
        if (bundles.length === 0) throw new Error(`No .app bundle was packaged in ${outputPath}.`);
        for (const bundle of bundles) {
          const plistPath = path.join(outputPath, bundle, 'Contents', 'Info.plist');
          const plist = await readFile(plistPath, 'utf8');
          await writeFile(plistPath, withBundleVersion(plist, bundleVersionOf(version)));
        }
      }
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    // win32 added alongside darwin: unzip-and-run, no installer, no admin rights needed - this
    // project's answer to a portable Windows build. Investigated a dedicated MSI wizard maker
    // (@electron-forge/maker-wix) instead of/alongside Squirrel first: the wizard UI itself
    // worked, but its shortcut mechanism turned out to be broken independent of anything in this
    // config - electron-wix-msi's own vendored StubExecutable.exe crashes with a raw access
    // violation even unmodified, straight from the npm package, with no arguments. Deferred for
    // the same reason AppImage was: a real, structural defect in the dependency itself, not a
    // fragile hack away from working. See RELEASING.md.
    new MakerZIP({}, ['darwin', 'win32']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
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
      // On by default: it lets a page loaded from file:// read any other file:// URL with fetch
      // or XMLHttpRequest, so code that got into the page could read any file the person can.
      // Off, Electron cannot load a page from inside app.asar over file:// at all, so the
      // packaged page is served from its own scheme instead (src/main/app-protocol.ts).
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    }),
  ],
};

export default config;
