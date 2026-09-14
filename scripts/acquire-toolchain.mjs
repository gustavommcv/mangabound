import { execFile } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  downloadFile,
  extractExecutable,
  hostTarget,
  parseChecksums,
  releaseVersion,
  sha256File,
  supportedTargets,
  toolSpecs,
} from './lib/toolchain.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function runHandshake(toolName, executablePath, pin) {
  const expectedVersion = releaseVersion(pin.releaseTag);
  const versionResult = await execFileAsync(executablePath, toolSpecs[toolName].versionArguments, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
    windowsHide: true,
  });
  const versionPattern = new RegExp(
    `^${toolName}\\s+v?${expectedVersion.replaceAll('.', '\\.')}\\s*$`,
    'u',
  );
  if (!versionPattern.test(versionResult.stdout)) {
    throw new Error(`${toolName} reported an unexpected version: ${versionResult.stdout.trim()}`);
  }

  const protocolResult = await execFileAsync(executablePath, ['--protocol-version'], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
    windowsHide: true,
  });
  let protocol;
  try {
    protocol = JSON.parse(protocolResult.stdout.trim());
  } catch (error) {
    throw new Error(`${toolName} returned malformed protocol information`, { cause: error });
  }
  if (
    protocol.tool !== toolName ||
    String(protocol.protocol_version) !== pin.protocolVersion ||
    protocol.tool_version !== expectedVersion
  ) {
    throw new Error(`${toolName} protocol handshake does not match its lockfile pin`);
  }
}

const target = valueAfter('--target') ?? hostTarget();
if (!supportedTargets.includes(target)) {
  throw new Error(`Unsupported toolchain target: ${target}`);
}
if (target !== hostTarget()) {
  throw new Error(`Cannot execute ${target} release checks on the ${hostTarget()} build host`);
}

const lockText = await readFile(path.join(repositoryRoot, 'toolchain.lock.json'), 'utf8');
const lock = JSON.parse(lockText);
if (lock.state !== 'locked') {
  throw new Error('Distributable builds require a locked toolchain manifest');
}

const toolchainRoot = path.resolve(repositoryRoot, 'vendor', 'toolchain');
const expectedToolchainRoot = `${repositoryRoot}${path.sep}`;
if (!toolchainRoot.startsWith(expectedToolchainRoot)) {
  throw new Error(`Refusing to write outside the repository: ${toolchainRoot}`);
}
await mkdir(toolchainRoot, { recursive: true });
const stagingDirectory = await mkdtemp(path.join(toolchainRoot, `.staging-${target}-`));
const workspaceDirectory = await mkdtemp(path.join(tmpdir(), 'mangabound-acquire-'));
const resolvedWorkspace = path.resolve(workspaceDirectory);
if (!resolvedWorkspace.startsWith(`${path.resolve(tmpdir())}${path.sep}`)) {
  throw new Error(`Unexpected acquisition workspace: ${resolvedWorkspace}`);
}

try {
  for (const toolName of ['mangabind', 'mangapress']) {
    const spec = toolSpecs[toolName];
    const pin = lock.tools[toolName].pin;
    const artifact = pin.artifacts[target];
    const checksumPath = path.join(workspaceDirectory, `${toolName}-checksums.txt`);
    const archivePath = path.join(workspaceDirectory, artifact.assetName);

    await downloadFile(pin.checksums.url, checksumPath);
    if ((await sha256File(checksumPath)) !== pin.checksums.sha256) {
      throw new Error(`${toolName} checksum file does not match the committed lock`);
    }
    const upstreamChecksum = parseChecksums(await readFile(checksumPath, 'utf8')).get(
      artifact.assetName,
    );
    if (upstreamChecksum !== artifact.archiveSha256) {
      throw new Error(`${toolName} upstream checksum does not match the committed archive pin`);
    }

    await downloadFile(artifact.url, archivePath);
    if ((await sha256File(archivePath)) !== artifact.archiveSha256) {
      throw new Error(`${toolName} archive does not match the committed lock`);
    }

    const extractedDirectory = path.join(workspaceDirectory, `${toolName}-extracted`);
    const extractedExecutable = await extractExecutable(
      archivePath,
      extractedDirectory,
      spec.executableName(target),
    );
    if ((await sha256File(extractedExecutable)) !== artifact.executableSha256) {
      throw new Error(`${toolName} executable does not match the committed lock`);
    }
    if (process.platform !== 'win32') await chmod(extractedExecutable, 0o755);
    await runHandshake(toolName, extractedExecutable, pin);
    await copyFile(extractedExecutable, path.join(stagingDirectory, spec.executableName(target)));
  }

  await writeFile(
    path.join(stagingDirectory, 'manifest.json'),
    JSON.stringify({ target, tools: lock.tools }, null, 2),
    'utf8',
  );

  const targetDirectory = path.join(toolchainRoot, target);
  await rm(targetDirectory, { force: true, recursive: true });
  await rename(stagingDirectory, targetDirectory);
  console.log(`Verified toolchain acquired for ${target}.`);
} catch (error) {
  await rm(stagingDirectory, { force: true, recursive: true });
  throw error;
} finally {
  await rm(resolvedWorkspace, { force: true, recursive: true });
}
