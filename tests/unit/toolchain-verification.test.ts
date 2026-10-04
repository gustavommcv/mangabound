import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { FsCoverStore } from '@/adapters/covers/fs-cover-store';
import { MangapressCliAdapter } from '@/adapters/mangapress/cli';
import { MangapressConversionAdapter } from '@/adapters/mangapress/conversion-port';
import { createNodeProcessRunner } from '@/adapters/process/node-process-runner';
import { loadToolchainManifest } from '@/adapters/toolchain/manifest';
import { resolveToolchainTarget, verifyBundledToolchain } from '@/adapters/toolchain/verification';
import { defaultMangapressSettings } from '@/domain/output-profile';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = loadToolchainManifest();
type Runner = (
  executablePath: string,
  arguments_: readonly string[],
) => Promise<{ readonly stderr: string; readonly stdout: string }>;

function toolFromPath(executablePath: string): 'mangabind' | 'mangapress' {
  return path.basename(executablePath).startsWith('mangabind') ? 'mangabind' : 'mangapress';
}

function targetFromPath(
  executablePath: string,
): keyof (typeof manifest.tools)['mangabind']['pin']['artifacts'] {
  const target = manifest.supportedTargets.find((candidate) => executablePath.includes(candidate));
  if (target === undefined) throw new Error(`Test path has no target: ${executablePath}`);
  return target;
}

function protocolFor(tool: 'mangabind' | 'mangapress', overrides = {}): string {
  const version = manifest.tools[tool].pin.releaseTag.slice(1);
  return tool === 'mangabind'
    ? JSON.stringify({
        protocol_version: 1,
        tool,
        tool_version: version,
        capabilities: ['report'],
        ...overrides,
      })
    : `${JSON.stringify({
        protocol_version: 1,
        tool,
        tool_version: version,
        sequence: 1,
        type: 'protocol',
        capabilities: ['events', 'profiles'],
        ...overrides,
      })}\n`;
}

const successfulDependencies = {
  hashFile: (executablePath: string) => {
    const tool = toolFromPath(executablePath);
    return Promise.resolve(
      manifest.tools[tool].pin.artifacts[targetFromPath(executablePath)].executableSha256,
    );
  },
  run: (executablePath: string, arguments_: readonly string[]) => {
    const tool = toolFromPath(executablePath);
    const version = manifest.tools[tool].pin.releaseTag.slice(1);
    return Promise.resolve({
      stderr: '',
      stdout: arguments_[0] === '--version' ? `${tool} ${version}\n` : protocolFor(tool),
    });
  },
};

