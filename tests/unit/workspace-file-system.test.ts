import { mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import type * as FsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { workspaceFileSystem } from '@/adapters/mangabind/binding-port';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

let root: string;

beforeEach(async () => {
  const actual = await vi.importActual<typeof FsPromises>('node:fs/promises');
  vi.mocked(rename).mockImplementation(actual.rename);
  root = await mkdtemp(path.join(os.tmpdir(), 'mangabound-workspace-atomic-'));
});

afterEach(async () => {
  vi.mocked(rename).mockReset();
  await rm(root, { recursive: true, force: true });
});

describe('workspaceFileSystem atomic metadata writes', () => {
  it('retries a transient lock while preserving and then replacing the real metadata file', async () => {
    const file = path.join(root, 'mangabind.json');
    await writeFile(file, '{"old":true}\n');
    vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('locked'), { code: 'EBUSY' }));

    await workspaceFileSystem.writeTextAtomically(file, '{"new":true}\n');

    expect(vi.mocked(rename)).toHaveBeenCalledTimes(2);
    expect(await readFile(file, 'utf8')).toBe('{"new":true}\n');
    expect(await readdir(root)).toEqual(['mangabind.json']);
  });

  it('removes the temporary file and keeps the original metadata when a rename fails', async () => {
    const file = path.join(root, 'mangabind.json');
    await writeFile(file, '{"old":true}\n');
    const failure = Object.assign(new Error('full'), { code: 'ENOSPC' });
    vi.mocked(rename).mockRejectedValue(failure);

    await expect(workspaceFileSystem.writeTextAtomically(file, '{"new":true}\n')).rejects.toBe(
      failure,
    );

    expect(await readFile(file, 'utf8')).toBe('{"old":true}\n');
    expect(await readdir(root)).toEqual(['mangabind.json']);
  });
});
