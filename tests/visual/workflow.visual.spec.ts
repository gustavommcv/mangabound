import { expect, test } from '@playwright/test';

// The queue and the results are two panes in a window as wide as the app opens at (1180px) and stack
// below 1024px, so they are captured at the size the app itself opens at, not the narrower default.
test.describe('at the size the window opens at', () => {
  test.use({ viewport: { height: 760, width: 1180 } });

  test('enabled actions show a pointer while unavailable controls do not', async ({ page }) => {
    await page.goto('/iframe.html?id=workflows-queue--empty&viewMode=story');
    await expect(page.getByRole('heading', { name: 'Queue' })).toBeVisible();
    await expect(page.getByTestId('drop-target')).toHaveCSS('cursor', 'pointer');
    await expect(page.getByRole('button', { name: 'Files', exact: true })).toHaveCSS(
      'cursor',
      'pointer',
    );
    await expect(page.getByRole('radio', { name: 'CBZ' })).toHaveCSS('cursor', 'pointer');
    await expect(page.getByLabel('Device')).toHaveCSS('cursor', 'pointer');
    await expect(page.getByRole('button', { name: 'Advanced conversion options' })).toHaveCSS(
      'cursor',
      'pointer',
    );
    await expect(page.getByRole('button', { name: 'Reset to defaults' })).toHaveCSS(
      'cursor',
      'default',
    );

    await page.goto('/iframe.html?id=workflows-queue--single-book-active&viewMode=story');
    await expect(page.getByRole('radio', { name: 'CBZ' })).toBeDisabled();
    await expect(page.getByRole('radio', { name: 'CBZ' })).not.toHaveCSS('cursor', 'pointer');
  });

  test('the empty queue remains visually consistent', async ({ page }) => {
    await page.goto('/iframe.html?id=workflows-queue--empty&viewMode=story');
    await expect(page.getByRole('heading', { name: 'Queue' })).toBeVisible();
    await page.evaluate(async () => document.fonts.ready);
    await expect(page.locator('#storybook-root')).toHaveScreenshot('queue-empty.png');
  });

  test('the menu a click on the empty queue opens remains visually consistent', async ({
    page,
  }) => {
    await page.goto('/iframe.html?id=workflows-queue--empty-choosing&viewMode=story');
    await expect(page.getByRole('menu')).toBeVisible();
    await page.evaluate(async () => document.fonts.ready);
    // The menu is drawn outside the story's root, so the whole window is what is compared.
    await expect(page).toHaveScreenshot('queue-empty-choosing.png');
  });

  test('a queue with items in every state remains visually consistent', async ({ page }) => {
    await page.goto('/iframe.html?id=workflows-queue--with-items&viewMode=story');
    await expect(page.getByRole('heading', { name: 'Queue' })).toBeVisible();
    await page.evaluate(async () => document.fonts.ready);
    await expect(page.locator('#storybook-root')).toHaveScreenshot('queue-with-items.png');
  });

  test('a library in the queue remains visually consistent', async ({ page }) => {
    await page.goto('/iframe.html?id=workflows-queue--with-library&viewMode=story');
    await expect(page.getByText('Library · 3 titles · 3 volumes')).toBeVisible();
    await page.evaluate(async () => document.fonts.ready);
    await expect(page.locator('#storybook-root')).toHaveScreenshot('queue-with-library.png');
  });

  test('pending books can be identified and reopened from the queue', async ({ page }) => {
    await page.goto('/iframe.html?id=workflows-queue--ready-books&viewMode=story');
    await expect(page.getByRole('button', { name: 'View books from Vol.01.epub' })).toBeVisible();
    await page.evaluate(async () => document.fonts.ready);
    await expect(page.locator('#storybook-root')).toHaveScreenshot('queue-ready-books.png');
  });

  test('deleting pending books presents an explicit confirmation', async ({ page }) => {
    await page.goto('/iframe.html?id=workflows-queue--ready-books-confirm-delete&viewMode=story');
    await expect(
      page.getByRole('group', { name: 'Confirm deletion of Vol.01.epub' }),
    ).toBeVisible();
    await page.evaluate(async () => document.fonts.ready);
    await expect(page.locator('#storybook-root')).toHaveScreenshot(
      'queue-ready-books-confirm-delete.png',
    );
  });

  test('joining volumes only remains visually consistent', async ({ page }) => {
    await page.goto('/iframe.html?id=workflows-queue--join-only&viewMode=story');
    await expect(page.getByRole('button', { name: /^Process \d+ items?$/ })).toBeVisible();
    await page.evaluate(async () => document.fonts.ready);
    await expect(page.locator('#storybook-root')).toHaveScreenshot('queue-join-only.png');
  });

  test('a queue whose options were changed remains visually consistent', async ({ page }) => {
    await page.goto('/iframe.html?id=workflows-queue--options-changed&viewMode=story');
    await expect(page.getByRole('button', { name: 'Reset to defaults' })).toBeVisible();
    await page.evaluate(async () => document.fonts.ready);
    await expect(page.locator('#storybook-root')).toHaveScreenshot('queue-options-changed.png');
  });

  test('validated plan remains visually consistent', async ({ page }) => {
    await page.goto('/iframe.html?id=workflows-queue--plan-validated&viewMode=story');
    await expect(page.getByRole('heading', { name: 'Plan validated' })).toBeVisible();
    await page.evaluate(async () => document.fonts.ready);
    await expect(page.locator('#storybook-root')).toHaveScreenshot('queue-plan-validated.png');
  });

  test('saved books with the KOReader card remain visually consistent', async ({ page }) => {
    await page.goto('/iframe.html?id=workflows-results--saved-and-sharing&viewMode=story');
    await expect(page.getByRole('heading', { name: '3 books ready' })).toBeVisible();
    await page.evaluate(async () => document.fonts.ready);
    await expect(page.locator('#storybook-root')).toHaveScreenshot('results-saved-sharing.png');
  });

  test('results distinguish books still pending from books already saved', async ({ page }) => {
    await page.goto('/iframe.html?id=workflows-results--partly-saved&viewMode=story');
    await expect(page.getByRole('button', { name: 'Save all to folder…' })).toBeVisible();
    await page.evaluate(async () => document.fonts.ready);
    await expect(page.locator('#storybook-root')).toHaveScreenshot('results-partly-saved.png');
  });

  test('results with something left out remain visually consistent', async ({ page }) => {
    await page.goto(
      '/iframe.html?id=workflows-results--saved-with-something-skipped&viewMode=story',
    );
    await expect(page.getByText('Random scans was skipped')).toBeVisible();
    await page.evaluate(async () => document.fonts.ready);
    await expect(page.locator('#storybook-root')).toHaveScreenshot('results-skipped.png');
  });
});

