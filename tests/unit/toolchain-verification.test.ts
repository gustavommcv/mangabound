import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadToolchainManifest } from '@/adapters/toolchain/manifest';
import { resolveToolchainTarget, verifyBundledToolchain } from '@/adapters/toolchain/verification';

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
});
