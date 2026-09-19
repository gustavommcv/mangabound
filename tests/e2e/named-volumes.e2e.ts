import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { $, $$, browser } from '@wdio/globals';

import { chooseOutputFolder } from './support';

const temporaryDirectories: string[] = [];

after(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('packaged folder whose names carry the volumes', () => {
  it('opens already grouped, converts without touching the source folder, and offers no lookup', async () => {
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

    await $('button*=Manga folder').click();
    await $('h1=Organize Named Volumes into volumes').waitForDisplayed({ timeout: 30_000 });

    // mangabind already grouped it: nothing is assigned by hand, and there is nothing to fix.
    const editor = await $('main').getText();
    assert.match(editor, /Grouped by mangabind/u);
    assert.doesNotMatch(editor, /Unassigned/u);
    // No source is configured, so there is no lookup panel to fail.
    assert.doesNotMatch(editor, /Suggest from external API/u);
    assert.equal(await $$('[role="alert"]').length, 0);

    await $('button=Confirm mapping').click();
    await $('h1=Convert Named Volumes').waitForDisplayed();
    await chooseOutputFolder('button=Choose output folder', libraryPath);
    await $('button=Start conversion').click();
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
