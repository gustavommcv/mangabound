import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { $, browser } from '@wdio/globals';

import {
  readZipEntry,
  recordProgress,
  reportedProgress,
  resetQueue,
  saveAllBooks,
  saveBookAs,
  waitForFolderNames,
} from './support';

const temporaryDirectories: string[] = [];

after(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

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
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [directCbzPath] });

    await resetQueue();
    await $('button=Folder').click();
    // Nothing in the chapter names says which volume they belong to, so the folder waits for a
    // grouping before it can run.
    await $('span=Needs volumes').waitForDisplayed({ timeout: 30_000 });
    await $('button[aria-label="Edit volumes for Mangabound E2E"]').click();
    await $('h1=Organize Mangabound E2E into volumes').waitForDisplayed({ timeout: 30_000 });
    assert.equal(await $('[role="tab"][aria-selected="true"]').getText(), 'Manual');
    await $('[role="status"][aria-label="No volumes found in file names"]').waitForDisplayed();
    await $('button=Select all').click();
    await $('button[aria-label="Add volume"]').click();
    await $('button=Assign selected').click();
    await $('button=Confirm mapping').click();
    await $('span=1 volume').waitForDisplayed({ timeout: 10_000 });
    await $('button=Validate plan').click();
    await $('h2=Plan validated').waitForDisplayed({ timeout: 30_000 });
    assert.deepEqual(await readdir(libraryPath), []);
    await assert.rejects(readFile(path.join(inputPath, 'mangabind.json'), 'utf8'));
    await $('button=Process 1 item').click();
    await $('h1=1 book ready').waitForDisplayed({ timeout: 120_000 });
    assert.deepEqual(
      await readdir(libraryPath),
      [],
      'processing must not save before the user chooses a destination',
    );
    const pendingShare = await browser.execute(async () => {
      const bridge = window.mangabound;
      if (bridge === undefined) throw new Error('The app bridge is unavailable.');
      const listed = await bridge.listPendingRuns();
      if (!listed.ok) throw new Error(listed.error.message);
      const run = listed.value.find((candidate) =>
        candidate.artifacts.some((artifact) => artifact.name === 'Mangabound E2E - Vol.01.epub'),
      );
      if (run === undefined)
        throw new Error('The newly converted book was not registered as pending.');
      const started = await bridge.startSharing(run.libraryId, '127.0.0.1', {
        username: '',
        password: '',
      });
      if (!started.ok) throw new Error(started.error.message);
      return started.value;
    });
    try {
      if (pendingShare.url === undefined) throw new Error('The pending catalog has no address.');
      const catalog = await fetch(pendingShare.url);
      assert.equal(catalog.status, 200);
      assert.match(await catalog.text(), /<title>Mangabound ready books<\/title>/u);
      const recent = await fetch(`${pendingShare.url}/recent`);
      assert.equal(recent.status, 200);
      assert.match(await recent.text(), /Mangabound E2E - Vol\.01/u);
    } finally {
      await browser.execute(async () => {
        await window.mangabound?.stopSharing();
      });
    }

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
    await saveBookAs('Mangabound E2E - Vol.01.epub', folderBook);
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
    await $('button=Process 1 item').click();
    await $('h1=1 book ready').waitForDisplayed({ timeout: 120_000 });

    const directBook = path.join(libraryPath, 'Mangabound Direct.epub');
    await saveBookAs('Mangabound Direct.epub', directBook);
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
    assert.equal(openDialog.mock.calls.length, 2);
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
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [outputLibraryPath] });
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
    await recordProgress();
    await $('button=Process 1 item').click();
    await $('h1=2 books ready').waitForDisplayed({ timeout: 120_000 });
    const progressSeen = await reportedProgress();
    // All of it is of the one run, and begins with the library being bound.
    assert.equal(new Set(progressSeen.map((progress) => progress.jobId)).size, 1);
    assert.equal(progressSeen[0]?.message, 'Building volume files for the library…');
    const titles = ['Auto-Resolved Manga', 'Needs Mapping Manga'];
    for (const title of titles) {
      const own = progressSeen.filter((progress) => progress.title === title);
      for (const stage of ['binding', 'processing', 'saving']) {
        assert.ok(
          own.some((progress) => progress.stage === stage),
          `${title} should have been reported in the ${stage} stage.`,
        );
      }
      // The pages are counted up to the whole of the title's book.
      const counted = own.filter((progress) => progress.total !== undefined);
      assert.ok(counted.length > 0);
      assert.equal(counted.at(-1)?.completed, counted.at(-1)?.total);
    }
    // The titles are converted one after the other, in the order of the library.
    const converting = progressSeen
      .filter((progress) => progress.stage === 'processing')
      .map((progress) => progress.title);
    assert.deepEqual([...new Set(converting)], titles);
    assert.deepEqual(await readdir(outputLibraryPath), []);
    // A file blocking the catalog directory lets the books copy but produces a warning.
    // Retrying after removing the obstruction must not require another conversion.
    const catalogPath = path.join(outputLibraryPath, '.mangabound');
    await writeFile(catalogPath, 'blocked');
    await saveAllBooks();
    await $('li*=destination catalog could not be updated').waitForDisplayed({ timeout: 30_000 });
    const pendingAfterWarning = await browser.execute(async () => {
      const listed = await window.mangabound?.listPendingRuns();
      if (listed === undefined || !listed.ok) throw new Error('Pending books could not be read.');
      return listed.value
        .flatMap((run) => run.artifacts)
        .filter((artifact) => artifact.name.includes('Manga - Vol.01.epub'))
        .map((artifact) => artifact.saved);
    });
    assert.deepEqual(pendingAfterWarning, [false, false]);
    const bookNames = ['Auto-Resolved Manga - Vol.01.epub', 'Needs Mapping Manga - Vol.01.epub'];
    await rm(catalogPath);
    for (const name of bookNames) await rm(path.join(outputLibraryPath, name));
    await $('button[aria-label="Dismiss these notices"]').click();
    await $('button=Save all to folder…').click();
    const entries = ['.mangabound', ...bookNames];
    await waitForFolderNames(outputLibraryPath, entries, {
      timeout: 120_000,
      describeAppState: () => $('main').getText(),
    });
    const savedBooks = bookNames;
    for (const name of savedBooks) {
      const bytes = await readFile(path.join(outputLibraryPath, name));
      assert.ok(bytes.length > 1_024);
      assert.equal(bytes.subarray(0, 2).toString('ascii'), 'PK');
    }
    // A clean export is retryable too: removing a copy from the wrong folder must not make
    // Save All disappear or force the person to process the source again.
    for (const name of savedBooks) await rm(path.join(outputLibraryPath, name));
    await $('button=Save all to folder…').click();
    await waitForFolderNames(outputLibraryPath, entries, {
      describeAppState: () => $('main').getText(),
    });
    assert.equal(openDialog.mock.calls.length, 4);
  });

  it('binds only the titles of a library that are ready, and leaves the others alone', async () => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), 'mangabound-library-subset-e2e-'));
    temporaryDirectories.push(testRoot);
    const sourceLibrary = path.resolve('tests', 'fixtures', 'e2e', 'manga-batch', 'Library');
    const libraryParentPath = path.join(testRoot, 'Library');
    await cp(sourceLibrary, libraryParentPath, { recursive: true });
    const openDialog = await browser.electron.mock('dialog', 'showOpenDialog');
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [libraryParentPath] });

    await resetQueue();
    await $('button=Folder').click();
    // One title has volumes and the other waits for them, so a run is of one title of two.
    await $('span=1 title').waitForDisplayed({ timeout: 60_000 });
    assert.match(await $('main').getText(), /1 title left out until they have volumes/u);
    await recordProgress();
    await $('button=Process 1 item').click();
    await $('h1=1 book ready').waitForDisplayed({ timeout: 120_000 });

    // The title that waits was not bound: nothing was said of it, as it was when the whole library
    // was bound first and the title it was asked for picked from it.
    const titles = new Set((await reportedProgress()).map((progress) => progress.title));
    assert.ok(titles.has('Auto-Resolved Manga'));
    assert.equal(titles.has('Needs Mapping Manga'), false);
  });

  it('recovers an unsaved book after the window reloads', async () => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), 'mangabound-restart-e2e-'));
    temporaryDirectories.push(testRoot);
    const directCbzPath = path.resolve('tests', 'fixtures', 'e2e', 'cbz', 'Mangabound Direct.cbz');
    const destination = path.join(testRoot, 'Recovered.epub');
    const pendingRoot = process.env.MANGABOUND_PENDING_ROOT;
    if (pendingRoot === undefined)
      throw new Error('The packaged test has no isolated pending root.');
    const earlierRuns = new Set(await readdir(pendingRoot));
    const openDialog = await browser.electron.mock('dialog', 'showOpenDialog');
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [directCbzPath] });

    await resetQueue();
    await $('button=Files').click();
    await $('span=Ready').waitForDisplayed({ timeout: 30_000 });
    await $('button=Process 1 item').click();
    await $('h1=1 book ready').waitForDisplayed({ timeout: 120_000 });
    assert.deepEqual(await readdir(testRoot), []);

    await browser.refresh();
    await $('h1=Queue').waitForDisplayed({ timeout: 30_000 });
    await $('h2=Ready books').waitForDisplayed({ timeout: 30_000 });
    await $('button=View books').click();
    await $('h1=1 book ready').waitForDisplayed();
    const saveDialog = await browser.electron.mock('dialog', 'showSaveDialog');
    const wrongExtension = path.join(testRoot, 'Recovered.pdf');
    await saveDialog.mockResolvedValueOnce({ canceled: false, filePath: wrongExtension });
    const rejectedSave = JSON.parse(
      await browser.execute(async () => {
        const bridge = window.mangabound;
        if (bridge === undefined) throw new Error('The app bridge is unavailable.');
        const listed = await bridge.listPendingRuns();
        if (!listed.ok) throw new Error(listed.error.message);
        const artifact = listed.value
          .flatMap((run) => run.artifacts)
          .find((book) => book.name === 'Mangabound Direct.epub' && !book.saved);
        if (artifact === undefined) throw new Error('The pending book is missing.');
        return JSON.stringify(await bridge.saveArtifactAs(artifact.id));
      }),
    ) as unknown;
    assert.deepEqual(rejectedSave, {
      ok: false,
      error: {
        code: 'save_failed',
        message: 'Choose a .epub file for this book.',
      },
    });
    await assert.rejects(readFile(wrongExtension));
    await saveBookAs('Mangabound Direct.epub', destination);
    assert.equal((await readFile(destination)).subarray(0, 2).toString('ascii'), 'PK');

    const newRuns = (await readdir(pendingRoot)).filter((id) => !earlierRuns.has(id));
    assert.equal(newRuns.length, 1);
    await $('button=Convert more').click();
    const deleteButton = $('button[aria-label="Delete pending books from Mangabound Direct.epub"]');
    await deleteButton.click();
    await $('button=Cancel').click();
    assert.ok((await readdir(pendingRoot)).includes(newRuns[0]!));

    await browser.execute(async (runId) => {
      const started = await window.mangabound?.startSharing(runId, '127.0.0.1', {
        username: '',
        password: '',
      });
      if (started?.ok !== true) throw new Error('Could not share the pending run.');
    }, newRuns[0]!);
    await deleteButton.click();
    await $('button=Delete books').click();
    const deletionError = $('section[aria-label="Workflow error"] p');
    await deletionError.waitForDisplayed();
    assert.equal(
      await deletionError.getText(),
      'Stop sharing these books before deleting their pending copies.',
    );
    assert.ok((await readdir(pendingRoot)).includes(newRuns[0]!));
    await browser.execute(async () => {
      const stopped = await window.mangabound?.stopSharing();
      if (stopped?.ok !== true) throw new Error('Could not stop sharing the pending run.');
    });
    await $('button=Delete books').click();
    await browser.waitUntil(async () => !(await readdir(pendingRoot)).includes(newRuns[0]!), {
      timeout: 30_000,
      timeoutMsg: 'The selected pending run was not deleted.',
    });
    assert.equal((await readFile(destination)).subarray(0, 2).toString('ascii'), 'PK');
  });
});
