import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { load } from 'cheerio';

import { base, site } from '../../site.config.mjs';
import { filesUnder } from '../../scripts/files.mjs';
import { auditSearchData } from '../../scripts/verification.mjs';

// Use the output of the real Astro/Starlight build, including its middleware and both locales.
const directory = path.resolve('dist');
const pages = filesUnder(directory)
  .filter((file) => file.endsWith('.html'))
  .map((file) => ({
    path: file.replaceAll('\\', '/'),
    html: readFileSync(path.join(directory, file), 'utf8'),
  }));
const options = { base, site };
const root = new URL(base.replace(/\/?$/, '/'), site);

function changePage(source, edit) {
  return pages.map((page) => {
    if (page.path !== source) return page;
    const $ = load(page.html);
    edit($);
    return { ...page, html: $.html() };
  });
}

test('the real built documentation remains indexable, with only its 404 excluded', () => {
  const result = auditSearchData(pages, options);
  assert.deepEqual(result.errors, []);
  assert.equal(result.indexable, pages.length - 1);
  assert.ok(pages.some((page) => page.path === '404.html'));
  assert.ok(result.indexable > 0);
});

for (const [source, lang] of [
  ['index.html', 'en'],
  ['pt-br/index.html', 'pt-BR'],
]) {
  test(`the built ${lang} home describes the site, the English app, and local sharing`, () => {
    const page = pages.find((page) => page.path === source);
    assert.ok(page, `${source} must be built`);
    const $ = load(page.html);
    const script = $('script[type="application/ld+json"]');
    assert.equal(script.length, 1);
    const data = JSON.parse(script.text());
    const website = data['@graph'].find((entity) => entity['@type'] === 'WebSite');
    const application = data['@graph'].find((entity) => entity['@type'] === 'SoftwareApplication');
    const url = new URL(source.replace('index.html', ''), root).href;
    assert.equal(website.url, url);
    assert.equal(website.inLanguage, lang);
    assert.equal(application.url, url);
    assert.equal(application.inLanguage, 'en');
    assert.equal(application.offers.price, '0');
    assert.equal(application.downloadUrl, 'https://github.com/gustavommcv/mangabound/releases');
    assert.equal($('html').attr('lang'), lang);
    assert.match($('meta[name="description"]').attr('content'), /KOReader/);
    assert.match($('meta[name="description"]').attr('content'), /local network|rede local/);
    assert.equal($('title').length, 1);
    assert.match($('title').text(), /Mangabound: /);
    assert.equal($('h1').text(), 'Mangabound');
  });

  test(`unexpected noindex on just the ${lang} home is a failure`, () => {
    const changed = changePage(source, ($) =>
      $('head').append('<meta name="robots" content="noindex">'),
    );
    assert.ok(
      auditSearchData(changed, options).errors.some(
        (error) =>
          error.source === source && error.reason === 'Documentation page must remain indexable',
      ),
    );
  });

  test(`empty JSON cannot replace the built ${lang} home data`, () => {
    const changed = changePage(source, ($) => $('script[type="application/ld+json"]').text('{}'));
    const errors = auditSearchData(changed, options).errors;
    assert.ok(
      errors.some(
        (error) => error.source === source && error.reason === 'No WebSite structured data',
      ),
    );
    assert.ok(
      errors.some(
        (error) =>
          error.source === source && error.reason === 'No SoftwareApplication structured data',
      ),
    );
  });
}

test('a global noindex regression cannot pass against the real built pages', () => {
  const changed = pages.map((page) => ({
    ...page,
    html: page.html.replace('</head>', '<meta name="robots" content="noindex"></head>'),
  }));
  const result = auditSearchData(changed, options);
  assert.equal(result.indexable, 0);
  assert.equal(
    result.errors.filter((error) => error.reason === 'Documentation page must remain indexable')
      .length,
    pages.length - 1,
  );
});

test('the real 404 cannot lose its noindex directive', () => {
  const changed = changePage('404.html', ($) => $('meta[name="robots"]').remove());
  assert.ok(
    auditSearchData(changed, options).errors.some(
      (error) => error.source === '404.html' && error.reason === '404 page must be marked noindex',
    ),
  );
});

test('a Portuguese breadcrumb cannot point to the English home', () => {
  const source = 'pt-br/getting-started/installation/index.html';
  const changed = changePage(source, ($) => {
    const script = $('script[type="application/ld+json"]');
    const data = JSON.parse(script.text());
    assert.equal(data['@type'], 'BreadcrumbList');
    data.itemListElement[0].item = root.href;
    script.text(JSON.stringify(data));
  });
  assert.ok(
    auditSearchData(changed, options).errors.some(
      (error) =>
        error.source === source &&
        error.reason === 'BreadcrumbList.itemListElement does not match this page',
    ),
  );
});

test('a home-page entity cannot silently move to another canonical URL', () => {
  const changed = changePage('index.html', ($) => {
    const script = $('script[type="application/ld+json"]');
    const data = JSON.parse(script.text());
    data['@graph'].find((entity) => entity['@type'] === 'WebSite').url = new URL(
      'pt-br/',
      root,
    ).href;
    script.text(JSON.stringify(data));
  });
  assert.ok(
    auditSearchData(changed, options).errors.some(
      (error) =>
        error.source === 'index.html' && error.reason === 'WebSite.url does not match this page',
    ),
  );
});
