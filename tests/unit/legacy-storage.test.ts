import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  moveLegacyStorage,
  nodeLegacyStorageFileSystem,
  type LegacyStorageFileSystem,
} from '@/adapters/library/legacy-storage';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function scratch(): Promise<{ readonly from: string; readonly to: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mangabound-legacy-'));
  directories.push(root);
  return { from: path.join(root, 'Mangabound'), to: path.join(root, 'Mangabound Data') };
}

async function put(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

const exists = (target: string): Promise<boolean> =>
  stat(target).then(
    () => true,
    () => false,
  );

describe('moveLegacyStorage', () => {
  const folders = ['Pending', 'Covers'];

  it('moves a folder whole to where the new version keeps it, with everything in it', async () => {
    const { from, to } = await scratch();
    await put(path.join(from, 'Pending', 'run-1', 'Book.epub'), 'book');
    await put(path.join(from, 'Pending', 'run-1', '.mangabound', 'pending.json'), '{}');
    await put(path.join(from, 'Covers', 'abc', 'index.json'), 'covers');
    const problem = vi.fn();

    await moveLegacyStorage({ from, to, folders, onProblem: problem });

    expect(await readFile(path.join(to, 'Pending', 'run-1', 'Book.epub'), 'utf8')).toBe('book');
    expect(await exists(path.join(to, 'Pending', 'run-1', '.mangabound', 'pending.json'))).toBe(
      true,
    );
    expect(await readFile(path.join(to, 'Covers', 'abc', 'index.json'), 'utf8')).toBe('covers');
    expect(await exists(path.join(from, 'Pending'))).toBe(false);
    expect(await exists(path.join(from, 'Covers'))).toBe(false);
    expect(problem).not.toHaveBeenCalled();
  });

  it('leaves the rest of the old folder alone, the installer’s own files included', async () => {
    const { from, to } = await scratch();
    await put(path.join(from, 'Update.exe'), 'installer');
    await put(path.join(from, 'app-0.1.0', 'mangabound.exe'), 'app');
    await put(path.join(from, 'Pending', 'run-1', 'Book.epub'), 'book');

    await moveLegacyStorage({ from, to, folders, onProblem: vi.fn() });

    expect((await readdir(from)).sort()).toEqual(['Update.exe', 'app-0.1.0']);
  });

  it('does nothing, and makes nothing, when the old place holds none of them', async () => {
    const { from, to } = await scratch();
    await put(path.join(from, 'Update.exe'), 'installer');

    await moveLegacyStorage({ from, to, folders, onProblem: vi.fn() });

    expect(await exists(to)).toBe(false);
  });

  it('does nothing when there is no old place at all', async () => {
    const { from, to } = await scratch();

    await moveLegacyStorage({ from, to, folders, onProblem: vi.fn() });

    expect(await exists(from)).toBe(false);
    expect(await exists(to)).toBe(false);
  });

  it('moves entry by entry when the new place already has the folder, and never replaces one', async () => {
    const { from, to } = await scratch();
    await put(path.join(from, 'Pending', 'run-old', 'Old.epub'), 'old');
    await put(path.join(from, 'Pending', 'run-both', 'Legacy.epub'), 'legacy');
    await put(path.join(to, 'Pending', 'run-both', 'Current.epub'), 'current');
    await put(path.join(to, 'Pending', 'run-new', 'New.epub'), 'new');
    const problem = vi.fn();

    await moveLegacyStorage({ from, to, folders, onProblem: problem });

    expect((await readdir(path.join(to, 'Pending'))).sort()).toEqual([
      'run-both',
      'run-new',
      'run-old',
    ]);
    expect(await readFile(path.join(to, 'Pending', 'run-old', 'Old.epub'), 'utf8')).toBe('old');
    // The run both have is the new one's, untouched; the old one stays where it was, and is said.
    expect(await readdir(path.join(to, 'Pending', 'run-both'))).toEqual(['Current.epub']);
    expect(await readFile(path.join(from, 'Pending', 'run-both', 'Legacy.epub'), 'utf8')).toBe(
      'legacy',
    );
    expect(problem).toHaveBeenCalledTimes(1);
    expect(problem).toHaveBeenCalledWith(expect.stringContaining('run-both'), undefined);
  });

  it('removes the old folder once everything in it has moved', async () => {
    const { from, to } = await scratch();
    await put(path.join(from, 'Pending', 'run-old', 'Old.epub'), 'old');
    await put(path.join(to, 'Pending', 'run-new', 'New.epub'), 'new');

    await moveLegacyStorage({ from, to, folders, onProblem: vi.fn() });

    expect(await exists(path.join(from, 'Pending'))).toBe(false);
  });

  it('leaves everything where it is when the old and the new place are one folder', async () => {
    const { from } = await scratch();
    await put(path.join(from, 'Pending', 'run-1', 'Book.epub'), 'book');

    await moveLegacyStorage({
      from,
      to: from.toUpperCase(),
      folders,
      onProblem: vi.fn(),
    });

    expect(await readFile(path.join(from, 'Pending', 'run-1', 'Book.epub'), 'utf8')).toBe('book');
  });

  it('reports a folder that cannot be moved and still moves the next, and never throws', async () => {
    const { from, to } = await scratch();
    await put(path.join(from, 'Pending', 'run-1', 'Book.epub'), 'book');
    await put(path.join(from, 'Covers', 'abc', 'index.json'), 'covers');
    const failure = new Error('The folder is in use.');
    const fileSystem: LegacyStorageFileSystem = {
      ...nodeLegacyStorageFileSystem,
      rename: (source, destination) =>
        source.endsWith('Pending')
          ? Promise.reject(failure)
          : nodeLegacyStorageFileSystem.rename(source, destination),
    };
    const problem = vi.fn();

    await moveLegacyStorage({ from, to, folders, fileSystem, onProblem: problem });

    expect(problem).toHaveBeenCalledExactlyOnceWith(
      `Could not move ${path.join(from, 'Pending')} to ${path.join(to, 'Pending')}.`,
      failure,
    );
    expect(await exists(path.join(from, 'Pending', 'run-1', 'Book.epub'))).toBe(true);
    expect(await exists(path.join(to, 'Covers', 'abc', 'index.json'))).toBe(true);
  });
});

describe('nodeLegacyStorageFileSystem', () => {
  it('leaves a folder with something in it where it is, and does not say so', async () => {
    const { from } = await scratch();
    await put(path.join(from, 'kept.txt'), 'kept');

    await expect(nodeLegacyStorageFileSystem.removeIfEmpty(from)).resolves.toBeUndefined();

    expect(await exists(path.join(from, 'kept.txt'))).toBe(true);
  });

  it('says a path that is not there does not exist', async () => {
    const { from } = await scratch();

    expect(await nodeLegacyStorageFileSystem.exists(from)).toBe(false);
  });
});
