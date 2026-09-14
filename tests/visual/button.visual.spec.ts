import { expect, test } from '@playwright/test';

test('button state gallery remains visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=design-system-button--state-gallery&viewMode=story');
  await expect(page.locator('#storybook-root')).toBeVisible();
  await expect(page.locator('#storybook-root')).toHaveScreenshot('button-state-gallery.png');
});
