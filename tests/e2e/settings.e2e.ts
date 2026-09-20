import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { $, browser } from '@wdio/globals';

import { chooseOutputFolder, queueOutputFolderButton, resetQueue } from './support';

const temporaryDirectories: string[] = [];

after(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

interface KeptSettings {
  readonly version: number;
  readonly mode: string;
  readonly format: string;
  readonly settings: Record<string, unknown>;
  readonly outputFolder?: string;
}

const readKept = async (file: string): Promise<KeptSettings> =>
  JSON.parse(await readFile(file, 'utf8')) as KeptSettings;

const formatRadio = (label: string): ReturnType<typeof $> => $(`[role="radio"]=${label}`);

/** The window is loaded again, which reads the settings file again, exactly as a launch does. */
async function reopen(): Promise<void> {
  await browser.refresh();
  await $('h1=Queue').waitForDisplayed({ timeout: 30_000 });
  // The device list arrives after the window does; the options are read at the same time.
  await $('#queue-device').waitForEnabled({ timeout: 30_000 });
}

describe('packaged saved settings', () => {
  it('keeps what was changed in the user data folder, brings it back, and resets it', async () => {
    const userData = await browser.electron.execute((electron) => electron.app.getPath('userData'));
    const settingsPath = path.join(userData, 'settings.json');
    const testRoot = await mkdtemp(path.join(os.tmpdir(), 'mangabound-settings-e2e-'));
    temporaryDirectories.push(testRoot);
    const libraryPath = path.join(testRoot, 'library');
    await mkdir(libraryPath);

    const openDialog = await browser.electron.mock('dialog', 'showOpenDialog');
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [libraryPath] });

    await resetQueue();
    await $('#queue-device').waitForEnabled({ timeout: 30_000 });
    // Opening the app changes nothing, so nothing is written.
    assert.equal(existsSync(settingsPath), false, 'a first launch should leave no settings file');

    // Change the device, the format, and the output folder.
    await $('#queue-device').selectByAttribute('value', 'KS');
    await formatRadio('PDF').click();
    await chooseOutputFolder(queueOutputFolderButton, libraryPath);
    await browser.waitUntil(
      async () =>
        existsSync(settingsPath) && (await readKept(settingsPath)).outputFolder === libraryPath,
      { timeout: 15_000, timeoutMsg: 'the settings file did not get the changes' },
    );
    const kept = await readKept(settingsPath);
    assert.equal(kept.version, 1);
    assert.equal(kept.mode, 'bind-and-convert');
    assert.equal(kept.format, 'pdf');
    assert.equal(kept.settings.deviceProfile, 'KS');
    // What names one book is never kept.
    assert.equal('title' in kept.settings, false);
    assert.equal('author' in kept.settings, false);

    // Opened again, the window is as it was left, folder included.
    await reopen();
    assert.equal(await $('#queue-device').getValue(), 'KS');
    assert.equal(await formatRadio('PDF').getAttribute('aria-checked'), 'true');
    await $(`p=${libraryPath}`).waitForDisplayed({ timeout: 10_000 });
    assert.equal(await $('[role="status"][aria-label="Notices"]').isExisting(), false);

    // Put back to the defaults: asks first, keeps the folder, and is written down.
    await $('button=Reset to defaults').click();
    await $('[role="group"][aria-label="Confirm reset"]').waitForDisplayed({ timeout: 10_000 });
    await $('[role="group"][aria-label="Confirm reset"]').$('button=Reset').click();
    await browser.waitUntil(async () => (await readKept(settingsPath)).format === 'epub', {
      timeout: 15_000,
      timeoutMsg: 'the settings file did not get the defaults back',
    });
    const reset = await readKept(settingsPath);
    assert.equal(reset.settings.deviceProfile, 'KPW6');
    assert.equal(reset.outputFolder, libraryPath);
    assert.equal(await $('#queue-device').getValue(), 'KPW6');
    assert.equal(await formatRadio('EPUB').getAttribute('aria-checked'), 'true');
  });

  it('starts from the defaults and says so when the file cannot be read, then replaces it with the next change', async () => {
    const userData = await browser.electron.execute((electron) => electron.app.getPath('userData'));
    const settingsPath = path.join(userData, 'settings.json');
    await writeFile(settingsPath, '{ this is not json');

    await reopen();

    await $(
      'li=The saved settings could not be read, so the defaults are in use.',
    ).waitForDisplayed({ timeout: 10_000 });
    assert.equal(await formatRadio('EPUB').getAttribute('aria-checked'), 'true');
    // Nothing was written over it yet: it is only replaced when something changes.
    assert.equal(await readFile(settingsPath, 'utf8'), '{ this is not json');

    await formatRadio('CBZ').click();
    await browser.waitUntil(async () => (await readFile(settingsPath, 'utf8')).startsWith('{\n'), {
      timeout: 15_000,
      timeoutMsg: 'the unreadable file was not replaced by the next change',
    });
    assert.equal((await readKept(settingsPath)).format, 'cbz');
  });

  it('says which output folder is gone and asks for another', async () => {
    const userData = await browser.electron.execute((electron) => electron.app.getPath('userData'));
    const settingsPath = path.join(userData, 'settings.json');
    const gone = path.join(os.tmpdir(), 'mangabound-settings-e2e-gone', 'library');
    const before = await readKept(settingsPath);
    await writeFile(settingsPath, JSON.stringify({ ...before, outputFolder: gone }));

    await reopen();

    await $(`li*=The output folder ${gone} is not available`).waitForDisplayed({
      timeout: 10_000,
    });
    assert.equal(
      await $(queueOutputFolderButton).getAttribute('aria-label'),
      'Choose output folder',
    );
    // The rest of what was kept still came back.
    assert.equal(await formatRadio('CBZ').getAttribute('aria-checked'), 'true');
  });
});
