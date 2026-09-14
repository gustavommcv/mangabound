import { readFile, writeFile } from 'node:fs/promises';

import { format } from 'prettier';

import {
  buildReleasePin,
  latestReleaseTag,
  releaseDetails,
  supportedTargets,
  toolSpecs,
} from './lib/toolchain.mjs';

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const outputMode = process.argv.includes('--write') ? 'write' : 'stdout';
const current = JSON.parse(
  await readFile(new URL('../toolchain.lock.json', import.meta.url), 'utf8'),
);
const selectedTool = valueAfter('--tool');
if (selectedTool !== undefined && selectedTool !== 'mangabind' && selectedTool !== 'mangapress') {
  throw new Error(`--tool must be mangabind or mangapress, received ${selectedTool}`);
}

const toolsToUpdate = selectedTool === undefined ? ['mangabind', 'mangapress'] : [selectedTool];
const requestedTags = {
  mangabind: valueAfter('--mangabind'),
  mangapress: valueAfter('--mangapress'),
};
const nextTools = structuredClone(current.tools);
const changes = [];

for (const toolName of toolsToUpdate) {
  const spec = toolSpecs[toolName];
  const tag = requestedTags[toolName] ?? (await latestReleaseTag(spec.repository));
  const oldPin = current.tools[toolName].pin;
  const newPin = await buildReleasePin(toolName, tag);
  nextTools[toolName].pin = newPin;
  changes.push({
    details: await releaseDetails(spec.repository, tag),
    newPin,
    oldPin,
    toolName,
  });
}

const manifest = {
  $schema: './schemas/toolchain-lock.schema.json',
  manifestVersion: 1,
  state: 'locked',
  supportedTargets,
  tools: nextTools,
};
const serialized = await format(JSON.stringify(manifest), { parser: 'json' });

if (outputMode === 'write') {
  await writeFile(new URL('../toolchain.lock.json', import.meta.url), serialized, 'utf8');
  for (const change of changes) {
    console.log(`Locked ${change.toolName} ${change.newPin.releaseTag}.`);
  }
} else {
  process.stdout.write(serialized);
}

const pullRequestBodyPath = valueAfter('--pr-body');
if (pullRequestBodyPath !== undefined) {
  if (changes.length !== 1) {
    throw new Error('--pr-body requires exactly one --tool');
  }
  const [change] = changes;
  const oldTag = change.oldPin?.releaseTag ?? 'not pinned';
  const oldProtocol = change.oldPin?.protocolVersion ?? 'not pinned';
  const body = `## ${change.toolName} toolchain update

| | Current | Proposed |
| --- | --- | --- |
| Release | \`${oldTag}\` | \`${change.newPin.releaseTag}\` |
| Machine protocol | \`${oldProtocol}\` | \`${change.newPin.protocolVersion}\` |

Every supported platform asset was downloaded, checked against upstream \`checksums.txt\` and GitHub's asset digest, unpacked, and hashed. The host executable also runs its version and protocol handshakes. The normal pull-request CI will package and exercise the candidate binaries on Windows, macOS, Linux, and Wayland.

### Upstream release notes

${change.details.notes}

[View the upstream release](${change.details.url})
`;
  await writeFile(pullRequestBodyPath, body, 'utf8');
}
