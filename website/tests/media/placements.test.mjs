import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { mediaPlacements } from '../../media-plan.mjs';
import { base } from '../../site.config.mjs';

const root = base.replace(/\/?$/, '/');

for (const locale of ['', 'pt-br/']) {
  for (const route of new Set(mediaPlacements.map((placement) => placement.route))) {
    test(`authoring placements are visible and localized: ${locale || 'en'} ${route || 'home'}`, async ({
      page,
    }) => {
      await page.goto(`${root}${locale}${route}`);
      for (const placement of mediaPlacements.filter((item) => item.route === route)) {
        const marker = page.locator(`[data-media-slot="${placement.id}"]`);
        await expect(marker).toBeVisible();
        await expect(marker).toContainText(locale ? placement.pt : placement.en);
        await expect(marker).toContainText(
          locale ? 'não aparece no site publicado' : 'hidden on the published site',
        );
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    });
  }

  for (const colorScheme of ['light', 'dark']) {
    test(`authoring callouts are accessible: ${locale || 'en'} ${colorScheme}`, async ({
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
