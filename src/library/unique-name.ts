/**
 * The first free name for a book: `Name.epub`, then `Name (2).epub`, `Name (3).epub`, and so on.
 * What counts as taken is left to the caller, so it can decide how names are compared.
 */
export function uniqueFileName(name: string, isTaken: (candidate: string) => boolean): string {
  if (!isTaken(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  for (let copy = 2; ; copy++) {
    const candidate = `${stem} (${String(copy)})${extension}`;
    if (!isTaken(candidate)) return candidate;
  }
}
