import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { tutorialPresentation } from '../../playwright.tutorial.config';

const directory = path.resolve('website/src/assets/tutorial/generated');
// Starlight's guide column is at most 45rem (720 CSS pixels at the default font size).
const displayedWidth = 720;
const displayDensities = [1, 2, 3, 4];
// Screens without their own panel padding include some existing Storybook background.
const screenInset = 24;
type CaptureVariant = { file: string; width: number; height: number; pixelRatio: number };
const captures = new Map<
  string,
  {
    name: string;
    story: string;
    masterRatio: number;
    variants: CaptureVariant[];
  }
>();
type Capture = (
  page: Page,
  name: string,
  story: string,
  region?: Locator | [Locator, Locator],
  includeContext?: boolean,
) => Promise<void>;

function tutorial(title: string, scenario: (page: Page, capture: Capture) => Promise<void>): void {
  test(title, async ({ browser }) => {
    // The 1× pass discovers each region's required densities. Only those contexts are rendered.
    const ratios = new Set([1]);
    for (const pixelRatio of ratios) {
      const context = await browser.newContext({
        ...tutorialPresentation,
        deviceScaleFactor: pixelRatio,
      });
      try {
        await scenario(await context.newPage(), (page, name, story, region, includeContext) =>
          capture(page, name, story, ratios, region, includeContext),
        );
      } finally {
        await context.close();
      }
    }
  });
}

test.beforeAll(async () => {
  await mkdir(directory, { recursive: true });
});

test.afterAll(async () => {
  await writeFile(
    path.join(directory, 'capture.json'),
    JSON.stringify(
      {
        commit:
          process.env.GITHUB_SHA ?? execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(),
        captures: [...captures.values()].map(({ name, story, masterRatio, variants }) => {
          const master = variants.find((variant) => variant.pixelRatio === masterRatio);
          if (!master) throw new Error(`Missing full-size tutorial capture: ${name}`);
          return {
            name,
            story,
            width: master.width,
            height: master.height,
            pixelRatio: masterRatio,
            variants,
          };
        }),
      },
      null,
      2,
    ) + '\n',
  );
});

async function openStory(page: Page, story: string): Promise<void> {
  await page.goto(`/iframe.html?id=${story}&viewMode=story`);
  await expect(page.locator('#storybook-root')).toBeVisible();
}

