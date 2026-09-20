import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { directoryExists } from '@/adapters/library/directory-exists';

describe('directoryExists', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'mangabound-directory-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('is true for a folder that is there', async () => {
    expect(await directoryExists(directory)).toBe(true);
  });

  it('is false for a file, which cannot be saved into', async () => {
    const file = path.join(directory, 'a-file.txt');
    await writeFile(file, 'text');

    expect(await directoryExists(file)).toBe(false);
  });

  it('is false for a path that is not there, such as a drive that is not connected', async () => {
    expect(await directoryExists(path.join(directory, 'gone'))).toBe(false);
  });
});
