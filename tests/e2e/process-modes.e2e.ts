import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { $, browser } from '@wdio/globals';

import { chooseOutputFolder, queueOutputFolderButton, resetQueue, setSteps } from './support';

const temporaryDirectories: string[] = [];

after(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function isZip(filePath: string): Promise<boolean> {
  const bytes = await readFile(filePath);
  return bytes.length > 1_024 && bytes.subarray(0, 2).toString('ascii') === 'PK';
}

describe('packaged process control', () => {
  it('joins a folder into CBZ volumes and saves them without ever running mangapress', async () => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), 'mangabound-join-only-e2e-'));
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
    await $('span=2 volumes').waitForDisplayed({ timeout: 30_000 });

    // Turn the conversion step off: only the joining remains.
    await setSteps({ group: true, convert: false });
    await $('button=Join 1 item').waitForExist({ timeout: 10_000 });
    assert.equal(await $('button*=mangapress options').isExisting(), false);

    await chooseOutputFolder(queueOutputFolderButton, libraryPath);
    await $('button=Validate plan').click();
    await $('h2=Plan validated').waitForDisplayed({ timeout: 30_000 });
    assert.match(await $('main').getText(), /saved as CBZ files, mangapress not run/u);
    assert.deepEqual(await readdir(libraryPath), []);

    await $('button=Join 1 item').click();
    await $('h1=2 books saved').waitForDisplayed({ timeout: 120_000 });

    assert.deepEqual((await readdir(libraryPath)).sort(), [
      '.mangabound',
      'Named Volumes - Vol.01.cbz',
      'Named Volumes - Vol.02.cbz',
    ]);
    for (const name of ['Named Volumes - Vol.01.cbz', 'Named Volumes - Vol.02.cbz']) {
      assert.ok(await isZip(path.join(libraryPath, name)), `${name} should be a CBZ (zip) file.`);
    }
    // Published through a staging folder, which is left empty.
    assert.deepEqual(await readdir(path.join(libraryPath, '.mangabound', 'incoming')), []);
    // The books are in the catalog that the OPDS feed serves.
    const catalog = JSON.parse(
      await readFile(path.join(libraryPath, '.mangabound', 'library.json'), 'utf8'),
    ) as { books: { relativePath: string; format: string }[] };
    assert.deepEqual(catalog.books.map((book) => [book.relativePath, book.format]).sort(), [
      ['Named Volumes - Vol.01.cbz', 'cbz'],
      ['Named Volumes - Vol.02.cbz', 'cbz'],
    ]);
    // The names already said everything, so nothing was written into the source folder.
    await assert.rejects(readFile(path.join(inputPath, 'mangabind.json'), 'utf8'));
  });

  it('sends an ungrouped folder straight to mangapress as one book, with no mapping', async () => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), 'mangabound-convert-only-e2e-'));
    temporaryDirectories.push(testRoot);
    const inputPath = path.join(testRoot, 'Mangabound E2E');
    const libraryPath = path.join(testRoot, 'library');
    await cp(
      path.resolve('tests', 'fixtures', 'e2e', 'manga-folder', 'Mangabound E2E'),
      inputPath,
      { recursive: true },
    );
    await mkdir(libraryPath);

    const openDialog = await browser.electron.mock('dialog', 'showOpenDialog');
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [inputPath] });
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [libraryPath] });

    await resetQueue();
    await $('button=Folder').click();
    // Nothing groups this folder, so it waits for volumes until grouping is turned off.
    await $('span=Needs volumes').waitForDisplayed({ timeout: 30_000 });

    // The join-only choice of the test before is still in force: only converting remains.
    await setSteps({ group: false, convert: true });
    await $('span=One book').waitForDisplayed({ timeout: 10_000 });
    assert.match(await $('main').getText(), /not grouped/u);

    // The earlier test already chose a library, so this reads "Change output folder" here: either
    // label opens the same picker and this test supplies its own fresh directory.
    await chooseOutputFolder(queueOutputFolderButton, libraryPath);
    await $('button=Validate plan').click();
    await $('h2=Plan validated').waitForDisplayed({ timeout: 30_000 });
    assert.match(await $('main').getText(), /one book, chapters not grouped/u);
    assert.deepEqual(await readdir(libraryPath), []);

    await $('button=Convert 1 item').click();
    await $('h1=1 book saved').waitForDisplayed({ timeout: 120_000 });

    assert.deepEqual((await readdir(libraryPath)).sort(), ['.mangabound', 'Mangabound E2E.epub']);
    assert.ok(await isZip(path.join(libraryPath, 'Mangabound E2E.epub')));
    // mangabind never ran, so it left nothing in the source folder either.
    await assert.rejects(readFile(path.join(inputPath, 'mangabind.json'), 'utf8'));
  });
});