test('a queue that has stacked below the two-pane width remains visually consistent', async ({
  page,
}) => {
  await page.goto('/iframe.html?id=workflows-queue--with-items&viewMode=story');
  await expect(page.getByRole('heading', { name: 'Queue' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('queue-narrow.png');
});

test('a running item remains visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-run-and-errors--progress&viewMode=story');
  await expect(page.getByRole('heading', { name: 'Converting A Quiet Journey' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('running.png');
});

test('building volume files shows measured page progress without visual drift', async ({
  page,
}) => {
  await page.goto('/iframe.html?id=workflows-running--binding-volume-files&viewMode=story');
  await expect(
    page.getByRole('heading', { name: 'Building volume files for Chainsaw Man' }),
  ).toBeVisible();
  await expect(page.getByText('414 of 1976 pages copied')).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('binding-progress.png');
});

test('expanded volume progress uses the page scroll, not another scrollbar', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto('/iframe.html?id=workflows-running--multiple-volumes&viewMode=story');
  const details = page.getByRole('region', { name: 'Volume details' });
  await expect(details).toBeVisible();
  const panel = await details.evaluate((element) => ({
    range: element.scrollHeight - element.clientHeight,
    overflow: getComputedStyle(element).overflowY,
  }));
  expect(panel.range).toBeLessThanOrEqual(1);
  expect(panel.overflow).toBe('visible');
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight - innerHeight),
  ).toBeGreaterThan(0);
});

test('the titles of a library remain visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-library-titles--every-state&viewMode=story');
  await expect(page.getByRole('heading', { name: 'Manga Library' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('library-titles.png');
});

test('full output settings remain visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-output-settings--normal&viewMode=story');
  await expect(page.getByRole('heading', { name: 'Device & output' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('output-settings.png');
});

test('changed output settings show aligned labels and individual resets', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-output-settings--modified-options&viewMode=story');
  await expect(page.getByRole('button', { name: 'Restore default for Gamma' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('output-settings-modified.png');
});

test('single-book notices span their editor and share the warning treatment', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-mapping-editor--single-book-active&viewMode=story');
  const mapping = page.getByRole('region', { name: /Organize A Quiet Journey into volumes/u });
  const mappingNotice = page.getByRole('status', { name: 'Single book for the series' });
  await expect(mappingNotice).toBeVisible();
  const mappingBox = await mapping.boundingBox();
  const mappingNoticeBox = await mappingNotice.boundingBox();
  expect(mappingBox).not.toBeNull();
  expect(mappingNoticeBox).not.toBeNull();
  expect(Math.abs(mappingNoticeBox!.x - mappingBox!.x)).toBeLessThan(1);
  expect(Math.abs(mappingNoticeBox!.width - mappingBox!.width)).toBeLessThan(1);
  await expect(mappingNotice).toHaveClass(/border-status-warning\/40/u);

  await page.goto('/iframe.html?id=workflows-output-settings--single-book-active&viewMode=story');
  const settingsNotice = page.getByRole('status', { name: 'Single book for the series' });
  await expect(settingsNotice).toBeVisible();
  const settingsBox = await settingsNotice.boundingBox();
  const settingsParentBox = await settingsNotice.locator('..').boundingBox();
  expect(settingsBox).not.toBeNull();
  expect(settingsParentBox).not.toBeNull();
  expect(Math.abs(settingsBox!.x - settingsParentBox!.x)).toBeLessThan(1);
  expect(Math.abs(settingsBox!.width - settingsParentBox!.width)).toBeLessThan(1);
  await expect(settingsNotice).toHaveClass(/border-status-warning\/40/u);
});

test('an online source with its results remains visually consistent', async ({ page }) => {
  await page.goto(
    '/iframe.html?id=workflows-mapping-editor--with-metadata-suggestions&viewMode=story',
  );
  await expect(page.getByRole('button', { name: 'Use these volumes' }).first()).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('mapping-editor-suggestions.png');
});

test('the list of online sources remains visually consistent', async ({ page }) => {
  await page.goto(
    '/iframe.html?id=workflows-mapping-editor--online-source-list-open&viewMode=story',
  );
  await expect(page.getByRole('option', { name: /MangaDex/u })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('online-source-list.png');
});

test('the share panel remains visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-share-panel--ready-to-start&viewMode=story');
  await expect(page.getByRole('heading', { name: 'Share to your e-reader' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('share-panel.png');
});

test('the question before options are reset remains visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-reset-options--asking-to-confirm&viewMode=story');
  await expect(page.getByRole('group', { name: 'Confirm reset' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('reset-options-confirm.png');
});

test('the open share panel remains visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=workflows-share-menu--open-while-sharing&viewMode=story');
  await expect(page.getByRole('dialog', { name: 'Share to your e-reader' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('share-menu-open.png');
});

test('the title bar remains visually consistent', async ({ page }) => {
  await page.goto('/iframe.html?id=shell-title-bar--while-sharing&viewMode=story');
  await expect(page.getByRole('button', { name: 'Sharing' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('titlebar.png');
});

test('the notices remain visually consistent', async ({ page }) => {
  await page.goto(
    '/iframe.html?id=workflows-notices--saved-settings-could-not-be-used&viewMode=story',
  );
  await expect(page.getByRole('status', { name: 'Notices' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('notices.png');
});

test('the process steps remain visually consistent', async ({ page }) => {
  await page.goto(
    '/iframe.html?id=workflows-process-steps--library-is-always-grouped&viewMode=story',
  );
  await expect(page.getByRole('checkbox', { name: 'Group chapters into volumes' })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator('#storybook-root')).toHaveScreenshot('process-steps.png');
});
