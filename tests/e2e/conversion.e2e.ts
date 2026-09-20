import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { $, browser } from '@wdio/globals';

import { chooseOutputFolder, queueOutputFolderButton, readZipEntry, resetQueue } from './support';

const temporaryDirectories: string[] = [];

after(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function waitForEntryCount(
  dirPath: string,
  count: number,
  timeoutMs: number,
  describeAppState: () => Promise<string>,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const entries = await readdir(dirPath);
    if (entries.length === count) return;
    if (Date.now() >= deadline) {
      // A bare timeout says nothing about why. This once passed on a rerun with no trace of
      // the cause, so the failure carries what the directory held and what the app showed.
      const shown = await describeAppState().catch(() => '(the page text was unavailable)');
      throw new Error(
        `Timed out waiting for ${String(count)} entries in ${dirPath}. ` +
          `Found: ${entries.join(', ') || '(nothing)'}.\nThe app showed:\n${shown}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

describe('packaged conversion pipeline', () => {
  it('converts a real manga folder and direct CBZ with the pinned tools', async () => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), 'mangabound-packaged-e2e-'));
    temporaryDirectories.push(testRoot);
    const sourceFixture = path.resolve(
      'tests',
      'fixtures',
      'e2e',
      'manga-folder',
      'Mangabound E2E',
    );
    const inputPath = path.join(testRoot, 'Mangabound E2E');
    const directCbzPath = path.resolve('tests', 'fixtures', 'e2e', 'cbz', 'Mangabound Direct.cbz');
    const libraryPath = path.join(testRoot, 'library');
    await cp(sourceFixture, inputPath, { recursive: true });
    await mkdir(libraryPath);

    const openDialog = await browser.electron.mock('dialog', 'showOpenDialog');
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [inputPath] });
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [libraryPath] });
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [directCbzPath] });

    await resetQueue();
    await $('button=Folder').click();
    // Nothing in the chapter names says which volume they belong to, so the folder waits for a
    // grouping before it can run.
    await $('span=Needs volumes').waitForDisplayed({ timeout: 30_000 });
    await $('button[aria-label="Edit volumes for Mangabound E2E"]').click();
    await $('h1=Organize Mangabound E2E into volumes').waitForDisplayed({ timeout: 30_000 });
    await $('button=Select all').click();
    await $('button[aria-label="Add volume"]').click();
    await $('button=Assign selected').click();
    await $('button=Confirm mapping').click();
    await $('span=1 volume').waitForDisplayed({ timeout: 10_000 });
    await chooseOutputFolder(queueOutputFolderButton, libraryPath);
    await $('button=Validate plan').click();
    await $('h2=Plan validated').waitForDisplayed({ timeout: 30_000 });
    assert.deepEqual(await readdir(libraryPath), []);
    await assert.rejects(readFile(path.join(inputPath, 'mangabind.json'), 'utf8'));
    await $('button=Convert 1 item').click();
    await $('h1=1 book saved').waitForDisplayed({ timeout: 120_000 });

    const metadata = JSON.parse(await readFile(path.join(inputPath, 'mangabind.json'), 'utf8')) as {
      schema_version: number;
      source?: unknown;
      volumes: { number: string; chapters: string[] }[];
    };
    assert.equal(metadata.source, undefined);
    assert.deepEqual(metadata, {
      schema_version: 1,
      manga: { title: 'Mangabound E2E' },
      volumes: [{ number: '1', chapters: ['1', '2'] }],
    });
    const folderBook = path.join(libraryPath, 'Mangabound E2E - Vol.01.epub');
    const folderBytes = await readFile(folderBook);
    assert.ok(folderBytes.length > 1_024);
    assert.equal(folderBytes.subarray(0, 2).toString('ascii'), 'PK');
    // No option was touched, so the book is made the way Kindle Comic Converter's own window makes
    // it (ADR 0011): manga reading order, which turns the pages right to left.
    assert.match(
      await readZipEntry(folderBook, (name) => name.endsWith('.opf')),
      /page-progression-direction="rtl"/u,
    );

    // The saved folder left the queue; the CBZ is added next, on its own.
    await $('button=Convert more').click();
    await $('h1=Queue').waitForDisplayed();
    assert.equal(await $('p=Mangabound E2E').isExisting(), false);
    await $('button=Files').click();
    await $('span=Ready').waitForDisplayed({ timeout: 30_000 });
    assert.match(await $('main').getText(), /goes straight to the e-reader step/u);
    await $('button=Validate plan').click();
    await $('h2=Plan validated').waitForDisplayed({ timeout: 30_000 });
    assert.deepEqual((await readdir(libraryPath)).sort(), [
      '.mangabound',
      'Mangabound E2E - Vol.01.epub',
    ]);
    await $('button=Convert 1 item').click();
    await $('h1=1 book saved').waitForDisplayed({ timeout: 120_000 });

    const directBook = path.join(libraryPath, 'Mangabound Direct.epub');
    const directBytes = await readFile(directBook);
    assert.ok(directBytes.length > 1_024);
    assert.equal(directBytes.subarray(0, 2).toString('ascii'), 'PK');
    assert.match(
      await readZipEntry(directBook, (name) => name.endsWith('.opf')),
      /page-progression-direction="rtl"/u,
    );
    assert.deepEqual((await readdir(libraryPath)).sort(), [
      '.mangabound',
      'Mangabound Direct.epub',
      'Mangabound E2E - Vol.01.epub',
    ]);
    assert.equal(openDialog.mock.calls.length, 3);
  });

  it('reads a real library from the queue, fixes one title, and converts both with the pinned tools', async () => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), 'mangabound-library-e2e-'));
    temporaryDirectories.push(testRoot);
    const sourceLibrary = path.resolve('tests', 'fixtures', 'e2e', 'manga-batch', 'Library');
    const libraryParentPath = path.join(testRoot, 'Library');
    const outputLibraryPath = path.join(testRoot, 'output');
    await cp(sourceLibrary, libraryParentPath, { recursive: true });
    await mkdir(outputLibraryPath);
    const needsMappingInputPath = path.join(libraryParentPath, 'Needs Mapping Manga');
    const autoResolvedInputPath = path.join(libraryParentPath, 'Auto-Resolved Manga');

    const openDialog = await browser.electron.mock('dialog', 'showOpenDialog');
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [libraryParentPath] });
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [outputLibraryPath] });

    // The previous test left the app on its "book saved" screen: return to the queue first.
    await resetQueue();
    // A library is added like any folder, and turns out to be one once it has been read.
    await $('button=Folder').click();
    await $('span=1 title').waitForDisplayed({ timeout: 60_000 });
    const queued = await $('main').getText();
    assert.match(queued, /Library · 2 titles · 1 volume/u);
    assert.match(queued, /1 title left out until they have volumes/u);
    await assert.rejects(readFile(path.join(needsMappingInputPath, 'mangabind.json'), 'utf8'));

    await $('button[aria-label="Edit titles of Library"]').click();
    await $('span=Needs volumes').waitForDisplayed({ timeout: 30_000 });
    await $('button[aria-label="Edit volumes for Needs Mapping Manga"]').click();
    await $('h1=Organize Needs Mapping Manga into volumes').waitForDisplayed({ timeout: 30_000 });
    await $('button=Select all').click();
    await $('button[aria-label="Add volume"]').click();
    await $('button=Assign selected').click();
    await $('button=Confirm mapping').click();
    // Saved in that title's folder, and the library read again: both titles have volumes now. The
    // library screen has to be back first. "Needs volumes" is also absent from the editor, so
    // waiting only for it to go would pass at once, while the save is still on its way.
    await $('h1=Library').waitForDisplayed({ timeout: 60_000 });
    await $('span=Needs volumes').waitForDisplayed({ timeout: 60_000, reverse: true });
    assert.doesNotMatch(await $('main').getText(), /Needs volumes/u);

    const savedMetadata = JSON.parse(
      await readFile(path.join(needsMappingInputPath, 'mangabind.json'), 'utf8'),
    ) as { schema_version: number };
    assert.equal(savedMetadata.schema_version, 1);
    await assert.rejects(readFile(path.join(autoResolvedInputPath, 'mangabind.json'), 'utf8'));

    await $('button=Queue').click();
    await $('span=2 titles').waitForDisplayed({ timeout: 30_000 });
    // The prior test already chose a library, so this reads "Change output folder" here: either
    // label opens the same picker and this test supplies its own fresh directory.
    await chooseOutputFolder(queueOutputFolderButton, outputLibraryPath);
    await $('button=Convert 1 item').click();
    await $('h1=2 books saved').waitForDisplayed({ timeout: 120_000 });
    await waitForEntryCount(outputLibraryPath, 3, 120_000, () => $('main').getText());

    const entries = (await readdir(outputLibraryPath)).sort();
    assert.deepEqual(entries, [
      '.mangabound',
      'Auto-Resolved Manga - Vol.01.epub',
      'Needs Mapping Manga - Vol.01.epub',
    ]);
    const savedBooks = entries.filter((name) => name !== '.mangabound');
    for (const name of savedBooks) {
      const bytes = await readFile(path.join(outputLibraryPath, name));
      assert.ok(bytes.length > 1_024);
      assert.equal(bytes.subarray(0, 2).toString('ascii'), 'PK');
    }
    assert.equal(openDialog.mock.calls.length, 2);
  });
});
