import { readFile, writeFile } from 'node:fs/promises';

import {
  buildReleasePin,
  latestReleaseTag,
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
const mangabindTag =
  valueAfter('--mangabind') ?? (await latestReleaseTag(toolSpecs.mangabind.repository));
const mangapressTag =
  valueAfter('--mangapress') ?? (await latestReleaseTag(toolSpecs.mangapress.repository));

const [mangabindPin, mangapressPin] = await Promise.all([
  buildReleasePin('mangabind', mangabindTag),
  buildReleasePin('mangapress', mangapressTag),
]);

const manifest = {
  $schema: './schemas/toolchain-lock.schema.json',
  manifestVersion: 1,
  state: 'locked',
  supportedTargets,
  tools: {
    mangabind: {
      sourceRepo: current.tools.mangabind.sourceRepo,
      pin: mangabindPin,
    },
    mangapress: {
      sourceRepo: current.tools.mangapress.sourceRepo,
      pin: mangapressPin,
    },
  },
};
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

if (outputMode === 'write') {
  await writeFile(new URL('../toolchain.lock.json', import.meta.url), serialized, 'utf8');
  console.log(`Locked mangabind ${mangabindTag} and mangapress ${mangapressTag}.`);
} else {
  process.stdout.write(serialized);
}
