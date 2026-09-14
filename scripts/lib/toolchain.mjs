import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const supportedTargets = ['win32-x64', 'linux-x64', 'darwin-x64', 'darwin-arm64'];

export const toolSpecs = {
  mangabind: {
    executableName: (target) => (target.startsWith('win32-') ? 'mangabind.exe' : 'mangabind'),
    releaseAssetName: {
      'win32-x64': 'mangabind_windows_amd64.zip',
      'linux-x64': 'mangabind_linux_amd64.tar.gz',
      'darwin-x64': 'mangabind_darwin_amd64.tar.gz',
      'darwin-arm64': 'mangabind_darwin_arm64.tar.gz',
    },
    repository: 'gustavommcv/mangabind',
    versionArguments: ['--version'],
  },
  mangapress: {
    executableName: (target) => (target.startsWith('win32-') ? 'mangapress.exe' : 'mangapress'),
    releaseAssetName: {
      'win32-x64': 'mangapress-x86_64-pc-windows-msvc.zip',
      'linux-x64': 'mangapress-x86_64-unknown-linux-musl.tar.gz',
      'darwin-x64': 'mangapress-x86_64-apple-darwin.tar.gz',
      'darwin-arm64': 'mangapress-aarch64-apple-darwin.tar.gz',
    },
    repository: 'gustavommcv/mangapress',
    versionArguments: ['--version'],
  },
};

function assertSupportedTarget(target) {
  if (!supportedTargets.includes(target)) {
    throw new Error(`Unsupported toolchain target: ${target}`);
  }
}

function normalizeArchiveEntry(entry) {
  return entry.replaceAll('\\', '/').replace(/^\.\//, '');
}

async function commandOutput(command, arguments_) {
  const result = await execFileAsync(command, arguments_, {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  return result.stdout;
}

export async function extractExecutable(archivePath, destination, executableName) {
  await mkdir(destination, { recursive: true });

  if (archivePath.endsWith('.zip') && process.platform !== 'win32') {
    const entries = (await commandOutput('unzip', ['-Z1', archivePath]))
      .split(/\r?\n/u)
      .filter(Boolean);
    const matches = entries.filter((entry) => normalizeArchiveEntry(entry) === executableName);
    if (matches.length !== 1) {
      throw new Error(
        `${path.basename(archivePath)} must contain exactly one root ${executableName}`,
      );
    }
    await execFileAsync('unzip', ['-qq', archivePath, matches[0], '-d', destination], {
      windowsHide: true,
    });
  } else {
    const entries = (await commandOutput('tar', ['-tf', archivePath]))
      .split(/\r?\n/u)
      .filter(Boolean);
    const matches = entries.filter((entry) => normalizeArchiveEntry(entry) === executableName);
    if (matches.length !== 1) {
      throw new Error(
        `${path.basename(archivePath)} must contain exactly one root ${executableName}`,
      );
    }
    await execFileAsync('tar', ['-xf', archivePath, '-C', destination, matches[0]], {
      windowsHide: true,
    });
  }

  return path.join(destination, executableName);
}

export async function sha256File(filePath) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);
  return hash.digest('hex');
}

export async function downloadFile(url, destination) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/octet-stream',
      'User-Agent': 'Mangabound-toolchain',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  if (!response.ok || response.body === null) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }

  const file = await import('node:fs').then(({ createWriteStream }) =>
    createWriteStream(destination, { flags: 'wx' }),
  );
  await pipeline(response.body, file);
}

export function parseChecksums(contents) {
  const checksums = new Map();
  for (const line of contents.split(/\r?\n/u)) {
    if (line.trim() === '') continue;
    const match = /^([a-f0-9]{64})\s+\*?(.+)$/u.exec(line);
    if (match === null) {
      throw new Error(`Malformed upstream checksum line: ${line}`);
    }
    const [, checksum, assetName] = match;
    if (checksums.has(assetName)) {
      throw new Error(`Duplicate upstream checksum entry: ${assetName}`);
    }
    checksums.set(assetName, checksum);
  }
  return checksums;
}

