import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
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

describe('packaged queue', () => {
  it('takes several folders at once, runs the ones that are ready and reports the one that is not', async () => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), 'mangabound-queue-e2e-'));
    temporaryDirectories.push(testRoot);
    const grouped = path.join(testRoot, 'Named Volumes');
    const ungrouped = path.join(testRoot, 'Mangabound E2E');
    const libraryPath = path.join(testRoot, 'library');
    await cp(
      path.resolve('tests', 'fixtures', 'e2e', 'manga-named-volumes', 'Named Volumes'),
      grouped,
      { recursive: true },
    );
    await cp(
      path.resolve('tests', 'fixtures', 'e2e', 'manga-folder', 'Mangabound E2E'),
      ungrouped,
      {
        recursive: true,
      },
    );
    await mkdir(libraryPath);

    const openDialog = await browser.electron.mock('dialog', 'showOpenDialog');
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [grouped, ungrouped] });
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [libraryPath] });

    await resetQueue();
    await $('button=Folder').click();
    await $('span=2 volumes').waitForDisplayed({ timeout: 30_000 });
    await $('span=Needs volumes').waitForDisplayed({ timeout: 30_000 });

    await chooseOutputFolder(queueOutputFolderButton, libraryPath);
    // Only the folder that is ready will run, and the queue says so before anything starts.
    assert.match(await $('main').getText(), /1 item will be left out/u);
    await $('button=Convert 1 item').click();
    await $('h1=2 books saved').waitForDisplayed({ timeout: 120_000 });

    assert.deepEqual((await readdir(libraryPath)).sort(), [
      '.mangabound',
      'Named Volumes - Vol.01.epub',
      'Named Volumes - Vol.02.epub',
    ]);
    const results = await $('main').getText();
    assert.match(results, /Mangabound E2E was skipped/u);
    assert.match(results, /No volumes yet/u);

    // What was left out can be fixed from the results, and then it is still in the queue.
    await $('button[aria-label="Fix Mangabound E2E"]').click();
    await $('h1=Organize Mangabound E2E into volumes').waitForDisplayed({ timeout: 30_000 });
    await $('button=Queue').click();
    await $('h1=Queue').waitForDisplayed();
    await $('span=Needs volumes').waitForDisplayed();
    assert.equal(await $('p=Named Volumes').isExisting(), false);
    assert.equal(openDialog.mock.calls.length, 2);
  });

  it('registers files dropped on the window by their path, and says why others were not added', async () => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), 'mangabound-drop-e2e-'));
    temporaryDirectories.push(testRoot);
    const cbzPath = path.resolve('tests', 'fixtures', 'e2e', 'cbz', 'Mangabound Direct.cbz');
    const notesPath = path.join(testRoot, 'notes.txt');
    await writeFile(notesPath, 'not a comic');

    await resetQueue();
    // A native drag cannot be scripted, so real files are put in a file input, which gives the page
    // File objects that point at the disk exactly as a drop does, and are then dropped on the queue
    // with the same events a drag produces. The rest (the page, the preload, the main process) is
    // the real thing.
    await browser.execute(() => {
      const input = document.createElement('input');
      input.id = 'e2e-dropped-files';
      input.type = 'file';
      input.multiple = true;
      input.style.cssText = 'position: fixed; top: 0; left: 0; z-index: 9999;';
      document.body.append(input);
    });
    await $('#e2e-dropped-files').addValue(`${cbzPath}\n${notesPath}`);

    const outcome = await browser.execute(() => {
      const input = document.getElementById('e2e-dropped-files');
      const target = document.querySelector('[data-testid="drop-target"]');
      if (!(input instanceof HTMLInputElement) || input.files === null) return 'no file input';
      if (target === null) return 'no drop target';
      const transfer = new DataTransfer();
      for (const file of Array.from(input.files)) transfer.items.add(file);
      for (const type of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(
          new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }),
        );
      }
      input.remove();
      return `dropped ${String(transfer.files.length)}`;
    });
    assert.equal(outcome, 'dropped 2');

    await $('p=Mangabound Direct.cbz').waitForDisplayed({ timeout: 30_000 });
    await $('span=Ready').waitForDisplayed({ timeout: 30_000 });
    assert.match(
      await $('main').getText(),
      /notes\.txt was not added\. Only folders and \.cbz files can be added\./u,
    );
    assert.equal(await $('p=notes.txt').isExisting(), false);

    await resetQueue();
  });
});
