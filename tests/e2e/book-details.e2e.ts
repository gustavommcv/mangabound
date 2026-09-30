import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { $, browser } from '@wdio/globals';

import { readZipEntry, resetQueue, saveAllBooks, setSteps } from './support';

const temporaryDirectories: string[] = [];

after(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const packageDocument = (filePath: string): Promise<string> =>
  readZipEntry(filePath, (name) => name.endsWith('.opf'));

describe('packaged title, author and language of a book', () => {
  it('titles each volume after the series title typed for the item, with its author and language', async () => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), 'mangabound-book-details-e2e-'));
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
    await setSteps({ group: true, convert: true });

    // Typed on the item's own page, and nowhere in the conversion options.
    await $('button[aria-label="Edit details of Named Volumes"]').click();
    await $('h1=Named Volumes').waitForDisplayed({ timeout: 10_000 });
    await $('#details-title').setValue('My Series');
    await $('#details-author').setValue('An Author');
    await $('#details-language').setValue('pt-br');
    await $('li=My Series - Vol.01').waitForDisplayed({ timeout: 10_000 });
    await $('button=Queue').click();
    await $('h1=Queue').waitForDisplayed();

    await $('button=Process 1 item').click();
    await $('h1=2 books ready').waitForDisplayed({ timeout: 120_000 });
    await saveAllBooks();

    assert.deepEqual((await readdir(libraryPath)).sort(), [
      '.mangabound',
      'My Series - Vol.01.epub',
      'My Series - Vol.02.epub',
    ]);
    for (const volume of ['01', '02']) {
      const opf = await packageDocument(path.join(libraryPath, `My Series - Vol.${volume}.epub`));
      assert.match(opf, new RegExp(`<dc:title[^>]*>My Series - Vol\\.${volume}</dc:title>`, 'u'));
      assert.match(opf, /<dc:creator[^>]*>An Author<\/dc:creator>/u);
      assert.match(opf, /<dc:language[^>]*>pt-br<\/dc:language>/u);
    }
  });
});
