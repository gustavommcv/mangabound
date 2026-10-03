/** The extension mangapress gives a Kobo profile's EPUB; Kobo's own reader tells it by this ending. */
const kepubExtension = '.kepub.epub';

/**
 * The first free name for a book: `Name.epub`, then `Name (2).epub`, `Name (3).epub`, and so on.
 * What counts as taken is left to the caller, so it can decide how names are compared. A Kobo
 * book's `.kepub.epub` is kept whole (`Name (2).kepub.epub`): numbered in the middle of it, the
 * file would no longer be one.
 */
export function uniqueFileName(name: string, isTaken: (candidate: string) => boolean): string {
  if (!isTaken(name)) return name;
  const kepub = name.toLowerCase().endsWith(kepubExtension) && name.length > kepubExtension.length;
  const dot = kepub ? name.length - kepubExtension.length : name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  for (let copy = 2; ; copy++) {
    const candidate = `${stem} (${String(copy)})${extension}`;
    if (!isTaken(candidate)) return candidate;
  }
}
