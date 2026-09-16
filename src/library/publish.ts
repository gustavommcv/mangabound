import type { LibraryBookEntry, LibraryManifest } from './manifest';

export function publishBook(manifest: LibraryManifest, entry: LibraryBookEntry): LibraryManifest {
  const books = manifest.books.filter((book) => book.relativePath !== entry.relativePath);
  return { ...manifest, books: [...books, entry] };
}

export function sortNewestFirst(books: readonly LibraryBookEntry[]): readonly LibraryBookEntry[] {
  return [...books].sort((a, b) => {
    if (a.convertedAt !== b.convertedAt) return a.convertedAt < b.convertedAt ? 1 : -1;
    return a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0;
  });
}
