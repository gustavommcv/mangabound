import { expect, test } from '@playwright/test';

test('single-input start remains visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-single-input--start&viewMode=story');
  await expect(page.getByRole('heading', { name: 'What are you bringing in?' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('single-input-start.png');
});

test('completed artifacts remain visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-single-input--success&viewMode=story');
  await expect(page.getByRole('heading', { name: '2 books saved' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('single-input-success.png');
});

test('full output settings remain visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-output-settings--normal&viewMode=story');
  await expect(page.getByRole('heading', { name: 'Device & output' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('output-settings.png');
});

test('validated plan remains visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-single-input--validated-plan&viewMode=story');
  await expect(page.getByRole('heading', { name: 'Plan validated' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('validated-plan.png');
});

test('batch review remains visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-single-input--batch-review-story&viewMode=story');
  await expect(page.getByRole('heading', { name: 'Convert Winter Reading Library' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('batch-review.png');
});

test('MangaDex suggestions remain visually consistent', async ({ page }) => {
  await page.goto(
    '/iframe.html?id=workflows-mapping-editor--with-metadata-suggestions&viewMode=story',
  );
  await expect(page.getByRole('button', { name: 'Use this' }).first()).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('mapping-editor-suggestions.png');
});
