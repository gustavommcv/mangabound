import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';

import { base } from '../../site.config.mjs';

const root = base.replace(/\/?$/, '/');
test.use({ deviceScaleFactor: 2 });
const applicationPages = [
  ['getting-started/quickstart/', ['queue-inputs', 'save-results']],
  ['user-guide/adding-manga/', ['queue-inputs']],
  [
    'user-guide/mapping-editor/',
    ['manual-mapping', 'online-mapping'],
    ['manual-mapping', 'online-mapping'],
  ],
  ['user-guide/output-profiles/', ['device-settings', 'single-book']],
  ['user-guide/processing/', ['processing-details']],
  ['user-guide/exporting/', ['save-results', 'ready-books']],
  ['koreader/opds-sharing/', ['share-panel'], ['share-panel']],
];

async function expectReadableImage(page, name, scope = page) {
  const image = scope.locator(`[data-tutorial-image="${name}"] img`).first();
  await image.scrollIntoViewIfNeeded();
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('alt', /\S/);
  await expect(image).toHaveAttribute('width', /^[1-9]\d*$/);
  await expect(image).toHaveAttribute('height', /^[1-9]\d*$/);
  await expect(image).toHaveJSProperty('complete', true);
  await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0);
  if (name.startsWith('generated/')) {
    const { sourceWidth, displayedWidth } = await image.evaluate((element) => ({
      sourceWidth: element.naturalWidth,
      displayedWidth: element.getBoundingClientRect().width,
    }));
    expect(sourceWidth).toBeGreaterThanOrEqual(Math.ceil(displayedWidth * 2));
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

test('published tutorial images retain the source pixels', async ({ page }) => {
  for (const [route, name] of [
    ['user-guide/processing/', 'generated/processing-details'],
    ['koreader/connecting/', 'koreader/opds-setup'],
    ['koreader/recommended-settings/', 'koreader/status-overlap'],
  ]) {
    await page.goto(`${root}${route}`);
    if (name === 'koreader/opds-setup') {
      await page.locator('.sl-markdown-content details summary').click();
    }
    await expectReadableImage(page, name);
    const figure = page.locator(`[data-tutorial-image="${name}"]`).first();
    const optimized = await page.request.get(
      await figure.locator('img').evaluate((element) => element.currentSrc),
    );
    const source = await page.request.get(
      await figure.locator('a').evaluate((element) => element.href),
    );
    expect(optimized.ok()).toBe(true);
    expect(source.ok()).toBe(true);
    const publishedPixels = await sharp(await optimized.body())
      .ensureAlpha()
      .raw()
      .toBuffer();
    const sourcePixels = await sharp(await source.body())
      .ensureAlpha()
      .raw()
      .toBuffer();
    expect(publishedPixels.equals(sourcePixels)).toBe(true);
  }
});

for (const locale of ['', 'pt-br/']) {
  for (const colorScheme of ['light', 'dark']) {
    test(`application captures load in the published guide: ${locale || 'en'} ${colorScheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      for (const [route, images, stepImages = []] of applicationPages) {
        await page.goto(`${root}${locale}${route}`);
        for (const name of images) await expectReadableImage(page, `generated/${name}`);
        const walkthroughs = await page.locator('.sl-markdown-content details').all();
        expect(walkthroughs).toHaveLength(stepImages.length);
        for (const [index, details] of walkthroughs.entries()) {
          await expect(details).not.toHaveAttribute('open');
          await expect(details.locator('[data-tutorial-image]').last()).toHaveAttribute(
            'data-tutorial-image',
            `generated/${stepImages[index]}`,
          );
          const summary = details.locator('summary');
          await summary.focus();
          await summary.press('Enter');
          await expect(details).toHaveAttribute('open');
          for (const figure of await details.locator('[data-tutorial-image]').all()) {
            await expectReadableImage(
              page,
              await figure.getAttribute('data-tutorial-image'),
              details,
            );
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
      const fullSize = page.locator('[data-tutorial-image="koreader/status-overlap"] a').first();
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
      for (const [index, details] of (await steps.all()).entries()) {
        await expect(details).not.toHaveAttribute('open');
        const repeated = ['status-overlap', 'refresh-every-page', 'tweak-menu'][index];
        await expect(details.locator(`[data-tutorial-image="koreader/${repeated}"]`)).toHaveCount(
          1,
        );
        const images = details.locator('[data-tutorial-image]');
        for (const image of await images.all()) await expect(image).not.toBeVisible();
        const summary = details.locator('summary');
        await summary.focus();
        await summary.press('Enter');
        await expect(details).toHaveAttribute('open');
        for (const figure of await images.all()) {
          await expectReadableImage(
            page,
            await figure.getAttribute('data-tutorial-image'),
            details,
          );
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

    test(`KOReader OPDS instructions show readable, keyboard-accessible steps: ${locale || 'en'} ${colorScheme}`, async ({
      page,
    }, testInfo) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(`${root}${locale}koreader/connecting/`);
      await expectReadableImage(page, 'koreader/opds-catalog');
      await expect(page.getByText('Kindle 2024', { exact: false })).toBeVisible();
      await expect(page.getByText('2026.07.2-198', { exact: false })).toBeVisible();
      await expect(page.locator('[data-media-slot]')).toHaveCount(0);
      const details = page.locator('.sl-markdown-content details');
      await expect(details).toHaveCount(1);
      await expect(details).not.toHaveAttribute('open');
      const names = [
        'opds-menu',
        'opds-add-catalog',
        'opds-setup',
        'opds-catalog',
        'opds-download',
      ];
      for (const name of names) {
        await expect(details.locator(`[data-tutorial-image="koreader/${name}"]`)).not.toBeVisible();
      }
      await page.screenshot({ path: testInfo.outputPath('opds-main.png') });
      const summary = details.locator('summary');
      await summary.focus();
      await summary.press('Enter');
      await expect(details).toHaveAttribute('open');
      for (const name of names) await expectReadableImage(page, `koreader/${name}`, details);
      const scan = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(scan.violations).toEqual([]);
      await details.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath('opds-steps.png') });
      await summary.press('Space');
      await expect(details).not.toHaveAttribute('open');
      for (const name of names) {
        await expect(details.locator(`[data-tutorial-image="koreader/${name}"]`)).not.toBeVisible();
      }
    });
  }
}
