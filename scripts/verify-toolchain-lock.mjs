import { readFile } from 'node:fs/promises';

const expectedTargets = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-x64'];
const manifestUrl = new URL('../toolchain.lock.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));

const fail = (message) => {
  throw new Error(`Invalid toolchain.lock.json: ${message}`);
};

if (manifest.manifestVersion !== 1) {
  fail('manifestVersion must be 1');
}

const actualTargets = [...(manifest.supportedTargets ?? [])].sort();
if (JSON.stringify(actualTargets) !== JSON.stringify(expectedTargets)) {
  fail(`supportedTargets must be exactly ${expectedTargets.join(', ')}`);
}

for (const toolName of ['mangabind', 'mangapress']) {
  if (!manifest.tools?.[toolName]?.sourceRepo?.startsWith('https://github.com/')) {
    fail(`${toolName} must declare its sourceRepo`);
  }
}

if (manifest.state === 'awaiting-structured-releases') {
  for (const toolName of ['mangabind', 'mangapress']) {
    if (manifest.tools[toolName].pin !== null) {
      fail(`${toolName} pin must remain null while structured releases are pending`);
    }
  }

  console.log(
    'Toolchain lock is valid but intentionally not release-eligible: structured CLI releases are pending.',
  );
  process.exit(0);
}

if (manifest.state !== 'locked') {
  fail('state must be awaiting-structured-releases or locked');
}

for (const toolName of ['mangabind', 'mangapress']) {
  const tool = manifest.tools?.[toolName];
  const pin = tool?.pin;
  if (pin === null || pin === undefined) {
    fail(`${toolName} pin is missing`);
  }
  if (typeof pin.releaseTag !== 'string' || typeof pin.protocolVersion !== 'string') {
    fail(`${toolName} must declare releaseTag and protocolVersion`);
  }
  if (
    typeof pin.checksums?.assetName !== 'string' ||
    !pin.checksums.url?.startsWith('https://github.com/') ||
    !/^[a-f0-9]{64}$/.test(pin.checksums.sha256 ?? '')
  ) {
    fail(`${toolName} must pin the upstream checksum file`);
  }

  for (const target of expectedTargets) {
    const artifact = pin.artifacts?.[target];
    if (artifact === undefined) {
      fail(`${toolName} is missing ${target}`);
    }
    if (typeof artifact.assetName !== 'string') {
      fail(`${toolName} ${target} must declare assetName`);
    }
    for (const hashName of ['archiveSha256', 'executableSha256']) {
      if (!/^[a-f0-9]{64}$/.test(artifact[hashName] ?? '')) {
        fail(`${toolName} ${target} has an invalid ${hashName}`);
      }
    }
    if (!artifact.url?.startsWith('https://github.com/')) {
      fail(`${toolName} ${target} must use an immutable GitHub Release URL`);
    }
  }
}

console.log('Toolchain lock is structurally valid and release-eligible.');
