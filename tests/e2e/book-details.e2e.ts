import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { $, browser } from '@wdio/globals';

import {
  readZipEntry,
  readZipEntryBytes,
  resetQueue,
  saveAllBooks,
  setFormat,
  setSteps,
} from './support';

const temporaryDirectories: string[] = [];

after(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

/**
 * Empties a text field the way a person does, key by key: clearing it through the driver does not
 * raise the input event the page listens to.
 */
async function emptyField(selector: string): Promise<void> {
  const field = $(selector);
  const length = (await field.getValue()).length;
  await field.click();
  await browser.keys(['End']);
  await browser.keys(Array.from({ length }, () => 'Backspace'));
}

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
    await setFormat('EPUB');
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
      // Typed pt-br, written the way BCP 47 recommends.
      assert.match(opf, /<dc:language[^>]*>pt-BR<\/dc:language>/u);
    }
  });
});

describe('packaged author and language kept with a folder', () => {
  it('are written next to the chapters, found again when the folder is added again, and taken away when cleared', async () => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), 'mangabound-kept-details-e2e-'));
    temporaryDirectories.push(testRoot);
    const inputPath = path.join(testRoot, 'Named Volumes');
    const libraryPath = path.join(testRoot, 'library');
    await cp(
      path.resolve('tests', 'fixtures', 'e2e', 'manga-named-volumes', 'Named Volumes'),
      inputPath,
      { recursive: true },
    );
    await mkdir(libraryPath);
    const keptFile = path.join(inputPath, 'mangabind.json');

    const openDialog = await browser.electron.mock('dialog', 'showOpenDialog');
    // In the order they are used: add, add again, the folder to save into, add once more.
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [inputPath] });
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [inputPath] });
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [libraryPath] });
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [inputPath] });

    await resetQueue();
    await $('button=Folder').click();
    await $('span=2 volumes').waitForDisplayed({ timeout: 30_000 });
    // Reading the folder and looking at the page changes nothing on disk.
    await $('button[aria-label="Edit details of Named Volumes"]').click();
    await $('h1=Named Volumes').waitForDisplayed({ timeout: 10_000 });
    await $('button=Queue').click();
    await $('h1=Queue').waitForDisplayed();
    assert.equal(
      await stat(keptFile).then(
        () => true,
        () => false,
      ),
      false,
    );

    await $('button[aria-label="Edit details of Named Volumes"]').click();
    await $('#details-author').setValue('An Author');
    await $('#details-language').setValue('pt-br');
    // A title is only for this run, and is not kept.
    await $('#details-title').setValue('A Title For This Run');
    // Nothing is written while typing, only when the page is left.
    assert.equal(
      await stat(keptFile).then(
        () => true,
        () => false,
      ),
      false,
    );
    await $('button=Queue').click();
    await $('h1=Queue').waitForDisplayed();
    await browser.waitUntil(
      () =>
        stat(keptFile).then(
          () => true,
          () => false,
        ),
      {
        timeout: 10_000,
        timeoutMsg: 'The author and language were not written next to the chapters.',
      },
    );

    const kept = JSON.parse(await readFile(keptFile, 'utf8')) as {
      manga: Record<string, string>;
      volumes: unknown[];
    };
    assert.deepEqual(kept.manga, { author: 'An Author', language: 'pt-BR' });
    assert.deepEqual(kept.volumes, []);

    // Added again, the folder comes with them, and the tools still read the folder as before.
    await $('button=Clear').click();
    await $('button=Clear').waitForExist({ reverse: true, timeout: 10_000 });
    await $('button=Folder').click();
    await $('span=2 volumes').waitForDisplayed({ timeout: 30_000 });
    await $('button[aria-label="Edit details of Named Volumes"]').click();
    await $('#details-author').waitForDisplayed({ timeout: 10_000 });
    assert.equal(await $('#details-author').getValue(), 'An Author');
    assert.equal(await $('#details-language').getValue(), 'pt-BR');
    assert.equal(await $('#details-title').getValue(), '');
    await $('button=Queue').click();
    await $('h1=Queue').waitForDisplayed();
    await setSteps({ group: true, convert: false });
    await $('button=Process 1 item').click();
    await $('h1=2 books ready').waitForDisplayed({ timeout: 120_000 });
    await saveAllBooks();
    assert.deepEqual((await readdir(libraryPath)).sort(), [
      '.mangabound',
      'Named Volumes - Vol.01.cbz',
      'Named Volumes - Vol.02.cbz',
    ]);

    // Cleared, they are taken away, and so is the file that held nothing else.
    await $('button=Convert more').click();
    await $('h1=Queue').waitForDisplayed({ timeout: 30_000 });
    await $('button=Folder').click();
    await $('span=2 volumes').waitForDisplayed({ timeout: 30_000 });
    await setSteps({ group: true, convert: true });
    await $('button[aria-label="Edit details of Named Volumes"]').click();
    await $('#details-author').waitForDisplayed({ timeout: 10_000 });
    assert.equal(await $('#details-author').getValue(), 'An Author');
    await emptyField('#details-author');
    await emptyField('#details-language');
    await $('button=Queue').click();
    await $('h1=Queue').waitForDisplayed();
    await browser.waitUntil(
      () =>
        stat(keptFile).then(
          () => false,
          () => true,
        ),
      {
        timeout: 10_000,
        timeoutMsg: 'The file that held only the author and language was not taken away.',
      },
    );
  });
});

