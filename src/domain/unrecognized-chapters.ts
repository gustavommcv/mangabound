import type { PipelineIssue } from './conversion';
import { lastPathPart, listNames } from './folder-names';

/**
 * The names of the folders `mangabind` could not read as chapters, from what it reported. It says
 * so once for each (`unparsed_chapter`, with the folder's path), and such a folder is in no volume
 * and in no book: it is not in the draft the editor works with, so nothing else shows it is there.
 */
export function unrecognizedChapterNames(issues: readonly PipelineIssue[]): readonly string[] {
  return issues
    .filter((issue) => issue.code === 'unparsed_chapter' && issue.path !== undefined)
    .map((issue) => lastPathPart(issue.path!))
    .filter((name) => name !== '');
}

/**
 * What a person is told about those folders: that they are left out, which ones, and what to do.
 * `mangabind` reads a name for a chapter number, and the fix is in the name, since the app has no
 * way to place a folder whose chapter it cannot tell.
 */
export function unrecognizedChaptersNote(
  names: readonly string[],
  /** What is added again once the names are fixed: the folder, or the library the title is in. */
  again: 'folder' | 'library' = 'folder',
): string {
  if (names.length === 0) return '';
  return `${leftOut(names.length)}: ${listNames(names, '')}. ${renameThem(names.length)}, then add the ${again} again.`;
}

/** The same for a library: the folders are named under the title they are in. */
export function unrecognizedInLibraryNote(
  titles: readonly { readonly title: string; readonly names: readonly string[] }[],
): string {
  const affected = titles.filter((title) => title.names.length > 0);
  if (affected.length === 0) return '';
  const folders = affected.reduce((count, title) => count + title.names.length, 0);
  const where = affected.map((title) => `${title.title} (${listNames(title.names, '')})`);
  return `${leftOut(folders)}: ${listNames(where, ' titles')}. ${renameThem(folders)}, then add the library again.`;
}

function leftOut(count: number): string {
  const many = count === 1 ? 'A folder has' : `${String(count)} folders have`;
  return `${many} a name mangabind cannot read as a chapter, so ${count === 1 ? 'it is' : 'they are'} left out of the books`;
}

function renameThem(count: number): string {
  return `Rename ${count === 1 ? 'it' : 'them'} to include a chapter number (Ch.005, for one)`;
}
