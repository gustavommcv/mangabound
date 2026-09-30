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
