import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { base } from '../../site.config.mjs';

const root = base.replace(/\/?$/, '/');
const platforms = [
  {
    name: 'Windows',
    buttons: [
      {
        en: 'Download installer (.exe)',
        pt: 'Baixar instalador (.exe)',
        filename: /^Mangabound-.+\.Setup\.exe$/,
      },
      {
        en: 'Download portable (.zip)',
        pt: 'Baixar versão portátil (.zip)',
        filename: /^Mangabound-win32-x64-.+\.zip$/,
      },
    ],
  },
  {
    name: 'macOS',
    buttons: [
      {
        en: 'Download for Apple Silicon (.zip)',
        pt: 'Baixar para Apple Silicon (.zip)',
        filename: /^Mangabound-darwin-arm64-.+\.zip$/,
      },
    ],
  },
  {
    name: 'Linux',
    buttons: [
      { en: 'Debian / Ubuntu (.deb)', pt: 'Debian / Ubuntu (.deb)', filename: /^.+_amd64\.deb$/ },
      { en: 'Fedora (.rpm)', pt: 'Fedora (.rpm)', filename: /^.+\.x86_64\.rpm$/ },
      {
        en: 'Arch Linux (.pkg.tar.zst)',
        pt: 'Arch Linux (.pkg.tar.zst)',
        filename: /^.+-x86_64\.pkg\.tar\.zst$/,
      },
    ],
  },
];

for (const locale of ['', 'pt-br/']) {
  for (const colorScheme of ['light', 'dark']) {
    test(`installation downloads work without browser API calls: ${locale || 'en'} ${colorScheme}`, async ({
      page,
    }, testInfo) => {
      const apiRequests = [];
      page.on('request', (request) => {
        if (new URL(request.url()).hostname === 'api.github.com') apiRequests.push(request.url());
      });
      // Exercise real anchor clicks and browser downloads without downloading large installers.
      await page.route(
        'https://github.com/gustavommcv/mangabound/releases/download/**',
        (route) => {
          const filename = decodeURIComponent(
            new URL(route.request().url()).pathname.split('/').at(-1),
          );
          return route.fulfill({
            contentType: 'application/octet-stream',
            headers: { 'content-disposition': `attachment; filename="${filename}"` },
            body: 'download response fixture',
          });
        },
      );
      await page.emulateMedia({ colorScheme });
      await page.goto(`${root}${locale}getting-started/installation/`);
      let selectedTag;
      for (const platform of platforms) {
        await page.getByRole('tab', { name: platform.name, exact: true }).click();
        const panel = page.getByRole('tabpanel', { name: platform.name, exact: true });
        const group = panel.locator('[data-release-tag]');
        const tag = await group.getAttribute('data-release-tag');
        if (selectedTag) expect(tag).toBe(selectedTag);
        selectedTag = tag;
        await expect(group.locator('.buttons a')).toHaveCount(platform.buttons.length);
        await expect(group.locator('.release-info strong')).toHaveText(tag);
        const notes = group.getByRole('link', {
          name: locale ? 'Notas da versão' : 'Release notes',
        });
        await expect(notes).toHaveAttribute(
          'href',
          `https://github.com/gustavommcv/mangabound/releases/tag/${encodeURIComponent(tag)}`,
        );
        await expect(group.getByRole('link', { name: 'SHA256SUMS', exact: true })).toHaveAttribute(
          'href',
          `https://github.com/gustavommcv/mangabound/releases/download/${encodeURIComponent(tag)}/SHA256SUMS`,
        );
        const first = group.getByRole('link', {
          name: locale ? platform.buttons[0].pt : platform.buttons[0].en,
          exact: true,
        });
        await first.focus();
        await first.press('Tab');
        const next = platform.buttons[1];
        await expect(
          next ? group.getByRole('link', { name: locale ? next.pt : next.en, exact: true }) : notes,
        ).toBeFocused();
        for (const button of platform.buttons) {
          const link = group.getByRole('link', {
            name: locale ? button.pt : button.en,
            exact: true,
          });
          const target = new URL(await link.getAttribute('href'));
          expect(target.origin).toBe('https://github.com');
          const parts = target.pathname.split('/').map(decodeURIComponent);
          expect(parts.slice(0, -1).join('/')).toBe(
            `/gustavommcv/mangabound/releases/download/${tag}`,
          );
          const filename = parts.at(-1);
          expect(filename).toMatch(button.filename);
          const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
          expect(download.suggestedFilename()).toBe(filename);
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        const scan = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        expect(scan.violations).toEqual([]);
        await panel.screenshot({
          path: testInfo.outputPath(`downloads-${platform.name}.png`),
          animations: 'disabled',
        });
      }
      expect(apiRequests).toEqual([]);
    });
  }
}
