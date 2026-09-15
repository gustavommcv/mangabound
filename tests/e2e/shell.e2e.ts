import assert from 'node:assert/strict';

import { $, browser } from '@wdio/globals';

describe('packaged application shell', () => {
  it('launches with the packaged CLI binaries verified and ready', async () => {
    assert.equal(await browser.getTitle(), 'Mangabound');
    assert.equal(await $('h1').getText(), 'What are you bringing in?');
    const status = $('section[aria-label="Bundled tool status"]');
    await status.waitForDisplayed();
    assert.match(await status.getText(), /Conversion tools ready/u);
  });
});
