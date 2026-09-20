import { expect, test } from '@playwright/test';

// The queue and the results are two panes in a window as wide as the app opens at (1180px) and stack
// below 1024px, so they are captured at the size the app itself opens at, not the narrower default.
test.describe('at the size the window opens at', () => {
  test.use({ viewport: { height: 760, width: 1180 } });

  test('the empty queue remains visually consistent', async ({ page }) => {
    await page.goto('/iframe.html?id=workflows-queue--empty&viewMode=story');
    await expect(page.getByRole('heading', { name: 'Queue' })).toBeVisible();
    await page.evaluate(async () => document.fonts.ready);
    await expect(page.locator('#storybook-root')).toHaveScreenshot('queue-empty.png');
  });

  test('a queue with items in every state remains visually consistent', async ({ page }) => {
    await page.goto('/iframe.html?id=workflows-queue--with-items&viewMode=story');
    await expect(page.getByRole('heading', { name: 'Queue' })).toBeVisible();
    await page.evaluate(async () => document.fonts.ready);
    await expect(page.locator('#storybook-root')).toHaveScreenshot('queue-with-items.png');
  });

  test('a library in the queue remains visually consistent', async ({ page }) => {
    await page.goto('/iframe.html?id=workflows-queue--with-library&viewMode=story');
    await expect(page.getByText('Library · 3 titles · 3 volumes')).toBeVisible();
    await page.evaluate(async () => document.fonts.ready);
    await expect(page.locator('#storybook-root')).toHaveScreenshot('queue-with-library.png');
  });

  test('joining volumes only remains visually consistent', async ({ page }) => {
    await page.goto('/iframe.html?id=workflows-queue--join-only&viewMode=story');
    await expect(page.getByRole('button', { name: /^Join \d+ items?$/ })).toBeVisible();
    await page.evaluate(async () => document.fonts.ready);
    await expect(page.locator('#storybook-root')).toHaveScreenshot('queue-join-only.png');
  });

  test('a queue whose options were changed remains visually consistent', async ({ page }) => {
    await page.goto('/iframe.html?id=workflows-queue--options-changed&viewMode=story');
    await expect(page.getByRole('button', { name: 'Reset to defaults' })).toBeVisible();
    await page.evaluate(async () => document.fonts.ready);
    await expect(page.locator('#storybook-root')).toHaveScreenshot('queue-options-changed.png');
  });

  test('validated plan remains visually consistent', async ({ page }) => {
    await page.goto('/iframe.html?id=workflows-queue--plan-validated&viewMode=story');
    await expect(page.getByRole('heading', { name: 'Plan validated' })).toBeVisible();
    await page.evaluate(async () => document.fonts.ready);
    await expect(page.locator('#storybook-root')).toHaveScreenshot('queue-plan-validated.png');
  });

  test('saved books with the KOReader card remain visually consistent', async ({ page }) => {
    await page.goto('/iframe.html?id=workflows-results--saved-and-sharing&viewMode=story');
    await expect(page.getByRole('heading', { name: '3 books saved' })).toBeVisible();
    await page.evaluate(async () => document.fonts.ready);
    await expect(page.locator('#storybook-root')).toHaveScreenshot('results-saved-sharing.png');
  });

  test('results with something left out remain visually consistent', async ({ page }) => {
    await page.goto(
      '/iframe.html?id=workflows-results--saved-with-something-skipped&viewMode=story',
    );
    await expect(page.getByText('Random scans was skipped')).toBeVisible();
    await page.evaluate(async () => document.fonts.ready);
    await expect(page.locator('#storybook-root')).toHaveScreenshot('results-skipped.png');
  });
});

test('a queue that has stacked below the two-pane width remains visually consistent', async ({
  page,
}) => {
  await page.goto('/iframe.html?id=workflows-queue--with-items&viewMode=story');
  await expect(page.getByRole('heading', { name: 'Queue' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('queue-narrow.png');
});

test('a running item remains visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-run-and-errors--progress&viewMode=story');
  await expect(page.getByRole('heading', { name: 'Converting A Quiet Journey' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('running.png');
});

test('the titles of a library remain visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-library-titles--every-state&viewMode=story');
  await expect(page.getByRole('heading', { name: 'Manga Library' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('library-titles.png');
});

test('full output settings remain visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-output-settings--normal&viewMode=story');
  await expect(page.getByRole('heading', { name: 'Device & output' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('output-settings.png');
});

test('an online source with its results remains visually consistent', async ({ page }) => {
  await page.goto(
    '/iframe.html?id=workflows-mapping-editor--with-metadata-suggestions&viewMode=story',
  );
  await expect(page.getByRole('button', { name: 'Use these volumes' }).first()).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('mapping-editor-suggestions.png');
});

test('the list of online sources remains visually consistent', async ({ page }) => {
  await page.goto(
    '/iframe.html?id=workflows-mapping-editor--online-source-list-open&viewMode=story',
  );
  await expect(page.getByRole('option', { name: /MangaDex/u })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('online-source-list.png');
});

test('the share panel remains visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-share-panel--ready-to-start&viewMode=story');
  await expect(page.getByRole('heading', { name: 'Share via OPDS' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('share-panel.png');
});

test('the question before options are reset remains visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-reset-options--asking-to-confirm&viewMode=story');
  await expect(page.getByRole('group', { name: 'Confirm reset' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('reset-options-confirm.png');
});

test('the notices remain visually consistent', async ({ page }) => {
  await page.goto(
    '/iframe.html?id=workflows-notices--saved-settings-could-not-be-used&viewMode=story',
  );
  await expect(page.getByRole('status', { name: 'Notices' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('notices.png');
});

test('the process steps remain visually consistent', async ({ page }) => {
  await page.goto(
    '/iframe.html?id=workflows-process-steps--library-is-always-grouped&viewMode=story',
  );
  await expect(page.getByRole('checkbox', { name: 'Group chapters into volumes' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('process-steps.png');
});
