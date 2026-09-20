import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FsSettingsStore, type FsSettingsStoreDeps } from '@/adapters/settings/fs-settings-store';
import { settingsFileVersion } from '@/adapters/settings/stored-settings';
import { SettingsSaveError, type StoredSettings } from '@/application/ports/settings-store';
import { defaultMangapressSettings } from '@/domain/output-profile';
import { defaultPreferences } from '@/domain/preferences';

const settingsFile = path.join('data', 'settings.json');
const kept: StoredSettings = {
  mode: 'bind-only',
  format: 'cbz',
  settings: { ...defaultMangapressSettings, deviceProfile: 'KS' },
  outputFolder: '/books',
};

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

/** Files that are in memory, so what was written and when can be looked at. */
function memoryDeps(initial?: string): {
  readonly deps: Partial<FsSettingsStoreDeps>;
  readonly files: Map<string, string>;
  readonly calls: string[];
} {
  const files = new Map<string, string>();
  if (initial !== undefined) files.set(settingsFile, initial);
  const calls: string[] = [];
  let suffix = 0;
  return {
    files,
    calls,
    deps: {
      createTempSuffix: () => `t${String(++suffix)}`,
      mkdir: ((directory: string) => {
        calls.push(`mkdir ${directory}`);
        return Promise.resolve(undefined);
      }) as unknown as FsSettingsStoreDeps['mkdir'],
      readFile: ((file: string) => {
        const text = files.get(file);
        return text === undefined ? Promise.reject(errno('ENOENT')) : Promise.resolve(text);
      }) as unknown as FsSettingsStoreDeps['readFile'],
      writeFile: ((file: string, text: string) => {
        calls.push(`write ${file}`);
        files.set(file, text);
        return Promise.resolve();
      }) as unknown as FsSettingsStoreDeps['writeFile'],
      rename: ((from: string, to: string) => {
        calls.push(`rename ${from} ${to}`);
        files.set(to, files.get(from) ?? '');
        files.delete(from);
        return Promise.resolve();
      }) as unknown as FsSettingsStoreDeps['rename'],
      rm: ((file: string) => {
        calls.push(`rm ${file}`);
        files.delete(file);
        return Promise.resolve();
      }) as unknown as FsSettingsStoreDeps['rm'],
    },
  };
}

describe('loading the settings file', () => {
  it('gives the defaults, and no complaint, when there is no file yet', async () => {
    const { deps } = memoryDeps();

    const loaded = await new FsSettingsStore(settingsFile, deps).load();

    expect(loaded).toEqual({ settings: defaultPreferences, unreadable: false });
  });

  it('gives what the file holds', async () => {
    const { deps } = memoryDeps(JSON.stringify({ version: settingsFileVersion, ...kept }));

    const loaded = await new FsSettingsStore(settingsFile, deps).load();

    expect(loaded).toEqual({ settings: kept, unreadable: false });
  });

  it.each([
    ['is not JSON', 'not json'],
    ['is from a version this build does not know', JSON.stringify({ ...kept, version: 99 })],
  ])('gives the defaults, and says so, when the file %s', async (_name, text) => {
    const { deps } = memoryDeps(text);

    const loaded = await new FsSettingsStore(settingsFile, deps).load();

    expect(loaded).toEqual({ settings: defaultPreferences, unreadable: true });
  });

  it('gives the defaults, and says so, when the file is there but cannot be read', async () => {
    const store = new FsSettingsStore(settingsFile, {
      readFile: (() =>
        Promise.reject(errno('EACCES'))) as unknown as FsSettingsStoreDeps['readFile'],
    });

    expect(await store.load()).toEqual({ settings: defaultPreferences, unreadable: true });
  });
});