async function capture(
  page: Page,
  name: string,
  story: string,
  requestedRatios: Set<number>,
  region?: Locator | [Locator, Locator],
  includeContext = false,
): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    // Documentation illustrates mouse use; keyboard-focus behavior stays tested separately.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  const target = Array.isArray(region) ? region[0] : (region ?? page.locator('#storybook-root'));
  await target.scrollIntoViewIfNeeded();
  const bounds = await target.boundingBox();
  if (bounds === null) throw new Error(`Tutorial region is not visible: ${name}`);
  if (Array.isArray(region)) {
    const end = await region[1].boundingBox();
    if (end === null) throw new Error(`Tutorial end region is not visible: ${name}`);
    // Two consecutive panels in one column retain their real gap, not a stitched bitmap.
    expect(end.x).toBeCloseTo(bounds.x, 1);
    expect(end.width).toBeCloseTo(bounds.width, 1);
    expect(end.y).toBeGreaterThan(bounds.y + bounds.height);
    bounds.height = end.y + end.height - bounds.y;
  }
  const inset = includeContext ? screenInset : 0;
  const area = { width: bounds.width + inset * 2, height: bounds.height + inset * 2 };
  const pixelRatio = await page.evaluate(() => window.devicePixelRatio);
  const ratios = [
    ...new Set(
      displayDensities.map((density) => Math.ceil((displayedWidth * density) / area.width)),
    ),
  ];
  const masterRatio = Math.max(3, ...ratios);
  for (const ratio of [...ratios, masterRatio]) requestedRatios.add(ratio);
  if (!ratios.includes(pixelRatio) && pixelRatio !== masterRatio) return;
  const file = pixelRatio === masterRatio ? `${name}.png` : `${name}@${pixelRatio}x.png`;
  const options = {
    animations: 'disabled' as const,
    caret: 'hide' as const,
    path: path.join(directory, file),
    scale: 'device' as const,
  };
  let screenshot: Buffer;
  if (includeContext || Array.isArray(region)) {
    const pageBounds = await page.evaluate(() => ({
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));
    const clip = {
      x: bounds.x + pageBounds.scrollX - inset,
      y: bounds.y + pageBounds.scrollY - inset,
      ...area,
    };
    // Fail if the story no longer has this space; never synthesize a border in the bitmap.
    expect(clip.x).toBeGreaterThanOrEqual(0);
    expect(clip.y).toBeGreaterThanOrEqual(0);
    expect(clip.x + clip.width).toBeLessThanOrEqual(pageBounds.width);
    expect(clip.y + clip.height).toBeLessThanOrEqual(pageBounds.height);
    screenshot = await page.screenshot({ ...options, clip, fullPage: true });
  } else {
    screenshot = await target.screenshot(options);
  }
  const { width, height } = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  }, screenshot.toString('base64'));
  // Element screenshots round both CSS edges before applying device pixel density.
  const edgeRounding = 2 * pixelRatio;
  expect(Math.abs(width - area.width * pixelRatio)).toBeLessThanOrEqual(edgeRounding);
  expect(Math.abs(height - area.height * pixelRatio)).toBeLessThanOrEqual(edgeRounding);
  if (pixelRatio === masterRatio) {
    expect(width).toBeGreaterThanOrEqual(displayedWidth * Math.max(...displayDensities));
  }
  const record = captures.get(name) ?? { name, story, masterRatio, variants: [] };
  record.variants.push({ file, width, height, pixelRatio });
  captures.set(name, record);
}

tutorial(
  'the queue illustrates a chapter folder, a library and a complete CBZ',
  async (page, capture) => {
    const story = 'workflows-queue--tutorial-inputs';
    await openStory(page, story);
    await expect(
      page.getByRole('list', { name: 'Queued items' }).getByRole('listitem'),
    ).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Folder', exact: true })).toBeVisible();
    await capture(
      page,
      'queue-inputs',
      story,
      page.locator('#storybook-root section').first(),
      true,
    );
  },
);

tutorial(
  'manual mapping starts offline and shows actual chapter assignment',
  async (page, capture) => {
    const story = 'workflows-mapping-editor--manual-with-online-option';
    await openStory(page, story);
    await expect(page.getByRole('tab', { name: 'Manual', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Create first volume' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create first volume' })).toHaveText(
      'Create volume 1',
    );
    await capture(page, 'manual-mapping-start', story);
    await page.getByRole('button', { name: 'Create first volume' }).click();
    await page
      .getByRole('checkbox', { name: 'Select Chapter 1 — The Long Way Home', exact: true })
      .check();
    await page
      .getByRole('checkbox', { name: 'Select Chapter 2 — A Door Left Open', exact: true })
      .check();
    await page.getByRole('button', { name: 'Assign selected', exact: true }).click();
    await expect(
      page
        .getByRole('region', { name: 'Chapters', exact: true })
        .locator('span')
        .filter({ hasText: /^Volume 1$/u }),
    ).toHaveCount(2);
    await capture(page, 'manual-mapping', story);
  },
);

tutorial('online mapping shows a search and the reviewed suggestion', async (page, capture) => {
  const story = 'workflows-mapping-editor--with-metadata-suggestions';
  await openStory(page, story);
  await expect(page.getByRole('button', { name: 'Use these volumes', exact: true })).toHaveCount(2);
  await capture(page, 'online-mapping-search', story);
  await page.getByRole('button', { name: 'Use these volumes', exact: true }).first().click();
  await expect(page.getByRole('region', { name: 'Proposed chapter mapping' })).toBeVisible();
  await capture(page, 'online-mapping', story);
});

