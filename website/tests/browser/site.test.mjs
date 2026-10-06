import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { base } from '../../site.config.mjs';
import { mediaPlacements } from '../../media-plan.mjs';

const root = base.replace(/\/?$/, '/');

test('published guides never expose authoring media markers', async ({ page }) => {
  for (const locale of ['', 'pt-br/']) {
    for (const route of new Set(mediaPlacements.map((placement) => placement.route))) {
      await page.goto(`${root}${locale}${route}`);
      await expect(page.locator('[data-media-slot]')).toHaveCount(0);
    }
  }
});

async function openNavigation(page) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  if (await menu.isVisible()) await menu.click();
}

test('a reader can navigate to installation in either viewport', async ({ page }) => {
  await page.goto(root);
  await openNavigation(page);
  await page
    .locator('#starlight__sidebar')
    .getByRole('link', { name: 'Installation', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Installation' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('language switching preserves the page and translates navigation', async ({ page }) => {
  await page.goto(`${root}getting-started/installation/`);
  await openNavigation(page);
  await page
    .getByLabel('Select language')
    .filter({ visible: true })
    .selectOption(`${root}pt-br/getting-started/installation/`);
  await expect(page.getByRole('heading', { level: 1, name: 'Instalação' })).toBeVisible();
  await openNavigation(page);
  await expect(
    page.locator('#starlight__sidebar').getByRole('link', { name: 'Instalação', exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('#starlight__sidebar').getByRole('link', { name: 'Guia rápido', exact: true }),
  ).toBeVisible();
});

for (const locale of ['', 'pt-br/']) {
  test(`installation tabs support keyboard navigation: ${locale || 'en'}`, async ({
    page,
  }, testInfo) => {
    await page.goto(`${root}${locale}getting-started/installation/`);
    const windows = page.getByRole('tab', { name: 'Windows', exact: true });
    const macOS = page.getByRole('tab', { name: 'macOS', exact: true });
    await windows.focus();
    await windows.press('ArrowRight');
    await expect(macOS).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: 'macOS', exact: true })).toBeVisible();
    await macOS.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Linux', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const linux = page.getByRole('tabpanel', { name: 'Linux', exact: true });
    await expect(linux).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await linux.screenshot({
      path: testInfo.outputPath('linux-installation.png'),
      animations: 'disabled',
    });
  });
}

test('Portuguese search returns a result that opens the right locale', async ({ page }) => {
  await page.goto(`${root}pt-br/`);
  await page.getByRole('button', { name: /Pesquisar/ }).click();
  await page.getByRole('textbox', { name: 'Pesquisar', exact: true }).fill('volumes');
  const results = page.locator('.pagefind-ui__result-link');
  await expect(results.first()).toBeVisible();
  const href = await results.first().getAttribute('href');
  expect(href).toContain(`${root}pt-br/`);
  await results.first().click();
  await expect(page).toHaveURL(new RegExp(`${root}pt-br/`));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('search can be dismissed with the keyboard', async ({ page }) => {
  await page.goto(root);
  await page.getByRole('button', { name: /Search/ }).click();
  await expect(page.getByRole('textbox', { name: 'Search', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox', { name: 'Search', exact: true })).not.toBeVisible();
});

test('unknown routes return the site 404 page', async ({ page }) => {
  const response = await page.goto(`${root}no-such-guide/`);
  expect(response.status()).toBe(404);
});

for (const locale of ['', 'pt-br/']) {
  for (const colorScheme of ['light', 'dark']) {
    test(`representative page is accessible: ${locale || 'en'} ${colorScheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(`${root}${locale}getting-started/quickstart/`);
      const scan = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(scan.violations).toEqual([]);
    });
  }
}
