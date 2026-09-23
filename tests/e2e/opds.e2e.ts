import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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

describe('packaged OPDS delivery', () => {
  it('serves real converted books newest-first over a real HTTP server', async () => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), 'mangabound-opds-e2e-'));
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
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [libraryPath] });

    await resetQueue();

    // Convert the folder fixture first, then the CBZ fixture second, so the CBZ's
    // conversion timestamp is deterministically the newest of the two.
    await $('button=Folder').click();
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
    await $('button=Convert 1 item').click();
    await $('h1=1 book saved').waitForDisplayed({ timeout: 120_000 });

    await $('button=Convert more').click();
    await $('h1=Queue').waitForDisplayed();
    await $('button=Files').click();
    await $('span=Ready').waitForDisplayed({ timeout: 30_000 });
    await $('button=Validate plan').click();
    await $('h2=Plan validated').waitForDisplayed({ timeout: 30_000 });
    await $('button=Convert 1 item').click();
    await $('h1=1 book saved').waitForDisplayed({ timeout: 120_000 });

    assert.deepEqual((await readdir(libraryPath)).sort(), [
      '.mangabound',
      'Mangabound Direct.epub',
      'Mangabound E2E - Vol.01.epub',
    ]);

    // Simulates a file placed in the library some other way, never through this app: the
    // catalog (`.mangabound/library.json`) never learns about it (ADR 0020).
    await cp(
      path.join(libraryPath, 'Mangabound Direct.epub'),
      path.join(libraryPath, 'Copied in.epub'),
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
        username: 'reader',
        password: 'hunter2',
      });
      if (!started.ok) throw new Error(started.error.message);
      return started.value;
    });
    const authorization = `Basic ${Buffer.from('reader:hunter2').toString('base64')}`;

    try {
      assert.ok(sharingStatus.url !== undefined);
      const { url } = sharingStatus;

      const navResponse = await fetch(`${url}/`, { headers: { Authorization: authorization } });
      assert.equal(navResponse.status, 200);
      assert.match(navResponse.headers.get('content-type') ?? '', /kind=navigation/u);
      assert.match(await navResponse.text(), /kind=acquisition/u);

      const unauthorized = await fetch(`${url}/recent`);
      assert.equal(unauthorized.status, 401);

      const recentResponse = await fetch(`${url}/recent`, {
        headers: { Authorization: authorization },
      });
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

      const directHref = `${url}/books/Mangabound%20Direct.epub`;
      assert.ok(
        recentBody.includes(`href="${directHref}" type="application/epub+zip"`),
        'Expected an acquisition link for the direct CBZ conversion with the epub MIME type.',
      );

      const acquisitionResponse = await fetch(directHref, {
        headers: { Authorization: authorization },
      });
      assert.equal(acquisitionResponse.status, 200);
      assert.equal(acquisitionResponse.headers.get('content-type'), 'application/epub+zip');
      const downloaded = Buffer.from(await acquisitionResponse.arrayBuffer());
      const onDisk = await readFile(path.join(libraryPath, 'Mangabound Direct.epub'));
      assert.ok(downloaded.equals(onDisk));

      // The file copied in some other way shows up as "Other files," not "Recently converted."
      assert.ok(
        !recentBody.includes('<title>Copied in</title>'),
        'A loose file must not appear in the tracked feed.',
      );
      const otherResponse = await fetch(`${url}/other`, {
        headers: { Authorization: authorization },
      });
      assert.equal(otherResponse.status, 200);
      const otherBody = await otherResponse.text();
      assert.ok(
        otherBody.includes('<title>Copied in</title>'),
        'Expected the loose file in the untracked feed.',
      );
      assert.ok(
        !otherBody.includes('<title>Mangabound Direct</title>'),
        'A tracked book must not also appear in the untracked feed.',
      );

      const otherHref = `${url}/books/Copied%20in.epub`;
      const otherDownload = await fetch(otherHref, { headers: { Authorization: authorization } });
      assert.equal(otherDownload.status, 200);
      assert.ok(Buffer.from(await otherDownload.arrayBuffer()).equals(onDisk));
    } finally {
      await browser.execute(async () => {
        await window.mangabound?.stopSharing();
      });
    }
  });

  it('records the real author mangapress used, and Unknown for an untracked copy of the same file', async () => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), 'mangabound-opds-author-e2e-'));
    temporaryDirectories.push(testRoot);
    const directCbzPath = path.resolve('tests', 'fixtures', 'e2e', 'cbz', 'Mangabound Direct.cbz');
    const libraryPath = path.join(testRoot, 'library');
    await mkdir(libraryPath);

    const openDialog = await browser.electron.mock('dialog', 'showOpenDialog');
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [directCbzPath] });
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [libraryPath] });
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [libraryPath] });

    await resetQueue();
    await $('button=Files').click();
    await $('span=Ready').waitForDisplayed({ timeout: 30_000 });
    await $('button*=mangapress options').click();
    await $('h1=mangapress options').waitForDisplayed({ timeout: 10_000 });
    await $('#book-author').setValue('A Real Author');
    await $('button=Back').click();
    await $('h1=Queue').waitForDisplayed();
    await chooseOutputFolder(queueOutputFolderButton, libraryPath);
    await $('button=Convert 1 item').click();
    await $('h1=1 book saved').waitForDisplayed({ timeout: 120_000 });

    const savedName = (await readdir(libraryPath)).find((name) => name !== '.mangabound');
    assert.ok(savedName !== undefined, 'Expected exactly one converted book in the library.');
    await cp(
      path.join(libraryPath, savedName),
      path.join(libraryPath, 'Copied without author.epub'),
    );

    const sharingStatus = await browser.execute(async () => {
      const bridge = window.mangabound;
      if (bridge === undefined) throw new Error('window.mangabound is unavailable.');
      const chosen = await bridge.chooseLibrary();
      if (!chosen.ok || chosen.value === null) {
        throw new Error('Could not choose a library to share.');
      }
      const started = await bridge.startSharing(chosen.value.libraryId, '127.0.0.1', {
        username: '',
        password: '',
      });
      if (!started.ok) throw new Error(started.error.message);
      return started.value;
    });

    try {
      assert.ok(sharingStatus.url !== undefined);
      const { url } = sharingStatus;

      const recentBody = await (await fetch(`${url}/recent`)).text();
      assert.match(
        recentBody,
        /<name>A Real Author<\/name>/u,
        'Expected the author set in mangapress options on the tracked entry.',
      );

      const otherBody = await (await fetch(`${url}/other`)).text();
      assert.ok(
        otherBody.includes('<title>Copied without author</title>'),
        'Expected the untracked copy in the "Other files" feed.',
      );
      assert.ok(
        !otherBody.includes('A Real Author'),
        'An untracked copy must not inherit the tracked entry’s author.',
      );
      assert.match(otherBody, /<name>Unknown<\/name>/u);
    } finally {
      await browser.execute(async () => {
        await window.mangabound?.stopSharing();
      });
    }
  });

  it('refuses to start sharing a library whose catalog is corrupt, with a readable message', async () => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), 'mangabound-opds-corrupt-start-'));
    temporaryDirectories.push(testRoot);
    const libraryPath = path.join(testRoot, 'library');
    await mkdir(path.join(libraryPath, '.mangabound'), { recursive: true });
    await writeFile(path.join(libraryPath, '.mangabound', 'library.json'), '{not valid json');

    const openDialog = await browser.electron.mock('dialog', 'showOpenDialog');
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [libraryPath] });

    // The result is returned as a JSON string, not an object: WebdriverIO's client reads a
    // script result carrying a top-level `error` key ({ ok: false, error: {...} } is exactly
    // the shape of a failed WorkflowResult) as a WebDriver error response, fails the command
    // with "[object Object]", and retries it -- by which point the one-shot dialog mock is spent.
    const raw = await browser.execute(async () => {
      const bridge = window.mangabound;
      if (bridge === undefined) throw new Error('window.mangabound is unavailable.');
      const chosen = await bridge.chooseLibrary();
      if (!chosen.ok || chosen.value === null) {
        throw new Error('Could not choose a library to share.');
      }
      const started = await bridge.startSharing(chosen.value.libraryId, '127.0.0.1', {
        username: '',
        password: '',
      });
      return JSON.stringify(started);
    });

    const result = JSON.parse(raw) as { ok: boolean; error?: { code: string; message: string } };
    assert.equal(result.ok, false, 'Expected sharing to be refused for a corrupt catalog.');
    assert.equal(result.error?.code, 'malformed_json');
    assert.equal(result.error.message, 'The output library catalog could not be read.');
    const status = await browser.execute(async () => window.mangabound?.getSharingStatus());
    assert.ok(status?.ok === true && !status.value.active, 'Expected no sharing to be running.');
  });

  it('answers a generic error, not parser text, when the catalog corrupts while sharing', async () => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), 'mangabound-opds-corrupt-live-'));
    temporaryDirectories.push(testRoot);
    const libraryPath = path.join(testRoot, 'library');
    await mkdir(libraryPath);

    const openDialog = await browser.electron.mock('dialog', 'showOpenDialog');
    await openDialog.mockResolvedValueOnce({ canceled: false, filePaths: [libraryPath] });

    // A library with no catalog yet is valid (it reads as empty), so sharing starts fine.
    const sharingStatus = await browser.execute(async () => {
      const bridge = window.mangabound;
      if (bridge === undefined) throw new Error('window.mangabound is unavailable.');
      const chosen = await bridge.chooseLibrary();
      if (!chosen.ok || chosen.value === null) {
        throw new Error('Could not choose a library to share.');
      }
      const started = await bridge.startSharing(chosen.value.libraryId, '127.0.0.1', {
        username: '',
        password: '',
      });
      if (!started.ok) throw new Error(started.error.message);
      return started.value;
    });

    try {
      assert.ok(sharingStatus.url !== undefined);
      const { url } = sharingStatus;

      await mkdir(path.join(libraryPath, '.mangabound'), { recursive: true });
      await writeFile(path.join(libraryPath, '.mangabound', 'library.json'), '{not valid json');

      const response = await fetch(`${url}/recent`);
      assert.equal(response.status, 500);
      const body = await response.text();
      assert.equal(body, 'The catalog could not be read.');
      assert.doesNotMatch(body, /JSON/u);
    } finally {
      await browser.execute(async () => {
        await window.mangabound?.stopSharing();
      });
    }
  });
});
