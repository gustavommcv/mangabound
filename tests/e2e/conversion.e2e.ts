import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { $, browser } from '@wdio/globals';

const temporaryDirectories: string[] = [];

after(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

// A plain poll loop, not browser.waitUntil: a real run showed the target directory state
// (both books plus the library catalog) landing within ~10s, while browser.waitUntil against
// the exact same condition ran out its full timeout without ever resolving -- polling this
// directly from Node, independent of whatever browser.waitUntil was doing internally, is both
// simpler and, empirically, actually reliable.
async function waitForEntryCount(dirPath: string, count: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if ((await readdir(dirPath)).length === count) return;
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${String(count)} entries in ${dirPath}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

describe('packaged conversion pipeline', () => {
  it('converts a real HakuNeko folder and direct CBZ with the pinned tools', async () => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), 'mangabound-packaged-e2e-'));
    temporaryDirectories.push(testRoot);
    const sourceFixture = path.resolve('tests', 'fixtures', 'e2e', 'hakuneko', 'Mangabound E2E');
    const inputPath = path.join(testRoot, 'Mangabound E2E');
    const directCbzPath = path.resolve('tests', 'fixtures', 'e2e', 'cbz', 'Mangabound Direct.cbz');
    const libraryPath = path.join(testRoot, 'library');
    await cp(sourceFixture, inputPath, { recursive: true });
    await mkdir(libraryPath);

    const openDialog = await browser.electron.mock('dialog', 'showOpenDialog');
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [inputPath] });
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [libraryPath] });
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [directCbzPath] });

    await $('button*=Manga folder').click();
    await $('h1=Organize Mangabound E2E into volumes').waitForDisplayed({ timeout: 30_000 });
    await $('button=Select all').click();
    await $('button[aria-label="Add volume"]').click();
    await $('button=Assign selected').click();
    await $('button=Confirm mapping').click();
    await $('h1=Convert Mangabound E2E').waitForDisplayed();
    await $('button=Choose output folder').click();
    await $('button=Validate plan').click();
    await $('h2=Plan validated').waitForDisplayed({ timeout: 30_000 });
    assert.deepEqual(await readdir(libraryPath), []);
    await assert.rejects(readFile(path.join(inputPath, 'mangabind.json'), 'utf8'));
    await $('button=Start conversion').click();
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

    await $('button=Convert something else').click();
    await $('button*=One CBZ file').click();
    await $('h1=Convert Mangabound Direct.cbz').waitForDisplayed({ timeout: 30_000 });
    assert.match(await $('main').getText(), /directly to mangapress/u);
    await $('button=Validate plan').click();
    await $('h2=Plan validated').waitForDisplayed({ timeout: 30_000 });
    assert.deepEqual((await readdir(libraryPath)).sort(), [
      '.mangabound',
      'Mangabound E2E - Vol.01.epub',
    ]);
    await $('button=Start conversion').click();
    await $('h1=1 book saved').waitForDisplayed({ timeout: 120_000 });

    const directBook = path.join(libraryPath, 'Mangabound Direct.epub');
    const directBytes = await readFile(directBook);
    assert.ok(directBytes.length > 1_024);
    assert.equal(directBytes.subarray(0, 2).toString('ascii'), 'PK');
    assert.deepEqual((await readdir(libraryPath)).sort(), [
      '.mangabound',
      'Mangabound Direct.epub',
      'Mangabound E2E - Vol.01.epub',
    ]);
    assert.equal(openDialog.mock.calls.length, 3);
  });

  it('discovers a real library in batch, fixes one title, and converts both with the pinned tools', async () => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), 'mangabound-batch-e2e-'));
    temporaryDirectories.push(testRoot);
    const sourceLibrary = path.resolve('tests', 'fixtures', 'e2e', 'hakuneko-batch', 'Library');
    const libraryParentPath = path.join(testRoot, 'Library');
    const outputLibraryPath = path.join(testRoot, 'output');
    await cp(sourceLibrary, libraryParentPath, { recursive: true });
    await mkdir(outputLibraryPath);
    const needsMappingInputPath = path.join(libraryParentPath, 'Needs Mapping Manga');
    const autoResolvedInputPath = path.join(libraryParentPath, 'Auto-Resolved Manga');

    const openDialog = await browser.electron.mock('dialog', 'showOpenDialog');
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [libraryParentPath] });
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [outputLibraryPath] });

    // The previous spec left the app on its "book saved" screen — return to Home first.
    await $('button=Convert something else').click();
    await $('h1=What are you bringing in?').waitForDisplayed({ timeout: 30_000 });
    await $('button*=Manga library (batch)').click();
    await $('h1=Convert Library').waitForDisplayed({ timeout: 30_000 });
    assert.match(await $('main').getText(), /No volumes could be assigned automatically/u);
    await assert.rejects(readFile(path.join(needsMappingInputPath, 'mangabind.json'), 'utf8'));

    await $('button=Fix mapping').click();
    await $('h1=Organize Needs Mapping Manga into volumes').waitForDisplayed({ timeout: 30_000 });
    await $('button=Select all').click();
    await $('button[aria-label="Add volume"]').click();
    await $('button=Assign selected').click();
    await $('button=Confirm mapping').click();
    await $('h1=Convert Library').waitForDisplayed({ timeout: 30_000 });
    assert.doesNotMatch(await $('main').getText(), /No volumes could be assigned automatically/u);

    const savedMetadata = JSON.parse(
      await readFile(path.join(needsMappingInputPath, 'mangabind.json'), 'utf8'),
    ) as { schema_version: number };
    assert.equal(savedMetadata.schema_version, 1);
    await assert.rejects(readFile(path.join(autoResolvedInputPath, 'mangabind.json'), 'utf8'));

    // The prior spec already chose a library, so this reads "Change output folder" here —
    // either label opens the same picker and this spec supplies its own fresh directory.
    const chooseOutputFolder = $('button*=output folder');
    await chooseOutputFolder.waitForClickable({ timeout: 30_000 });
    await chooseOutputFolder.click();
    await $('button=Start batch conversion').click();
    await waitForEntryCount(outputLibraryPath, 3, 120_000);

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
