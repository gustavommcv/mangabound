import { $, browser } from '@wdio/globals';

/**
 * The output-folder button on the queue screen, however it is labelled at the time ("Choose" before
 * a folder is picked, "Change" after). The visible text is only "Choose" or "Change", so it is found
 * by its accessible name.
 */
export const queueOutputFolderButton = 'button[aria-label$="output folder"]';

/**
 * Clicks one of the output-folder buttons and waits until the app is actually showing the folder
 * the mocked dialog returned.
 *
 * chooseLibrary() is asynchronous (an IPC round trip through the dialog before the library state
 * updates) and click() only confirms the click was dispatched, so the next step can otherwise run
 * against the previously chosen library: the app reports its books saved while the folder the test
 * is watching stays empty.
 *
 * The wait matches the full path exactly. A partial match on a word like "output" is already
 * satisfied by unrelated helper text ("Used for EPUB output."), which makes the wait a no-op.
 */
export async function chooseOutputFolder(
  buttonSelector: string,
  libraryPath: string,
): Promise<void> {
  await $(buttonSelector).click();
  await $(`p=${libraryPath}`).waitForDisplayed({ timeout: 10_000 });
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
