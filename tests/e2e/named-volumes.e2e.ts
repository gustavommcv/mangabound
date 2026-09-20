import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { $, $$, browser } from '@wdio/globals';

import { chooseOutputFolder, queueOutputFolderButton, resetQueue } from './support';

const temporaryDirectories: string[] = [];

after(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('packaged folder whose names carry the volumes', () => {
  it('arrives already grouped, converts without touching the source folder, and searches nowhere unless asked', async () => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), 'mangabound-named-volumes-e2e-'));
    temporaryDirectories.push(testRoot);
    const inputPath = path.join(testRoot, 'Named Volumes');
    const libraryPath = path.join(testRoot, 'library');
    await cp(
      path.resolve('tests', 'fixtures', 'e2e', 'manga-named-volumes', 'Named Volumes'),
      inputPath,
      { recursive: true },
    );
    await mkdir(libraryPath);

    const openDialog = await browser.electron.mock('dialog', 'showOpenDialog');
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [inputPath] });
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [libraryPath] });

    await resetQueue();
    await $('button=Folder').click();

    // mangabind already grouped it: the row says so, and nothing has to be assigned by hand.
    await $('span=2 volumes').waitForDisplayed({ timeout: 30_000 });
    assert.match(await $('main').getText(), /grouped from names/u);

    await $('button[aria-label="Edit volumes for Named Volumes"]').click();
    await $('h1=Organize Named Volumes into volumes').waitForDisplayed({ timeout: 30_000 });
    const editor = await $('main').getText();
    assert.match(editor, /Grouped by mangabind/u);
    assert.doesNotMatch(editor, /Unassigned/u);
    assert.match(editor, /2 volumes were read from the names of 3 chapters/u);
    assert.equal(await $$('[role="alert"]').length, 0);

    // The names are where the grouping comes from unless someone chooses otherwise, and no online
    // source is chosen until they do: MangaDex is in the list, and nothing has been sent to it.
    await $('[role="tab"]*=Online source').click();
    const source = $('[role="combobox"]');
    assert.equal((await source.getText()).trim(), 'Select a source');
    await source.click();
    assert.match(await $('[role="listbox"]').getText(), /MangaDex\s+mangadex\.org/u);
    await $('[role="option"]*=MangaDex').click();
    // The folder names declare English, and the lookup would be made in it.
    await $('p*=Volumes are looked up in en').waitForDisplayed({ timeout: 10_000 });

    // The credit opens MangaDex's own site through the system, never an address the page names.
    const openExternal = await browser.electron.mock('shell', 'openExternal');
    await openExternal.mockResolvedValue(undefined);
    await $('button[aria-label="Open MangaDex in your browser"]').click();
    await browser.waitUntil(() => openExternal.mock.calls.length === 1, {
      timeout: 10_000,
      timeoutMsg: 'The credit did not open MangaDex.',
    });
    assert.deepEqual(openExternal.mock.calls[0], ['https://mangadex.org/']);
    // Searching is a separate, explicit step: choosing the source sent nothing.
    assert.equal(await $('button=Search').isExisting(), true);

    await $('button=Confirm mapping').click();
    await $('h1=Queue').waitForDisplayed();
    await chooseOutputFolder(queueOutputFolderButton, libraryPath);
    await $('button=Convert 1 item').click();
    await $('h1=2 books saved').waitForDisplayed({ timeout: 120_000 });

    assert.deepEqual((await readdir(libraryPath)).sort(), [
      '.mangabound',
      'Named Volumes - Vol.01.epub',
      'Named Volumes - Vol.02.epub',
    ]);
    for (const name of ['Named Volumes - Vol.01.epub', 'Named Volumes - Vol.02.epub']) {
      const bytes = await readFile(path.join(libraryPath, name));
      assert.ok(bytes.length > 1_024);
      assert.equal(bytes.subarray(0, 2).toString('ascii'), 'PK');
    }
    // The names already said everything, so no mangabind.json was written into the source.
    await assert.rejects(readFile(path.join(inputPath, 'mangabind.json'), 'utf8'));
  });
});
