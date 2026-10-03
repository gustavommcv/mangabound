import { test } from '@playwright/test';

import { base } from '../../site.config.mjs';
import { openFullSizeImage } from '../support/tutorial-images.mjs';

for (const locale of ['', 'pt-br/']) {
  test(`full-size tutorial links open real images during development: ${locale || 'en'}`, async ({
    page,
  }) => {
    for (const [route, name] of [
      ['getting-started/quickstart/', 'generated/save-results'],
      ['koreader/recommended-settings/', 'koreader/status-overlap'],
    ]) {
      await page.goto(`${base.replace(/\/?$/, '/')}${locale}${route}`);
      await openFullSizeImage(page, name);
    }
  });
}
