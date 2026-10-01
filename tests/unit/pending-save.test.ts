import { constants } from 'node:fs';
import { copyFile, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PendingSaveError, pendingSaveMessage, saveWithUniqueName } from '@/library/pending-save';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
const collision = () => Object.assign(new Error('existing file'), { code: 'EEXIST' });

describe('pending save names', () => {
  it('exports a real CBZ fixture repeatedly without replacing existing bytes', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'mangabound-save-names-'));
    directories.push(directory);
    const fixture = path.resolve('tests/fixtures/e2e/cbz/Mangabound Direct.cbz');
    const original = await readFile(fixture);
    const save = async (candidate: string) => {
      await copyFile(fixture, path.join(directory, candidate), constants.COPYFILE_EXCL);
      return candidate;
    };

    expect(await saveWithUniqueName('Volume.cbz', save)).toBe('Volume.cbz');
    expect(await saveWithUniqueName('Volume.cbz', save)).toBe('Volume (2).cbz');
    expect(await saveWithUniqueName('Volume.cbz', save)).toBe('Volume (3).cbz');
    expect((await readdir(directory)).sort()).toEqual([
      'Volume (2).cbz',
      'Volume (3).cbz',
      'Volume.cbz',
    ]);
    for (const name of await readdir(directory))
      expect(await readFile(path.join(directory, name))).toEqual(original);
    expect(await readFile(fixture)).toEqual(original);
  });

  it('retries only EEXIST and returns warnings unchanged', async () => {
    const save = vi
      .fn<(name: string) => Promise<string | undefined>>()
      .mockRejectedValueOnce(collision())
      .mockRejectedValueOnce({ code: 'EEXIST' })
      .mockResolvedValue('The book was copied, but its destination catalog could not be updated.');

    expect(await saveWithUniqueName('Vol.01.epub', save)).toContain('destination catalog');
    expect(save.mock.calls).toEqual([['Vol.01.epub'], ['Vol.01 (2).epub'], ['Vol.01 (3).epub']]);
  });

  it.each([
    Object.assign(new Error('full'), { code: 'ENOSPC' }),
    new Error('unexpected'),
    null,
    undefined,
    'boom',
  ])('does not retry a non-collision failure (%s)', async (cause) => {
    const save = vi.fn<(name: string) => Promise<void>>().mockRejectedValue(cause);
    await expect(saveWithUniqueName('Volume.pdf', save)).rejects.toBe(cause);
    expect(save).toHaveBeenCalledExactlyOnceWith('Volume.pdf');
  });

  it('retains the existing bounded naming budget and exposes a typed exhaustion reason', async () => {
    const save = vi.fn<(name: string) => Promise<void>>().mockRejectedValue(collision());
    await expect(saveWithUniqueName('Volume.epub', save)).rejects.toMatchObject({
      code: 'name_unavailable',
      message: 'No available file name was found.',
    });
    expect(save).toHaveBeenCalledTimes(998);
    expect(save).toHaveBeenLastCalledWith('Volume (998).epub');
  });
});

describe('pending save errors', () => {
  it.each(['book_unavailable', 'run_deleting', 'wrong_extension', 'name_unavailable'] as const)(
    'keeps the actionable message for typed %s, regardless of its prefix',
    (code) => {
      const error = new PendingSaveError(code, 'Reworded explanation.');
      expect(error.name).toBe('PendingSaveError');
      expect(error.code).toBe(code);
      expect(pendingSaveMessage(error)).toBe('Reworded explanation.');
    },
  );

  it.each([
    ['ENOSPC', 'The destination is full. Free some space and try again; the pending book is safe.'],
    [
      'EACCES',
      'Mangabound cannot write to that destination. Choose a writable folder or check its permissions.',
    ],
    [
      'EPERM',
      'Mangabound cannot write to that destination. Choose a writable folder or check its permissions.',
    ],
    [
      'EROFS',
      'Mangabound cannot write to that destination. Choose a writable folder or check its permissions.',
    ],
    ['ENOENT', 'The chosen destination folder is no longer available. Choose another folder.'],
  ])('maps %s without leaking operating-system details', (code, message) => {
    expect(pendingSaveMessage(Object.assign(new Error('secret destination'), { code }))).toBe(
      message,
    );
  });

  it.each([
    new Error('Choose a private path'),
    new Error('This pending book: secret'),
    { code: 'EIO' },
    null,
    undefined,
    'boom',
  ])('uses the safe fallback for unclassified errors (%s)', (error) => {
    expect(pendingSaveMessage(error)).toBe(
      'The book could not be saved. Its pending copy is still available; try another destination.',
    );
  });
});
