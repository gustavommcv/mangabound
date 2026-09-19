import { expect, test } from '@playwright/test';

test('mapping editor remains visually consistent', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.goto('/iframe.html?id=workflows-mapping-editor--provider-suggested&viewMode=story');
  await expect(
    page.getByRole('heading', { name: 'Organize A Quiet Journey into volumes' }),
  ).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('mapping-editor.png');
});

test('a mapping that starts from the grouping mangabind found remains visually consistent', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.goto('/iframe.html?id=workflows-mapping-editor--pre-grouped&viewMode=story');
  await expect(page.getByText('Grouped by mangabind · Offline')).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('mapping-editor-pre-grouped.png');
});
