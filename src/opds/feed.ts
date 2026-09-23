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

/** One flat acquisition feed a person can browse into from the root (ADR 0007, amended by 0020). */
export interface AcquisitionFeedInfo {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly path: string;
}

export const recentFeed: AcquisitionFeedInfo = {
  id: 'urn:mangabound:recent',
  title: 'Recently converted',
  summary: 'The most recently converted books, newest first.',
  path: '/recent',
};

export const otherFilesFeed: AcquisitionFeedInfo = {
  id: 'urn:mangabound:other',
  title: 'Other files',
  summary: 'Comic and book files found in this folder that were not converted here.',
  path: '/other',
};

export function entryId(relativePath: string): string {
  return `urn:mangabound:book:${encodeRelativePath(relativePath)}`;
}

export function buildNavigationFeed(config: OpdsCatalogConfig): string {
  const rootHref = `${config.baseUrl}/`;
  const sections = [recentFeed, otherFilesFeed].map((feed) => {
    const href = `${config.baseUrl}${feed.path}`;
    return [
      '  <entry>',
      `    <title>${escapeXml(feed.title)}</title>`,
      `    <id>${escapeXml(feed.id)}</id>`,
      `    <updated>${escapeXml(config.updated)}</updated>`,
      `    <content type="text">${escapeXml(feed.summary)}</content>`,
      `    <link rel="subsection" href="${escapeXml(href)}" type="${acquisitionFeedType}"/>`,
      '  </entry>',
    ].join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog">',
    '  <id>urn:mangabound:root</id>',
    `  <title>${escapeXml(config.libraryTitle)}</title>`,
    `  <updated>${escapeXml(config.updated)}</updated>`,
    `  <link rel="self" href="${escapeXml(rootHref)}" type="${navigationFeedType}"/>`,
    `  <link rel="start" href="${escapeXml(rootHref)}" type="${navigationFeedType}"/>`,
    ...sections,
    '</feed>',
    '',
  ].join('\n');
}

export function buildAcquisitionFeed(
  config: OpdsCatalogConfig,
  feed: AcquisitionFeedInfo,
  books: readonly LibraryBookEntry[],
): string {
  const sorted = sortNewestFirst(books);
  const rootHref = `${config.baseUrl}/`;
  const selfHref = `${config.baseUrl}${feed.path}`;
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
    `  <id>${escapeXml(feed.id)}</id>`,
    `  <title>${escapeXml(feed.title)}</title>`,
    `  <updated>${escapeXml(updated)}</updated>`,
    `  <link rel="self" href="${escapeXml(selfHref)}" type="${acquisitionFeedType}"/>`,
    `  <link rel="start" href="${escapeXml(rootHref)}" type="${navigationFeedType}"/>`,
    ...entries,
    '</feed>',
    '',
  ].join('\n');
}
