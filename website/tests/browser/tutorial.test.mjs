import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { base } from '../../site.config.mjs';

const root = base.replace(/\/?$/, '/');
const applicationPages = [
  ['getting-started/quickstart/', ['queue-inputs', 'save-results']],
  ['user-guide/adding-manga/', ['queue-inputs']],
  ['user-guide/mapping-editor/', ['manual-mapping', 'online-mapping']],
  ['user-guide/output-profiles/', ['device-settings', 'single-book']],
  ['user-guide/processing/', ['processing-details']],
  ['user-guide/exporting/', ['save-results', 'ready-books']],
  ['koreader/opds-sharing/', ['share-panel']],
];

async function expectReadableImage(page, name) {
  const image = page.locator(`[data-tutorial-image="${name}"] img`);
  await image.scrollIntoViewIfNeeded();
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('alt', /\S/);
  await expect(image).toHaveAttribute('width', /^[1-9]\d*$/);
  await expect(image).toHaveAttribute('height', /^[1-9]\d*$/);
  await expect(image).toHaveJSProperty('complete', true);
  await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

for (const locale of ['', 'pt-br/']) {
  for (const colorScheme of ['light', 'dark']) {
    test(`application captures load in the published guide: ${locale || 'en'} ${colorScheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      for (const [route, images] of applicationPages) {
        await page.goto(`${root}${locale}${route}`);
        for (const name of images) await expectReadableImage(page, `generated/${name}`);
        for (const details of await page.locator('.sl-markdown-content details').all()) {
          await expect(details).not.toHaveAttribute('open');
          const summary = details.locator('summary');
          await summary.focus();
          await summary.press('Enter');
          await expect(details).toHaveAttribute('open');
          for (const figure of await details.locator('[data-tutorial-image]').all()) {
            await expectReadableImage(page, await figure.getAttribute('data-tutorial-image'));
          }
          await summary.press('Space');
          await expect(details).not.toHaveAttribute('open');
        }
      }
    });

    test(`KOReader steps expand with the keyboard: ${locale || 'en'} ${colorScheme}`, async ({
      page,
    }, testInfo) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(`${root}${locale}koreader/recommended-settings/`);
      const fullSize = page.locator('[data-tutorial-image="koreader/status-overlap"] a');
      await fullSize.click();
      await expect(page).toHaveURL(/status-overlap\.[^/]+\.png$/);
      await expect(page.locator('img')).toHaveJSProperty('complete', true);
      await expect
        .poll(() => page.locator('img').evaluate((element) => element.naturalWidth))
        .toBe(1072);
      await page.goBack();
      await expect(page.getByText('Kindle 2024', { exact: false })).toBeVisible();
      await expect(page.getByText('2026.07.2-198', { exact: false })).toBeVisible();
      for (const name of ['status-overlap', 'refresh-every-page', 'tweak-menu']) {
        await expectReadableImage(page, `koreader/${name}`);
      }
      const steps = page.locator('.sl-markdown-content details');
      await expect(steps).toHaveCount(3);
      for (const details of await steps.all()) {
        await expect(details).not.toHaveAttribute('open');
        const images = details.locator('[data-tutorial-image]');
        for (const image of await images.all()) await expect(image).not.toBeVisible();
        const summary = details.locator('summary');
        await summary.focus();
        await summary.press('Enter');
        await expect(details).toHaveAttribute('open');
        for (const figure of await images.all()) {
          await expectReadableImage(page, await figure.getAttribute('data-tutorial-image'));
        }
      }
      const scan = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(scan.violations).toEqual([]);
      for (const summary of await steps.locator('summary').all()) await summary.click();
      await page
        .getByRole('heading', { name: 'Overlap status bar', exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath('koreader-main.png') });
      await steps.nth(1).locator('summary').click();
      await steps.nth(1).scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath('koreader-steps.png') });
    });
  }
}
