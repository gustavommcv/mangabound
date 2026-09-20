import assert from 'node:assert/strict';

import { $, browser } from '@wdio/globals';

describe('packaged application shell', () => {
  it('launches with the packaged CLI binaries verified and ready', async () => {
    assert.equal(await browser.getTitle(), 'Mangabound');
    assert.equal(await $('h1').getText(), 'Queue');
    const status = $('section[aria-label="Bundled tool status"]');
    await status.waitForDisplayed();
    assert.match(await status.getText(), /Conversion tools ready/u);
  });

  it('keeps the title bar in place while the page under it scrolls', async () => {
    // The page is made taller than the window, and the part under the bar is scrolled.
    const measured = JSON.parse(
      await browser.execute(() => {
        const bar = document.querySelector('header.window-titlebar');
        const scroller = bar?.nextElementSibling;
        if (!(bar instanceof HTMLElement) || !(scroller instanceof HTMLElement)) {
          return JSON.stringify({ found: false });
        }
        const filler = document.createElement('div');
        filler.style.height = '4000px';
        scroller.appendChild(filler);
        scroller.scrollTop = 600;
        const result = {
          found: true,
          barTop: bar.getBoundingClientRect().top,
          barHeight: bar.getBoundingClientRect().height,
          scrolled: scroller.scrollTop,
          windowScrolled: document.documentElement.scrollTop,
        };
        filler.remove();
        return JSON.stringify(result);
      }),
    ) as {
      found: boolean;
      barTop: number;
      barHeight: number;
      scrolled: number;
      windowScrolled: number;
    };

    assert.equal(measured.found, true, 'the bar should be followed by the part that scrolls');
    assert.equal(measured.barTop, 0, 'the bar stays at the top of the window');
    assert.ok(measured.barHeight >= 40, 'the bar keeps its height');
    assert.ok(measured.scrolled > 0, 'the part under the bar is what scrolls');
    assert.equal(measured.windowScrolled, 0, 'the window itself does not scroll');
  });

  it('opens the share panel from the title bar, and Escape puts it away', async () => {
    const share = $('header').$('button=Share');
    await share.click();
    const panel = $('[role="dialog"]');
    await panel.waitForDisplayed({ timeout: 10_000 });
    assert.equal(await panel.$('h2').getText(), 'Share to your e-reader');

    await browser.keys('Escape');

    await panel.waitForExist({ reverse: true, timeout: 10_000 });
    const focused = await browser.execute(() => document.activeElement?.textContent ?? '');
    assert.match(focused, /Share/u, 'focus returns to the Share button');
  });
});
