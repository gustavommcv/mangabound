import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

import { $, browser } from '@wdio/globals';

/**
 * Reads the first entry of a zip file (an EPUB or CBZ is one) whose name satisfies `matches`, as
 * text. The end-to-end suite has no zip library, and the entries it looks at are small.
 */
export async function readZipEntry(
  filePath: string,
  matches: (name: string) => boolean,
): Promise<string> {
  return (await readZipEntryBytes(filePath, matches)).toString('utf8');
}

/** The same entry as it is stored, for the ones that are not text: an image. */
export async function readZipEntryBytes(
  filePath: string,
  matches: (name: string) => boolean,
): Promise<Buffer> {
  const zip = await readFile(filePath);
  // The end-of-central-directory record is the last 22 bytes unless a comment follows it.
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error(`${filePath} is not a zip file.`);
  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  for (let index = 0; index < count; index += 1) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error(`${filePath} is corrupt.`);
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.toString('utf8', offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;
    if (!matches(name)) continue;
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const localExtraLength = zip.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const data = zip.subarray(start, start + compressedSize);
    if (method === 0) return Buffer.from(data);
    if (method === 8) return inflateRawSync(data);
    throw new Error(`${name} uses compression method ${String(method)}, which is not supported.`);
  }
  throw new Error(`${filePath} has no entry that matched.`);
}

/** Save a single ready book through the real Save As handler and a mocked native picker. */
export async function saveBookAs(name: string, filePath: string): Promise<void> {
  const saveDialog = await browser.electron.mock('dialog', 'showSaveDialog');
  await saveDialog.mockResolvedValueOnce({ canceled: false, filePath });
  await $(`button[aria-label="Save ${name} as"]`).click();
  await browser.waitUntil(() => existsSync(filePath), {
    timeout: 30_000,
    timeoutMsg: `${name} was not exported to ${filePath}.`,
  });
  // The file appears first; the folder's catalog and the saved-state record follow, and the row
  // says "Saved" only after both. A test that lists the folder next has to wait for that.
  await browser.waitUntil(
    () =>
      browser.execute((bookName: string) => {
        const rows = Array.from(document.querySelectorAll('ul[aria-label="Ready books"] li'));
        const row = rows.find((item) => item.querySelector('p')?.textContent === bookName);
        return row?.textContent.includes(' · Saved') === true;
      }, name),
    { timeout: 30_000, timeoutMsg: `${name} was exported but not marked saved.` },
  );
}

/**
 * Waits until a folder holds exactly these names. A save stages a hidden `.tmp` copy beside the
 * book, links it to the book's name and only then removes it, so one look at the folder in the
 * middle of a save can see the temporary file as an entry of its own: a count of entries is not
 * the end of a save, the names are. A timeout reports what the folder held and what the app showed.
 */
export async function waitForFolderNames(
  directory: string,
  expected: readonly string[],
  options: {
    readonly timeout?: number;
    readonly describeAppState?: () => Promise<string>;
  } = {},
): Promise<void> {
  const wanted = [...expected].sort();
  const deadline = Date.now() + (options.timeout ?? 30_000);
  for (;;) {
    const names = (await readdir(directory)).sort();
    if (names.length === wanted.length && names.every((name, index) => name === wanted[index])) {
      return;
    }
    if (Date.now() >= deadline) {
      // A bare timeout says nothing about why, so the failure carries what was there instead.
      const shown = await options
        .describeAppState?.()
        .catch(() => '(the page text was unavailable)');
      throw new Error(
        `Timed out waiting for ${wanted.join(', ')} in ${directory}. ` +
          `Found: ${names.join(', ') || '(nothing)'}.` +
          (shown === undefined ? '' : `\nThe app showed:\n${shown}`),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** The caller queues the native folder-dialog response after its input picker responses. */
export async function saveAllBooks(): Promise<void> {
  await $('button=Save all to folder…').click();
  await browser.waitUntil(
    () =>
      browser.execute(() => {
        const rows = Array.from(document.querySelectorAll('ul[aria-label="Ready books"] li'));
        return (
          rows.length > 0 && rows.every((row) => row.textContent.includes(' · Saved') === true)
        );
      }),
    { timeout: 30_000, timeoutMsg: 'The ready books were not all marked saved.' },
  );
}

/**
 * Sets the two step checkboxes to the wanted state whatever they are now: the choice is kept for
 * the rest of the session, so an earlier test may have left one of them off.
 */
export async function setSteps(steps: {
  readonly group: boolean;
  readonly convert: boolean;
}): Promise<void> {
  const wanted = [
    { selector: '#step-group', on: steps.group },
    { selector: '#step-convert', on: steps.convert },
  ];
  // Steps are turned on before any is turned off: the last one standing cannot be switched off.
  for (const turningOn of [true, false]) {
    for (const { selector, on } of wanted) {
      if (on !== turningOn) continue;
      const box = $(selector);
      if ((await box.getAttribute('aria-checked')) === String(on)) continue;
      await box.click();
      await browser.waitUntil(async () => (await box.getAttribute('aria-checked')) === String(on), {
        timeout: 10_000,
        timeoutMsg: `${selector} did not become ${on ? 'checked' : 'unchecked'}.`,
      });
    }
  }
}

/**
 * Brings the app back to an empty queue, whatever an earlier test left on screen: the results of a
 * run, a library review, or rows that were left over.
 */
export async function resetQueue(): Promise<void> {
  const convertMore = $('button=Convert more');
  const back = $('button=Back');
  if (await convertMore.isExisting()) {
    await convertMore.click();
  } else if (await back.isExisting()) {
    await back.click();
  }
  await $('h1=Queue').waitForDisplayed({ timeout: 30_000 });
  const clear = $('button=Clear');
  if (await clear.isExisting()) {
    await clear.click();
    await clear.waitForExist({ reverse: true, timeout: 10_000 });
  }
}

/** What the main process tells the window while a run goes on. */
export interface ReportedProgress {
  readonly jobId: string;
  readonly stage: string;
  readonly title?: string;
  readonly message: string;
  readonly completed?: number;
  readonly total?: number;
}

/**
 * Starts keeping what the main process tells the window as it arrives: the screen shows it for a
 * moment, so a run is read from what was kept once it is over (`reportedProgress`).
 */
export async function recordProgress(): Promise<void> {
  await browser.execute(() => {
    const seen: unknown[] = [];
    Reflect.set(window, 'progressSeen', seen);
    window.mangabound?.onConversionProgress((progress) => seen.push(progress));
  });
}

export function reportedProgress(): Promise<readonly ReportedProgress[]> {
  return browser.execute(() => Reflect.get(window, 'progressSeen') as readonly ReportedProgress[]);
}