export function releaseVersion(tag) {
  const match = /^v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/u.exec(tag);
  if (match === null) {
    throw new Error(`Release tag is not a semantic version: ${tag}`);
  }
  return match[1];
}

async function githubJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Mangabound-toolchain',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(60 * 1000),
  });
  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

export async function latestReleaseTag(repository) {
  const release = await githubJson(`https://api.github.com/repos/${repository}/releases/latest`);
  return release.tag_name;
}

export async function releaseDetails(repository, tag) {
  const release = await githubJson(
    `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`,
  );
  return {
    notes:
      typeof release.body === 'string' && release.body.trim() !== ''
        ? release.body
        : '_No release notes provided._',
    url: release.html_url,
  };
}

export async function buildReleasePin(toolName, tag) {
  const spec = toolSpecs[toolName];
  if (spec === undefined) throw new Error(`Unknown tool: ${toolName}`);
  releaseVersion(tag);

  const release = await githubJson(
    `https://api.github.com/repos/${spec.repository}/releases/tags/${encodeURIComponent(tag)}`,
  );
  const assets = new Map(release.assets.map((asset) => [asset.name, asset]));
  const checksumsAsset = assets.get('checksums.txt');
  if (checksumsAsset === undefined) {
    throw new Error(`${toolName} ${tag} does not publish checksums.txt`);
  }

  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'mangabound-pin-'));
  const resolvedTemporaryDirectory = path.resolve(temporaryDirectory);
  const resolvedSystemTemp = `${path.resolve(tmpdir())}${path.sep}`;
  if (!resolvedTemporaryDirectory.startsWith(resolvedSystemTemp)) {
    throw new Error(`Unexpected temporary path: ${resolvedTemporaryDirectory}`);
  }
  try {
    const checksumPath = path.join(temporaryDirectory, `${toolName}-checksums.txt`);
    await downloadFile(checksumsAsset.browser_download_url, checksumPath);
    const checksumFileSha256 = await sha256File(checksumPath);
    const upstreamChecksums = parseChecksums(await readFile(checksumPath, 'utf8'));
    const artifacts = {};

    for (const target of supportedTargets) {
      assertSupportedTarget(target);
      const assetName = spec.releaseAssetName[target];
      const asset = assets.get(assetName);
      if (asset === undefined) {
        throw new Error(`${toolName} ${tag} does not publish ${assetName}`);
      }
      const upstreamSha256 = upstreamChecksums.get(assetName);
      if (upstreamSha256 === undefined) {
        throw new Error(`${toolName} ${tag} checksums.txt does not list ${assetName}`);
      }

      const archivePath = path.join(temporaryDirectory, assetName);
      await downloadFile(asset.browser_download_url, archivePath);
      const archiveSha256 = await sha256File(archivePath);
      if (archiveSha256 !== upstreamSha256) {
        throw new Error(`${toolName} ${target} archive does not match its upstream checksum`);
      }
      if (typeof asset.digest === 'string' && asset.digest !== `sha256:${archiveSha256}`) {
        throw new Error(`${toolName} ${target} archive does not match GitHub's asset digest`);
      }

      const extractionDirectory = path.join(temporaryDirectory, `${toolName}-${target}`);
      const executablePath = await extractExecutable(
        archivePath,
        extractionDirectory,
        spec.executableName(target),
      );
      artifacts[target] = {
        assetName,
        url: asset.browser_download_url,
        archiveSha256,
        executableSha256: await sha256File(executablePath),
      };
    }

    return {
      releaseTag: tag,
      protocolVersion: '1',
      checksums: {
        assetName: checksumsAsset.name,
        url: checksumsAsset.browser_download_url,
        sha256: checksumFileSha256,
      },
      artifacts,
    };
  } finally {
    await rm(resolvedTemporaryDirectory, { force: true, recursive: true });
  }
}

export function hostTarget() {
  const arch = process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : undefined;
  const platform =
    process.platform === 'win32' || process.platform === 'linux' || process.platform === 'darwin'
      ? process.platform
      : undefined;
  const target = platform === undefined || arch === undefined ? undefined : `${platform}-${arch}`;
  assertSupportedTarget(target);
  return target;
}
