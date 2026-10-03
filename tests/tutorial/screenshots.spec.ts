import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';

const directory = path.resolve('website/src/assets/tutorial/generated');
const captures: {
  name: string;
  story: string;
  width: number;
  height: number;
  pixelRatio: number;
}[] = [];

test.beforeAll(async () => {
  await mkdir(directory, { recursive: true });
});

test.afterAll(async () => {
  await writeFile(
    path.join(directory, 'capture.json'),
    JSON.stringify(
      {
        commit:
          process.env.GITHUB_SHA ?? execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(),
        captures,
      },
      null,
      2,
    ) + '\n',
  );
});

async function openStory(page: Page, story: string): Promise<void> {
  await page.goto(`/iframe.html?id=${story}&viewMode=story`);
  await expect(page.locator('#storybook-root')).toBeVisible();
}

async function capture(page: Page, name: string, story: string, region?: Locator): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    // Documentation illustrates mouse use; keyboard-focus behavior stays tested separately.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  const target = region ?? page.locator('#storybook-root');
  const bounds = await target.boundingBox();
  if (bounds === null) throw new Error(`Tutorial region is not visible: ${name}`);
  const pixelRatio = await page.evaluate(() => window.devicePixelRatio);
  expect(pixelRatio).toBeGreaterThanOrEqual(2);
  const screenshot = await target.screenshot({
    animations: 'disabled',
    caret: 'hide',
    path: path.join(directory, `${name}.png`),
    scale: 'device',
  });
  const { width, height } = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  }, screenshot.toString('base64'));
  // Element screenshots round both CSS edges before applying device pixel density.
  const edgeRounding = 2 * pixelRatio;
  expect(Math.abs(width - bounds.width * pixelRatio)).toBeLessThanOrEqual(edgeRounding);
  expect(Math.abs(height - bounds.height * pixelRatio)).toBeLessThanOrEqual(edgeRounding);
  captures.push({ name, story, width, height, pixelRatio });
}

test('the queue illustrates a chapter folder, a library and a complete CBZ', async ({ page }) => {
  const story = 'workflows-queue--tutorial-inputs';
  await openStory(page, story);
  await expect(page.getByRole('list', { name: 'Queued items' }).getByRole('listitem')).toHaveCount(
    3,
  );
  await expect(page.getByRole('button', { name: 'Folder', exact: true })).toBeVisible();
  await capture(page, 'queue-inputs', story, page.locator('#storybook-root section').first());
});

test('manual mapping starts offline and shows actual chapter assignment', async ({ page }) => {
  const story = 'workflows-mapping-editor--manual-with-online-option';
  await openStory(page, story);
  await expect(page.getByRole('tab', { name: 'Manual', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Create first volume' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create first volume' })).toHaveText(
    'Create volume 1',
  );
  await capture(page, 'manual-mapping-start', story);
  await page.getByRole('button', { name: 'Create first volume' }).click();
  await page
    .getByRole('checkbox', { name: 'Select Chapter 1 — The Long Way Home', exact: true })
    .check();
  await page
    .getByRole('checkbox', { name: 'Select Chapter 2 — A Door Left Open', exact: true })
    .check();
  await page.getByRole('button', { name: 'Assign selected', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Chapters', exact: true })
      .locator('span')
      .filter({ hasText: /^Volume 1$/u }),
  ).toHaveCount(2);
  await capture(page, 'manual-mapping', story);
});

test('online mapping shows a search and the reviewed suggestion', async ({ page }) => {
  const story = 'workflows-mapping-editor--with-metadata-suggestions';
  await openStory(page, story);
  await expect(page.getByRole('button', { name: 'Use these volumes', exact: true })).toHaveCount(2);
  await capture(page, 'online-mapping-search', story);
  await page.getByRole('button', { name: 'Use these volumes', exact: true }).first().click();
  await expect(page.getByRole('region', { name: 'Proposed chapter mapping' })).toBeVisible();
  await capture(page, 'online-mapping', story);
});

test('custom dimensions are real controlled fields, not an edited image', async ({ page }) => {
  const story = 'workflows-conversion-options--normal';
  await openStory(page, story);
  await expect(
    page.getByRole('heading', { name: 'Conversion options', exact: true }),
  ).toBeFocused();
  await page.getByLabel(/^Custom width/u).fill('1440');
  await page.getByLabel(/^Custom height/u).fill('1920');
  await expect(page.getByLabel(/^Custom width/u)).toHaveValue('1440');
  await expect(page.getByLabel(/^Custom height/u)).toHaveValue('1920');
  await capture(
    page,
    'device-settings',
    story,
    page.getByLabel('Device profile').locator('xpath=ancestor::section[1]'),
  );
});

test('single-book mode visibly locks the coupled process choices', async ({ page }) => {
  const story = 'workflows-queue--single-book-active';
  await openStory(page, story);
  await expect(
    page.getByRole('checkbox', { name: 'Create one book for the series' }),
  ).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Group chapters into volumes', exact: true }),
  ).toBeDisabled();
  await capture(
    page,
    'single-book',
    story,
    page.getByRole('complementary', { name: 'Conversion options' }),
  );
});

test('progress details show completed, converting and saving volumes', async ({ page }) => {
  const story = 'workflows-running--multiple-volumes';
  await openStory(page, story);
  await expect(page.getByRole('region', { name: 'Volume details' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hide details' })).toBeVisible();
  await capture(page, 'processing-details', story, page.locator('#storybook-root section').first());
});

test('results show repeatable saving and sharing without a focus outline', async ({ page }) => {
  const story = 'workflows-results--saved';
  await openStory(page, story);
  await expect(page.getByRole('heading', { name: '3 books ready' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Save all to folder…', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share these books', exact: true })).toBeVisible();
  await capture(page, 'save-results', story, page.locator('#storybook-root section').first());
  await expect(page.getByRole('heading', { name: '3 books ready' })).not.toBeFocused();
});

test('ready books expose reopening and safe deletion', async ({ page }) => {
  const story = 'workflows-queue--ready-books';
  await openStory(page, story);
  await expect(page.getByRole('button', { name: 'View books from Vol.01.epub' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Delete pending books from Vol.01.epub' }),
  ).toBeVisible();
  await capture(page, 'ready-books', story, page.getByRole('region', { name: 'Earlier books' }));
});

test('sharing explains the interface and then the catalog address', async ({ page }) => {
  const setup = 'workflows-share-panel--ready-to-start';
  await openStory(page, setup);
  await expect(page.getByRole('combobox', { name: 'Network interface' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start sharing' })).toBeEnabled();
  await capture(
    page,
    'share-setup',
    setup,
    page.getByRole('region', { name: 'Share to your e-reader' }),
  );
  const active = 'workflows-share-panel--tutorial-sharing';
  await openStory(page, active);
  await expect(page.getByLabel('Catalog address')).toHaveValue('http://192.168.1.20:48123');
  await expect(page.getByRole('button', { name: 'Stop sharing' })).toBeVisible();
  await capture(
    page,
    'share-panel',
    active,
    page.getByRole('region', { name: 'Share to your e-reader' }),
  );
});