tutorial(
  'book details show editable metadata and the resulting volume titles',
  async (page, capture) => {
    const story = 'workflows-book-details--finding-the-author';
    await openStory(page, story);
    await expect(page.getByLabel('Author', { exact: true })).toHaveValue('Fujimoto Tatsuki');
    await page.getByLabel('Series title', { exact: true }).fill('Chainsaw Man (Deluxe)');
    await page.getByLabel('Language', { exact: true }).fill('pt-BR');
    await expect(page.getByLabel('Series title', { exact: true })).toHaveValue(
      'Chainsaw Man (Deluxe)',
    );
    await expect(page.getByLabel('Language', { exact: true })).toHaveValue('pt-BR');
    await expect(page.getByRole('list', { name: 'Book titles' })).toContainText(
      'Chainsaw Man (Deluxe) - Vol.01',
    );
    await capture(
      page,
      'book-details',
      story,
      page.locator('#storybook-root section').first(),
      true,
    );
  },
);

tutorial(
  'covers distinguish individual choices, folder images and first-page fallbacks',
  async (page, capture) => {
    const story = 'workflows-book-details--with-covers';
    await openStory(page, story);
    const covers = page.getByRole('list', { name: 'Books and their covers' });
    await expect(covers.getByRole('listitem')).toHaveCount(5);
    await expect(covers.getByText('01.jpg · from a folder', { exact: true })).toBeVisible();
    await expect(covers.getByText('IMG_2041.jpg', { exact: true })).toBeVisible();
    await expect(covers.getByText('First page', { exact: true })).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Add covers from a folder…' })).toBeVisible();
    await capture(
      page,
      'book-covers',
      story,
      page
        .getByRole('heading', { name: 'Covers', exact: true })
        .locator('xpath=ancestor::section[1]'),
    );
  },
);

tutorial(
  'reading and spread controls show their real conditional choices',
  async (page, capture) => {
    const story = 'workflows-output-settings--webtoon-strips';
    await openStory(page, story);
    await expect(page.getByRole('combobox', { name: 'Content', exact: true })).toHaveValue(
      'webtoon',
    );
    await expect(page.getByRole('checkbox', { name: 'Manga reading order' })).toBeDisabled();
    await expect(page.getByRole('combobox', { name: 'Wide pages', exact: true })).toBeDisabled();
    await expect(
      page.getByRole('checkbox', { name: 'Keep the whole spread upright' }),
    ).toBeDisabled();
    await capture(page, 'page-layout', story, [
      page
        .getByRole('heading', { name: 'Reading', exact: true })
        .locator('xpath=ancestor::section[1]'),
      page
        .getByRole('heading', { name: 'Double-page spreads', exact: true })
        .locator('xpath=ancestor::section[1]'),
    ]);
  },
);

tutorial(
  'color and page-image controls explain PNG choices and remaining JPEG pages',
  async (page, capture) => {
    const story = 'workflows-output-settings--color-and-png';
    await openStory(page, story);
    await expect(page.getByRole('combobox', { name: 'Color pages', exact: true })).toHaveValue(
      'color',
    );
    await expect(page.getByRole('combobox', { name: 'Page format', exact: true })).toHaveValue(
      'png',
    );
    await expect(page.getByRole('checkbox', { name: 'Keep all 256 grays' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: '8-bit PNG' })).toBeDisabled();
    await expect(page.getByLabel(/^JPEG quality/u)).toBeEnabled();
    await expect(page.getByText(/^For the color pages, which stay JPEG\./u)).toBeVisible();
    await capture(page, 'page-images', story, [
      page
        .getByRole('heading', { name: 'Color and tone', exact: true })
        .locator('xpath=ancestor::section[1]'),
      page
        .getByRole('heading', { name: 'Page images', exact: true })
        .locator('xpath=ancestor::section[1]'),
    ]);
  },
);

