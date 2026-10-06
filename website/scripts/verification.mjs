import { isDeepStrictEqual } from 'node:util';

import { load } from 'cheerio';

const portablePath = (value) => value.replaceAll('\\', '/');

export function translationGaps(paths) {
  if (paths.length === 0) throw new Error('No documentation pages found');
  const files = paths.map(portablePath);
  const english = files.filter((file) => !file.startsWith('pt-br/'));
  const portuguese = files.filter((file) => file.startsWith('pt-br/')).map((file) => file.slice(6));
  return {
    englishCount: english.length,
    portugueseCount: portuguese.length,
    missingPortuguese: english.filter((file) => !portuguese.includes(file)),
    missingEnglish: portuguese.filter((file) => !english.includes(file)),
  };
}

/** Resolve actual browser URLs against the deployed base, not guessed filesystem paths. */
export function auditLinks(pages, { site, base, assets = [] }) {
  if (pages.length === 0) throw new Error('No built HTML pages found');
  const root = new URL(base.replace(/\/?$/, '/'), site);
  const parsed = new Map(pages.map(({ path, html }) => [portablePath(path), load(html)]));
  const availableAssets = new Set(assets.map(portablePath));
  const errors = [];
  let internal = 0;
  let external = 0;

  for (const [source, $] of parsed) {
    const current = new URL(source.replace(/index\.html$/, ''), root);
    $('a[href], img[src], video[src], source[src]').each((_index, element) => {
      const raw = $(element).attr(element.name === 'a' ? 'href' : 'src');
      const fail = (reason) => errors.push({ source, link: raw, reason });
      let target;
      try {
        target = new URL(raw, current);
      } catch {
        fail('Invalid URL');
        return;
      }
      if (['mailto:', 'tel:'].includes(target.protocol)) return;
      if (!['https:', 'http:'].includes(target.protocol)) {
        fail('Unsupported URL scheme');
        return;
      }
      if (target.origin !== root.origin) {
        external++;
        return;
      }
      internal++;
      if (!target.pathname.startsWith(root.pathname)) {
        fail(`URL is outside the project base ${root.pathname}`);
        return;
      }
      let relative;
      let anchor;
      try {
        relative = decodeURIComponent(target.pathname.slice(root.pathname.length));
        anchor = decodeURIComponent(target.hash.slice(1));
      } catch {
        fail('Invalid URL encoding');
        return;
      }
      const targetPage =
        parsed.get(relative) ??
        parsed.get(`${relative.replace(/\/$/, '')}/index.html`) ??
        (relative === '' ? parsed.get('index.html') : undefined);
      if (targetPage === undefined) {
        if (!availableAssets.has(relative)) fail('Target does not exist');
        return;
      }
      if (
        anchor &&
        !targetPage('[id], a[name]')
          .toArray()
          .some(
            (node) =>
              targetPage(node).attr('id') === anchor || targetPage(node).attr('name') === anchor,
          )
      ) {
        fail(`Anchor #${anchor} does not exist`);
      }
    });
  }
  return { internal, external, errors };
}

/** Check the published documentation contract, not general schema.org validity or ranking. */
export function auditSearchData(pages, { site, base }) {
  if (pages.length === 0) throw new Error('No built HTML pages found');
  const root = new URL(base.replace(/\/?$/, '/'), site);
  const titles = new Map();
  const errors = [];
  let indexable = 0;

  for (const page of pages) {
    const source = portablePath(page.path);
    const $ = load(page.html);
    const fail = (reason) => errors.push({ source, reason });
    const noindex = $('meta[name="robots" i], meta[name="googlebot" i]')
      .toArray()
      .some((node) => /\b(noindex|none)\b/i.test($(node).attr('content') ?? ''));
    if (source === '404.html') {
      if (!noindex) fail('404 page must be marked noindex');
      continue;
    }
    if (noindex) {
      fail('Documentation page must remain indexable');
      continue;
    }
    indexable++;

    const title = $('head > title').text().trim();
    if (!title) fail('No title');
    else if (titles.has(title)) fail(`Title is also used by ${titles.get(title)}`);
    else titles.set(title, source);

    const description = $('meta[name="description"]').attr('content') ?? '';
    if (!description.trim()) fail('No description');

    const address = new URL(source.replace(/index\.html$/, ''), root).href;
    if ($('link[rel="canonical"]').attr('href') !== address)
      fail(`Canonical address is not ${address}`);

    const headings = $('h1').length;
    if (headings !== 1) fail(`Expected one h1, found ${headings}`);

    const portuguese = source.startsWith('pt-br/');
    const home = new URL(portuguese ? 'pt-br/' : '', root).href;
    const lang = portuguese ? 'pt-BR' : 'en';
    if ($('html').attr('lang') !== lang) fail(`Page language is not ${lang}`);

    const data = $('script[type="application/ld+json"]').toArray();
    if (data.length === 0) fail('No structured data');
    for (const node of data) {
      let document;
      try {
        document = JSON.parse($(node).text());
      } catch {
        fail('Structured data is not valid JSON');
        continue;
      }
      if (document?.['@context'] !== 'https://schema.org')
        fail('Structured data context is not schema.org');
      const entities = Array.isArray(document?.['@graph']) ? document['@graph'] : [document];
      const types = address === home ? ['WebSite', 'SoftwareApplication'] : ['BreadcrumbList'];
      for (const type of types) {
        const entity = entities.find((entry) => entry?.['@type'] === type);
        if (!entity) {
          fail(`No ${type} structured data`);
          continue;
        }
        const expected =
          type === 'BreadcrumbList'
            ? {
                itemListElement: [
                  { '@type': 'ListItem', position: 1, name: 'Mangabound', item: home },
                  { '@type': 'ListItem', position: 2, name: $('h1').text().trim(), item: address },
                ],
              }
            : {
                name: 'Mangabound',
                url: address,
                description,
                inLanguage: type === 'WebSite' ? lang : 'en',
              };
        for (const [key, value] of Object.entries(expected)) {
          if (!isDeepStrictEqual(entity[key], value))
            fail(`${type}.${key} does not match this page`);
        }
      }
    }

    const withoutText = $('img:not([alt])').length;
    if (withoutText) fail(`${withoutText} image(s) without alternative text`);
  }
  if (indexable === 0)
    errors.push({ source: 'dist', reason: 'No indexable documentation pages found' });
  return { indexable, errors };
}
