import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { hostTarget, toolSpecs } from './lib/toolchain.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = hostTarget();
const manifest = JSON.parse(
  await readFile(path.join(repositoryRoot, 'schemas', 'cli-capabilities.json'), 'utf8'),
);

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right, 'en'));
}

function advertisedFlags(help) {
  return sorted(new Set(help.match(/(?<!\S)-{1,2}[A-Za-z][\w-]*/gu) ?? []));
}

for (const toolName of ['mangabind', 'mangapress']) {
  const executablePath = path.join(
    repositoryRoot,
    'vendor',
    'toolchain',
    target,
    toolSpecs[toolName].executableName(target),
  );
  const { stdout, stderr } = await execFileAsync(executablePath, ['--help'], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  const actual = advertisedFlags(`${stdout}\n${stderr}`);
  const groups = manifest.tools[toolName];
  // A deferred flag is one the pinned tool has and the app does not offer yet (ADR 0035). It is
  // listed so that it is a decision somebody wrote down, never a flag nobody noticed.
  const deferred = sorted(groups.deferred ?? []);
  const offered = [...groups.workflow, ...groups.user, ...groups.internal];
  const twice = deferred.filter((flag) => offered.includes(flag));
  if (twice.length > 0) {
    throw new Error(
      `${toolName} lists these flags as both offered and deferred: ${twice.join(', ')}.`,
    );
  }
  const represented = sorted(new Set([...offered, ...deferred]));
  if (JSON.stringify(actual) !== JSON.stringify(represented)) {
    const missing = actual.filter((flag) => !represented.includes(flag));
    const stale = represented.filter((flag) => !actual.includes(flag));
    throw new Error(
      `${toolName} capability coverage is stale. Unrepresented: ${missing.join(', ') || 'none'}. No longer advertised: ${stale.join(', ') || 'none'}.`,
    );
  }
  console.log(`${toolName}: all ${String(actual.length)} advertised flags are represented.`);
  if (deferred.length > 0) {
    console.log(
      `${toolName}: ${String(deferred.length)} of them are deferred, not offered yet: ${deferred.join(', ')}.`,
    );
  }
}
