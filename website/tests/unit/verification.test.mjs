import assert from 'node:assert/strict';
import test from 'node:test';

import { auditLinks, auditSearchData, translationGaps } from '../../scripts/verification.mjs';

const options = { site: 'https://example.org', base: '/mangabound/' };
const page = (path, html) => ({ path, html });

test('empty input cannot produce a false green verification', () => {
  assert.throws(() => translationGaps([]), /No documentation pages found/);
  assert.throws(() => auditLinks([], options), /No built HTML pages found/);
  assert.throws(() => auditSearchData([], options), /No built HTML pages found/);
});

test('translation parity accepts Windows and POSIX separators', () => {
  for (const paths of [
    ['guide/start.mdx', 'pt-br/guide/start.mdx'],
    ['guide\\start.mdx', 'pt-br\\guide\\start.mdx'],
  ]) {
    assert.deepEqual(translationGaps(paths), {
      englishCount: 1,
      portugueseCount: 1,
      missingPortuguese: [],
      missingEnglish: [],
    });
  }
});

test('translation parity reports missing counterparts in both directions', () => {
  const result = translationGaps(['en-only.mdx', 'pt-br/pt-only.mdx']);
  assert.deepEqual(result.missingPortuguese, ['en-only.mdx']);
  assert.deepEqual(result.missingEnglish, ['pt-only.mdx']);
});

test('valid relative, project-root, query, and encoded-anchor URLs resolve', () => {
  const result = auditLinks(
    [
      page(
        'index.html',
        '<a href="guide/?q=1&amp;x=2#ol%C3%A1">go</a><a href="/mangabound/guide/">go</a>',
      ),
      page(
        'guide/index.html',
        '<h2 id="olá">Title</h2><a href="../">home</a><a href="#ol%C3%A1">same</a>',
      ),
    ],
    options,
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.internal, 4);
});

test('a missing project base fails even when the dist file exists', () => {
  const result = auditLinks(
    [
      page(
        'index.html',
        '<a href="/guide/">wrong</a><a href="https://example.org/guide/">also wrong</a>',
      ),
      page('guide/index.html', '<h1>Guide</h1>'),
    ],
    options,
  );
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0].reason, /outside the project base/);
});

test('alternate deployment bases use configuration, not the project name', () => {
  const result = auditLinks(
    [
      page('index.html', '<a href="/preview/guide/">go</a>'),
      page('guide/index.html', '<h1>Guide</h1>'),
    ],
    { ...options, base: '/preview/' },
  );
  assert.deepEqual(result.errors, []);
});

test('host-root deployment and direct HTML pages resolve', () => {
  const result = auditLinks(
    [page('index.html', '<a href="/404.html">404</a>'), page('404.html', '<a href="/">home</a>')],
    { ...options, base: '/' },
  );
  assert.deepEqual(result.errors, []);
});

test('missing pages and missing anchors fail', () => {
  const result = auditLinks(
    [page('index.html', '<a href="missing/">bad</a><a href="#missing">bad</a>')],
    options,
  );
  assert.deepEqual(
    result.errors.map(({ reason }) => reason),
    ['Target does not exist', 'Anchor #missing does not exist'],
  );
});

test('external and contact links do not trigger network requests', () => {
  const result = auditLinks(
    [
      page(
        'index.html',
        '<a href="https://external.org/">external</a><a href="mailto:a@example.org">mail</a><a href="tel:123">call</a>',
      ),
    ],
    options,
  );
  assert.equal(result.external, 1);
  assert.equal(result.internal, 0);
  assert.deepEqual(result.errors, []);
});

test('HTML parsing supports unquoted attributes and named anchors', () => {
  const result = auditLinks(
    [page('index.html', '<a name=legacy></a><a href=#legacy>legacy</a>')],
    options,
  );
  assert.deepEqual(result.errors, []);
});

test('missing local images and videos fail; present GIF assets pass', () => {
  const result = auditLinks(
    [page('index.html', '<img src="images/demo.gif"><video src="images/missing.webm"></video>')],
    { ...options, assets: ['images/demo.gif'] },
  );
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].link, 'images/missing.webm');
});

test('unsafe schemes, malformed URLs, and malformed encoding fail', () => {
  const result = auditLinks(
    [
      page(
        'index.html',
        '<a href="javascript:alert(1)">unsafe</a><a href="https://[">invalid</a><a href="#%ZZ">bad encoding</a>',
      ),
    ],
    options,
  );
  assert.deepEqual(
    result.errors.map(({ reason }) => reason),
    ['Unsupported URL scheme', 'Invalid URL', 'Invalid URL encoding'],
  );
});

const description = 'd'.repeat(120);
const indexed = (
  address,
  { title = `Page ${address}`, text = description, body = '<h1>T</h1>' } = {},
) =>
  `<head><title>${title}</title><meta name="description" content="${text}">` +
  `<link rel="canonical" href="https://example.org/mangabound/${address}">` +
  `<script type="application/ld+json">{"@type":"WebSite"}</script></head>${body}`;

test('complete pages pass and a noindex page is not held to the same rules', () => {
  const result = auditSearchData(
    [
      page('index.html', indexed('')),
      page('guide\\index.html', indexed('guide/', { body: '<h1>T</h1><img src="a.png" alt="">' })),
      page('404.html', '<head><meta name="robots" content="noindex"></head>'),
    ],
    options,
  );
  assert.deepEqual(result, { indexable: 2, errors: [] });
});

test('a page with nothing for a search engine reports each missing part', () => {
  const result = auditSearchData([page('index.html', '<head></head><img src="a.png">')], options);
  assert.deepEqual(
    result.errors.map((error) => error.reason),
    [
      'No title',
      'Description has 0 characters; expected 110 to 160',
      'Canonical address is not https://example.org/mangabound/',
      'Expected one h1, found 0',
      'No structured data',
      '1 image(s) without alternative text',
    ],
  );
});

test('a repeated title, an overlong description, and broken structured data fail', () => {
  const result = auditSearchData(
    [
      page('index.html', indexed('', { title: 'Same' })),
      page('a/index.html', indexed('a/', { title: 'Same', text: 'd'.repeat(161) })),
      page('b/index.html', indexed('b/').replace('{"@type":"WebSite"}', '{')),
    ],
    options,
  );
  assert.deepEqual(result.errors, [
    { source: 'a/index.html', reason: 'Title is also used by index.html' },
    { source: 'a/index.html', reason: 'Description has 161 characters; expected 110 to 160' },
    { source: 'b/index.html', reason: 'Structured data is not valid JSON' },
  ]);
});
