import type { ConversionArtifact, PipelineIssue } from '@/domain/conversion';

/**
 * The notes of the joining step that say something of the person's was left out of a book, as
 * `mangabind` documents their codes. The others (a chapter that is in no volume, a name no parser
 * read) the person already saw while placing the chapters, and a code a later `mangabind` adds is
 * not shown under a heading the app has not written.
 */
const leftOutCodes: ReadonlySet<string> = new Set([
  'chapter_conflict',
  'chapter_gap',
  'empty_chapter',
  'link_skipped',
]);

/**
 * The books of a run with what the joining step said about them added to their warnings. The
 * volumes are the ones the books were made from, in the order the books came: a note that names a
 * volume goes to that volume's book, and one that names none (or a series bound as a single book)
 * to every book it could be about.
 */
export function withBindingWarnings(
  artifacts: readonly ConversionArtifact[],
  volumes: readonly (number | undefined)[],
  issues: readonly PipelineIssue[],
): readonly ConversionArtifact[] {
  const reported = issues.filter((issue) => leftOutCodes.has(issue.code));
  if (reported.length === 0) return artifacts;
  return artifacts.map((artifact, index) => {
    const volume = volumes[index];
    const about = reported
      .filter(
        (issue) =>
          issue.volume === undefined || volume === undefined || issue.volume === String(volume),
      )
      .map(({ code, message }) => ({ code, message }));
    return about.length === 0
      ? artifact
      : { ...artifact, warnings: [...(artifact.warnings ?? []), ...about] };
  });
}
