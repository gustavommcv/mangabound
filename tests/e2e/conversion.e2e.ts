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

    await $('button*=Manga folder').click();
    await $('h1=Organize Mangabound E2E into volumes').waitForDisplayed({ timeout: 30_000 });
    await $('button=Select all').click();
    await $('button[aria-label="Add volume"]').click();
    await $('button=Assign selected').click();
    await $('button=Confirm mapping').click();
    await $('h1=Convert Mangabound E2E').waitForDisplayed();
    await $('button=Choose output folder').click();
    // See the batch spec below for why this wait matters: chooseLibrary() is async, and
    // clicking the button only confirms the event dispatched, not that the library state
    // (and this shared OutputSettingsPanel's displayed path) actually updated yet.
    await $(`p*=${path.basename(libraryPath)}`).waitForDisplayed({ timeout: 10_000 });
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
    await $('button*=output folder').click();
    // chooseLibrary() is async (an IPC round trip through the mocked dialog before setLibrary()
    // runs) -- WebdriverIO's click() only confirms the click event dispatched, not that this
    // finished. Without waiting for the new path to actually render, "Start batch conversion"
    // can fire against the still-stale library from the previous spec: real diagnostics showed
    // the app reporting both titles converted successfully while the *new* output folder stayed
    // completely empty, because the batch quietly ran against the old one instead.
    await $(`p*=${path.basename(outputLibraryPath)}`).waitForDisplayed({ timeout: 10_000 });
    await $('button=Start batch conversion').click();
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
