import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { $, browser } from '@wdio/globals';

import { resetQueue, saveAllBooks, setFormat, setSteps, waitForFolderNames } from './support';

const temporaryDirectories: string[] = [];

after(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

/** The same fixture folder twice, under two different parents, so the queue has two of one name. */
async function twoFoldersNamed(
  fixture: readonly string[],
  name: string,
): Promise<{ readonly folders: readonly string[]; readonly libraryPath: string }> {
  const testRoot = await mkdtemp(path.join(os.tmpdir(), 'mangabound-unique-names-e2e-'));
  temporaryDirectories.push(testRoot);
  const folders: string[] = [];
  for (const parent of ['first', 'second']) {
    const target = path.join(testRoot, parent, name);
    await cp(path.resolve('tests', 'fixtures', 'e2e', ...fixture, name), target, {
      recursive: true,
    });
    folders.push(target);
  }
  const libraryPath = path.join(testRoot, 'library');
  await mkdir(libraryPath);
  return { folders, libraryPath };
}

describe('packaged runs never let one book replace another', () => {
  it('keeps both books when two folders would convert to the same file name', async () => {
    const { folders, libraryPath } = await twoFoldersNamed(['manga-folder'], 'Mangabound E2E');
    const openDialog = await browser.electron.mock('dialog', 'showOpenDialog');
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [...folders] });
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [libraryPath] });
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [libraryPath] });

    await resetQueue();
    await setFormat('EPUB');
    await $('button=Folder').click();
    await setSteps({ group: false, convert: true });
    await $('button=Process 2 items').waitForExist({ timeout: 30_000 });

    await $('button=Process 2 items').click();
    await $('h1=2 books ready').waitForDisplayed({ timeout: 120_000 });
    await saveAllBooks();

    assert.deepEqual((await readdir(libraryPath)).sort(), [
      '.mangabound',
      'Mangabound E2E (2).epub',
      'Mangabound E2E.epub',
    ]);
    // Export the same pending books again into a populated destination: exclusive publication
    // must select new names, not replace either of the previous copies.
    const firstCopy = await readFile(path.join(libraryPath, 'Mangabound E2E.epub'));
    const secondCopy = await readFile(path.join(libraryPath, 'Mangabound E2E (2).epub'));
    await saveAllBooks();
    // The books were already marked saved, so nothing on screen says when the repeated export is
    // over: only the folder does, once it holds the two new names and no staged copy.
    await waitForFolderNames(
      libraryPath,
      [
        '.mangabound',
        'Mangabound E2E (2) (2).epub',
        'Mangabound E2E (2).epub',
        'Mangabound E2E (3).epub',
        'Mangabound E2E.epub',
      ],
      { describeAppState: () => $('main').getText() },
    );
    assert.deepEqual(await readFile(path.join(libraryPath, 'Mangabound E2E.epub')), firstCopy);
    assert.deepEqual(await readFile(path.join(libraryPath, 'Mangabound E2E (2).epub')), secondCopy);
    assert.deepEqual(await readFile(path.join(libraryPath, 'Mangabound E2E (3).epub')), firstCopy);
    assert.deepEqual(
      await readFile(path.join(libraryPath, 'Mangabound E2E (2) (2).epub')),
      secondCopy,
    );
  });

  it('keeps every joined volume when two folders would join to the same file names', async () => {
    const { folders, libraryPath } = await twoFoldersNamed(
      ['manga-named-volumes'],
      'Named Volumes',
    );
    const openDialog = await browser.electron.mock('dialog', 'showOpenDialog');
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [...folders] });
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [libraryPath] });

    await resetQueue();
    await $('button=Folder').click();
    await setSteps({ group: true, convert: false });
    await $('button=Process 2 items').waitForExist({ timeout: 30_000 });

    await $('button=Process 2 items').click();
    await $('h1=4 books ready').waitForDisplayed({ timeout: 120_000 });
    await saveAllBooks();

    assert.deepEqual((await readdir(libraryPath)).sort(), [
      '.mangabound',
      'Named Volumes - Vol.01 (2).cbz',
      'Named Volumes - Vol.01.cbz',
      'Named Volumes - Vol.02 (2).cbz',
      'Named Volumes - Vol.02.cbz',
    ]);
  });
});
