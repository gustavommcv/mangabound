/** How many names are spelled out before "and N more". */
const namedInANote = 3;

/** The last part of a path, whichever separator it uses; empty when the path names nothing. */
export function lastPathPart(path: string): string {
  return (
    path
      .split(/[\\/]/u)
      .filter((part) => part !== '')
      .at(-1) ?? ''
  );
}

/** The names, as many as are spelled out, and how many more there are. */
export function listNames(names: readonly string[], more = ''): string {
  const shown = names.slice(0, namedInANote).join(', ');
  return names.length > namedInANote
    ? `${shown} and ${String(names.length - namedInANote)} more${more}`
    : shown;
}
