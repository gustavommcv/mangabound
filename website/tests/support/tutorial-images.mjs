import { expect } from '@playwright/test';

/** Follow the link as a document; fetching it as an image can hide development-route failures. */
export async function openFullSizeImage(page, name) {
  const link = page.locator(`[data-tutorial-image="${name}"] a`).first();
  const [response] = await Promise.all([
    page.waitForResponse((reply) => reply.request().isNavigationRequest()),
    link.click(),
  ]);
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toMatch(/^image\//u);
  const image = page.locator('img');
  await expect(image).toHaveJSProperty('complete', true);
  await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0);
  return image;
}
