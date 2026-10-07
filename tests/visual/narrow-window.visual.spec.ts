import { expect, test } from '@playwright/test';

// The narrowest the window can be made (minWidth in src/main/window.ts). A tiling window manager
// that puts the app beside a reader on a 1366px screen gives it about half of it.
const narrowest = 480;

test.use({ viewport: { height: 700, width: narrowest } });

const storyUrl = (id: string): string => `/iframe.html?id=${id}&viewMode=story`;

// One story for each screen of the app and for each piece that lays itself out on its own: the
// widest state of each, so a row or a form that stops fitting is found. Loading a story costs about
// two seconds, which is why this is not every story.
const screens = [
  'shell-title-bar--while-sharing',
  'workflows-queue--empty',
  'workflows-queue--with-items',
  'workflows-queue--plan-validated',
  'workflows-queue--ready-books-confirm-delete',
  'workflows-queue--some-items-not-added',
  'workflows-conversion-options--normal',
  'workflows-mapping-editor--online-source-list-open',
  'workflows-mapping-editor--needs-attention',
  'workflows-library-titles--every-state',
  'workflows-book-details--with-covers',
  'workflows-book-details--finding-the-author',
  'workflows-running--multiple-volumes',
  'workflows-results--saved-and-sharing',
  'workflows-results--with-warnings',
  'workflows-share-menu--open-while-sharing',
  'workflows-share-panel--ready-to-start',
] as const;

// Measures with the page, not a screenshot: nothing here is a baseline, so the check holds on any
// machine.
test('no screen needs to scroll sideways in the narrowest window', async ({ page }) => {
  test.setTimeout(screens.length * 10_000);
  const wider: string[] = [];
  for (const id of screens) {
    await page.goto(storyUrl(id));
    await page.waitForSelector('body.sb-show-main');
    await page.evaluate(async () => document.fonts.ready);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 0) wider.push(`${id} is ${String(overflow)}px wider than the window`);
  }
  expect(wider).toEqual([]);
});

test('a queued item keeps its whole name when its buttons do not fit beside it', async ({
  page,
}) => {
  await page.goto(storyUrl('workflows-queue--with-items'));
  const items = page.getByRole('list', { name: 'Queued items' }).getByRole('listitem');
  await expect(items).toHaveCount(5);
  const clipped = await items.evaluateAll((rows) =>
    rows
      .map((row) => row.querySelector('p.truncate'))
      .filter((name): name is Element => name !== null)
      .filter((name) => name.scrollWidth > name.clientWidth)
      .map((name) => name.textContent),
  );
  expect(clipped).toEqual([]);
  // What the item can be told to do is still all there, below its name.
  const remove = page.getByRole('button', { name: 'Remove Chainsaw Man' });
  await expect(remove).toBeVisible();
  const box = await remove.boundingBox();
  expect(box === null ? Infinity : box.x + box.width).toBeLessThanOrEqual(narrowest);
});
