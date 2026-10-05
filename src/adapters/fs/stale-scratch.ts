import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { newestChange } from './newest-change';

/**
 * The name `mkdtemp` gives a scratch workspace made with the prefix `mangabound-`: six letters or
 * digits, and nothing else. The test folders and the acquisition script's own use longer names.
 */
const workspaceName = /^mangabound-[A-Za-z0-9]{6}$/u;

/**
 * Removes the scratch workspaces an earlier run of the app left in the temporary folder, and says
 * which. A workspace holds every volume bound during a run and is removed when the run lets go of
 * it, so one that is still there was left by a run that was killed; on Windows nothing else clears
 * the temporary folder. One changed more recently than `olderThanMs` ago is left, since it may
 * belong to another copy of the app that is still working.
 */
export async function removeStaleScratch(
  root: string,
  olderThanMs: number,
  now = Date.now(),
): Promise<readonly string[]> {
  const removed: string[] = [];
  for (const child of await readdir(root, { withFileTypes: true })) {
    if (!child.isDirectory() || !workspaceName.test(child.name)) continue;
    const scratch = path.join(root, child.name);
    if (now - (await newestChange(scratch)) <= olderThanMs) continue;
    await rm(scratch, { recursive: true, force: true });
    removed.push(child.name);
  }
  return removed;
}
