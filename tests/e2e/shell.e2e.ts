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

describe('packaged application shell', () => {
  it('launches with the packaged CLI binaries verified and ready', async () => {
    assert.equal(await browser.getTitle(), 'Mangabound');
    assert.equal(await $('h1').getText(), 'What are you bringing in?');
    const status = $('section[aria-label="Bundled tool status"]');
    await status.waitForDisplayed();
    assert.match(await status.getText(), /Conversion tools ready/u);
  });

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
    await $('button=Start conversion').click();
    await $('h1=1 book saved').waitForDisplayed({ timeout: 120_000 });

    const directBook = path.join(libraryPath, 'Mangabound Direct.epub');
    const directBytes = await readFile(directBook);
    assert.ok(directBytes.length > 1_024);
    assert.equal(directBytes.subarray(0, 2).toString('ascii'), 'PK');
    assert.deepEqual(
      (await readdir(libraryPath)).sort(),
      ['Mangabound Direct.epub', 'Mangabound E2E - Vol.01.epub'].sort(),
    );
    assert.equal(openDialog.mock.calls.length, 3);
  });
});
