import assert from 'node:assert/strict';

import { $, browser } from '@wdio/globals';

// Half of a 1366px screen, less what a tiling window manager keeps for its gaps.
const halfScreen = 640;

describe('packaged application beside another window', () => {
  let opensAt: number[] = [];

  before(async () => {
    opensAt = await browser.electron.execute(
      (electron) => electron.BrowserWindow.getAllWindows()[0]?.getSize() ?? [],
    );
  });

  after(async () => {
    const [width = 1180, height = 760] = opensAt;
    await browser.electron.execute(
      (electron, toWidth: number, toHeight: number) => {
        electron.BrowserWindow.getAllWindows()[0]?.setSize(toWidth, toHeight);
      },
      width,
      height,
    );
  });

  it('can be as narrow as half of a small laptop screen', async () => {
    // A tiled window is not allowed under its minimum, so a larger one is drawn past the edge of
    // the screen: the minimum is what decides whether the app fits beside another window.
    const [minimumWidth = 0] = await browser.electron.execute(
      (electron) => electron.BrowserWindow.getAllWindows()[0]?.getMinimumSize() ?? [],
    );
    assert.ok(
      minimumWidth > 0 && minimumWidth <= halfScreen,
      `the window cannot be narrower than ${String(minimumWidth)}px`,
    );
  });

  it('fits in that width, and its Share panel stays inside the bar of the window', async () => {
    await browser.electron.execute((electron, width: number) => {
      electron.BrowserWindow.getAllWindows()[0]?.setSize(width, 700);
    }, halfScreen);
    await browser.waitUntil(async () => (await browser.execute(() => innerWidth)) <= halfScreen, {
      timeoutMsg: 'the window did not take the narrow width',
    });
    await $('h1=Queue').waitForDisplayed();
    const sideways = await browser.execute(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    assert.ok(sideways <= 0, `the page is ${String(sideways)}px wider than the window`);

    await $('header').$('button=Share').click();
    const panel = $('[role="dialog"][aria-labelledby="share-title"]');
    await panel.waitForDisplayed();
    const measured = await browser.execute(() => {
      const box = document
        .querySelector('[role="dialog"][aria-labelledby="share-title"]')
        ?.getBoundingClientRect();
      // The part of the bar the window's own buttons leave free: the panel hangs from its right
      // edge, so it must not reach under the buttons or past the left edge of the window.
      const area = (
        navigator as Navigator & {
          windowControlsOverlay?: { getTitlebarAreaRect: () => DOMRect };
        }
      ).windowControlsOverlay?.getTitlebarAreaRect();
      return {
        left: box?.left ?? Number.NaN,
        right: box?.right ?? Number.NaN,
        areaRight: area === undefined ? innerWidth : area.x + area.width,
      };
    });
    assert.ok(measured.left >= 0, `the panel starts ${String(measured.left)}px from the left edge`);
    assert.ok(
      measured.right <= measured.areaRight + 1,
      `the panel ends at ${String(measured.right)}px, past the ${String(measured.areaRight)}px the bar leaves free`,
    );
    await $('button[aria-label="Close sharing"]').click();
  });
});