tutorial(
  'custom dimensions are real controlled fields, not an edited image',
  async (page, capture) => {
    const story = 'workflows-conversion-options--normal';
    await openStory(page, story);
    await expect(
      page.getByRole('heading', { name: 'Conversion options', exact: true }),
    ).toBeFocused();
    await page.getByLabel(/^Custom width/u).fill('1440');
    await page.getByLabel(/^Custom height/u).fill('1920');
    await expect(page.getByLabel(/^Custom width/u)).toHaveValue('1440');
    await expect(page.getByLabel(/^Custom height/u)).toHaveValue('1920');
    await capture(
      page,
      'device-settings',
      story,
      page.getByLabel('Device profile').locator('xpath=ancestor::section[1]'),
    );
  },
);

tutorial('single-book mode visibly locks the coupled process choices', async (page, capture) => {
  const story = 'workflows-queue--single-book-active';
  await openStory(page, story);
  await expect(
    page.getByRole('checkbox', { name: 'Create one book for the series' }),
  ).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Group chapters into volumes', exact: true }),
  ).toBeDisabled();
  await capture(
    page,
    'single-book',
    story,
    page.getByRole('complementary', { name: 'Conversion options' }),
  );
});

tutorial(
  'progress details show completed, converting and saving volumes',
  async (page, capture) => {
    const story = 'workflows-running--multiple-volumes';
    await openStory(page, story);
    await expect(page.getByRole('region', { name: 'Volume details' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hide details' })).toBeVisible();
    await capture(
      page,
      'processing-details',
      story,
      page.locator('#storybook-root section').first(),
      true,
    );
  },
);

tutorial(
  'results show repeatable saving and sharing without a focus outline',
  async (page, capture) => {
    const story = 'workflows-results--saved';
    await openStory(page, story);
    await expect(page.getByRole('heading', { name: '3 books ready' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Save all to folder…', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Share these books', exact: true }),
    ).toBeVisible();
    await capture(
      page,
      'save-results',
      story,
      page.locator('#storybook-root section').first(),
      true,
    );
    await expect(page.getByRole('heading', { name: '3 books ready' })).not.toBeFocused();
  },
);

tutorial('ready books expose reopening and safe deletion', async (page, capture) => {
  const story = 'workflows-queue--ready-books';
  await openStory(page, story);
  await expect(page.getByRole('button', { name: 'View books from Vol.01.epub' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Delete pending books from Vol.01.epub' }),
  ).toBeVisible();
  await capture(page, 'ready-books', story, page.getByRole('region', { name: 'Earlier books' }));
});

tutorial(
  'warnings name affected books without turning successful conversion into failure',
  async (page, capture) => {
    const story = 'workflows-results--with-warnings';
    await openStory(page, story);
    await expect(page.getByRole('heading', { name: '3 books ready' })).toBeVisible();
    await expect(page.getByText('Pages smaller than the screen', { exact: true })).toHaveCount(1);
    await expect(page.getByText('Pages already converted once', { exact: true })).toHaveCount(1);
    await expect(page.getByText(/^In all 3 books\./u)).toBeVisible();
    await expect(page.getByText(/^In Vagabond Vol\.03\.epub\./u)).toBeVisible();
    await capture(
      page,
      'book-warnings',
      story,
      page.locator('#storybook-root section').first(),
      true,
    );
  },
);

tutorial('sharing explains the interface and then the catalog address', async (page, capture) => {
  const setup = 'workflows-share-panel--ready-to-start';
  await openStory(page, setup);
  await expect(page.getByRole('combobox', { name: 'Network interface' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start sharing' })).toBeEnabled();
  await capture(
    page,
    'share-setup',
    setup,
    page.getByRole('region', { name: 'Share to your e-reader' }),
  );
  const active = 'workflows-share-panel--tutorial-sharing';
  await openStory(page, active);
  await expect(page.getByLabel('Catalog address')).toHaveValue('http://192.168.1.20:48123');
  await expect(page.getByRole('button', { name: 'Stop sharing' })).toBeVisible();
  await capture(
    page,
    'share-panel',
    active,
    page.getByRole('region', { name: 'Share to your e-reader' }),
  );
});
