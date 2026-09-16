import { describe, expect, it } from 'vitest';

import type { LibraryBookEntry } from '@/library/manifest';
import { publishBook } from '@/library/publish';
import {
  acquisitionFeedType,
  buildAcquisitionFeed,
  buildNavigationFeed,
  entryId,
  navigationFeedType,
  type OpdsCatalogConfig,
} from '@/opds/feed';

function book(overrides: Partial<LibraryBookEntry> = {}): LibraryBookEntry {
  return {
    relativePath: 'Manga/Vol.01.epub',
    title: 'Manga',
    author: 'Unknown',
    format: 'epub',
    bytes: 100,
    convertedAt: '2026-09-16T10:00:00.000Z',
    ...overrides,
  };
}

const baseConfig: OpdsCatalogConfig = {
  baseUrl: 'http://192.168.1.20:51234',
  libraryTitle: 'My Library',
  updated: '2026-09-16T00:00:00.000Z',
};

describe('buildNavigationFeed', () => {
  it('links to the acquisition feed with the navigation feed self/start links', () => {
    const xml = buildNavigationFeed(baseConfig);

    expect(xml).toContain(`type="${navigationFeedType}"`);
    expect(xml).toContain(
      `<link rel="subsection" href="http://192.168.1.20:51234/recent" type="${acquisitionFeedType}"/>`,
    );
    expect(xml).toContain('<updated>2026-09-16T00:00:00.000Z</updated>');
  });

  it('embeds the token in the subsection link when configured', () => {
    const xml = buildNavigationFeed({ ...baseConfig, token: 'secret' });

    expect(xml).toContain('href="http://192.168.1.20:51234/recent?token=secret"');
  });
});

describe('buildAcquisitionFeed', () => {
  it('produces a well-formed feed with no entries for an empty library', () => {
    const xml = buildAcquisitionFeed(baseConfig, []);

    expect(xml).not.toContain('<entry>');
    expect(xml).toContain('<updated>2026-09-16T00:00:00.000Z</updated>');
  });

  it('orders entries newest-converted-first regardless of input order', () => {
    const oldest = book({ relativePath: 'a', convertedAt: '2026-09-16T08:00:00.000Z' });
    const newest = book({ relativePath: 'b', convertedAt: '2026-09-16T12:00:00.000Z' });
    const middle = book({ relativePath: 'c', convertedAt: '2026-09-16T10:00:00.000Z' });

    const xml = buildAcquisitionFeed(baseConfig, [oldest, newest, middle]);

    const newestIndex = xml.indexOf(entryId('b'));
    const middleIndex = xml.indexOf(entryId('c'));
    const oldestIndex = xml.indexOf(entryId('a'));
    expect(newestIndex).toBeGreaterThan(-1);
    expect(newestIndex).toBeLessThan(middleIndex);
    expect(middleIndex).toBeLessThan(oldestIndex);
  });

  it('keeps a stable entry id and a single entry across a collision replace', () => {
    const original = book({ bytes: 100, convertedAt: '2026-09-16T10:00:00.000Z' });
    const republished = book({ bytes: 200, convertedAt: '2026-09-16T11:00:00.000Z' });
    const manifestAfterReplace = publishBook(
      publishBook({ schemaVersion: 1, books: [] }, original),
      republished,
    );

    const xml = buildAcquisitionFeed(baseConfig, manifestAfterReplace.books);

    expect(xml.match(/<entry>/g)).toHaveLength(1);
    expect(xml).toContain(`<id>${entryId(republished.relativePath)}</id>`);
    expect(xml).toContain('<updated>2026-09-16T11:00:00.000Z</updated>');
  });

  it('sets the acquisition link type from the book format', () => {
    const epub = buildAcquisitionFeed(baseConfig, [book({ format: 'epub' })]);
    const cbz = buildAcquisitionFeed(baseConfig, [book({ format: 'cbz' })]);
    const pdf = buildAcquisitionFeed(baseConfig, [book({ format: 'pdf' })]);

    expect(epub).toContain('type="application/epub+zip"');
    expect(cbz).toContain('type="application/vnd.comicbook+zip"');
    expect(pdf).toContain('type="application/pdf"');
  });

  it('embeds the token in acquisition links when configured, omits it otherwise', () => {
    const withoutToken = buildAcquisitionFeed(baseConfig, [book()]);
    const withToken = buildAcquisitionFeed({ ...baseConfig, token: 'secret' }, [book()]);

    expect(withoutToken).toContain('href="http://192.168.1.20:51234/books/Manga/Vol.01.epub"');
    expect(withToken).toContain(
      'href="http://192.168.1.20:51234/books/Manga/Vol.01.epub?token=secret"',
    );
  });

  it('escapes reserved characters in a title and author while keeping surrounding tags intact', () => {
    const xml = buildAcquisitionFeed(baseConfig, [
      book({ title: `Tom & Jerry: "Cat's Life" <redux>`, author: `A & B` }),
    ]);

    expect(xml).toContain(
      '<title>Tom &amp; Jerry: &quot;Cat&apos;s Life&quot; &lt;redux&gt;</title>',
    );
    expect(xml).toContain('<name>A &amp; B</name>');
  });
});

describe('entryId', () => {
  it('is deterministic for a given relative path', () => {
    expect(entryId('Manga/Vol.01.epub')).toBe(entryId('Manga/Vol.01.epub'));
  });

  it('differs for different relative paths', () => {
    expect(entryId('Manga/Vol.01.epub')).not.toBe(entryId('Manga/Vol.02.epub'));
  });
});
