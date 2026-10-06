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
  { title = `Page ${address}`, text = description, body = '<h1>T</h1>', root = options.base } = {},
) => {
  const url = `https://example.org${root}${address}`;
  const lang = address.startsWith('pt-br/') ? 'pt-BR' : 'en';
  const home = `https://example.org${root}${lang === 'pt-BR' ? 'pt-br/' : ''}`;
  const data =
    url === home
      ? {
          '@context': 'https://schema.org',
          '@graph': [
            { '@type': 'WebSite', name: 'Mangabound', url, description: text, inLanguage: lang },
            {
              '@type': 'SoftwareApplication',
              name: 'Mangabound',
              url,
              description: text,
              inLanguage: 'en',
            },
          ],
        }
      : {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Mangabound', item: home },
            { '@type': 'ListItem', position: 2, name: 'T', item: url },
          ],
        };
  return (
    `<html lang="${lang}"><head><title>${title}</title><meta name="description" content="${text}">` +
    `<link rel="canonical" href="${url}">` +
    `<script type="application/ld+json">${JSON.stringify(data)}</script></head>${body}</html>`
  );
};

const withData = (html, data) =>
  html.replace(/(<script type="application\/ld\+json">).*?(<\/script>)/, `$1${data}$2`);

test('both locales pass, while only the noindex 404 is exempt', () => {
  const result = auditSearchData(
    [
      page('index.html', indexed('')),
      page('guide\\index.html', indexed('guide/', { body: '<h1>T</h1><img src="a.png" alt="">' })),
      page('pt-br/index.html', indexed('pt-br/')),
      page('pt-br/guide/index.html', indexed('pt-br/guide/')),
      page('404.html', '<head><meta name="robots" content="noindex"></head>'),
    ],
    options,
  );
  assert.deepEqual(result, { indexable: 4, errors: [] });
});

test('a page with nothing for a search engine reports each missing part', () => {
  const result = auditSearchData([page('index.html', '<head></head><img src="a.png">')], options);
  assert.deepEqual(
    result.errors.map((error) => error.reason),
    [
      'No title',
      'No description',
      'Canonical address is not https://example.org/mangabound/',
      'Expected one h1, found 0',
      'Page language is not en',
      'No structured data',
      '1 image(s) without alternative text',
    ],
  );
});

test('a repeated title, a blank description, and broken structured data fail', () => {
  const result = auditSearchData(
    [
      page('index.html', indexed('', { title: 'Same' })),
      page('a/index.html', indexed('a/', { title: 'Same', text: '   ' })),
      page('b/index.html', withData(indexed('b/'), '{')),
    ],
    options,
  );
  assert.deepEqual(result.errors, [
    { source: 'a/index.html', reason: 'Title is also used by index.html' },
    { source: 'a/index.html', reason: 'No description' },
    { source: 'b/index.html', reason: 'Structured data is not valid JSON' },
  ]);
});

test('descriptions are required but have no arbitrary character-count gate', () => {
  for (const text of ['Short summary.', 'A complete summary. '.repeat(20)]) {
    assert.deepEqual(
      auditSearchData([page('index.html', indexed('', { text }))], options).errors,
      [],
    );
  }
});

test('noindex on any guide fails, including case variations and Google-specific directives', () => {
  for (const tag of [
    '<meta name="robots" content="noindex">',
    '<meta name="ROBOTS" content="NOINDEX, FOLLOW">',
    '<meta name="googlebot" content="none">',
  ]) {
    const result = auditSearchData(
      [
        page('index.html', indexed('')),
        page('guide/index.html', indexed('guide/').replace('</head>', `${tag}</head>`)),
      ],
      options,
    );
    assert.deepEqual(result, {
      indexable: 1,
      errors: [{ source: 'guide/index.html', reason: 'Documentation page must remain indexable' }],
    });
  }
});

test('an entirely excluded site and a site containing only a 404 cannot pass', () => {
  const excluded = '<meta name="robots" content="noindex">';
  assert.deepEqual(auditSearchData([page('index.html', excluded)], options), {
    indexable: 0,
    errors: [
      { source: 'index.html', reason: 'Documentation page must remain indexable' },
      { source: 'dist', reason: 'No indexable documentation pages found' },
    ],
  });
  assert.deepEqual(auditSearchData([page('404.html', excluded)], options).errors, [
    { source: 'dist', reason: 'No indexable documentation pages found' },
  ]);
});

test('the 404 must explicitly exclude itself from indexing', () => {
  const result = auditSearchData(
    [page('index.html', indexed('')), page('404.html', '<meta name="robots">')],
    options,
  );
  assert.deepEqual(result.errors, [
    { source: '404.html', reason: '404 page must be marked noindex' },
  ]);
});

test('valid JSON cannot stand in for missing structured-data entities', () => {
  for (const data of [
    '{}',
    'null',
    '[]',
    '"text"',
    '{"@context":"https://schema.org","@graph":[null,0,{}]}',
  ]) {
    const result = auditSearchData([page('index.html', withData(indexed(''), data))], options);
    assert.ok(result.errors.some(({ reason }) => reason === 'No WebSite structured data'));
    assert.ok(
      result.errors.some(({ reason }) => reason === 'No SoftwareApplication structured data'),
    );
  }
});

test('structured-data context, identity, page URL, description, and language must match', () => {
  const data = {
    '@context': 'https://example.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: 'Other',
        url: 'https://other.org',
        description: 'Other',
        inLanguage: 'de',
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Other',
        url: 'https://other.org',
        description: 'Other',
        inLanguage: 'pt-BR',
      },
    ],
  };
  const result = auditSearchData(
    [page('index.html', withData(indexed(''), JSON.stringify(data)))],
    options,
  );
  assert.deepEqual(
    result.errors.map(({ reason }) => reason),
    [
      'Structured data context is not schema.org',
      'WebSite.name does not match this page',
      'WebSite.url does not match this page',
      'WebSite.description does not match this page',
      'WebSite.inLanguage does not match this page',
      'SoftwareApplication.name does not match this page',
      'SoftwareApplication.url does not match this page',
      'SoftwareApplication.description does not match this page',
      'SoftwareApplication.inLanguage does not match this page',
    ],
  );
});

test('breadcrumbs cannot cross locales or lose their ordered path back home', () => {
  for (const data of [
    { '@context': 'https://schema.org', '@type': 'WebSite' },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [] },
  ]) {
    const result = auditSearchData(
      [page('pt-br/guide/index.html', withData(indexed('pt-br/guide/'), JSON.stringify(data)))],
      options,
    );
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0].reason, /BreadcrumbList/);
  }
});

test('structured-data and canonical checks follow an alternate deployment base', () => {
  for (const root of ['/', '/preview/']) {
    const result = auditSearchData(
      [
        page('index.html', indexed('', { root })),
        page('pt-br/index.html', indexed('pt-br/', { root })),
      ],
      { ...options, base: root },
    );
    assert.deepEqual(result.errors, []);
  }
});