describe('saving the settings file', () => {
  it('writes beside the file and renames over it, so it is never half written', async () => {
    const { deps, files, calls } = memoryDeps();
    const store = new FsSettingsStore(settingsFile, deps);

    await store.save(kept);

    expect(calls).toEqual([
      `mkdir ${path.dirname(settingsFile)}`,
      `write ${settingsFile}.t1.tmp`,
      `rename ${settingsFile}.t1.tmp ${settingsFile}`,
    ]);
    expect(files.has(`${settingsFile}.t1.tmp`)).toBe(false);
    expect(await new FsSettingsStore(settingsFile, deps).load()).toEqual({
      settings: kept,
      unreadable: false,
    });
  });

  it('writes one save after another, so the last one asked for is the one kept', async () => {
    const { deps, files } = memoryDeps();
    let holdFirst: () => void = () => undefined;
    const firstIsHeld = new Promise<void>((resolve) => {
      holdFirst = resolve;
    });
    let writes = 0;
    const store = new FsSettingsStore(settingsFile, {
      ...deps,
      writeFile: (async (file: string, text: string) => {
        writes += 1;
        // The first write takes longer than the ones after it.
        if (writes === 1) await firstIsHeld;
        files.set(file, text);
      }) as unknown as FsSettingsStoreDeps['writeFile'],
    });

    const first = store.save({ ...defaultPreferences, format: 'pdf' });
    const second = store.save({ ...defaultPreferences, format: 'cbz' });
    holdFirst();
    await Promise.all([first, second]);

    expect(JSON.parse(files.get(settingsFile) ?? '{}')).toMatchObject({ format: 'cbz' });
  });

  it('fails with a save error, leaves no temporary file, and keeps what was there', async () => {
    const { deps, files, calls } = memoryDeps(JSON.stringify({ version: 1, ...kept }));
    const failure = errno('ENOSPC');
    const store = new FsSettingsStore(settingsFile, {
      ...deps,
      rename: (() => Promise.reject(failure)) as unknown as FsSettingsStoreDeps['rename'],
    });

    const saved = store.save(defaultPreferences);

    await expect(saved).rejects.toBeInstanceOf(SettingsSaveError);
    await expect(saved).rejects.toMatchObject({
      code: 'settings_save_failed',
      cause: failure,
      message: 'The settings could not be saved.',
    });
    expect(calls).toContain(`rm ${settingsFile}.t1.tmp`);
    expect(files.has(`${settingsFile}.t1.tmp`)).toBe(false);
    expect(JSON.parse(files.get(settingsFile) ?? '{}')).toMatchObject({ format: 'cbz' });
  });

  it('still reports the failed save when the temporary file cannot be removed either', async () => {
    const { deps } = memoryDeps();
    const store = new FsSettingsStore(settingsFile, {
      ...deps,
      writeFile: (() =>
        Promise.reject(errno('EACCES'))) as unknown as FsSettingsStoreDeps['writeFile'],
      rm: (() => Promise.reject(errno('EPERM'))) as unknown as FsSettingsStoreDeps['rm'],
    });

    await expect(store.save(defaultPreferences)).rejects.toBeInstanceOf(SettingsSaveError);
  });

  it('keeps saving after one save failed', async () => {
    const { deps, files } = memoryDeps();
    const writeFile = vi
      .fn<FsSettingsStoreDeps['writeFile']>()
      .mockRejectedValueOnce(errno('EACCES'))
      .mockImplementation(((file: string, text: string) => {
        files.set(file, text);
        return Promise.resolve();
      }) as unknown as FsSettingsStoreDeps['writeFile']);
    const store = new FsSettingsStore(settingsFile, { ...deps, writeFile });

    await expect(store.save(defaultPreferences)).rejects.toBeInstanceOf(SettingsSaveError);
    await store.save(kept);

    expect(JSON.parse(files.get(settingsFile) ?? '{}')).toMatchObject({ format: 'cbz' });
  });
});

describe('waiting for saves', () => {
  it('has nothing to wait for before any save', async () => {
    await expect(
      new FsSettingsStore(settingsFile, memoryDeps().deps).settled(),
    ).resolves.toBeUndefined();
  });

  it('resolves once every save asked for has finished, even one that failed', async () => {
    const { deps } = memoryDeps();
    let finished = false;
    const store = new FsSettingsStore(settingsFile, {
      ...deps,
      rename: (async () => {
        await Promise.resolve();
        finished = true;
        throw errno('EBUSY');
      }) as unknown as FsSettingsStoreDeps['rename'],
    });
    const failing = store.save(defaultPreferences);
    failing.catch(() => undefined);

    await store.settled();

    expect(finished).toBe(true);
  });
});

describe('on a real disk', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'mangabound-settings-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('creates the folder if it is missing, writes the file, and leaves nothing else behind', async () => {
    const file = path.join(directory, 'nested', 'settings.json');
    const store = new FsSettingsStore(file);

    await store.save(kept);

    expect(await new FsSettingsStore(file).load()).toEqual({ settings: kept, unreadable: false });
    expect(await readdir(path.dirname(file))).toEqual(['settings.json']);
    expect((await readFile(file, 'utf8')).endsWith('\n')).toBe(true);
  });

  it('replaces a file that is already there', async () => {
    const file = path.join(directory, 'settings.json');
    await writeFile(file, 'old and unreadable');
    const store = new FsSettingsStore(file);
    expect((await store.load()).unreadable).toBe(true);

    await store.save(kept);

    expect(await store.load()).toEqual({ settings: kept, unreadable: false });
  });
});
