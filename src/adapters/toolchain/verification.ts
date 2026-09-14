import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

import { parseMangabindProtocolInfo } from '@/adapters/mangabind/protocol';
import { parseMangapressEventStream } from '@/adapters/mangapress/protocol';
import { loadToolchainManifest, type ToolchainManifest } from '@/adapters/toolchain/manifest';
import type {
  ToolName,
  ToolchainStatus,
  ToolchainTarget,
  ToolVerificationStatus,
} from '@/shared/toolchain-status';

const execFileAsync = promisify(execFile);

interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

interface VerificationDependencies {
  readonly hashFile: (filePath: string) => Promise<string>;
  readonly run: (executablePath: string, arguments_: readonly string[]) => Promise<CommandResult>;
}

interface VerificationOptions {
  readonly arch: NodeJS.Architecture;
  readonly manifest?: ToolchainManifest;
  readonly platform: NodeJS.Platform;
  readonly toolchainRoot: string;
  readonly dependencies?: VerificationDependencies;
}

const executableNames: Record<ToolName, { readonly windows: string; readonly unix: string }> = {
  mangabind: { windows: 'mangabind.exe', unix: 'mangabind' },
  mangapress: { windows: 'mangapress.exe', unix: 'mangapress' },
};

export function resolveToolchainTarget(
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture,
): ToolchainTarget | undefined {
  const candidate = `${platform}-${arch}`;
  return candidate === 'win32-x64' ||
    candidate === 'linux-x64' ||
    candidate === 'darwin-x64' ||
    candidate === 'darwin-arm64'
    ? candidate
    : undefined;
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);
  return hash.digest('hex');
}

async function run(executablePath: string, arguments_: readonly string[]): Promise<CommandResult> {
  const result = await execFileAsync(executablePath, [...arguments_], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
    windowsHide: true,
  });
  return { stderr: result.stderr, stdout: result.stdout };
}

function expectedVersion(releaseTag: string): string {
  return releaseTag.replace(/^v/u, '');
}

function verifyVersionOutput(toolName: ToolName, releaseTag: string, stdout: string): void {
  const version = expectedVersion(releaseTag);
  if (stdout.trim() !== `${toolName} ${version}` && stdout.trim() !== `${toolName} v${version}`) {
    throw new Error(`${toolName} reports a different release version.`);
  }
}

function verifyProtocolOutput(
  toolName: ToolName,
  releaseTag: string,
  protocolVersion: string,
  stdout: string,
): void {
  const version = expectedVersion(releaseTag);
  if (toolName === 'mangabind') {
    const handshake = parseMangabindProtocolInfo(stdout);
    if (
      handshake.tool_version !== version ||
      String(handshake.protocol_version) !== protocolVersion ||
      !handshake.capabilities.includes('report')
    ) {
      throw new Error('mangabind reports an incompatible machine protocol.');
    }
    return;
  }

  const events = parseMangapressEventStream(stdout);
  const handshake = events.length === 1 ? events[0] : undefined;
  if (
    handshake?.type !== 'protocol' ||
    handshake.tool_version !== version ||
    String(handshake.protocol_version) !== protocolVersion ||
    !Array.isArray(handshake.capabilities) ||
    !handshake.capabilities.includes('events') ||
    !handshake.capabilities.includes('profiles')
  ) {
    throw new Error('mangapress reports an incompatible machine protocol.');
  }
}

async function verifyTool(
  toolName: ToolName,
  target: ToolchainTarget,
  toolchainRoot: string,
  manifest: ToolchainManifest,
  dependencies: VerificationDependencies,
): Promise<ToolVerificationStatus> {
  const pin = manifest.tools[toolName].pin;
  const executableName = target.startsWith('win32-')
    ? executableNames[toolName].windows
    : executableNames[toolName].unix;
  const executablePath = path.join(toolchainRoot, target, executableName);

  try {
    if ((await dependencies.hashFile(executablePath)) !== pin.artifacts[target].executableSha256) {
      throw new Error(`${toolName} failed its startup integrity check.`);
    }
    const versionResult = await dependencies.run(executablePath, ['--version']);
    verifyVersionOutput(toolName, pin.releaseTag, versionResult.stdout);
    const protocolResult = await dependencies.run(executablePath, ['--protocol-version']);
    verifyProtocolOutput(toolName, pin.releaseTag, pin.protocolVersion, protocolResult.stdout);
    return {
      name: toolName,
      releaseTag: pin.releaseTag,
      state: 'ready',
      message: `${toolName} ${pin.releaseTag} is verified.`,
    };
  } catch {
    return {
      name: toolName,
      releaseTag: pin.releaseTag,
      state: 'failed',
      message: `${toolName} could not be verified. Reinstall Mangabound to restore its bundled tools.`,
    };
  }
}

export async function verifyBundledToolchain({
  arch,
  manifest = loadToolchainManifest(),
  platform,
  toolchainRoot,
  dependencies = { hashFile, run },
}: VerificationOptions): Promise<ToolchainStatus> {
  const target = resolveToolchainTarget(platform, arch);
  if (target === undefined) {
    return {
      state: 'blocked',
      tools: [],
      message: `Mangabound does not bundle tools for ${platform}-${arch}.`,
    };
  }

  const tools = await Promise.all(
    (['mangabind', 'mangapress'] as const).map((toolName) =>
      verifyTool(toolName, target, toolchainRoot, manifest, dependencies),
    ),
  );
  const ready = tools.every((tool) => tool.state === 'ready');
  return {
    state: ready ? 'ready' : 'blocked',
    target,
    tools,
    message: ready
      ? 'Bundled conversion tools are verified and ready.'
      : 'Conversion is unavailable until the bundled tools are restored.',
  };
}