/** The width and height a JPEG says it has, read from its frame header. */
function jpegSize(jpeg: Buffer): { readonly width: number; readonly height: number } {
  let offset = 2;
  while (offset + 9 < jpeg.length) {
    const marker = jpeg.readUInt16BE(offset);
    // The start-of-frame markers, leaving out the ones that only look like them.
    if (marker >= 0xffc0 && marker <= 0xffcf && ![0xffc4, 0xffc8, 0xffcc].includes(marker)) {
      return { height: jpeg.readUInt16BE(offset + 5), width: jpeg.readUInt16BE(offset + 7) };
    }
    offset += 2 + jpeg.readUInt16BE(offset + 2);
  }
  throw new Error('The image has no JPEG frame header.');
}

describe('packaged cover of the person’s own', () => {
  it('is picked for one volume, kept by the app without the original, and made that book’s cover', async () => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), 'mangabound-covers-e2e-'));
    temporaryDirectories.push(testRoot);
    const inputPath = path.join(testRoot, 'Named Volumes');
    const libraryPath = path.join(testRoot, 'library');
    // A 300x400 image, from a place and under a name that have nothing to do with the series.
    const picked = path.join(testRoot, 'any name at all.png');
    await cp(
      path.resolve('tests', 'fixtures', 'e2e', 'manga-named-volumes', 'Named Volumes'),
      inputPath,
      { recursive: true },
    );
    await mkdir(libraryPath);
    await cp(path.resolve('tests', 'fixtures', 'covers', 'front.png'), picked);

    const openDialog = await browser.electron.mock('dialog', 'showOpenDialog');
    // In the order they are used: the folder, the cover, the folder to save into.
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [inputPath] });
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [picked] });
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [libraryPath] });

    await resetQueue();
    await setFormat('EPUB');
    await $('button=Folder').click();
    await $('span=2 volumes').waitForDisplayed({ timeout: 30_000 });
    await setSteps({ group: true, convert: true });

    await $('button[aria-label="Edit details of Named Volumes"]').click();
    await $('h1=Named Volumes').waitForDisplayed({ timeout: 10_000 });
    await $('button[aria-label="Choose a cover for Named Volumes - Vol.02"]').click();
    // Named without its extension: a selector that ends in one is taken for a picture to look for.
    await $('p*=any name at all').waitForDisplayed({ timeout: 10_000 });
    // The first volume was given none, and keeps its first page.
    await $('button[aria-label="Choose a cover for Named Volumes - Vol.01"]').waitForDisplayed();

    // The app has its own copy: the original can go before the books are made.
    await rm(picked);
    const coversRoot = process.env.MANGABOUND_COVERS_ROOT;
    assert.ok(coversRoot);
    const [itemFolder] = await readdir(coversRoot);
    assert.ok(itemFolder);
    const kept = await readdir(path.join(coversRoot, itemFolder));
    assert.equal(kept.length, 2);
    assert.ok(kept.includes('covers.json'));
    assert.ok(kept.some((name) => /^2-.+\.png$/u.test(name)));

    await $('button=Queue').click();
    await $('h1=Queue').waitForDisplayed();
    await $('button=Process 1 item').click();
    await $('h1=2 books ready').waitForDisplayed({ timeout: 120_000 });
    await saveAllBooks();

    const books = (await readdir(libraryPath)).filter((name) => name.endsWith('.epub')).sort();
    assert.equal(books.length, 2);
    const coverOf = async (book: string) =>
      jpegSize(
        await readZipEntryBytes(path.join(libraryPath, book), (name) =>
          name.endsWith('Images/cover.jpg'),
        ),
      );
    // A cover is fitted to the screen and never enlarged, so the picked image keeps its size.
    assert.deepEqual(await coverOf(books[1]!), { width: 300, height: 400 });
    assert.notDeepEqual(await coverOf(books[0]!), { width: 300, height: 400 });
  });
  it('does not keep an image that cannot be read as a cover, and says so', async () => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), 'mangabound-covers-damaged-e2e-'));
    temporaryDirectories.push(testRoot);
    const inputPath = path.join(testRoot, 'Named Volumes');
    // It has the name of an image and holds none: it would stop the book it was the cover of.
    const damaged = path.join(testRoot, 'damaged.png');
    await cp(
      path.resolve('tests', 'fixtures', 'e2e', 'manga-named-volumes', 'Named Volumes'),
      inputPath,
      { recursive: true },
    );
    await writeFile(damaged, 'this is not an image');
    const coversRoot = process.env.MANGABOUND_COVERS_ROOT;
    assert.ok(coversRoot);
    const before = await readdir(coversRoot);

    const openDialog = await browser.electron.mock('dialog', 'showOpenDialog');
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [inputPath] });
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [damaged] });

    await resetQueue();
    await $('button=Folder').click();
    await $('span=2 volumes').waitForDisplayed({ timeout: 30_000 });
    await setSteps({ group: true, convert: true });
    await $('button[aria-label="Edit details of Named Volumes"]').click();
    await $('h1=Named Volumes').waitForDisplayed({ timeout: 10_000 });
    await $('button[aria-label="Choose a cover for Named Volumes - Vol.01"]').click();

    await $('p*=could not be read as an image').waitForDisplayed({ timeout: 10_000 });
    // The book still has none: the button still offers to choose one, and the app kept nothing.
    await $('button[aria-label="Choose a cover for Named Volumes - Vol.01"]').waitForDisplayed();
    assert.deepEqual(await readdir(coversRoot), before);
  });
});
