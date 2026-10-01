import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { $, browser } from '@wdio/globals';

const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

describe('packaged application shell', () => {
  it('launches with the packaged CLI binaries verified and ready, saying nothing about it', async () => {
    assert.equal(await browser.getTitle(), 'Mangabound');
    assert.equal(await $('h1').getText(), 'Queue');
    // Verified tools are mandatory, not a status: the queue enables once they are, with no banner.
    await $('button=Files').waitForEnabled();
    assert.equal(await $('section[aria-label="Bundled tool status"]').isExisting(), false);
    // Proves app.getVersion() reaches the title bar through additionalArguments, for real - not
    // just a mocked bridge in a component test.
    assert.equal(await $('header').$(`span=v${version}`).isDisplayed(), true);
  });

  it('returns safe command-specific failures for invalid IPC payloads without side effects', async () => {
    const results = JSON.parse(
      await browser.execute(async () => {
        const bridge = window.mangabound;
        if (bridge === undefined) throw new Error('The app bridge is unavailable.');
        const before = await bridge.listPendingRuns();
        const failures = await Promise.all([
          bridge.convert({} as never),
          bridge.convertLibrary({} as never),
          bridge.saveSettings({} as never),
          bridge.openArtifact(''),
          bridge.saveArtifactAs(''),
          bridge.discardPendingRun(''),
        ]);
        const after = await bridge.listPendingRuns();
        return JSON.stringify({ before, failures, after });
      }),
    ) as {
      before: unknown;
      after: unknown;
      failures: { ok: boolean; error: { code: string; message: string } }[];
    };
    assert.deepEqual(results.after, results.before);
    assert.equal(results.failures.length, 6);
    assert.ok(results.failures.every((result) => !result.ok));
    assert.deepEqual(
      results.failures.map((result) => result.error.code),
      [
        'invalid_request',
        'invalid_request',
        'invalid_request',
        'invalid_request',
        'save_failed',
        'pending_delete_failed',
      ],
    );
    for (const result of results.failures) {
      assert.doesNotMatch(result.error.message, /ZodError|stack|TypeError/u);
    }
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
          barLine: getComputedStyle(bar).borderBottomWidth,
          scrollerLine: getComputedStyle(scroller).borderTopWidth,
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
      barLine: string;
      scrollerLine: string;
      scrolled: number;
      windowScrolled: number;
    };

    assert.equal(measured.found, true, 'the bar should be followed by the part that scrolls');
    assert.equal(measured.barTop, 0, 'the bar stays at the top of the window');
    assert.ok(measured.barHeight >= 40, 'the bar keeps its height');
    // The window's buttons cover the whole height of the bar, so the line under it is not the bar's.
    assert.equal(measured.barLine, '0px', 'the bar draws no line that its buttons could cover');
    assert.equal(measured.scrollerLine, '1px', "the line under the bar is the scrolling part's");
    assert.ok(measured.scrolled > 0, 'the part under the bar is what scrolls');
    assert.equal(measured.windowScrolled, 0, 'the window itself does not scroll');
  });

  it('has one scrollbar when single-book options make the queue taller than the window', async () => {
    await $('#combine-into-one-volume').click();
    const measured = JSON.parse(
      await browser.execute(() => {
        const bar = document.querySelector('header.window-titlebar');
        const scroller = bar?.nextElementSibling;
        const scrollables = Array.from(document.querySelectorAll('*'))
          .filter((element): element is HTMLElement => element instanceof HTMLElement)
          .filter((element) => {
            const overflow = getComputedStyle(element).overflowY;
            return (
              (overflow === 'auto' || overflow === 'scroll') &&
              element.scrollHeight - element.clientHeight > 1
            );
          })
          .map((element) => ({
            tag: element.tagName,
            className: element.className,
            left: element.getBoundingClientRect().left,
            right: element.getBoundingClientRect().right,
            range: element.scrollHeight - element.clientHeight,
          }));
        return JSON.stringify({
          viewportWidth: window.innerWidth,
          documentOverflow: getComputedStyle(document.documentElement).overflowY,
          bodyOverflow: getComputedStyle(document.body).overflowY,
          contentRange:
            scroller instanceof HTMLElement ? scroller.scrollHeight - scroller.clientHeight : -1,
          scrollables,
        });
      }),
    ) as {
      viewportWidth: number;
      documentOverflow: string;
      bodyOverflow: string;
      contentRange: number;
      scrollables: readonly {
        tag: string;
        className: string;
        left: number;
        right: number;
        range: number;
      }[];
    };
    assert.ok(measured.contentRange > 0, JSON.stringify(measured));
    assert.equal(measured.documentOverflow, 'hidden', JSON.stringify(measured));
    assert.equal(measured.bodyOverflow, 'hidden', JSON.stringify(measured));
    assert.equal(measured.scrollables.length, 1, JSON.stringify(measured));
    assert.equal(measured.scrollables[0]?.right, measured.viewportWidth, JSON.stringify(measured));
    await $('#combine-into-one-volume').click();
  });

  it('has only the content area scroll on the long options page', async () => {
    await $('button=Advanced conversion options').click();
    await $('h1=Conversion options').waitForDisplayed();
    assert.equal(await $('#jpeg-quality').getAttribute('placeholder'), '85%');
    assert.equal(await $('#gamma').getAttribute('placeholder'), '1.0');
    assert.equal(await $('#custom-width').getAttribute('placeholder'), '1272');
    await $('#device-profile').selectByAttribute('value', 'KS');
    assert.equal(await $('#jpeg-quality').getAttribute('placeholder'), '90%');
    assert.equal(await $('#custom-width').getAttribute('placeholder'), '1860');
    await $('#device-profile').selectByAttribute('value', 'KPW6');

    const measured = JSON.parse(
      await browser.execute(() => {
        const bar = document.querySelector('header.window-titlebar');
        const scroller = bar?.nextElementSibling;
        return JSON.stringify({
          documentRange: document.documentElement.scrollHeight - window.innerHeight,
          bodyRange: document.body.scrollHeight - window.innerHeight,
          contentRange:
            scroller instanceof HTMLElement ? scroller.scrollHeight - scroller.clientHeight : -1,
        });
      }),
    ) as { documentRange: number; bodyRange: number; contentRange: number };

    assert.ok(
      measured.contentRange > 0,
      `the options content must scroll: ${JSON.stringify(measured)}`,
    );
    assert.ok(
      measured.documentRange <= 1,
      `the document must not scroll: ${JSON.stringify(measured)}`,
    );
    assert.ok(measured.bodyRange <= 1, `the body must not scroll: ${JSON.stringify(measured)}`);
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
