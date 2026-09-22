import { encodeRelativePath } from './links';
import { bookFormatMimeTypes } from './mime';
import { escapeXml } from './xml';

import type { LibraryBookEntry } from '@/library/manifest';
import { sortNewestFirst } from '@/library/publish';

export const navigationFeedType = 'application/atom+xml;profile=opds-catalog;kind=navigation';
export const acquisitionFeedType = 'application/atom+xml;profile=opds-catalog;kind=acquisition';

export interface OpdsCatalogConfig {
  readonly baseUrl: string;
  readonly libraryTitle: string;
  readonly updated: string;
}

export function entryId(relativePath: string): string {
  return `urn:mangabound:book:${encodeRelativePath(relativePath)}`;
}

export function buildNavigationFeed(config: OpdsCatalogConfig): string {
  const rootHref = `${config.baseUrl}/`;
  const recentHref = `${config.baseUrl}/recent`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog">',
    '  <id>urn:mangabound:root</id>',
    `  <title>${escapeXml(config.libraryTitle)}</title>`,
    `  <updated>${escapeXml(config.updated)}</updated>`,
    `  <link rel="self" href="${escapeXml(rootHref)}" type="${navigationFeedType}"/>`,
    `  <link rel="start" href="${escapeXml(rootHref)}" type="${navigationFeedType}"/>`,
    '  <entry>',
    '    <title>Recently converted</title>',
    '    <id>urn:mangabound:recent</id>',
    `    <updated>${escapeXml(config.updated)}</updated>`,
    '    <content type="text">The most recently converted books, newest first.</content>',
    `    <link rel="subsection" href="${escapeXml(recentHref)}" type="${acquisitionFeedType}"/>`,
    '  </entry>',
    '</feed>',
    '',
  ].join('\n');
}

export function buildAcquisitionFeed(
  config: OpdsCatalogConfig,
  books: readonly LibraryBookEntry[],
): string {
  const sorted = sortNewestFirst(books);
  const rootHref = `${config.baseUrl}/`;
  const selfHref = `${config.baseUrl}/recent`;
  const updated = sorted[0]?.convertedAt ?? config.updated;
  const entries = sorted.map((book) => {
    const acquisitionHref = `${config.baseUrl}/books/${encodeRelativePath(book.relativePath)}`;
    return [
      '  <entry>',
      `    <title>${escapeXml(book.title)}</title>`,
      `    <id>${escapeXml(entryId(book.relativePath))}</id>`,
      `    <updated>${escapeXml(book.convertedAt)}</updated>`,
      '    <author>',
      `      <name>${escapeXml(book.author)}</name>`,
      '    </author>',
      `    <link rel="http://opds-spec.org/acquisition" href="${escapeXml(acquisitionHref)}" type="${bookFormatMimeTypes[book.format]}"/>`,
      '  </entry>',
    ].join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog">',
    '  <id>urn:mangabound:recent</id>',
    '  <title>Recently converted</title>',
    `  <updated>${escapeXml(updated)}</updated>`,
    `  <link rel="self" href="${escapeXml(selfHref)}" type="${acquisitionFeedType}"/>`,
    `  <link rel="start" href="${escapeXml(rootHref)}" type="${navigationFeedType}"/>`,
    ...entries,
    '</feed>',
    '',
  ].join('\n');
}
