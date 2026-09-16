import { describe, expect, it } from 'vitest';

import type { LibraryBookEntry, LibraryManifest } from '@/library/manifest';
import { libraryManifestSchemaVersion } from '@/library/manifest';
import { publishBook, sortNewestFirst } from '@/library/publish';

function entry(overrides: Partial<LibraryBookEntry> = {}): LibraryBookEntry {
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

const emptyManifest: LibraryManifest = { schemaVersion: libraryManifestSchemaVersion, books: [] };

describe('publishBook', () => {
  it('adds the first entry to an empty manifest', () => {
    const published = publishBook(emptyManifest, entry());
    expect(published.books).toEqual([entry()]);
  });

  it('keeps two entries with distinct paths', () => {
    const first = entry({ relativePath: 'Manga/Vol.01.epub' });
    const second = entry({ relativePath: 'Manga/Vol.02.epub' });
    const published = publishBook(publishBook(emptyManifest, first), second);
    expect(published.books).toHaveLength(2);
    expect(published.books).toEqual(expect.arrayContaining([first, second]));
  });

  it('replaces an existing entry at the same relative path instead of duplicating it', () => {
    const original = entry({ bytes: 100, convertedAt: '2026-09-16T10:00:00.000Z' });
    const republished = entry({ bytes: 200, convertedAt: '2026-09-16T11:00:00.000Z' });
    const manifest = publishBook(emptyManifest, original);

    const published = publishBook(manifest, republished);

    expect(published.books).toHaveLength(1);
    expect(published.books[0]).toEqual(republished);
  });
});

describe('sortNewestFirst', () => {
  it('returns an empty array unchanged', () => {
    expect(sortNewestFirst([])).toEqual([]);
  });

  it('sorts already-ordered entries as newest first', () => {
    const newer = entry({ relativePath: 'a', convertedAt: '2026-09-16T12:00:00.000Z' });
    const older = entry({ relativePath: 'b', convertedAt: '2026-09-16T10:00:00.000Z' });
    expect(sortNewestFirst([newer, older])).toEqual([newer, older]);
  });

  it('reorders entries that arrive oldest first', () => {
    const older = entry({ relativePath: 'a', convertedAt: '2026-09-16T10:00:00.000Z' });
    const newer = entry({ relativePath: 'b', convertedAt: '2026-09-16T12:00:00.000Z' });
    expect(sortNewestFirst([older, newer])).toEqual([newer, older]);
  });

  it('breaks a timestamp tie by relativePath ascending when the later path comes first', () => {
    const b = entry({ relativePath: 'b', convertedAt: '2026-09-16T10:00:00.000Z' });
    const a = entry({ relativePath: 'a', convertedAt: '2026-09-16T10:00:00.000Z' });
    expect(sortNewestFirst([b, a])).toEqual([a, b]);
  });

  it('keeps a timestamp tie in place when the paths already sort ascending', () => {
    const a = entry({ relativePath: 'a', convertedAt: '2026-09-16T10:00:00.000Z' });
    const b = entry({ relativePath: 'b', convertedAt: '2026-09-16T10:00:00.000Z' });
    expect(sortNewestFirst([a, b])).toEqual([a, b]);
  });

  it('leaves the order untouched when both timestamp and relativePath tie exactly', () => {
    const first = entry({ relativePath: 'same', convertedAt: '2026-09-16T10:00:00.000Z' });
    const second = entry({
      relativePath: 'same',
      convertedAt: '2026-09-16T10:00:00.000Z',
      bytes: 999,
    });
    expect(sortNewestFirst([first, second])).toEqual([first, second]);
  });
});
