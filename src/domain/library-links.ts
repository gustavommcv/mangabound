import type { PipelineIssue } from './conversion';
import { lastPathPart, listNames } from './folder-names';

/**
 * The names of the links in a library folder that `mangabind` did not follow. It says so once for
 * each (`link_skipped`, with the link's own path), as an issue of the whole run: a link is not a
 * manga, so there is none to attach it to. A link inside a chapter has a volume and a chapter, and
 * is told with the book it was in instead (ADR 0039), so only an issue with no manga is read here.
 *
 * A series kept as a link is in no book and in no list of titles, so nothing else shows it is
 * missing.
 */
export function skippedLinkNames(issues: readonly PipelineIssue[]): readonly string[] {
  return issues
    .filter(
      (issue) =>
        issue.code === 'link_skipped' && issue.manga === undefined && issue.path !== undefined,
    )
    .map((issue) => lastPathPart(issue.path!))
    .filter((name) => name !== '');
}

/** What the library's own screen says about those links: what happened, why, and what to do. */
export function skippedLinksNotice(names: readonly string[]): {
  readonly title: string;
  readonly advice: string;
  readonly names: string;
} {
  const one = names.length === 1;
  return {
    title: one
      ? '1 folder in this library was not read'
      : `${String(names.length)} folders in this library were not read`,
    advice: one
      ? 'It is a link, and mangabind does not follow links to a series. Put the real folder in the library, or add it on its own:'
      : 'They are links, and mangabind does not follow links to a series. Put the real folders in the library, or add each on its own:',
    names: listNames(names),
  };
}

/**
 * What the queue says about a folder in which every manga was a link, so that it holds none:
 * `mangabind` found no chapters, and "turn off grouping" would not change that.
 */
export function onlyLinksNote(names: readonly string[]): string {
  const one = names.length === 1;
  return `${one ? 'A folder in it is a link' : `${String(names.length)} folders in it are links`}, and mangabind does not follow links to a series, so ${one ? 'it was' : 'they were'} not read: ${listNames(names)}. Put the real ${one ? 'folder' : 'folders'} in the library and add it again.`;
}
