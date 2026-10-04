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

/** What a search engine reads from each page it may index. A page marked `noindex` is not one. */
export function auditSearchData(pages, { site, base }) {
  if (pages.length === 0) throw new Error('No built HTML pages found');
  const root = new URL(base.replace(/\/?$/, '/'), site);
  const titles = new Map();
  const errors = [];
  let indexable = 0;

  for (const page of pages) {
    const source = portablePath(page.path);
    const $ = load(page.html);
    if ($('meta[name="robots"]').attr('content')?.includes('noindex')) continue;
    indexable++;
    const fail = (reason) => errors.push({ source, reason });

    const title = $('head > title').text().trim();
    if (!title) fail('No title');
    else if (titles.has(title)) fail(`Title is also used by ${titles.get(title)}`);
    else titles.set(title, source);

    const description = $('meta[name="description"]').attr('content') ?? '';
    if (description.length < 110 || description.length > 160)
      fail(`Description has ${description.length} characters; expected 110 to 160`);

    const address = new URL(source.replace(/index\.html$/, ''), root).href;
    if ($('link[rel="canonical"]').attr('href') !== address)
      fail(`Canonical address is not ${address}`);

    const headings = $('h1').length;
    if (headings !== 1) fail(`Expected one h1, found ${headings}`);

    const data = $('script[type="application/ld+json"]').toArray();
    if (data.length === 0) fail('No structured data');
    for (const node of data) {
      try {
        JSON.parse($(node).text());
      } catch {
        fail('Structured data is not valid JSON');
      }
    }

    const withoutText = $('img:not([alt])').length;
    if (withoutText) fail(`${withoutText} image(s) without alternative text`);
  }
  return { indexable, errors };
}
