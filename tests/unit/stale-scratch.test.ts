import { lutimes, mkdir, mkdtemp, readdir, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { newestChange } from '@/adapters/fs/newest-change';
import { removeStaleScratch } from '@/adapters/fs/stale-scratch';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function scratch(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mangabound-stale-test-'));
  directories.push(root);
  return root;
}

const day = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 4, 12, 0, 0);

/** Writes a file and says it was last changed `agoMs` before `now`. */
async function fileChanged(file: string, agoMs: number): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, 'x');
  const when = new Date(now - agoMs);
  await utimes(file, when, when);
}

/** Says everything in a tree, the folders too, was last changed `agoMs` before `now`. */
async function treeChanged(target: string, agoMs: number): Promise<void> {
  const when = new Date(now - agoMs);
  for (const entry of await readdir(target, { withFileTypes: true })) {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) await treeChanged(child, agoMs);
    else await utimes(child, when, when);
  }
  await utimes(target, when, when);
}

/** Says a folder itself was last changed `agoMs` before `now`. */
async function folderChanged(folder: string, agoMs: number): Promise<void> {
  const when = new Date(now - agoMs);
  await utimes(folder, when, when);
}

describe('newestChange', () => {
  it('is the time of a file', async () => {
    const root = await scratch();
    await fileChanged(path.join(root, 'a.txt'), 5 * day);

    expect(await newestChange(path.join(root, 'a.txt'))).toBe(now - 5 * day);
  });

  it('is the latest time of anything below a folder, however deep, not the folder’s own', async () => {
    const root = await scratch();
    await fileChanged(path.join(root, 'old.txt'), 9 * day);
    await fileChanged(path.join(root, 'a', 'b', 'c', 'new.txt'), 2 * day);
    await fileChanged(path.join(root, 'a', 'older.txt'), 6 * day);
    for (const folder of [path.join(root, 'a', 'b', 'c'), path.join(root, 'a', 'b')]) {
      await folderChanged(folder, 8 * day);
    }
    await folderChanged(path.join(root, 'a'), 8 * day);
    await folderChanged(root, 8 * day);

    expect(await newestChange(root)).toBe(now - 2 * day);
  });

  it('is the folder’s own time when it is empty, or newer than what is in it', async () => {
    const root = await scratch();
    await mkdir(path.join(root, 'empty'));
    await folderChanged(path.join(root, 'empty'), 3 * day);
    await fileChanged(path.join(root, 'inside', 'a.txt'), 7 * day);
    await folderChanged(path.join(root, 'inside'), 4 * day);

    expect(await newestChange(path.join(root, 'empty'))).toBe(now - 3 * day);
    expect(await newestChange(path.join(root, 'inside'))).toBe(now - 4 * day);
  });

  it('counts something that is not there for nothing', async () => {
    const root = await scratch();

    expect(await newestChange(path.join(root, 'gone'))).toBe(0);
  });

  it('does not hide a failure that is not the thing being gone', async () => {
    const root = await scratch();
    await fileChanged(path.join(root, 'file.txt'), day);

    // A name that no file system can hold is not "gone"; it is a mistake, and is not hidden.
    await expect(
      newestChange(path.join(root, 'bad' + String.fromCharCode(0) + 'name')),
    ).rejects.toThrow();
  });

  it.skipIf(process.platform === 'win32')('looks at a link and does not follow it', async () => {
    const root = await scratch();
    const outside = await scratch();
    await fileChanged(path.join(outside, 'recent.txt'), 0);
    await fileChanged(path.join(root, 'inside.txt'), 3 * day);
    await symlink(outside, path.join(root, 'link'));
    // The link was made just now, and so was the folder it was made in: age both, the link itself
    // (not what it leads to) first.
    const then = new Date(now - 3 * day);
    await lutimes(path.join(root, 'link'), then, then);
    await folderChanged(root, 3 * day);

    // The link's own time counts; the file it leads to, which is newer, is not looked at.
    expect(await newestChange(root)).toBe(now - 3 * day);
  });
});

describe('removeStaleScratch', () => {
  it('removes scratch workspaces nothing has touched for longer than the age, and says which', async () => {
    const root = await scratch();
    await fileChanged(path.join(root, 'mangabound-aB3dE9', 'volumes', 'v1.cbz'), 3 * day);
    await treeChanged(path.join(root, 'mangabound-aB3dE9'), 3 * day);
    await fileChanged(path.join(root, 'mangabound-Zz09Yy', 'input', 'c1.png'), 2 * day);
    await treeChanged(path.join(root, 'mangabound-Zz09Yy'), 2 * day);

    const removed = await removeStaleScratch(root, day, now);

    expect([...removed].sort()).toEqual(['mangabound-Zz09Yy', 'mangabound-aB3dE9']);
    expect(await readdir(root)).toEqual([]);
  });

  it('leaves one that something changed recently, even when the folder itself is old', async () => {
    const root = await scratch();
    await fileChanged(path.join(root, 'mangabound-aB3dE9', 'volumes', 'v1.cbz'), 3 * day);
    await treeChanged(path.join(root, 'mangabound-aB3dE9'), 3 * day);
    // Something in it was written a minute ago: a book being made is not a leftover.
    await fileChanged(path.join(root, 'mangabound-aB3dE9', 'volumes', 'v2.cbz'), 60 * 1000);

    expect(await removeStaleScratch(root, day, now)).toEqual([]);
    expect(await readdir(root)).toEqual(['mangabound-aB3dE9']);
  });

  it('leaves one that is exactly as old as the age, and takes the next moment of it', async () => {
    const root = await scratch();
    await fileChanged(path.join(root, 'mangabound-aB3dE9', 'v1.cbz'), day);
    await treeChanged(path.join(root, 'mangabound-aB3dE9'), day);

    expect(await removeStaleScratch(root, day, now)).toEqual([]);
    expect(await removeStaleScratch(root, day, now + 1)).toEqual(['mangabound-aB3dE9']);
  });

  it('leaves what is not a scratch workspace of the app, however old', async () => {
    const root = await scratch();
    for (const name of [
      'mangabound-e2e-123',
      'mangabound-acquire-AbCdEf',
      'mangabound-abc',
      'mangabound-abcdefg',
      'mangabound-ab-def',
      'other-aB3dE9',
      'MANGABOUND-aB3dE9',
    ]) {
      await fileChanged(path.join(root, name, 'f.txt'), 30 * day);
      await treeChanged(path.join(root, name), 30 * day);
    }
    // A file with the right name is not a workspace either.
    await fileChanged(path.join(root, 'mangabound-fIlE01'), 30 * day);

    expect(await removeStaleScratch(root, day, now)).toEqual([]);
    expect(await readdir(root)).toHaveLength(8);
  });

  it('does nothing in a folder with nothing in it', async () => {
    expect(await removeStaleScratch(await scratch(), day, now)).toEqual([]);
  });

  it('uses the time of the call when it is not given one', async () => {
    const root = await scratch();
    await mkdir(path.join(root, 'mangabound-aB3dE9'));

    // Made a moment ago, so a day is too long. A negative age is older than anything made now: a
    // minute of it, since a file system's clock can be a few milliseconds ahead of the program's.
    expect(await removeStaleScratch(root, day)).toEqual([]);
    expect(await removeStaleScratch(root, -60_000)).toEqual(['mangabound-aB3dE9']);
  });
});
