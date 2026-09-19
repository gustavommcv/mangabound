import { $ } from '@wdio/globals';

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
