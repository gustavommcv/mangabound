import { readFile } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';

import { base } from '../../site.config.mjs';
import { openFullSizeImage } from '../support/tutorial-images.mjs';

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
    const { sourceWidth, displayedWidth, density } = await image.evaluate(async (element) => {
      // naturalWidth on a srcset image is density-corrected; decode the selected resource itself.
      const resource = new Image();
      resource.src = element.currentSrc;
      await resource.decode();
      return {
        sourceWidth: resource.naturalWidth,
        displayedWidth: element.getBoundingClientRect().width,
        density: window.devicePixelRatio,
      };
    });
    expect(sourceWidth).toBeGreaterThanOrEqual(Math.ceil(displayedWidth * density));
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

test('screen captures retain background space around their content', async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL('../../src/assets/tutorial/generated/capture.json', import.meta.url),
      'utf8',
    ),
  );
  for (const name of ['queue-inputs', 'save-results', 'processing-details']) {
    const capture = manifest.captures.find((entry) => entry.name === name);
    for (const variant of capture.variants) {
      const image = sharp(
        await readFile(
          new URL(`../../src/assets/tutorial/generated/${variant.file}`, import.meta.url),
        ),
      );
      // Inspect real PNG pixels, not the declared inset or the capture implementation.
      const inset = 12 * variant.pixelRatio;
      for (const strip of [
        { left: 0, top: 0, width: variant.width, height: inset },
        { left: 0, top: variant.height - inset, width: variant.width, height: inset },
        { left: 0, top: 0, width: inset, height: variant.height },
        { left: variant.width - inset, top: 0, width: inset, height: variant.height },
      ]) {
        // Sharp's stats() reads its input, so materialize the extraction first.
        const edge = await image.clone().extract(strip).toBuffer();
        const { channels } = await sharp(edge).stats();
        for (const channel of channels) expect(channel.min).toBe(channel.max);
      }
    }
  }
});

for (const colorScheme of ['light', 'dark']) {
  test(`tutorial frames separate images from the page: ${colorScheme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    for (const [route, names] of [
      ['getting-started/quickstart/', ['generated/queue-inputs', 'generated/save-results']],
      ['koreader/recommended-settings/', ['koreader/status-overlap']],
    ]) {
      await page.goto(`${root}${route}`);
      for (const name of names) {
        await expectReadableImage(page, name);
        const link = page.locator(`[data-tutorial-image="${name}"] a`).first();
        const frame = await link.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            borders: ['Top', 'Right', 'Bottom', 'Left'].map((side) => ({
              width: Number.parseFloat(style[`border${side}Width`]),
              style: style[`border${side}Style`],
              color: style[`border${side}Color`],
            })),
            pageBackground: getComputedStyle(document.documentElement).backgroundColor,
            shadow: style.boxShadow,
          };
        });
        for (const border of frame.borders) {
          expect(border.width).toBeGreaterThanOrEqual(1);
          expect(border.style).toBe('solid');
          expect(border.color).not.toBe('rgba(0, 0, 0, 0)');
          expect(border.color).not.toBe(frame.pageBackground);
        }
        expect(frame.shadow).not.toBe('none');
        await link.focus();
        await expect(link).toBeFocused();
        await link.evaluate((element) => element.blur());
        await page
          .locator(`[data-tutorial-image="${name}"]`)
          .first()
          .screenshot({
            path: testInfo.outputPath(`${name.replaceAll('/', '-')}-${colorScheme}.png`),
          });
      }
    }
  });
}

test('published tutorial images and their full-size links retain the source pixels', async ({
  page,
}) => {
  const manifest = JSON.parse(
    await readFile(
      new URL('../../src/assets/tutorial/generated/capture.json', import.meta.url),
      'utf8',
    ),
  );
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
    const fullSize = await page.request.get(
      await figure.locator('a').evaluate((element) => element.href),
    );
    expect(optimized.ok()).toBe(true);
    expect(fullSize.ok()).toBe(true);
    const published = await optimized.body();
    const { width } = await sharp(published).metadata();
    const variant = name.startsWith('generated/')
      ? manifest.captures
          .find((capture) => `generated/${capture.name}` === name)
          .variants.find((capture) => capture.width === width)
      : undefined;
    const sourceName = variant ? `generated/${variant.file}` : `${name}.png`;
    const publishedPixels = await sharp(published).ensureAlpha().raw().toBuffer();
    const sourcePixels = await sharp(
      await readFile(new URL(`../../src/assets/tutorial/${sourceName}`, import.meta.url)),
    )
      .ensureAlpha()
      .raw()
      .toBuffer();
    expect(publishedPixels.equals(sourcePixels)).toBe(true);
    const fullPixels = await sharp(await fullSize.body())
      .ensureAlpha()
      .raw()
      .toBuffer();
    const masterPixels = await sharp(
      await readFile(new URL(`../../src/assets/tutorial/${name}.png`, import.meta.url)),
    )
      .ensureAlpha()
      .raw()
      .toBuffer();
    expect(fullPixels.equals(masterPixels)).toBe(true);
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
      const fullSize = await openFullSizeImage(page, 'koreader/status-overlap');
      await expect.poll(() => fullSize.evaluate((element) => element.naturalWidth)).toBe(1072);
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

for (const density of [1, 2, 3, 4]) {
  test.describe(`native tutorial alternatives at ${density}×`, () => {
    test.use({ deviceScaleFactor: density });
    test('the browser selects readable native sources without always loading the master', async ({
      page,
    }, testInfo) => {
      if (testInfo.project.name === 'desktop')
        await page.setViewportSize({ width: 1920, height: 1080 });
      const seen = new Set();
      const browserImages = new Set();
      const unneededMasters = new Set();
      page.on('request', (request) => {
        if (request.resourceType() === 'image') browserImages.add(request.url());
      });
      let selectedBytes = 0;
      let fullSizeBytes = 0;
      for (const [route] of applicationPages) {
        await page.goto(`${root}${route}`);
        for (const summary of await page.locator('.sl-markdown-content details summary').all())
          await summary.click();
        for (const figure of await page.locator('[data-tutorial-image]').all()) {
          const name = await figure.getAttribute('data-tutorial-image');
          if (seen.has(name)) continue;
          seen.add(name);
          await expectReadableImage(page, name);
          const image = figure.locator('img');
          await expect(image).toHaveAttribute('srcset', /\d+w/u);
          await expect(image).toHaveAttribute('sizes', /^auto,/u);
          const selectedUrl = await image.evaluate((element) => element.currentSrc);
          const masterUrl = await figure.locator('a').evaluate((element) => element.href);
          const selected = await page.request.get(selectedUrl);
          const master = await page.request.get(masterUrl);
          if (selectedUrl !== masterUrl) unneededMasters.add(masterUrl);
          expect(selected.ok()).toBe(true);
          expect(master.ok()).toBe(true);
          const selectedData = await selected.body();
          const masterData = await master.body();
          selectedBytes += selectedData.length;
          fullSizeBytes += masterData.length;
          expect((await sharp(masterData).metadata()).width).toBeGreaterThanOrEqual(2880);
        }
      }
      expect(seen.size).toBe(12);
      if (density <= 2) {
        expect(selectedBytes).toBeLessThan(fullSizeBytes);
        // Native lazy selection must not silently preload the heavyweight fallback as well.
        for (const url of unneededMasters) expect(browserImages.has(url)).toBe(false);
      }
      await testInfo.attach('image-transfer.json', {
        body: JSON.stringify({ density, selectedBytes, fullSizeBytes }),
        contentType: 'application/json',
      });
    });
  });
}
