import type { PipelineIssue } from './conversion';

/** How many names are spelled out before "and N more". */
const namedInTheNote = 3;

/**
 * The names of the folders `mangabind` could not read as chapters, from what it reported. It says
 * so once for each (`unparsed_chapter`, with the folder's path), and such a folder is in no volume
 * and in no book: it is not in the draft the editor works with, so nothing else shows it is there.
 */
export function unrecognizedChapterNames(issues: readonly PipelineIssue[]): readonly string[] {
  return issues
    .filter((issue) => issue.code === 'unparsed_chapter' && issue.path !== undefined)
    .map(
      (issue) =>
        issue
          .path!.split(/[\\/]/u)
          .filter((part) => part !== '')
          .at(-1) ?? '',
    )
    .filter((name) => name !== '');
}

/**
 * What a person is told about those folders: that they are left out, which ones, and what to do.
 * `mangabind` reads a name for a chapter number, and the fix is in the name, since the app has no
 * way to place a folder whose chapter it cannot tell.
 */
export function unrecognizedChaptersNote(names: readonly string[]): string {
  if (names.length === 0) return '';
  const shown = names.slice(0, namedInTheNote).join(', ');
  const more =
    names.length > namedInTheNote ? ` and ${String(names.length - namedInTheNote)} more` : '';
  const many = names.length === 1 ? 'A folder has' : `${String(names.length)} folders have`;
  return `${many} a name mangabind cannot read as a chapter, so ${names.length === 1 ? 'it is' : 'they are'} left out of the books: ${shown}${more}. Rename ${names.length === 1 ? 'it' : 'them'} to include a chapter number (Ch.005, for one), then add the folder again.`;
}
