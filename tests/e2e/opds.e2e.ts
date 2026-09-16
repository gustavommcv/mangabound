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

async function returnToHome(): Promise<void> {
  const convertSomethingElse = $('button=Convert something else');
  const back = $('button=Back');
  if (await convertSomethingElse.isExisting()) {
    await convertSomethingElse.click();
  } else if (await back.isExisting()) {
    await back.click();
  }
  await $('h1=What are you bringing in?').waitForDisplayed({ timeout: 30_000 });
}

describe('packaged OPDS delivery', () => {
  it('serves real converted books newest-first over a real HTTP server', async () => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), 'mangabound-opds-e2e-'));
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
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [libraryPath] });

    await returnToHome();

    // Convert the folder fixture first, then the CBZ fixture second, so the CBZ's
    // conversion timestamp is deterministically the newest of the two.
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
    await $('button=Start conversion').click();
    await $('h1=1 book saved').waitForDisplayed({ timeout: 120_000 });

    await $('button=Convert something else').click();
    await $('button*=One CBZ file').click();
    await $('h1=Convert Mangabound Direct.cbz').waitForDisplayed({ timeout: 30_000 });
    await $('button=Validate plan').click();
    await $('h2=Plan validated').waitForDisplayed({ timeout: 30_000 });
    await $('button=Start conversion').click();
    await $('h1=1 book saved').waitForDisplayed({ timeout: 120_000 });

    assert.deepEqual(
      (await readdir(libraryPath)).sort(),
      ['Mangabound Direct.epub', 'Mangabound E2E - Vol.01.epub'].sort(),
    );

    // The Share panel's interface picker only ever lists real, non-loopback LAN
    // addresses (by design, see ADR 0007) -- a CI sandbox may have none. Sharing
    // itself is driven directly through the same bridge the panel calls, bound to
    // loopback, so this spec can exercise the real server hermetically.
    const sharingStatus = await browser.execute(async () => {
      const bridge = window.mangabound;
      if (bridge === undefined) throw new Error('window.mangabound is unavailable.');
      const chosen = await bridge.chooseLibrary();
      if (!chosen.ok || chosen.value === null) {
        throw new Error('Could not choose a library to share.');
      }
      const started = await bridge.startSharing(chosen.value.libraryId, '127.0.0.1', {
        mode: 'token',
      });
      if (!started.ok) throw new Error(started.error.message);
      return started.value;
    });

    try {
      assert.ok(sharingStatus.url !== undefined);
      assert.ok(sharingStatus.token !== undefined);
      const { url, token } = sharingStatus;

      const navResponse = await fetch(`${url}/?token=${token}`);
      assert.equal(navResponse.status, 200);
      assert.match(navResponse.headers.get('content-type') ?? '', /kind=navigation/u);
      assert.match(await navResponse.text(), /kind=acquisition/u);

      const unauthorized = await fetch(`${url}/recent`);
      assert.equal(unauthorized.status, 401);

      const recentResponse = await fetch(`${url}/recent?token=${token}`);
      assert.equal(recentResponse.status, 200);
      assert.match(recentResponse.headers.get('content-type') ?? '', /kind=acquisition/u);
      const recentBody = await recentResponse.text();

      const directTitleIndex = recentBody.indexOf('<title>Mangabound Direct</title>');
      const folderTitleIndex = recentBody.indexOf('<title>Mangabound E2E - Vol.01</title>');
      assert.ok(directTitleIndex >= 0, 'Expected the direct CBZ conversion in the feed.');
      assert.ok(folderTitleIndex >= 0, 'Expected the folder conversion in the feed.');
      assert.ok(
        directTitleIndex < folderTitleIndex,
        'Expected the more recently converted book first.',
      );

      const directHref = `${url}/books/Mangabound%20Direct.epub?token=${token}`;
      assert.ok(
        recentBody.includes(`href="${directHref}" type="application/epub+zip"`),
        'Expected an acquisition link for the direct CBZ conversion with the epub MIME type.',
      );

      const acquisitionResponse = await fetch(directHref);
      assert.equal(acquisitionResponse.status, 200);
      assert.equal(acquisitionResponse.headers.get('content-type'), 'application/epub+zip');
      const downloaded = Buffer.from(await acquisitionResponse.arrayBuffer());
      const onDisk = await readFile(path.join(libraryPath, 'Mangabound Direct.epub'));
      assert.ok(downloaded.equals(onDisk));
    } finally {
      await browser.execute(async () => {
        await window.mangabound?.stopSharing();
      });
    }
  });
});