describe('bundled toolchain verification', () => {
  it.each([
    ['win32', 'x64', 'win32-x64'],
    ['linux', 'x64', 'linux-x64'],
    ['darwin', 'x64', 'darwin-x64'],
    ['darwin', 'arm64', 'darwin-arm64'],
    ['linux', 'arm64', undefined],
    ['freebsd', 'x64', undefined],
  ] as const)('maps %s-%s to its supported bundle', (platform, arch, expected) => {
    expect(resolveToolchainTarget(platform, arch)).toBe(expected);
  });

  it('accepts matching hashes, versions, protocols, and required capabilities', async () => {
    const status = await verifyBundledToolchain({
      arch: 'x64',
      dependencies: successfulDependencies,
      manifest,
      platform: 'win32',
      toolchainRoot: 'C:\\bundled-tools',
    });

    expect(status).toMatchObject({
      state: 'ready',
      target: 'win32-x64',
      tools: [
        { name: 'mangabind', state: 'ready' },
        { name: 'mangapress', state: 'ready' },
      ],
    });
    expect(status.tools.find((tool) => tool.name === 'mangabind')?.capabilities).toEqual([
      'report',
    ]);
  });

  it('preserves optional progress capability from the verified handshake', async () => {
    const status = await verifyBundledToolchain({
      arch: 'x64',
      dependencies: {
        ...successfulDependencies,
        run: (executablePath, arguments_) => {
          const tool = toolFromPath(executablePath);
          const version = manifest.tools[tool].pin.releaseTag.slice(1);
          return Promise.resolve({
            stderr: '',
            stdout:
              arguments_[0] === '--version'
                ? `${tool} ${version}\n`
                : protocolFor(
                    tool,
                    tool === 'mangabind' ? { capabilities: ['report', 'progress-json'] } : {},
                  ),
          });
        },
      },
      manifest,
      platform: 'win32',
      toolchainRoot: 'C:\\bundled-tools',
    });

    expect(status.tools.find((tool) => tool.name === 'mangabind')?.capabilities).toEqual([
      'report',
      'progress-json',
    ]);
  });

  it('accepts a conventional v prefix in human version output', async () => {
    const status = await verifyBundledToolchain({
      arch: 'x64',
      dependencies: {
        ...successfulDependencies,
        run: (executablePath, arguments_) => {
          const tool = toolFromPath(executablePath);
          const version = manifest.tools[tool].pin.releaseTag.slice(1);
          return Promise.resolve({
            stderr: '',
            stdout: arguments_[0] === '--version' ? `${tool} v${version}\n` : protocolFor(tool),
          });
        },
      },
      manifest,
      platform: 'win32',
      toolchainRoot: 'C:\\bundled-tools',
    });

    expect(status.state).toBe('ready');
  });

  it('resolves Unix executable names for a supported non-Windows target', async () => {
    const status = await verifyBundledToolchain({
      arch: 'x64',
      dependencies: successfulDependencies,
      manifest,
      platform: 'linux',
      toolchainRoot: '/bundled-tools',
    });

    expect(status.state).toBe('ready');
  });

  it('blocks every tool whose executable hash differs', async () => {
    const status = await verifyBundledToolchain({
      arch: 'x64',
      dependencies: { ...successfulDependencies, hashFile: () => Promise.resolve('tampered') },
      manifest,
      platform: 'win32',
      toolchainRoot: 'C:\\bundled-tools',
    });

    expect(status.state).toBe('blocked');
    expect(status.tools.every((tool) => tool.state === 'failed')).toBe(true);
    expect(status.tools.every((tool) => /Reinstall Mangabound/u.test(tool.message))).toBe(true);
  });

  it('blocks version skew and malformed or incompatible protocol handshakes', async () => {
    const failureCases: Runner[] = [
      () => Promise.resolve({ stderr: '', stdout: 'wrong version' }),
      (executablePath, arguments_) => {
        const tool = toolFromPath(executablePath);
        return Promise.resolve({
          stderr: '',
          stdout:
            arguments_[0] === '--version'
              ? `${tool} ${manifest.tools[tool].pin.releaseTag.slice(1)}`
              : protocolFor(tool, { tool_version: '99.0.0' }),
        });
      },
      (executablePath, arguments_) => {
        const tool = toolFromPath(executablePath);
        return Promise.resolve({
          stderr: '',
          stdout:
            arguments_[0] === '--version'
              ? `${tool} ${manifest.tools[tool].pin.releaseTag.slice(1)}`
              : '{',
        });
      },
    ];

    for (const run of failureCases) {
      const status = await verifyBundledToolchain({
        arch: 'x64',
        dependencies: { ...successfulDependencies, run },
        manifest,
        platform: 'win32',
        toolchainRoot: 'C:\\bundled-tools',
      });
      expect(status.state).toBe('blocked');
    }
  });

  it('rejects a mangapress handshake containing more than one event', async () => {
    const status = await verifyBundledToolchain({
      arch: 'x64',
      dependencies: {
        ...successfulDependencies,
        run: (executablePath, arguments_) => {
          const tool = toolFromPath(executablePath);
          const version = manifest.tools[tool].pin.releaseTag.slice(1);
          const normal = arguments_[0] === '--version' ? `${tool} ${version}` : protocolFor(tool);
          const extra = JSON.stringify({
            protocol_version: 1,
            tool: 'mangapress',
            tool_version: version,
            sequence: 2,
            type: 'future',
          });
          return Promise.resolve({
            stderr: '',
            stdout:
              tool === 'mangapress' && arguments_[0] !== '--version'
                ? `${normal}${extra}\n`
                : normal,
          });
        },
      },
      manifest,
      platform: 'win32',
      toolchainRoot: 'C:\\bundled-tools',
    });

    expect(status.tools).toMatchObject([
      { name: 'mangabind', state: 'ready' },
      { name: 'mangapress', state: 'failed' },
    ]);
  });

  it('reports unsupported platforms without touching the filesystem', async () => {
    const status = await verifyBundledToolchain({
      arch: 'arm64',
      dependencies: successfulDependencies,
      manifest,
      platform: 'linux',
      toolchainRoot: '/unused',
    });

    expect(status).toEqual({
      state: 'blocked',
      tools: [],
      message: 'Mangabound does not bundle tools for linux-arm64.',
    });
  });

  it('executes the real downloaded release binaries on the build host', async () => {
    const status = await verifyBundledToolchain({
      arch: process.arch,
      manifest,
      platform: process.platform,
      toolchainRoot: path.join(repositoryRoot, 'vendor', 'toolchain'),
    });

    expect(status.state).toBe('ready');
  });

  // The profiles the other tests convert for are Kindles. mangapress names a Kobo's EPUB
  // `.kepub.epub`, and 0.7.0 and 0.7.1 also reported that as the book's format, which the adapter
  // refuses: it only showed when the real tool was run for a Kobo (ADR 0035).
  it('converts for a Kobo profile with the real pinned mangapress', async () => {
    const target = resolveToolchainTarget(process.platform, process.arch)!;
    const executableName = target.startsWith('win32-') ? 'mangapress.exe' : 'mangapress';
    const conversion = new MangapressConversionAdapter(
      new MangapressCliAdapter(
        path.join(repositoryRoot, 'vendor', 'toolchain', target, executableName),
        createNodeProcessRunner(),
      ),
    );
    const outputDirectory = await mkdtemp(path.join(tmpdir(), 'mangabound-kobo-'));
    try {
      const book = await conversion.convert(
        {
          inputPath: path.join(
            repositoryRoot,
            'tests',
            'fixtures',
            'e2e',
            'cbz',
            'Mangabound Direct.cbz',
          ),
          outputDirectory,
          settings: { ...defaultMangapressSettings, deviceProfile: 'KoC' },
          format: 'epub',
        },
        { onProgress: () => undefined },
      );

      expect(book.name).toBe('Mangabound Direct.kepub.epub');
      expect(book.format).toBe('epub');
      expect(book.bytes).toBeGreaterThan(0);

      // The same book under the plain name, with both cover options (ADR 0038).
      const plain = await conversion.convert(
        {
          inputPath: path.join(
            repositoryRoot,
            'tests',
            'fixtures',
            'e2e',
            'cbz',
            'Mangabound Direct.cbz',
          ),
          outputDirectory,
          settings: {
            ...defaultMangapressSettings,
            deviceProfile: 'KoC',
            noKepub: true,
            smartCoverCrop: true,
            coverFill: true,
          },
          format: 'epub',
        },
        { onProgress: () => undefined },
      );
      expect(plain.name).toBe('Mangabound Direct.epub');
      expect(plain.format).toBe('epub');
      expect(plain.bytes).toBeGreaterThan(0);
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  });

  // The fixture's pages are 600x800, smaller than a Paperwhite's screen. With nothing enlarging
  // them the real tool says so, and the book carries what it said (ADR 0039).
  it('keeps the warning the real pinned mangapress gives for pages smaller than the screen', async () => {
    const target = resolveToolchainTarget(process.platform, process.arch)!;
    const executableName = target.startsWith('win32-') ? 'mangapress.exe' : 'mangapress';
    const conversion = new MangapressConversionAdapter(
      new MangapressCliAdapter(
        path.join(repositoryRoot, 'vendor', 'toolchain', target, executableName),
        createNodeProcessRunner(),
      ),
    );
    const inputPath = path.join(
      repositoryRoot,
      'tests',
      'fixtures',
      'e2e',
      'cbz',
      'Mangabound Direct.cbz',
    );
    const outputDirectory = await mkdtemp(path.join(tmpdir(), 'mangabound-warnings-'));
    try {
      const fitted = await conversion.convert(
        {
          inputPath,
          outputDirectory,
          settings: { ...defaultMangapressSettings, upscale: false },
          format: 'epub',
        },
        { onProgress: () => undefined },
      );
      expect(fitted.warnings?.map((warning) => warning.code)).toEqual([
        'images_smaller_than_device',
      ]);

      // Enlarging is where the options start, and with it there is nothing to warn about.
      const enlarged = await conversion.convert(
        { inputPath, outputDirectory, settings: defaultMangapressSettings, format: 'cbz' },
        { onProgress: () => undefined },
      );
      expect(enlarged).not.toHaveProperty('warnings');
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  });

  // A cover of the person's own is an image from anywhere, under any name, copied by the app and
  // handed over with --cover (ADR 0040). The real tool has to take it and still make the book.
  it('makes a book with a cover of the person’s own with the real pinned mangapress', async () => {
    const target = resolveToolchainTarget(process.platform, process.arch)!;
    const executableName = target.startsWith('win32-') ? 'mangapress.exe' : 'mangapress';
    const conversion = new MangapressConversionAdapter(
      new MangapressCliAdapter(
        path.join(repositoryRoot, 'vendor', 'toolchain', target, executableName),
        createNodeProcessRunner(),
      ),
    );
    const inputPath = path.join(
      repositoryRoot,
      'tests',
      'fixtures',
      'e2e',
      'cbz',
      'Mangabound Direct.cbz',
    );
    const work = await mkdtemp(path.join(tmpdir(), 'mangabound-cover-'));
    try {
      const store = new FsCoverStore(path.join(work, 'covers'));
      const picked = path.join(work, 'any name at all.png');
      await copyFile(path.join(repositoryRoot, 'tests', 'fixtures', 'covers', 'front.png'), picked);
      await store.attach(inputPath, { slot: 'book', origin: 'chosen', sourcePath: picked });
      await rm(picked);
      const [cover] = await store.list(inputPath);

      const withCover = await conversion.convert(
        {
          inputPath,
          outputDirectory: path.join(work, 'with'),
          settings: defaultMangapressSettings,
          cover: cover!.path,
          format: 'epub',
        },
        { onProgress: () => undefined },
      );
      const without = await conversion.convert(
        {
          inputPath,
          outputDirectory: path.join(work, 'without'),
          settings: defaultMangapressSettings,
          format: 'epub',
        },
        { onProgress: () => undefined },
      );

      expect(withCover.bytes).toBeGreaterThan(0);
      // The cover is a different image, so the book is a different size.
      expect(withCover.bytes).not.toBe(without.bytes);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  // The capability check knows the pinned tool has these flags; only a run shows it takes them
  // together, and that it still makes a book when told to leave the images alone.
  it('converts with every image option, and with none applied, with the real pinned mangapress', async () => {
    const target = resolveToolchainTarget(process.platform, process.arch)!;
    const executableName = target.startsWith('win32-') ? 'mangapress.exe' : 'mangapress';
    const conversion = new MangapressConversionAdapter(
      new MangapressCliAdapter(
        path.join(repositoryRoot, 'vendor', 'toolchain', target, executableName),
        createNodeProcessRunner(),
      ),
    );
    const inputPath = path.join(
      repositoryRoot,
      'tests',
      'fixtures',
      'e2e',
      'cbz',
      'Mangabound Direct.cbz',
    );
    const outputDirectory = await mkdtemp(path.join(tmpdir(), 'mangabound-images-'));
    try {
      for (const settings of [
        {
          ...defaultMangapressSettings,
          deviceProfile: 'KCS',
          forceColor: true,
          colorAutoContrast: true,
          forcePng: true,
          noQuantize: true,
          pngLegacy: true,
          forcePngRgb: true,
        },
        { ...defaultMangapressSettings, noProcessing: true },
      ]) {
        const book = await conversion.convert(
          { inputPath, outputDirectory, settings, format: 'epub' },
          { onProgress: () => undefined },
        );
        expect(book.format).toBe('epub');
        expect(book.bytes).toBeGreaterThan(0);
      }
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  });
});
