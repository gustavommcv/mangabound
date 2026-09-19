import { expect, test } from '@playwright/test';

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

test('joining volumes only remains visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-queue--join-only&viewMode=story');
  await expect(page.getByRole('button', { name: /^Join \d+ items?$/ })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('queue-join-only.png');
});

test('validated plan remains visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-queue--plan-validated&viewMode=story');
  await expect(page.getByRole('heading', { name: 'Plan validated' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('queue-plan-validated.png');
});

test('a running item remains visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-single-input--progress&viewMode=story');
  await expect(page.getByRole('heading', { name: 'Converting A Quiet Journey' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('running.png');
});

test('saved books with the KOReader card remain visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-results--saved-and-sharing&viewMode=story');
  await expect(page.getByRole('heading', { name: '3 books saved' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('results-saved-sharing.png');
});

test('results with something left out remain visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-results--saved-with-something-skipped&viewMode=story');
  await expect(page.getByText('Random scans was skipped')).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('results-skipped.png');
});

test('full output settings remain visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-output-settings--normal&viewMode=story');
  await expect(page.getByRole('heading', { name: 'Device & output' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('output-settings.png');
});

test('batch review remains visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-single-input--batch-review-story&viewMode=story');
  await expect(page.getByRole('heading', { name: 'Convert Winter Reading Library' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('batch-review.png');
});

test('External API suggestions remain visually consistent', async ({ page }) => {
  await page.goto(
    '/iframe.html?id=workflows-mapping-editor--with-metadata-suggestions&viewMode=story',
  );
  await expect(page.getByRole('button', { name: 'Use this' }).first()).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('mapping-editor-suggestions.png');
});

test('the share panel remains visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-share-panel--ready-to-start&viewMode=story');
  await expect(page.getByRole('heading', { name: 'Share via OPDS' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('share-panel.png');
});

test('the process steps remain visually consistent', async ({ page }) => {
  await page.goto(
    '/iframe.html?id=workflows-process-steps--library-is-always-grouped&viewMode=story',
  );
  await expect(page.getByRole('checkbox', { name: 'Group chapters into volumes' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('process-steps.png');
});
