import { mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { writeFileAtomically, type AtomicWriteDeps } from '@/adapters/fs/write-file-atomically';

const target = path.join('data', 'record.json');
const temporary = `${target}.test.tmp`;
const roots: string[] = [];

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

function memoryIO() {
  const files = new Map([[target, 'old']]);
  const io = {
    createTempSuffix: () => 'test',
    writeFile: vi.fn<AtomicWriteDeps['writeFile']>().mockImplementation((file, contents) => {
      if (files.has(file)) return Promise.reject(errno('EEXIST'));
      files.set(file, contents);
      return Promise.resolve();
    }),
    rename: vi.fn<AtomicWriteDeps['rename']>().mockImplementation((from, to) => {
      files.set(to, files.get(from) ?? '');
      files.delete(from);
      return Promise.resolve();
    }),
    rm: vi.fn<AtomicWriteDeps['rm']>().mockImplementation((file) => {
      files.delete(file);
      return Promise.resolve();
    }),
  };
  return { files, io };
}

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('writeFileAtomically', () => {
  it('keeps the old contents until the complete temporary file is published', async () => {
    const { files, io } = memoryIO();
    io.rename.mockImplementationOnce((from, to) => {
      expect(files.get(target)).toBe('old');
      expect(files.get(from)).toBe('new');
      files.set(to, files.get(from) ?? '');
      files.delete(from);
      return Promise.resolve();
    });

    await writeFileAtomically(target, 'new', io);

    expect(io.writeFile).toHaveBeenCalledExactlyOnceWith(temporary, 'new', {
      encoding: 'utf8',
      flag: 'wx',
    });
    expect([...files]).toEqual([[target, 'new']]);
    expect(io.rm).not.toHaveBeenCalled();
  });

  it.each(['EBUSY', 'EPERM', 'EACCES'])('recovers a transient %s rename failure', async (code) => {
    vi.useFakeTimers();
    const { files, io } = memoryIO();
    io.rename.mockRejectedValueOnce(errno(code));

    const saved = writeFileAtomically(target, 'new', io);
    await vi.runAllTimersAsync();
    await saved;

    expect(io.rename).toHaveBeenCalledTimes(2);
    expect(io.writeFile).toHaveBeenCalledOnce();
    expect([...files]).toEqual([[target, 'new']]);
  });

  it('removes the temporary file when the rename retry budget is exhausted', async () => {
    vi.useFakeTimers();
    const { files, io } = memoryIO();
    const failure = errno('EBUSY');
    io.rename.mockRejectedValue(failure);

    const failed = expect(writeFileAtomically(target, 'new', io)).rejects.toBe(failure);
    await vi.runAllTimersAsync();
    await failed;

    expect(io.rename).toHaveBeenCalledTimes(5);
    expect(io.rm).toHaveBeenCalledExactlyOnceWith(temporary, { force: true });
    expect([...files]).toEqual([[target, 'old']]);
  });

  it.each(['ENOSPC', 'EEXIST'])('cleans up a non-retryable %s rename failure', async (code) => {
    const { files, io } = memoryIO();
    const failure = errno(code);
    io.rename.mockRejectedValue(failure);

    await expect(writeFileAtomically(target, 'new', io)).rejects.toBe(failure);

    expect(io.rename).toHaveBeenCalledOnce();
    expect([...files]).toEqual([[target, 'old']]);
  });

  it('removes a partial temporary file when writing fails', async () => {
    const { files, io } = memoryIO();
    const failure = errno('ENOSPC');
    io.writeFile.mockImplementationOnce((file) => {
      files.set(file, 'partial');
      return Promise.reject(failure);
    });

    await expect(writeFileAtomically(target, 'new', io)).rejects.toBe(failure);

    expect(io.rename).not.toHaveBeenCalled();
    expect([...files]).toEqual([[target, 'old']]);
  });

  it('keeps a colliding temporary file owned by another writer', async () => {
    const { files, io } = memoryIO();
    files.set(temporary, 'another writer');

    await expect(writeFileAtomically(target, 'new', io)).rejects.toMatchObject({ code: 'EEXIST' });

    expect(io.rename).not.toHaveBeenCalled();
    expect(io.rm).not.toHaveBeenCalled();
    expect([...files]).toEqual([
      [target, 'old'],
      [temporary, 'another writer'],
    ]);
  });

  it('preserves the original failure when cleanup also fails', async () => {
    const { files, io } = memoryIO();
    const failure = errno('ENOSPC');
    io.rename.mockRejectedValue(failure);
    io.rm.mockRejectedValue(errno('EACCES'));

    await expect(writeFileAtomically(target, 'new', io)).rejects.toBe(failure);

    expect(files.get(target)).toBe('old');
    expect(io.rm).toHaveBeenCalledExactlyOnceWith(temporary, { force: true });
  });

  it.each([null, undefined])('preserves an unclassified write rejection (%s)', async (failure) => {
    const { io } = memoryIO();
    io.writeFile.mockRejectedValue(failure);

    await expect(writeFileAtomically(target, 'new', io)).rejects.toBe(failure);

    expect(io.rename).not.toHaveBeenCalled();
    expect(io.rm).toHaveBeenCalledExactlyOnceWith(temporary, { force: true });
  });
});

describe('writeFileAtomically on disk', () => {
  async function fixture(): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mangabound-atomic-unit-'));
    roots.push(root);
    return root;
  }

  it('creates and replaces a UTF-8 file without leaving temporary files', async () => {
    const root = await fixture();
    const file = path.join(root, 'record.json');

    await writeFileAtomically(file, 'first\n');
    expect(await readFile(file, 'utf8')).toBe('first\n');
    await writeFileAtomically(file, '第二\n');

    expect(await readFile(file, 'utf8')).toBe('第二\n');
    expect(await readdir(root)).toEqual(['record.json']);
  });

  it('never overwrites or deletes an existing temporary file', async () => {
    const root = await fixture();
    const file = path.join(root, 'record.json');
    const temp = `${file}.taken.tmp`;
    await writeFile(file, 'old');
    await writeFile(temp, 'another writer');

    await expect(
      writeFileAtomically(file, 'new', { writeFile, rename, rm, createTempSuffix: () => 'taken' }),
    ).rejects.toMatchObject({ code: 'EEXIST' });

    expect(await readFile(file, 'utf8')).toBe('old');
    expect(await readFile(temp, 'utf8')).toBe('another writer');
  });

  it('removes an actual partial file and preserves the destination after a failed write', async () => {
    const root = await fixture();
    const file = path.join(root, 'record.json');
    await writeFile(file, 'old');
    const failure = errno('ENOSPC');

    await expect(
      writeFileAtomically(file, 'new', {
        rename,
        rm,
        createTempSuffix: () => 'partial',
        writeFile: async (temp, _contents, options) => {
          await writeFile(temp, 'partial', options);
          throw failure;
        },
      }),
    ).rejects.toBe(failure);

    expect(await readFile(file, 'utf8')).toBe('old');
    expect(await readdir(root)).toEqual(['record.json']);
  });
});
